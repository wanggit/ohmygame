import { readFile } from "node:fs/promises";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { CustomProviderDetails, MediaModelCatalog, VideoModel, VideoModelRef } from "../shared/contracts.js";
import { customVideoModel } from "../shared/custom-models.js";
import { customMediaSource } from "./custom-media-source.js";
import type { ImageSource } from "./image-adapters.js";
import {
  VideoGenerationError,
  type GeneratedVideo,
  type VideoGenerationInput,
  type VideoGenerator,
  type VideoReferenceAsset,
} from "./video-generation.js";
import {
  listOpenRouterVideoModels,
  openRouterHeaders,
  resolveOpenRouterMediaSource,
  type OpenRouterMediaSource,
} from "./openrouter-media.js";
import { SeedanceProvider } from "./seedance-provider.js";
import { isSeedanceProviderId, SEEDANCE_PROVIDER_IDS, SEEDANCE_PROVIDERS, seedanceModel, seedanceModels, type SeedanceProviderId } from "./seedance-models.js";
import { MinimaxProvider } from "./minimax-provider.js";
import { isMinimaxProviderId, MINIMAX_PROVIDER_IDS, MINIMAX_PROVIDERS, minimaxModel, minimaxModels, type MinimaxProviderId } from "./minimax-models.js";

const MAX_WAIT_MS = 15 * 60_000;
const POLL_INTERVAL_MS = 5_000;
/** `/videos/generations` renders synchronously; 10-second clips can take 8–15 minutes. */
const VIDEOS_GENERATIONS_TIMEOUT_MS = 30 * 60_000;

export class ProviderVideos implements VideoGenerator {
  constructor(
    private readonly runtime: () => Promise<ModelRuntime>,
    private readonly request: typeof fetch = fetch,
    private readonly seedanceApiKey: (providerId: SeedanceProviderId) => string | undefined = () => undefined,
    private readonly isEnabled: (provider: string) => boolean = () => true,
    private readonly options: { customProviders?: () => Promise<CustomProviderDetails[]>; defaultModel?: () => VideoModelRef | undefined; minimaxApiKey?: (providerId: MinimaxProviderId) => string | undefined } = {},
  ) {}

  async models(signal?: AbortSignal): Promise<VideoModel[]> {
    return (await this.catalog(signal)).models;
  }

  /** Every connected video provider with its models, or the reason it has none. */
  async catalog(signal?: AbortSignal): Promise<MediaModelCatalog<VideoModel>> {
    const custom = await this.options.customProviders?.() ?? [];
    const entries = await Promise.all([
      this.#openRouterCatalog(signal),
      ...SEEDANCE_PROVIDER_IDS.map(async (providerId) => {
        if (!this.isEnabled(providerId) || !this.seedanceApiKey(providerId)) return undefined;
        const definition = SEEDANCE_PROVIDERS[providerId];
        const models = seedanceModels(providerId);
        return {
          models,
          provider: { provider: definition.id, providerName: definition.name, state: "ready" as const },
        };
      }),
      ...MINIMAX_PROVIDER_IDS.map(async (providerId) => {
        if (!this.isEnabled(providerId) || !this.options.minimaxApiKey?.(providerId)) return undefined;
        const definition = MINIMAX_PROVIDERS[providerId];
        const models = minimaxModels(providerId);
        return {
          models,
          provider: { provider: definition.id, providerName: definition.name, state: "ready" as const },
        };
      }),
      ...custom.filter((provider) => this.isEnabled(provider.id) && provider.models.some((model) => model.usages?.video)).map(async (provider) => {
        if (!(await this.runtime()).hasConfiguredAuth(provider.id)) return undefined;
        const models = provider.models.filter((model) => !provider.hiddenModelIds.includes(model.id)).flatMap((model) => {
          const video = customVideoModel(provider, model);
          return video ? [video] : [];
        });
        return { models, provider: { provider: provider.id, providerName: provider.name, state: models.length ? "ready" as const : "empty" as const,
          ...(!models.length ? { message: "Enable video models in Models." } : {}) } };
      }),
    ]);
    const connected = entries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    const defaultModel = this.options.defaultModel?.();
    const models = connected.flatMap((entry) => entry.models);
    const index = models.findIndex((model) => sameModel(model, defaultModel));
    if (index > 0) models.unshift(...models.splice(index, 1));
    return { models, providers: connected.map((entry) => entry.provider), ...(defaultModel ? { defaultModel } : {}) };
  }

