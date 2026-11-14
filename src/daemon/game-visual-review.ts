import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { RuntimeModel } from "./agent.js";
import type { PromptImage, PromptImageMediaType } from "../shared/contracts.js";
import type { GameRuntimeAdapter, GameUseOpenTarget } from "../shared/playtest.js";
import { parseGameVisualReview, type GameVisualReviewReport } from "../shared/game-review.js";

/** A review image with the label the reviewer refers to issues by. */
export interface ReviewImage {
  label: string;
  image: PromptImage;
  /** Extra observation attached to the label, such as the blank-frame heuristic. */
  note?: string;
}

export interface GameVisualReviewEvidence {
  screenshots: ReviewImage[];
  assets: ReviewImage[];
  /** What was and was not captured, so the reviewer and the agent know the evidence's limits. */
  notes: string[];
}

const MAX_SCREENSHOTS = 4;
const MAX_ASSETS = 6;
const MAX_ASSET_BYTES = 3 * 1024 * 1024;
const REVIEW_TIMEOUT_MS = 180_000;
const SKIP_DIRECTORIES = new Set(["node_modules", "dist", "build", "out", ".git", ".runtime", ".data", "canvas-backups", "coverage", ".ohmygame", "tmp"]);
const IMAGE_MEDIA_TYPES: Record<string, PromptImageMediaType> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

type ActRequest = Extract<Parameters<GameRuntimeAdapter["request"]>[0], { operation: "act" }>;


/**
 * Plays the game briefly through the playtest runtime and captures the screens an
 * independent reviewer should judge. Each step degrades gracefully: whatever was
 * captured before a failure is still reviewed.
 */
export async function collectGameplayScreenshots(
  driver: GameRuntimeAdapter,
  resolveOpenTarget: () => Promise<GameUseOpenTarget>,
  signal?: AbortSignal,
): Promise<{ screenshots: ReviewImage[]; notes: string[] }> {
  const screenshots: ReviewImage[] = [];
  const notes: string[] = [];
  let sessionId: string | undefined;
  const capture = async (state: string) => {
    if (screenshots.length >= MAX_SCREENSHOTS || !sessionId) return;
    const result = await driver.request({ operation: "capture", sessionId }, signal);
    if (result.operation !== "capture") return;
    const shot = result.capture;
    screenshots.push({
      label: `Gameplay screenshot ${screenshots.length + 1} — ${state}`,
      image: { mediaType: shot.mediaType, data: shot.data },
      ...(shot.analysis.likelyBlank ? { note: "pixel analysis flags this frame as likely blank" } : {}),
    });
  };
  const act = async (actions: ActRequest["actions"]) => {
    if (!sessionId) return;
    await driver.request({ operation: "act", sessionId, actions }, signal);
  };
  try {
    const target = await resolveOpenTarget();
    const open = await driver.request({ operation: "open", target, viewport: { width: 1280, height: 720 } }, signal);
    if (open.operation !== "open") throw new Error("The game preview did not open");
    sessionId = open.snapshot.sessionId;
    await capture("initial screen at 1280x720");
    await act([
      { type: "click", target: { x: 640, y: 360 } },
      { type: "wait", milliseconds: 900 },
    ]).catch(() => notes.push("The starting click did not complete; the review may only cover the initial screen."));
    await capture("after a click at the center (likely the start or primary action)");
    await act([
      { type: "press", key: "Space" },
      { type: "wait", milliseconds: 400 },
      { type: "press", key: "ArrowRight" },
      { type: "wait", milliseconds: 400 },
      { type: "click", target: { x: 640, y: 360 } },
      { type: "wait", milliseconds: 700 },
    ]).catch(() => notes.push("Some gameplay inputs did not complete."));
    await capture("after gameplay inputs (Space, ArrowRight, click)");
    await act([
      { type: "resize", viewport: { width: 390, height: 844 } },
      { type: "wait", milliseconds: 600 },
    ]).catch(() => notes.push("The mobile viewport resize did not complete."));
    await capture("mobile viewport 390x844");
    if (screenshots.length < 2) notes.push("Fewer than two gameplay states were captured; treat the review as partial.");
  } catch (cause) {
    notes.push(`Playtest capture stopped early: ${cause instanceof Error ? cause.message : String(cause)}`);
  } finally {
    if (sessionId) await driver.request({ operation: "close", sessionId }).catch(() => {});
  }
  return { screenshots, notes };
}

