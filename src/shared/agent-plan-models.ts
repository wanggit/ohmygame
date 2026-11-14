import type { CustomProviderModel, ImageAspectRatio, VideoAspectRatio, VideoResolution } from "./contracts.js";

/** Ark Agent Plan subscription gateway: the metered Ark API family behind a dedicated Base URL and key. */
export const AGENT_PLAN_BASE_URL = "https://ark.cn-beijing.volces.com/api/plan/v3";

/** The plan endpoint has no `GET /models` listing (it 404s), so its catalog ships in-app. */
export function usesAgentPlanPresets(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl.trim());
    return url.hostname === "ark.cn-beijing.volces.com" &&
      url.pathname.replace(/\/+$/, "").endsWith("/api/plan/v3");
  } catch {
    return false;
  }
}

const IMAGE_ASPECT_RATIOS: readonly ImageAspectRatio[] = ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9"];
const VIDEO_ASPECT_RATIOS: readonly VideoAspectRatio[] = ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];

function languageModel(id: string, name: string, contextWindow: number, maxTokens: number): CustomProviderModel {
  return { id, name, api: "openai-completions", contextWindow, maxTokens, reasoning: false, supportsImages: false, usages: { language: true } };
}

function imageModel(id: string, name: string, maxReferenceImages: number): CustomProviderModel {
  return {
    id, name, api: "openai-completions", contextWindow: 128_000, maxTokens: 16_384,
    reasoning: false, supportsImages: false,
    usages: { image: {
      protocol: "volcengine-images",
      resolutions: ["1K", "1.5K", "2K"],
      aspectRatios: [...IMAGE_ASPECT_RATIOS],
      maxReferenceImages, maxOutputs: 1,
    } },
  };
}

function videoModel(id: string, name: string, resolutions: VideoResolution[], durations: number[], maxReferenceImages: number): CustomProviderModel {
  return {
    id, name, api: "openai-completions", contextWindow: 128_000, maxTokens: 16_384,
    reasoning: false, supportsImages: false,
    usages: { video: {
      protocol: "seedance",
      resolutions,
      aspectRatios: [...VIDEO_ASPECT_RATIOS],
      durations, maxReferenceImages, referenceModes: ["reference", "frame"],
    } },
  };
}

function integers(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

/**
 * The Agent Plan activation list (language, Seedream image and Seedance video
 * models) with request-ready uses, protocols and limits. Models are spelled as
 * the plan documents them: some with dots (`doubao-seedream-5.0-flash`), some
 * with dashes (`doubao-seedream-5-0-pro`).
 */
export function agentPlanPresetModels(): CustomProviderModel[] {
  return [
    languageModel("doubao-seed-2.1-pro", "Doubao Seed 2.1 Pro", 1_048_576, 262_144),
    languageModel("doubao-seed-2.1-lite", "Doubao Seed 2.1 Lite", 1_048_576, 262_144),
    languageModel("doubao-seed-2.0-mini", "Doubao Seed 2.0 Mini", 262_144, 131_072),
    languageModel("doubao-seed-evolving", "Doubao Seed Evolving", 1_048_576, 262_144),
    languageModel("glm-5.3", "GLM 5.3", 1_048_576, 131_072),
    languageModel("glm-5.3-flash", "GLM 5.3 Flash", 1_048_576, 131_072),
    languageModel("deepseek-v4-flash", "DeepSeek V4 Flash", 1_048_576, 393_216),
    languageModel("deepseek-v4-pro", "DeepSeek V4 Pro", 1_048_576, 393_216),
    languageModel("deepseek-v4.1-flash", "DeepSeek V4.1 Flash", 1_048_576, 393_216),
    languageModel("deepseek-v4.1-flash-economy", "DeepSeek V4.1 Flash Economy", 1_048_576, 393_216),
    languageModel("kimi-k2.8-preview", "Kimi K2.8 Preview", 1_048_576, 1_048_576),
    languageModel("kimi-k3.1-pro", "Kimi K3.1 Pro", 1_048_576, 1_048_576),
    imageModel("doubao-seedream-5-0-pro", "Doubao Seedream 5.0 Pro", 10),
    imageModel("doubao-seedream-5.0-flash", "Doubao Seedream 5.0 Flash", 10),
    videoModel("doubao-seedance-2.5", "Doubao Seedance 2.5", ["480p", "720p", "1080p"], integers(4, 30), 30),
    videoModel("doubao-seedance-2.0", "Doubao Seedance 2.0", ["480p", "720p", "1080p", "4K"], integers(4, 15), 9),
    videoModel("doubao-seedance-2.0-fast", "Doubao Seedance 2.0 Fast", ["480p", "720p", "1080p"], integers(4, 15), 9),
    videoModel("doubao-seedance-2.0-mini", "Doubao Seedance 2.0 Mini", ["480p", "720p", "1080p"], integers(4, 15), 9),
  ];
}