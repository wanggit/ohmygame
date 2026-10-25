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

/** Reference counts used when a provider lists a known model without its limits. */
export function knownImageReferenceLimit(modelId: string): number | undefined {
  const id = modelId.split("/").at(-1) ?? modelId;
  if (/^gpt-image-/.test(id)) return 16;
  if (/^gemini-3(?:\.\d+)?-[\w.-]*-image(?:-|$)/.test(id)) return 14;
  if (/^gemini-2\.5-flash-image(?:-|$)/.test(id)) return 3;
  if (Object.hasOwn(FREEAIPROXY_IMAGE_REFERENCE_LIMITS, id)) return FREEAIPROXY_IMAGE_REFERENCE_LIMITS[id as keyof typeof FREEAIPROXY_IMAGE_REFERENCE_LIMITS];
  return Object.hasOwn(SEEDREAM_REFERENCE_LIMITS, id) ? SEEDREAM_REFERENCE_LIMITS[id as keyof typeof SEEDREAM_REFERENCE_LIMITS] : undefined;
}