async function collectWorkspaceImages(workspace: string): Promise<{ assets: ReviewImage[]; notes: string[] }> {
  const notes: string[] = [];
  const candidates: Array<{ path: string; priority: number }> = [];
  const consider = (relative: string, priority: number) => {
    const mediaType = IMAGE_MEDIA_TYPES[path.extname(relative).toLowerCase()];
    if (mediaType) candidates.push({ path: relative, priority });
  };
  const walk = async (directory: string, depth: number) => {
    if (depth > 4 || candidates.length > 200) return;
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(workspace, absolute);
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name) && !entry.name.startsWith(".")) await walk(absolute, depth + 1);
      } else if (entry.isFile()) {
        consider(relative, relative.split(path.sep)[0] === "assets" ? 0 : 1);
      }
    }
  };
  // Generated canvas assets are the most likely source of visual defects; review them first.
  try {
    const manifest = JSON.parse(await readFile(path.join(workspace, "canvas", "assets.json"), "utf8")) as { assets?: Record<string, { path?: unknown }> };
    for (const entry of Object.values(manifest.assets ?? {})) {
      if (entry && typeof entry.path === "string") consider(entry.path, -1);
    }
  } catch { /* No canvas asset manifest; the workspace scan below still applies. */ }
  await walk(workspace, 0);
  const unique = new Map<string, number>();
  for (const candidate of candidates) {
    const priority = unique.get(candidate.path);
    if (priority === undefined || candidate.priority < priority) unique.set(candidate.path, candidate.priority);
  }
  const ordered = [...unique.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  const assets: ReviewImage[] = [];
  for (const [relative] of ordered) {
    if (assets.length >= MAX_ASSETS) break;
    const absolute = path.join(workspace, relative);
    try {
      const info = await stat(absolute);
      if (!info.isFile() || info.size > MAX_ASSET_BYTES) continue;
      const data = await readFile(absolute);
      assets.push({
        label: `Game asset: ${relative}`,
        image: { mediaType: IMAGE_MEDIA_TYPES[path.extname(relative).toLowerCase()], data: data.toString("base64"), name: path.basename(relative) },
      });
    } catch { /* Skip unreadable files. */ }
  }
  if (ordered.length > assets.length) notes.push(`${ordered.length - assets.length} image asset(s) were skipped (unreadable, oversized, or above the review limit).`);
  return { assets, notes };
}

/** Collects the evidence an independent visual review judges: gameplay screenshots plus image assets. */
export async function collectGameVisualReviewEvidence(options: {
  driver: GameRuntimeAdapter;
  resolveOpenTarget: () => Promise<GameUseOpenTarget>;
  workspace: string;
  signal?: AbortSignal;
}): Promise<GameVisualReviewEvidence> {
  const [gameplay, workspaceImages] = await Promise.all([
    collectGameplayScreenshots(options.driver, options.resolveOpenTarget, options.signal),
    collectWorkspaceImages(options.workspace),
  ]);
  return {
    screenshots: gameplay.screenshots,
    assets: workspaceImages.assets,
    notes: [...gameplay.notes, ...workspaceImages.notes],
  };
}

