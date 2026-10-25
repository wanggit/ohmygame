import { access, mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CustomMusicSettingsStore } from "../src/daemon/custom-music-settings.js";

describe("Custom Music settings", () => {
  it("persists the connection without exposing the API key", async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "ohmygame-custom-music-"),
    );
    const settings = new CustomMusicSettingsStore(directory);
    await settings.load();
    expect(settings.get()).toEqual({ configured: false, hasApiKey: false });
    expect(settings.connection()).toBeUndefined();

    await settings.update({
      baseUrl: "  http://127.0.0.1:8000/v1/  ",
      apiKey: "  sk-gateway  ",
    });
    expect(settings.get()).toEqual({
      configured: true,
      hasApiKey: true,
      baseUrl: "http://127.0.0.1:8000/v1",
    });
    expect(settings.key()).toBe("sk-gateway");
    expect(settings.connection()).toEqual({
      baseUrl: "http://127.0.0.1:8000/v1",
      apiKey: "sk-gateway",
      model: "wenxin-music",
    });
    expect(
      JSON.parse(
        await readFile(path.join(directory, "custom-music.json"), "utf8"),
      ),
    ).toEqual({
      version: 1,
      baseUrl: "http://127.0.0.1:8000/v1",
      apiKey: "sk-gateway",
    });
    expect(
      (await stat(path.join(directory, "custom-music.json"))).mode & 0o777,
    ).toBe(0o600);

    const restored = new CustomMusicSettingsStore(directory);
    await restored.load();
    expect(restored.get()).toEqual({
      configured: true,
      hasApiKey: true,
      baseUrl: "http://127.0.0.1:8000/v1",
    });
    await restored.clear();
    await expect(
      access(path.join(directory, "custom-music.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(restored.get()).toEqual({ configured: false, hasApiKey: false });
  });

  it("applies partial updates: unset fields stay, null clears", async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "ohmygame-custom-music-partial-"),
    );
    const settings = new CustomMusicSettingsStore(directory);
    await settings.load();
    await settings.update({
      baseUrl: "http://127.0.0.1:8000/v1",
      apiKey: "sk-gateway",
      model: "wenxin-music",
      style: "流行",
      voice: "甜美女声",
    });

    await settings.update({ style: null });
    expect(settings.get()).toEqual({
      configured: true,
      hasApiKey: true,
      baseUrl: "http://127.0.0.1:8000/v1",
      model: "wenxin-music",
      voice: "甜美女声",
    });

    await settings.update({ apiKey: null });
    expect(settings.get().hasApiKey).toBe(false);
    expect(settings.key()).toBeUndefined();

    await settings.update({ model: "custom-song-model" });
    expect(settings.connection()).toEqual({
      baseUrl: "http://127.0.0.1:8000/v1",
      model: "custom-song-model",
      voice: "甜美女声",
    });
  });

  it("rejects invalid endpoints, keys, and oversized values", async () => {
    const settings = new CustomMusicSettingsStore(
      await mkdtemp(path.join(tmpdir(), "ohmygame-custom-music-invalid-")),
    );
    await settings.load();
    await expect(settings.update({ baseUrl: "not-a-url" })).rejects.toThrow(
      "Invalid URL",
    );
    await expect(settings.update({ baseUrl: "file:///tmp" })).rejects.toThrow(
      "Base URL",
    );
    await expect(
      settings.update({ baseUrl: "http://127.0.0.1:8000/v1?key=1" }),
    ).rejects.toThrow("Base URL");
    await expect(settings.update({ apiKey: " " })).rejects.toThrow(
      "must not be empty",
    );
    await expect(settings.update({ apiKey: "key\nvalue" })).rejects.toThrow(
      "printable ASCII",
    );
    await expect(settings.update({ model: "x".repeat(201) })).rejects.toThrow(
      "Model ID",
    );
    await expect(settings.update({ style: "" })).rejects.toThrow(
      "must not be empty",
    );
  });
});
