import { describe, expect, it, vi } from "vitest";
import { CustomMusicProvider } from "../src/daemon/custom-music-provider.js";
import type { CustomMusicConnection } from "../src/daemon/custom-music-settings.js";

const MODEL = { provider: "custom-music", id: "wenxin-music" } as const;
const CONNECTION: CustomMusicConnection = {
  baseUrl: "http://127.0.0.1:8000/v1",
  apiKey: "sk-gateway",
  model: "wenxin-music",
  style: "流行",
  voice: "甜美女声",
};

/** Minimal FLAC header + STREAMINFO: 44.1 kHz stereo, 3.25 s. */
function flacFixture(): Buffer {
  const sampleRate = 44_100;
  const channels = 2;
  const totalSamples = 143_325;
  const streamInfo = Buffer.alloc(34);
  streamInfo[10] = (sampleRate >> 12) & 0xff;
  streamInfo[11] = (sampleRate >> 4) & 0xff;
  streamInfo[12] = ((sampleRate & 0x0f) << 4) | ((channels - 1) << 1);
  streamInfo[13] = ((16 - 1) << 4) | Math.floor(totalSamples / 2 ** 32);
  streamInfo.writeUInt32BE(totalSamples >>> 0, 14);
  return Buffer.concat([
    Buffer.from("fLaC"),
    Buffer.from([0x00, 0x00, 0x00, 34]),
    streamInfo,
    Buffer.from("frame-data"),
  ]);
}

