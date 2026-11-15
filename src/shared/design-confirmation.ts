/** Design confirmation gate: the agent may not produce media before the user confirms the main design. */
export const DESIGN_CONFIRMATION_FILE = "canvas/design-confirmation.json";

export interface DesignConfirmationRecord {
  version: 1;
  documentId: string;
  revision: string;
  confirmedAt: string;
  /** Heading fingerprint of the document at confirmation time. Edits that keep it intact refine the confirmed design instead of reopening the gate. */
  structure?: string;
  /** Number of visual mockup images embedded in the document when it was confirmed. */
  visualMockups?: number;
}

export type DesignGateState =
  | { status: "not-required" }
  | { status: "confirmed"; documentId: string; revision: string; confirmedAt: string; visualMockups?: number }
  | { status: "awaiting"; documentId: string; revision: string; reason: "missing" | "stale" }
  | { status: "no-main-document" };

/** Minimum embedded mockups for the confirmation to cover visual direction, not just prose. */
export const DESIGN_MOCKUP_GUIDELINE = 2;

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

/**
 * Questions every game main design document must answer in dedicated sections.
 * Heading matching is intentionally loose (English or Chinese wording); the gate
 * only requires that both questions are answered as explicit sections.
 */
export const DESIGN_REQUIRED_SECTIONS: ReadonlyArray<{ heading: string; pattern: RegExp }> = [
  {
    heading: "Why players choose this game",
    pattern: /^#{1,6}\s+.*(?:\bwhy\b[^\n]*\b(players?|this game|choose|pick|us)\b|\b(players?|this game)\b[^\n]*\bchoose\b|(玩家|用户)[^\n]*(为什么|为何)|(为什么|为何)[^\n]*(选|挑)|差异化|卖点)/im,
  },
  {
    heading: "Skills and capabilities required",
    pattern: /^#{1,6}\s+.*(?:\b(skills?|capabilities)\b[^\n]*\b(required|needs?|needed|requirements?)\b|\b(required|needs?|needed|requirements?)\b[^\n]*\b(skills?|capabilities)\b|(技能|能力)[^\n]*(需求|需要|所需|清单))/im,
  },
];

/** Canonical headings of the required sections missing from a main design document's Markdown. */
export function missingDesignSections(markdown: string): string[] {
  return DESIGN_REQUIRED_SECTIONS.filter(({ pattern }) => !pattern.test(markdown)).map(({ heading }) => heading);
}

/** Visual mockup images embedded in a design document's Markdown. */
export function countVisualMockups(markdown: string): number {
  return (markdown.match(/!\[[^\]]*\]\([^)]+\)/g) ?? []).length;
}

export function isDesignConfirmationRecord(value: unknown): value is DesignConfirmationRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as DesignConfirmationRecord;
  return record.version === 1
    && typeof record.documentId === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(record.documentId)
    && typeof record.revision === "string" && record.revision.length > 0
    && typeof record.confirmedAt === "string"
    && (record.structure === undefined || typeof record.structure === "string")
    && (record.visualMockups === undefined || (Number.isInteger(record.visualMockups) && record.visualMockups >= 0));
}

/** Heading fingerprint of a design document: its section skeleton. Content edits that keep it intact refine the confirmed design; adding, removing, or renaming a heading changes it. */
export function designStructure(markdown: string): string {
  return (markdown.match(/^#{1,6}\s+.*$/gm) ?? []).map((line) => line.trim().toLowerCase()).join("\n");
}

/** Pure gate decision from the main document's revision and the stored confirmation record. */
export function designGateState(
  projectType: string,
  main: { documentId: string; revision: string; structure?: string } | undefined,
  record: DesignConfirmationRecord | undefined,
): DesignGateState {
  if (!designGateRequired(projectType)) return { status: "not-required" };
  if (!main) return { status: "no-main-document" };
  const anchor = { documentId: main.documentId, revision: main.revision };
  if (!record || record.documentId !== main.documentId) return { status: "awaiting", ...anchor, reason: "missing" };
  const unchangedRevision = record.revision === main.revision;
  const unchangedStructure = record.structure !== undefined && main.structure !== undefined && record.structure === main.structure;
  if (!unchangedRevision && !unchangedStructure) return { status: "awaiting", ...anchor, reason: "stale" };
  return { status: "confirmed", ...anchor, confirmedAt: record.confirmedAt, ...(record.visualMockups === undefined ? {} : { visualMockups: record.visualMockups }) };
}

/** Message returned to the agent when a production tool is blocked. */
export function designGateBlockReason(state: DesignGateState): string | undefined {
  if (state.status === "confirmed" || state.status === "not-required") return undefined;
  const guidance = `Discuss the core loop with the user and write the main design document — it must include the sections "Why players choose this game" and "Skills and capabilities required" — and embed at least ${DESIGN_MOCKUP_GUIDELINE} visual mockups (generated reference images or code-rendered stills) so the user confirms the visual direction together with the design. Then tell the user the design is on the Design tab at the top of the workspace and ask them to confirm it (open the Design tab, select the main design document node, Confirm design) before generating any media. Refine the design first; do not work around this gate.`;
  if (state.status === "no-main-document") return `Design gate: this project has no main design document yet. ${guidance}`;
  return `Design gate: the main design document is ${state.reason === "stale" ? "edited since the last confirmation" : "not confirmed"}. ${guidance}`;
}
