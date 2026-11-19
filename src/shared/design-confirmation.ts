/** Design gate: the agent may not produce media before the main design document is complete. A complete document is treated as human-approved automatically; there is no user confirmation step. */

export type DesignGateState =
  | { status: "not-required" }
  | { status: "confirmed"; documentId: string; revision: string; visualMockups: number }
  | { status: "awaiting"; documentId: string; revision: string; reason: "missing-sections"; missing: string[] }
  | { status: "no-main-document" };

/** Embedded mockups recommended before heavy art production so the visual direction is settled, not just prose. */
export const DESIGN_MOCKUP_GUIDELINE = 2;

/** Project types whose agent must wait for a complete main design before generating media. */
export function designGateRequired(projectType: string): boolean {
  return projectType !== "asset-canvas";
}

/** Agent tool names that produce media and therefore wait for a complete main design. */
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

/** Pure gate decision from the main design document's content. A document with every required section is complete and therefore treated as human-approved automatically. */
export function designGateState(
  projectType: string,
  main: { documentId: string; revision: string; markdown: string } | undefined,
): DesignGateState {
  if (!designGateRequired(projectType)) return { status: "not-required" };
  if (!main) return { status: "no-main-document" };
  const anchor = { documentId: main.documentId, revision: main.revision };
  const missing = missingDesignSections(main.markdown);
  if (missing.length) return { status: "awaiting", ...anchor, reason: "missing-sections", missing };
  return { status: "confirmed", ...anchor, visualMockups: countVisualMockups(main.markdown) };
}

/** Message returned to the agent when a production tool is blocked. */
export function designGateBlockReason(state: DesignGateState): string | undefined {
  if (state.status === "confirmed" || state.status === "not-required") return undefined;
  const sections = '"Why players choose this game" (why players choose this over similar games with mature gameplay) and "Skills and capabilities required" (the skills building this game needs and their availability)';
  const mockups = `Embed at least ${DESIGN_MOCKUP_GUIDELINE} visual mockups (generated reference images or code-rendered stills) in the main design document so the visual direction is settled before implementation; prose alone invites "the art looks cheap / the layout is boring" rework.`;
  const automatic = "A complete main design document is treated as human-approved automatically — there is no user confirmation step; complete the document and continue.";
  if (state.status === "no-main-document") return `Design gate: this project has no main design document yet. Discuss the core loop with the user and write the main design document — it must include the sections ${sections} — and ${mockups} ${automatic} Refine the design first; do not work around this gate.`;
  return `Design gate: the main design document is missing required sections: ${state.missing.join("; ")}. Add them as dedicated sections answering ${sections}. ${mockups} ${automatic} Refine the design first; do not work around this gate.`;
}