  async #openRouterCatalog(signal?: AbortSignal): Promise<{ models: VideoModel[]; provider: MediaModelCatalog<VideoModel>["providers"][number] } | undefined> {
    if (!this.isEnabled("openrouter")) return undefined;
    const source = await this.runtime().then((runtime) => resolveOpenRouterMediaSource(runtime, signal)).catch(() => undefined);
    if (!source) return undefined;
    try {
      const models = await listOpenRouterVideoModels(source, this.request, signal);
      return {
        models,
        provider: models.length
          ? { provider: "openrouter", providerName: "OpenRouter", state: "ready" }
          : { provider: "openrouter", providerName: "OpenRouter", state: "empty", message: "OpenRouter lists no video models for this account." },
      };
    } catch (cause) {
      return { models: [], provider: { provider: "openrouter", providerName: "OpenRouter", state: "error", message: cause instanceof Error ? cause.message : String(cause) } };
    }
  }

  async generate(input: VideoGenerationInput, signal?: AbortSignal): Promise<GeneratedVideo> {
    input = { ...input, model: input.model ?? this.options.defaultModel?.() };
    if (!this.isEnabled(input.model?.provider ?? "openrouter")) throw new VideoGenerationError("The selected provider is disabled", 409);
    const custom = (await this.options.customProviders?.() ?? []).find((provider) => provider.id === input.model?.provider);
    if (custom) {
      const selected = custom.models.find((model) => model.id === input.model?.id && !custom.hiddenModelIds.includes(model.id));
      const model = selected && customVideoModel(custom, selected);
      const config = selected?.usages?.video;
      if (!model || !config) throw new VideoGenerationError("The selected video model is not available", 503);
      const runtime = await this.runtime();
      if (!runtime.hasConfiguredAuth(custom.id)) throw new VideoGenerationError("Video generation is not configured", 503);
      const source = await customMediaSource(runtime, custom, config.baseUrl, signal);
      if (config.protocol === "seedance") return new SeedanceProvider("volcengine-ark", () => source.apiKey, this.request, undefined, undefined,
        { name: custom.name, baseUrl: source.baseUrl, headers: source.headers, authentication: source.authentication }).generate(model, input, signal);
      if (config.protocol === "openai-videos") return this.#generateVideosGenerations(source, model, input, signal);
      return this.#generateOpenRouter({ ...source, headers: source.headers ?? {} }, model, input, signal);
    }
    if (input.model && isMinimaxProviderId(input.model.provider)) {
      const providerId = input.model.provider;
      const model = minimaxModel(providerId, input.model.id);
      if (!model) throw new VideoGenerationError("The selected video model is not available", 503);
      return new MinimaxProvider(providerId, () => this.options.minimaxApiKey?.(providerId), this.request)
        .generate(model, input, signal);
    }
    if (input.model && isSeedanceProviderId(input.model.provider)) {
      const providerId = input.model.provider;
      const model = seedanceModel(providerId, input.model.id);
      if (!model) throw new VideoGenerationError("The selected video model is not available", 503);
      return new SeedanceProvider(providerId, () => this.seedanceApiKey(providerId), this.request)
        .generate(model, input, signal);
    }
    const runtime = await this.runtime();
    const source = await resolveOpenRouterMediaSource(runtime, signal);
    if (source) {
      const models = await listOpenRouterVideoModels(source, this.request, signal);
      const model = models.find((candidate) => sameModel(candidate, input.model));
      if (model) return this.#generateOpenRouter(source, model, input, signal);
    }
    throw new VideoGenerationError("The selected video model is not available", 503);
  }

  async #generateOpenRouter(source: OpenRouterMediaSource, model: VideoModel, input: VideoGenerationInput, signal?: AbortSignal): Promise<GeneratedVideo> {
    const duration = input.duration ?? model.durations[0]!;
    const resolution = input.resolution ?? model.resolutions[0]!;
    const aspectRatio = input.aspectRatio ?? model.aspectRatios[0]!;
    if (!model.durations.includes(duration)) throw new VideoGenerationError("Video duration is not supported by the selected model", 400);
    if (!model.resolutions.includes(resolution)) throw new VideoGenerationError("Video resolution is not supported by the selected model", 400);
    if (!model.aspectRatios.includes(aspectRatio)) throw new VideoGenerationError("Video aspect ratio is not supported by the selected model", 400);
    const references = input.references ?? [];
    const mode = input.referenceMode ?? model.imageReferenceMode ?? "reference";
    if (!(model.referenceModes ?? [model.imageReferenceMode ?? "reference"]).includes(mode)) throw new VideoGenerationError("The selected video model does not support this reference mode", 400);
    if (references.some((reference) => reference.type !== "image")) {
      throw new VideoGenerationError("OpenRouter video generation currently supports image references only", 400);
    }
    const maxReferences = mode === "frame" ? Math.min(2, model.maxImageReferences) : model.maxImageReferences;
    if (references.length > maxReferences) {
      throw new VideoGenerationError(`The selected video model supports up to ${maxReferences} reference images`, 400);
    }
    const referenceItems = await Promise.all(references.map(referenceItem));
    const referencePayload = mode === "frame" && referenceItems.length
      ? { frame_images: referenceItems.slice(0, 2).map((reference, index) => ({ ...reference, frame_type: index === 0 ? "first_frame" : "last_frame" })) }
      : referenceItems.length ? { input_references: referenceItems } : {};
    const created = await json(await this.request(`${source.baseUrl}/videos`, {
      method: "POST",
      headers: openRouterHeaders(source, true),
      body: JSON.stringify({
        model: model.id,
        prompt: input.prompt,
        duration,
        resolution,
        aspect_ratio: aspectRatio,
        ...referencePayload,
      }),
      signal,
    }), "OpenRouter video generation request failed");
    const requestId = string(created.id);
    const pollingUrl = httpUrl(created.polling_url) ?? (requestId ? `${source.baseUrl}/videos/${encodeURIComponent(requestId)}` : undefined);
    if (!requestId || !pollingUrl) throw new VideoGenerationError("OpenRouter returned no video job ID");

    const deadline = Date.now() + MAX_WAIT_MS;
    while (Date.now() < deadline) {
      signal?.throwIfAborted();
      const status = await json(await this.request(pollingUrl, { headers: new URL(pollingUrl).origin === new URL(source.baseUrl).origin ? openRouterHeaders(source) : {}, signal }), "OpenRouter video status request failed");
      const state = string(status.status)?.toLowerCase();
      if (state === "completed" || state === "succeeded" || state === "success") {
        const contentUrl = firstHttpUrl(status.unsigned_urls) ?? httpUrl(status.content_url) ?? `${source.baseUrl}/videos/${encodeURIComponent(requestId)}/content`;
        const content = await this.request(contentUrl, { headers: new URL(contentUrl).origin === new URL(source.baseUrl).origin ? openRouterHeaders(source) : {}, signal });
        if (!content.ok) throw new VideoGenerationError(`OpenRouter video download failed (${content.status})`, content.status);
        return { bytes: Buffer.from(await content.arrayBuffer()), mediaType: "video/mp4", requestId };
      }
      if (state === "failed" || state === "failure" || state === "error" || state === "expired" || state === "cancelled") {
        throw new VideoGenerationError(errorMessage(status.error) ?? `OpenRouter video generation ${state}`);
      }
      await delay(POLL_INTERVAL_MS, signal);
    }
    throw new VideoGenerationError("OpenRouter video generation timed out", 504);
  }

  async #generateVideosGenerations(source: ImageSource, model: VideoModel, input: VideoGenerationInput, signal?: AbortSignal): Promise<GeneratedVideo> {
    const duration = input.duration ?? model.durations[0]!;
    const resolution = input.resolution ?? model.resolutions[0]!;
    const aspectRatio = input.aspectRatio ?? model.aspectRatios[0]!;
    if (!model.durations.includes(duration)) throw new VideoGenerationError("Video duration is not supported by the selected model", 400);
    if (!model.resolutions.includes(resolution)) throw new VideoGenerationError("Video resolution is not supported by the selected model", 400);
    if (!model.aspectRatios.includes(aspectRatio)) throw new VideoGenerationError("Video aspect ratio is not supported by the selected model", 400);
    if ((input.references ?? []).length) throw new VideoGenerationError("The selected video model does not support reference images", 400);
    const headers = sourceHeaders(source);
    const timeout = AbortSignal.timeout(VIDEOS_GENERATIONS_TIMEOUT_MS);
    let response: Response;
    try {
      response = await this.request(`${source.baseUrl.replace(/\/$/, "")}/videos/generations`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          model: model.id,
          prompt: input.prompt,
          n: 1,
          size: aspectRatio === "adaptive" ? "auto" : aspectRatio,
          duration,
          response_format: "url",
        }),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (cause) {
      if (signal?.aborted) throw signal.reason ?? cause;
      throw new VideoGenerationError(cause instanceof Error && cause.name === "TimeoutError" ? "Video generation timed out" : "Could not reach the video provider", 502);
    }
    const body = await response.json().catch(() => ({})) as { error?: unknown; data?: Array<Record<string, unknown>> };
    if (!response.ok) throw videosGenerationsError(response.status, body.error);
    const result = body.data?.[0];
    const requestId = response.headers.get("x-request-id") ?? undefined;
    if (typeof result?.b64_json === "string" && result.b64_json) {
      const bytes = Buffer.from(result.b64_json, "base64");
      assertMp4(bytes);
      return { bytes, mediaType: "video/mp4", ...(requestId ? { requestId } : {}) };
    }
    if (typeof result?.url === "string" && /^https?:\/\//.test(result.url)) {
      let download: Response;
      try {
        download = await this.request(result.url, {
          headers: new URL(result.url).origin === new URL(source.baseUrl).origin ? headers : {},
          signal,
        });
      } catch (cause) {
        if (signal?.aborted) throw signal.reason ?? cause;
        throw new VideoGenerationError("Could not download the generated video", 502);
      }
      if (!download.ok) throw new VideoGenerationError(`Video download failed (${download.status})`, 502);
      const bytes = Buffer.from(await download.arrayBuffer());
      assertMp4(bytes);
      return { bytes, mediaType: "video/mp4", ...(requestId ? { requestId } : {}) };
    }
    throw new VideoGenerationError("The video provider returned no video", 502);
  }
}

