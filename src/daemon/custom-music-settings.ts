import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CUSTOM_MUSIC_DEFAULT_MODEL,
  CUSTOM_MUSIC_PROVIDER_NAME,
} from "../shared/audio.js";
import { normalizeEndpoint } from "../shared/custom-models.js";

// A type alias (not an interface) so it stays assignable to Record<string, unknown>.
type StoredCustomMusicSettings = {
  version: 1;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  style?: string;
  voice?: string;
};

export interface CustomMusicConnection {
  baseUrl: string;
  apiKey?: string;
  model: string;
  style?: string;
  voice?: string;
}

export interface CustomMusicSettingsUpdate {
  baseUrl?: string | null;
  apiKey?: string | null;
  model?: string | null;
  style?: string | null;
  voice?: string | null;
}

export class CustomMusicSettingsStore {
  readonly #filePath: string;
  #settings: StoredCustomMusicSettings = { version: 1 };
  #mutations: Promise<void> = Promise.resolve();

  constructor(dataDirectory: string) {
    this.#filePath = path.join(dataDirectory, "custom-music.json");
  }

  async load(): Promise<void> {
    try {
      const parsed = JSON.parse(
        await readFile(this.#filePath, "utf8"),
      ) as Record<string, unknown>;
      if (parsed.version !== 1)
        throw new Error(
          `Invalid ${CUSTOM_MUSIC_PROVIDER_NAME} settings: ${this.#filePath}`,
        );
      this.#settings = {
        version: 1,
        ...stringField(parsed, "baseUrl"),
        ...stringField(parsed, "apiKey"),
        ...stringField(parsed, "model"),
        ...stringField(parsed, "style"),
        ...stringField(parsed, "voice"),
      };
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
    }
  }

  get(): {
    configured: boolean;
    hasApiKey: boolean;
    baseUrl?: string;
    model?: string;
    style?: string;
    voice?: string;
  } {
    return {
      configured: Boolean(this.#settings.baseUrl),
      hasApiKey: Boolean(this.#settings.apiKey),
      ...stringField(this.#settings, "baseUrl"),
      ...stringField(this.#settings, "model"),
      ...stringField(this.#settings, "style"),
      ...stringField(this.#settings, "voice"),
    };
  }

  key(): string | undefined {
    return this.#settings.apiKey;
  }

  /** The saved connection, or undefined until a Base URL is stored. */
  connection(): CustomMusicConnection | undefined {
    const baseUrl = this.#settings.baseUrl;
    if (!baseUrl) return undefined;
    return {
      baseUrl,
      ...stringField(this.#settings, "apiKey"),
      model: this.#settings.model ?? CUSTOM_MUSIC_DEFAULT_MODEL,
      ...stringField(this.#settings, "style"),
      ...stringField(this.#settings, "voice"),
    };
  }

  async update(
    patch: CustomMusicSettingsUpdate,
  ): Promise<ReturnType<CustomMusicSettingsStore["get"]>> {
    await this.#mutate(async () => {
      const next: StoredCustomMusicSettings = { ...this.#settings };
      if ("baseUrl" in patch)
        next.baseUrl =
          optionalText(patch.baseUrl, "Base URL", (value) =>
            normalizeEndpoint(value),
          ) ?? undefined;
      if ("apiKey" in patch)
        next.apiKey =
          optionalText(patch.apiKey, "API key", (value) => {
            if (!/^[\x21-\x7E]+$/.test(value))
              throw new Error(
                `${CUSTOM_MUSIC_PROVIDER_NAME} API key must contain only printable ASCII characters`,
              );
            return value;
          }) ?? undefined;
      if ("model" in patch)
        next.model =
          optionalText(patch.model, "Model ID", (value) =>
            bounded(value, 200, "Model ID"),
          ) ?? undefined;
      if ("style" in patch)
        next.style =
          optionalText(patch.style, "Style", (value) =>
            bounded(value, 200, "Style"),
          ) ?? undefined;
      if ("voice" in patch)
        next.voice =
          optionalText(patch.voice, "Voice", (value) =>
            bounded(value, 200, "Voice"),
          ) ?? undefined;
      await mkdir(path.dirname(this.#filePath), { recursive: true });
      const temporary = `${this.#filePath}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, `${JSON.stringify(next)}\n`, {
          encoding: "utf8",
          mode: 0o600,
        });
        await rename(temporary, this.#filePath);
      } finally {
        await rm(temporary, { force: true }).catch(() => undefined);
      }
      this.#settings = next;
    });
    return this.get();
  }

  async clear(): Promise<void> {
    await this.#mutate(async () => {
      await rm(this.#filePath, { force: true });
      this.#settings = { version: 1 };
    });
  }

  async #mutate(operation: () => Promise<void>): Promise<void> {
    const pending = this.#mutations.then(operation);
    this.#mutations = pending.catch(() => undefined);
    await pending;
  }
}

function stringField(
  source: Record<string, unknown>,
  key: "baseUrl" | "apiKey" | "model" | "style" | "voice",
): Partial<Pick<StoredCustomMusicSettings, typeof key>> {
  const value = source[key];
  return typeof value === "string" && value ? { [key]: value } : {};
}

function optionalText(
  value: string | null | undefined,
  label: string,
  validate: (value: string) => string,
): string | undefined {
  if (value === undefined) return undefined;
  if (value === null) return undefined;
  const normalized = value.trim();
  if (!normalized)
    throw new Error(`${CUSTOM_MUSIC_PROVIDER_NAME} ${label} must not be empty`);
  return validate(normalized);
}

function bounded(value: string, max: number, label: string): string {
  if (value.length > max)
    throw new Error(
      `${CUSTOM_MUSIC_PROVIDER_NAME} ${label} must be ${max} characters or fewer`,
    );
  return value;
}
