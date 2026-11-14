import type { ImageAspectRatio, ImageSizeFormat } from "./contracts.js";

export const SEEDREAM_REFERENCE_LIMITS = {
  "doubao-seedream-5-0-pro-260628": 10,
  "doubao-seedream-5-0-flash-260915": 10,
  "doubao-seedream-5-0-260128": 14,
} as const;

/** FreeAiProxy image models: one calibrated reference; wenxin has no upload entry. */
export const FREEAIPROXY_IMAGE_REFERENCE_LIMITS = {
  "doubao-image": 1,
  "yuanbao-image": 1,
  "chatglm-image": 1,
  "wenxin-image": 0,
} as const;

/**
 * FreeAiProxy image models take aspect ratios ("1:1") as `size` and reject pixel
 * sizes like "1024x1024". Calibrated per model where the gateway documents a list;
 * unlisted ratios are accepted and ignored by chatglm/wenxin.
 */
export const FREEAIPROXY_IMAGE_ASPECT_RATIOS: Record<string, readonly ImageAspectRatio[]> = {
  "doubao-image": ["1:1", "2:3", "3:2", "3:4", "4:3", "16:9", "9:16"],
  "yuanbao-image": ["1:1", "3:4", "4:3", "16:9", "9:16"],
};

function freeAiProxyImageModel(modelId: string): keyof typeof FREEAIPROXY_IMAGE_REFERENCE_LIMITS | undefined {
  const id = modelId.split("/").at(-1) ?? modelId;
  return Object.hasOwn(FREEAIPROXY_IMAGE_REFERENCE_LIMITS, id) ? id as keyof typeof FREEAIPROXY_IMAGE_REFERENCE_LIMITS : undefined;
}

/** Reference counts used when a provider lists a known model without its limits. */
export function knownImageReferenceLimit(modelId: string): number | undefined {
  const id = modelId.split("/").at(-1) ?? modelId;
  if (/^gpt-image-/.test(id)) return 16;
  if (/^gemini-3(?:\.\d+)?-[\w.-]*-image(?:-|$)/.test(id)) return 14;
  if (/^gemini-2\.5-flash-image(?:-|$)/.test(id)) return 3;
  const freeAiProxy = freeAiProxyImageModel(modelId);
  if (freeAiProxy) return FREEAIPROXY_IMAGE_REFERENCE_LIMITS[freeAiProxy];
  return Object.hasOwn(SEEDREAM_REFERENCE_LIMITS, id) ? SEEDREAM_REFERENCE_LIMITS[id as keyof typeof SEEDREAM_REFERENCE_LIMITS] : undefined;
}

/** Aspect ratios sent as `size` for known models; unknown models keep the full default list. */
export function knownImageAspectRatios(modelId: string): readonly ImageAspectRatio[] | undefined {
  const id = modelId.split("/").at(-1) ?? modelId;
  return FREEAIPROXY_IMAGE_ASPECT_RATIOS[id];
}

/** Known FreeAiProxy image models need aspect-ratio sizes; pixel sizes are rejected. */
export function knownImageSizeFormat(modelId: string): ImageSizeFormat | undefined {
  return freeAiProxyImageModel(modelId) ? "aspect-ratio" : undefined;
}
