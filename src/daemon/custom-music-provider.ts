import { randomUUID } from "node:crypto";
import {
  CUSTOM_MUSIC_PROVIDER_NAME,
  type AudioGenerationRequest,
  type AudioModel,
  type GeneratedAudio,
  type MusicAudioRequest,
} from "../shared/audio.js";
import {
  AudioGenerationError,
  type AudioProviderAdapter,
} from "./audio-generation.js";
import type { CustomMusicConnection } from "./custom-music-settings.js";

const PROVIDER_ID = "custom-music";
const PROTOCOL = "custom-music-generations";
const MAX_PROMPT_CHARACTERS = 4_000;
const MAX_LYRICS_CHARACTERS = 4_000;
const MAX_AUDIO_BYTES = 64 * 1024 * 1024;
const MAX_DURATION_SECONDS = 600;
/** Generations run synchronously in the gateway for minutes at a time. */
const REQUEST_TIMEOUT_MS = 600_000;

/**
 * Adapts OpenAI-compatible music-generation endpoints (`POST
 * {base}/music/generations`) such as FreeAiProxy's `wenxin-music`: one
 * vocal song per request, FLAC output, style/voice selected in settings.
 */
export class CustomMusicProvider implements AudioProviderAdapter {
  readonly id = PROVIDER_ID;
  readonly name = CUSTOM_MUSIC_PROVIDER_NAME;

  constructor(
    private readonly connection: () => CustomMusicConnection | undefined,
    private readonly request: typeof fetch = fetch,
    private readonly isEnabled: () => boolean = () => true,
  ) {}

  configured(): boolean {
    return Boolean(this.connection());
  }

  enabled(): boolean {
    return this.isEnabled();
  }

  models(): AudioModel[] {
    const connection = this.connection();
    if (!connection) return [];
    return [customMusicModel(connection.model)];
  }