describe("Custom Music provider", () => {
  it("translates a music request and downloads the FLAC result", async () => {
    const flac = flacFixture();
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            created: 1_792_737_258,
            data: [{ url: "http://127.0.0.1:8000/v1/files/b869df25.flac" }],
          }),
          { status: 200, headers: { "x-request-id": "music-request-1" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array(flac), {
          status: 200,
          headers: { "content-type": "audio/flac" },
        }),
      );
    const provider = new CustomMusicProvider(() => CONNECTION, request);

    const generated = await provider.generate({
      operation: "music",
      model: MODEL,
      prompt: "  Boss battle theme with taiko drums  ",
      instrumental: false,
      lyrics: "[Verse]\nWe rise again",
      durationSeconds: 30,
    });

    expect(Buffer.from(generated.bytes)).toEqual(flac);
    expect(generated.mediaType).toBe("audio/flac");
    expect(generated.model).toEqual(MODEL);
    expect(generated.metadata).toEqual({
      durationMs: 3_250,
      sampleRate: 44_100,
      channels: 2,
      codec: "flac",
      providerRequestId: "music-request-1",
    });

    const [url, init] = request.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:8000/v1/music/generations");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer sk-gateway",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "wenxin-music",
      prompt: "Boss battle theme with taiko drums\n（时长约 30 秒）",
      style: "流行",
      voice: "甜美女声",
      lyrics: "[Verse]\nWe rise again",
    });

    const [downloadUrl, downloadInit] = request.mock.calls[1]!;
    expect(downloadUrl).toBe("http://127.0.0.1:8000/v1/files/b869df25.flac");
    expect(downloadInit?.method).toBe("GET");
  });

  it("accepts inline base64 output and works without an API key", async () => {
    const flac = flacFixture();
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ data: [{ b64_json: flac.toString("base64") }] }),
        ),
      );
    const provider = new CustomMusicProvider(
      () => ({ baseUrl: "http://127.0.0.1:8000/v1", model: "wenxin-music" }),
      request,
    );

    const generated = await provider.generate({
      operation: "music",
      model: MODEL,
      prompt: "Town theme",
      instrumental: false,
    });

    expect(Buffer.from(generated.bytes)).toEqual(flac);
    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:8000/v1/music/generations");
    expect(init?.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "wenxin-music",
      prompt: "Town theme",
    });
  });

  it("uses the configured model id in the catalog and requests", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ b64_json: flacFixture().toString("base64") }],
          }),
        ),
      );
    const provider = new CustomMusicProvider(
      () => ({
        baseUrl: "http://127.0.0.1:8000/v1",
        model: "custom-song-model",
      }),
      request,
    );

    expect(provider.configured()).toBe(true);
    expect(provider.models()).toEqual([
      expect.objectContaining({
        provider: "custom-music",
        id: "custom-song-model",
        protocol: "custom-music-generations",
      }),
    ]);
    expect(provider.models()[0]?.capabilities).toMatchObject({
      operations: ["music"],
      formats: ["flac"],
      vocalsOnly: true,
      supportsLyrics: true,
      supportsInstrumental: false,
    });

    await provider.generate({
      operation: "music",
      model: { provider: "custom-music", id: "custom-song-model" },
      prompt: "theme",
      instrumental: false,
    });
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toMatchObject({
      model: "custom-song-model",
    });
  });

  it("rejects unsupported controls before calling the gateway", async () => {
    const request = vi.fn<typeof fetch>();
    const provider = new CustomMusicProvider(() => CONNECTION, request);

    await expect(
      new CustomMusicProvider(() => undefined, request).generate({
        operation: "music",
        model: MODEL,
        prompt: "theme",
        instrumental: false,
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
      message: expect.stringContaining("not connected"),
    });

    await expect(
      provider.generate({
        operation: "sound-effect",
        model: MODEL,
        prompt: "rain",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("music generation only"),
    });

    await expect(
      provider.generate({
        operation: "music",
        model: { provider: "custom-music", id: "other-model" },
        prompt: "theme",
        instrumental: false,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("unavailable"),
    });

    await expect(
      provider.generate({
        operation: "music",
        model: MODEL,
        prompt: "theme",
        instrumental: true,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("always produces songs with vocals"),
    });

    await expect(
      provider.generate({
        operation: "music",
        model: MODEL,
        prompt: "theme",
        instrumental: false,
        loop: true,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("seamless loops"),
    });

    await expect(
      provider.generate({
        operation: "music",
        model: MODEL,
        prompt: "theme",
        instrumental: false,
        referenceAssetId: "asset-1",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("reference audio"),
    });

    await expect(
      provider.generate({
        operation: "music",
        model: MODEL,
        prompt: "theme",
        instrumental: false,
        output: { format: "mp3" },
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("FLAC"),
    });

    await expect(
      provider.generate({
        operation: "music",
        model: MODEL,
        prompt: "theme",
        instrumental: false,
        output: { sampleRate: 48_000 },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      provider.generate({
        operation: "music",
        model: MODEL,
        prompt: "theme",
        instrumental: false,
        output: { channels: 2 },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      provider.generate({
        operation: "music",
        model: MODEL,
        prompt: "  ",
        instrumental: false,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("prompt"),
    });
    await expect(
      provider.generate({
        operation: "music",
        model: MODEL,
        prompt: "theme",
        instrumental: false,
        lyrics: " ",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("Lyrics"),
    });
    await expect(
      provider.generate({
        operation: "music",
        model: MODEL,
        prompt: "theme",
        instrumental: false,
        durationSeconds: 601,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(request).not.toHaveBeenCalled();
  });

  it("maps gateway errors and invalid audio payloads", async () => {
    const failing = (response: Response) =>
      new CustomMusicProvider(
        () => CONNECTION,
        vi.fn<typeof fetch>().mockResolvedValue(response),
      );
    const generate = (provider: CustomMusicProvider) =>
      provider.generate({
        operation: "music",
        model: MODEL,
        prompt: "theme",
        instrumental: false,
      });

    await expect(
      generate(failing(new Response("denied", { status: 401 }))),
    ).rejects.toMatchObject({ statusCode: 503 });
    await expect(
      generate(
        failing(
          new Response(
            JSON.stringify({
              error: { type: "rate_limit_error", code: "queue_full" },
            }),
            { status: 429 },
          ),
        ),
      ),
    ).rejects.toMatchObject({ statusCode: 429 });
    await expect(
      generate(
        failing(
          new Response(
            JSON.stringify({
              error: {
                type: "authentication_required",
                code: "login_required",
              },
            }),
            { status: 502 },
          ),
        ),
      ),
    ).rejects.toMatchObject({ statusCode: 503 });
    await expect(
      generate(
        failing(
          new Response(
            JSON.stringify({ error: { message: "invalid style" } }),
            { status: 400 },
          ),
        ),
      ),
    ).rejects.toMatchObject({ statusCode: 400, message: "invalid style" });
    await expect(
      generate(failing(new Response("boom", { status: 500 }))),
    ).rejects.toMatchObject({ statusCode: 502 });

    const empty = new CustomMusicProvider(
      () => CONNECTION,
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify({ data: [] }))),
    );
    await expect(generate(empty)).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining("returned no audio"),
    });

    const foreignUrl = new CustomMusicProvider(
      () => CONNECTION,
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ data: [{ url: "file:///tmp/leak.flac" }] }),
          ),
        ),
    );
    await expect(generate(foreignUrl)).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining("invalid audio URL"),
    });

    const garbage = new CustomMusicProvider(
      () => CONNECTION,
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              data: [{ url: "http://127.0.0.1:8000/v1/files/x.flac" }],
            }),
          ),
        )
        .mockResolvedValueOnce(new Response(Buffer.from("not audio"))),
    );
    await expect(generate(garbage)).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining("not valid audio"),
    });

    const mp4Container = new CustomMusicProvider(
      () => CONNECTION,
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              data: [{ url: "http://127.0.0.1:8000/v1/files/x.mp4" }],
            }),
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            new Uint8Array(
              Buffer.concat([
                Buffer.from([0, 0, 0, 0x18]),
                Buffer.from("ftypisom"),
                Buffer.from("mdat"),
              ]),
            ),
          ),
        ),
    );
    await expect(generate(mp4Container)).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining("MP4"),
    });
  });
});
