/** Design confirmation gate: the agent may not produce media before the user confirms the main design. */
export const DESIGN_CONFIRMATION_FILE = "canvas/design-confirmation.json";

export interface DesignConfirmationRecord {
  version: 1;
  documentId: string;
  revision: string;
  confirmedAt: string;
}

export type DesignGateState =
  | { status: "not-required" }
  | { status: "confirmed"; documentId: string; revision: string; confirmedAt: string }
  | { status: "awaiting"; documentId: string; revision: string; reason: "missing" | "stale" }
  | { status: "no-main-document" };

/** Project types whose agent must wait for a confirmed main design before generating media. */
export function designGateRequired(projectType: string): boolean {
  return projectType !== "asset-canvas";
}

/** Agent tool names that produce media and therefore wait for design confirmation. */
export const DESIGN_GATE_TOOL_NAMES: ReadonlySet<string> = new Set([
  "generate_canvas_media",
  "generate_image",
  "generate_video",
  "generate_3d_asset",
  "animate_3d_asset",
  "generate_speech",
  "generate_sound_effect",
  "generate_music",
]);

export function isDesignConfirmationRecord(value: unknown): value is DesignConfirmationRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as DesignConfirmationRecord;
  return record.version === 1
    && typeof record.documentId === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(record.documentId)
    && typeof record.revision === "string" && record.revision.length > 0
    && typeof record.confirmedAt === "string";
}

/** Pure gate decision from the main document's revision and the stored confirmation record. */
export function designGateState(
  projectType: string,
  main: { documentId: string; revision: string } | undefined,
  record: DesignConfirmationRecord | undefined,
): DesignGateState {
  if (!designGateRequired(projectType)) return { status: "not-required" };
  if (!main) return { status: "no-main-document" };
  if (!record || record.documentId !== main.documentId) return { status: "awaiting", ...main, reason: "missing" };
  if (record.revision !== main.revision) return { status: "awaiting", ...main, reason: "stale" };
  return { status: "confirmed", documentId: main.documentId, revision: main.revision, confirmedAt: record.confirmedAt };
}

/** Message returned to the agent when a production tool is blocked. */
export function designGateBlockReason(state: DesignGateState): string | undefined {
  if (state.status === "confirmed" || state.status === "not-required") return undefined;
  const guidance = "Discuss the core loop with the user and write the main design document, then ask the user to confirm it (Design canvas → Confirm design) before generating any media. Refine the design first; do not work around this gate.";
  if (state.status === "no-main-document") return `Design gate: this project has no main design document yet. ${guidance}`;
  return `Design gate: the main design document is ${state.reason === "stale" ? "edited since the last confirmation" : "not confirmed"}. ${guidance}`;
}