function sourceHeaders(source: ImageSource): Record<string, string> {
  return { ...source.headers, ...(source.authentication === "none" ? {} : { authorization: `Bearer ${source.apiKey}` }) };
}

function videosGenerationsError(status: number, error: unknown): VideoGenerationError {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const detail = errorMessage(error);
  const code = string(record.code);
  if (code === "queue_full" || status === 429) return new VideoGenerationError("Video generation is temporarily rate limited", 429);
  if (code === "login_required" || string(record.type) === "authentication_required") {
    return new VideoGenerationError("The video gateway login expired; re-login in the gateway", 503);
  }
  if (status === 401 || status === 403) return new VideoGenerationError("The video provider credentials were rejected", 503);
  return new VideoGenerationError(detail ?? "Video generation failed", status >= 500 ? 502 : 400);
}

/** MP4 is ISO BMFF; the `ftyp` box normally appears within the first bytes. */
function assertMp4(bytes: Buffer): void {
  if (bytes.length < 12 || !bytes.subarray(0, 64).includes(Buffer.from("ftyp"))) {
    throw new VideoGenerationError("The video provider returned invalid video data", 502);
  }
}

function sameModel(left: VideoModelRef | undefined, right: VideoModelRef | undefined): boolean {
  return Boolean(left && right && left.provider === right.provider && left.id === right.id);
}

async function referenceItem(reference: VideoReferenceAsset) {
  const data = await readFile(reference.absolutePath);
  return {
    type: "image_url" as const,
    image_url: { url: `data:${reference.mediaType};base64,${data.toString("base64")}` },
  };
}

async function json(response: Response, message: string): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (response.ok) return body;
  const detail = errorMessage(body.error);
  if (response.status === 401 || response.status === 403) throw new VideoGenerationError("OpenRouter credentials were rejected", 503);
  if (response.status === 429) throw new VideoGenerationError("OpenRouter video generation is temporarily rate limited", 429);
  throw new VideoGenerationError(detail ?? message, response.status >= 500 ? 502 : 400);
}

function errorMessage(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object" && "message" in value) return string((value as { message?: unknown }).message);
  return undefined;
}

function firstHttpUrl(value: unknown): string | undefined {
  return Array.isArray(value) ? value.map(httpUrl).find(Boolean) : undefined;
}

function httpUrl(value: unknown): string | undefined {
  const candidate = string(value);
  return candidate && /^https?:\/\//.test(candidate) ? candidate : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("Video generation cancelled"));
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
}