  async generate(
    input: AudioGenerationRequest,
    signal?: AbortSignal,
  ): Promise<GeneratedAudio> {
    if (input.operation !== "music")
      throw new AudioGenerationError(
        `${CUSTOM_MUSIC_PROVIDER_NAME} supports music generation only`,
        400,
      );
    const connection = this.connection();
    if (!connection)
      throw new AudioGenerationError(
        `${CUSTOM_MUSIC_PROVIDER_NAME} is not connected`,
        503,
      );
    if (
      input.model &&
      (input.model.provider !== PROVIDER_ID ||
        input.model.id !== connection.model)
    )
      throw new AudioGenerationError(
        `The selected ${CUSTOM_MUSIC_PROVIDER_NAME} model is unavailable`,
        400,
      );

    validateRequest(input);
    const prompt = providerPrompt(input);
    const body: Record<string, string> = {
      model: connection.model,
      prompt,
    };
    if (connection.style) body.style = connection.style;
    if (connection.voice) body.voice = connection.voice;
    if (input.lyrics?.trim()) body.lyrics = input.lyrics.trim();

    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await this.request(`${connection.baseUrl}/music/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(connection.apiKey
            ? { Authorization: `Bearer ${connection.apiKey}` }
            : {}),
        },
        body: JSON.stringify(body),
        signal: combined,
      });
    } catch (cause) {
      if (signal?.aborted) throw cause;
      throw new AudioGenerationError(
        timeout.aborted
          ? `${CUSTOM_MUSIC_PROVIDER_NAME} timed out after ${Math.round(REQUEST_TIMEOUT_MS / 60_000)} minutes`
          : `Could not reach ${CUSTOM_MUSIC_PROVIDER_NAME}: ${cause instanceof Error ? cause.message : String(cause)}`,
        502,
      );
    }
    if (!response.ok) throw await responseError(response);
    const result = await parseResponse(response, connection.baseUrl);
    const bytes = await fetchAudio(this.request, result, signal);
    const format = sniffAudio(bytes);
    return {
      bytes,
      mediaType:
        format === "wav"
          ? "audio/wav"
          : format === "mp3"
            ? "audio/mpeg"
            : "audio/flac",
      model: { provider: PROVIDER_ID, id: connection.model },
      metadata: {
        ...audioMetadata(bytes, format),
        codec: format,
        providerRequestId: response.headers.get("x-request-id") ?? randomUUID(),
      },
    };
  }
}

export function customMusicModel(model: string): AudioModel {
  return {
    provider: PROVIDER_ID,
    providerName: CUSTOM_MUSIC_PROVIDER_NAME,
    id: model,
    name: model,
    protocol: PROTOCOL,
    capabilities: {
      operations: ["music"],
      executionModes: ["synchronous"],
      languages: ["zh-cn", "en"],
      formats: ["flac"],
      maxTextCharacters: MAX_PROMPT_CHARACTERS,
      supportsLoop: false,
      supportsLyrics: true,
      supportsInstrumental: false,
      /** The provider always sings; the instrumental option is not offered. */
      vocalsOnly: true,
      supportsReferenceAudio: false,
      supportsNegativePrompt: false,
    },
  };
}

function validateRequest(input: MusicAudioRequest): void {
  if (!input.prompt?.trim())
    throw new AudioGenerationError("Music prompt must not be empty", 400);
  if (input.prompt.trim().length > MAX_PROMPT_CHARACTERS)
    throw new AudioGenerationError(
      `Music prompt must be ${MAX_PROMPT_CHARACTERS.toLocaleString("en-US")} characters or fewer`,
      400,
    );
  if (input.instrumental)
    throw new AudioGenerationError(
      `${CUSTOM_MUSIC_PROVIDER_NAME} always produces songs with vocals; instrumental music is not available`,
      400,
    );
  if (input.lyrics !== undefined) {
    const lyrics = input.lyrics.trim();
    if (!lyrics)
      throw new AudioGenerationError("Lyrics must not be empty when set", 400);
    if (lyrics.length > MAX_LYRICS_CHARACTERS)
      throw new AudioGenerationError(
        `Lyrics must be ${MAX_LYRICS_CHARACTERS.toLocaleString("en-US")} characters or fewer`,
        400,
      );
  }
  if (
    input.durationSeconds !== undefined &&
    (!Number.isFinite(input.durationSeconds) ||
      input.durationSeconds < 1 ||
      input.durationSeconds > MAX_DURATION_SECONDS)
  )
    throw new AudioGenerationError(
      `Music duration must be between 1 and ${MAX_DURATION_SECONDS} seconds`,
      400,
    );
  if (input.loop)
    throw new AudioGenerationError(
      `${CUSTOM_MUSIC_PROVIDER_NAME} does not create guaranteed seamless loops`,
      400,
    );
  if (input.referenceAssetId)
    throw new AudioGenerationError(
      `${CUSTOM_MUSIC_PROVIDER_NAME} reference audio is not enabled`,
      400,
    );
  if (input.output?.format !== undefined && input.output.format !== "flac")
    throw new AudioGenerationError(
      `${CUSTOM_MUSIC_PROVIDER_NAME} output must be FLAC`,
      400,
    );
  if (input.output?.sampleRate !== undefined)
    throw new AudioGenerationError(
      `${CUSTOM_MUSIC_PROVIDER_NAME} does not expose sample rate selection`,
      400,
    );
  if (input.output?.channels !== undefined)
    throw new AudioGenerationError(
      `${CUSTOM_MUSIC_PROVIDER_NAME} does not expose channel selection`,
      400,
    );
}

function providerPrompt(input: MusicAudioRequest): string {
  const prompt = input.prompt.trim();
  return input.durationSeconds !== undefined
    ? `${prompt}\n（时长约 ${input.durationSeconds} 秒）`
    : prompt;
}

interface MusicResponse {
  created?: unknown;
  data?: unknown;
}

async function parseResponse(
  response: Response,
  baseUrl: string,
): Promise<{ url?: string; base64?: string }> {
  let value: MusicResponse;
  try {
    value = (await response.json()) as MusicResponse;
  } catch {
    throw new AudioGenerationError(
      `${CUSTOM_MUSIC_PROVIDER_NAME} returned invalid JSON`,
      502,
    );
  }
  const entry = Array.isArray(value.data) ? value.data[0] : undefined;
  const record =
    entry && typeof entry === "object"
      ? (entry as Record<string, unknown>)
      : undefined;
  const url = typeof record?.url === "string" ? record.url.trim() : "";
  const base64 =
    typeof record?.b64_json === "string" ? record.b64_json.trim() : "";
  if (!url && !base64)
    throw new AudioGenerationError(
      `${CUSTOM_MUSIC_PROVIDER_NAME} returned no audio`,
      502,
    );
  if (url) {
    let parsed: URL;
    try {
      parsed = new URL(url, baseUrl);
    } catch {
      throw new AudioGenerationError(
        `${CUSTOM_MUSIC_PROVIDER_NAME} returned an invalid audio URL`,
        502,
      );
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      throw new AudioGenerationError(
        `${CUSTOM_MUSIC_PROVIDER_NAME} returned an invalid audio URL`,
        502,
      );
    return { url: parsed.toString() };
  }
  return { base64: base64! };
}

async function fetchAudio(
  request: typeof fetch,
  source: { url?: string; base64?: string },
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (source.base64) {
    const normalized = source.base64.replace(/\s/g, "");
    if (
      !normalized ||
      normalized.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)
    )
      throw new AudioGenerationError(
        `${CUSTOM_MUSIC_PROVIDER_NAME} returned invalid audio data`,
        502,
      );
    const bytes = new Uint8Array(Buffer.from(normalized, "base64"));
    if (!bytes.length || bytes.length > MAX_AUDIO_BYTES)
      throw new AudioGenerationError(
        `${CUSTOM_MUSIC_PROVIDER_NAME} returned an invalid audio size`,
        502,
      );
    return bytes;
  }
  let response: Response;
  try {
    response = await request(source.url!, { method: "GET", signal });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new AudioGenerationError(
      `Could not download ${CUSTOM_MUSIC_PROVIDER_NAME} audio: ${cause instanceof Error ? cause.message : String(cause)}`,
      502,
    );
  }
  if (!response.ok)
    throw new AudioGenerationError(
      `${CUSTOM_MUSIC_PROVIDER_NAME} audio download failed (${response.status})`,
      502,
    );
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_AUDIO_BYTES)
    throw new AudioGenerationError(
      `${CUSTOM_MUSIC_PROVIDER_NAME} returned an invalid audio size`,
      502,
    );
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_AUDIO_BYTES)
    throw new AudioGenerationError(
      `${CUSTOM_MUSIC_PROVIDER_NAME} returned an invalid audio size`,
      502,
    );
  return bytes;
}

type AudioFormat = "flac" | "wav" | "mp3";

function sniffAudio(bytes: Uint8Array): AudioFormat {
  const ascii = (start: number, end: number) =>
    Buffer.from(bytes.subarray(start, end)).toString("ascii");
  if (bytes.length >= 4 && ascii(0, 4) === "fLaC") return "flac";
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE")
    return "wav";
  if (
    bytes.length >= 3 &&
    (ascii(0, 3) === "ID3" ||
      (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0))
  )
    return "mp3";
  // Some gateway music models (for example doubao-music) return an MP4 with a
  // cover image plus the audio track; the audio pipeline stores audio files only.
  if (bytes.length >= 12 && ascii(4, 8) === "ftyp")
    throw new AudioGenerationError(
      `${CUSTOM_MUSIC_PROVIDER_NAME} returned an MP4 container; choose a model that returns an audio file`,
      502,
    );
  throw new AudioGenerationError(
    `${CUSTOM_MUSIC_PROVIDER_NAME} returned data that is not valid audio`,
    502,
  );
}

/** Duration, sample rate and channels from the FLAC STREAMINFO block. */
function audioMetadata(
  bytes: Uint8Array,
  format: AudioFormat,
): {
  durationMs?: number;
  sampleRate?: number;
  channels?: number;
} {
  if (format !== "flac" || bytes.length < 42) return {};
  const block = Buffer.from(bytes.subarray(0, 42));
  if (block.toString("ascii", 0, 4) !== "fLaC") return {};
  const type = block[4]! & 0x7f;
  const length = (block[5]! << 16) | (block[6]! << 8) | block[7]!;
  if (type !== 0 || length < 34) return {};
  // STREAMINFO payload starts at byte 8; sample rate is at payload offset 10.
  const sampleRate = (block[18]! << 12) | (block[19]! << 4) | (block[20]! >> 4);
  const channels = ((block[20]! >> 1) & 0x07) + 1;
  const totalSamples =
    (block[21]! & 0x0f) * 0x1_0000_0000 +
    (((block[22]! << 24) |
      (block[23]! << 16) |
      (block[24]! << 8) |
      block[25]!) >>>
      0);
  if (!sampleRate || sampleRate <= 0 || totalSamples <= 0) return {};
  return {
    durationMs: Math.round((totalSamples / sampleRate) * 1_000),
    sampleRate,
    channels,
  };
}

async function responseError(
  response: Response,
): Promise<AudioGenerationError> {
  const raw = (await response.text().catch(() => "")).slice(0, 500).trim();
  let detail = raw;
  let code = "";
  let type = "";
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: unknown; code?: unknown; type?: unknown };
    };
    const error = parsed.error;
    if (typeof error?.message === "string" && error.message.trim())
      detail = error.message.trim();
    if (typeof error?.code === "string") code = error.code;
    if (typeof error?.type === "string") type = error.type;
  } catch {
    /* Keep the gateway's plain-text response. */
  }
  if (code === "queue_full" || response.status === 429)
    return new AudioGenerationError(
      `${CUSTOM_MUSIC_PROVIDER_NAME} rate limit was reached`,
      429,
    );
  if (code === "login_required" || type === "authentication_required")
    return new AudioGenerationError(
      `${CUSTOM_MUSIC_PROVIDER_NAME} login expired; re-login in the gateway`,
      503,
    );
  if (response.status === 401 || response.status === 403)
    return new AudioGenerationError(
      `${CUSTOM_MUSIC_PROVIDER_NAME} credentials were rejected or the service is not enabled`,
      503,
    );
  return new AudioGenerationError(
    detail ||
      `${CUSTOM_MUSIC_PROVIDER_NAME} request failed (${response.status})`,
    response.status >= 500 ? 502 : 400,
  );
}