const REVIEW_SYSTEM_PROMPT = [
  "You are an independent game visual QA reviewer. You did not build this game and you cannot see its code or its author's intentions; judge only the attached evidence the way a demanding player or a portal's QA reviewer would.",
  "",
  "Gameplay screenshots are labeled by the state they were captured in. For each, check:",
  "- Blank, black, or stuck-loading frames (a game screen should never be empty).",
  "- Playfield visibility and framing: the game area is visible and not cut off.",
  "- HUD and UI obstruction, clipping, overflow, elements running off screen or overlapping the play area.",
  "- Text readability: legible size and contrast, no unreadable labels or garbled characters.",
  "- Alignment, spacing, and visual hierarchy: the primary action is obvious at a glance.",
  "- Art style coherence: sprites, backgrounds, and UI should not clash in style or palette.",
  "- The 3-second test: could a stranger seeing only this screen say what the game is about? If not, say what blocks it.",
  "- On the mobile viewport screenshot: responsive layout, touch target size, no crushed or hidden controls.",
  "",
  "Game assets are labeled by their file path. For each, check:",
  "- Provider watermarks, signatures, or painted-in text.",
  "- Painted-in checkerboard patterns that fake transparency instead of real alpha.",
  "- Stretched, squashed, or wrongly anchored sprites; white or dark halos around cutouts.",
  "- Heavy blur or pixelation at display size; style or palette clashes with the rest of the game.",
  "",
  'Return ONLY a JSON object, no commentary: {"verdict":"pass"|"needs-work"|"reject","summary":"one short paragraph","issues":[{"severity":"blocker"|"major"|"minor","area":"blank-frame"|"layout"|"hud"|"readability"|"style"|"asset-quality"|"responsiveness"|"other","where":"screenshot label or asset path","description":"what is wrong and why a player would notice","suggestion":"concrete fix"}]}.',
  'Verdict rules: "reject" when any blocker exists (blank core frame, broken core presentation, unreadable core text, watermark shipped in an asset); "needs-work" when major issues exist or many minor ones; "pass" otherwise. An issue only counts when you can point at the evidence; never invent problems outside the images.',
].join("\n");

function reviewUserContent(evidence: GameVisualReviewEvidence, projectName?: string, projectType?: string): Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> {
  const images = [...evidence.screenshots, ...evidence.assets];
  const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [{
    type: "text",
    text: `Review the visuals and image assets of this game${projectName ? ` ("${projectName}")` : ""}${projectType ? ` of type ${projectType}` : ""}. ${images.length} image(s) follow, each introduced by its label.`,
  }];
  for (const item of images) {
    content.push({ type: "text", text: item.note ? `${item.label} (${item.note})` : item.label });
    content.push({ type: "image", data: item.image.data, mimeType: item.image.mediaType });
  }
  return content;
}

/**
 * Runs the independent visual review on collected evidence. The reviewer gets a
 * fresh context — only the rubric and the images — so its judgement is separate
 * from the agent that built the game.
 */
export async function runGameVisualReview(
  runtime: ModelRuntime,
  model: RuntimeModel,
  input: GameVisualReviewEvidence & { projectName?: string; projectType?: string },
  signal?: AbortSignal,
): Promise<GameVisualReviewReport> {
  const images = input.screenshots.length + input.assets.length;
  if (!images) throw new Error("No screenshots or image assets were collected to review");
  if (!model.input.includes("image")) throw new Error(`The review model ${model.provider}/${model.id} does not accept images. Choose a model that accepts images.`);
  const timeout = AbortSignal.timeout(REVIEW_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await runtime.completeSimple(model, {
    systemPrompt: REVIEW_SYSTEM_PROMPT,
    messages: [{ role: "user", content: reviewUserContent(input, input.projectName, input.projectType), timestamp: Date.now() }],
  }, {
    maxTokens: Math.min(model.maxTokens, 4_000),
    maxRetries: 1,
    signal: combined,
  });
  if (response.stopReason === "error" || response.stopReason === "aborted") {
    throw new Error(response.errorMessage?.trim() || `The visual review did not complete (${response.stopReason})`);
  }
  const text = response.content.filter((content) => content.type === "text").map((content) => content.text).join("").trim();
  const parsed = parseGameVisualReview(text);
  return {
    ...parsed,
    screenshotsReviewed: input.screenshots.length,
    assetsReviewed: input.assets.length,
    model: { provider: model.provider, id: model.id },
  };
}
