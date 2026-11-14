import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { RuntimeModel } from "../src/daemon/agent.js";
import { WEB_GAME_USE_CAPABILITIES, type GameRuntimeAdapter, type PlaytestRequest, type PlaytestResult } from "../src/shared/playtest.js";
import { formatGameVisualReview, parseGameVisualReview, type GameVisualReviewReport } from "../src/shared/game-review.js";
import { collectGameVisualReviewEvidence, collectGameplayScreenshots, runGameVisualReview } from "../src/daemon/game-visual-review.js";

const open: PlaytestRequest = { operation: "open", target: { runtime: "web", url: "http://127.0.0.1:1234/" }, viewport: { width: 1280, height: 720 } };

function capture(data: string, likelyBlank = false): PlaytestResult {
  return {
    operation: "capture",
    capture: {
      sessionId: "session-1",
      mediaType: "image/jpeg",
      data,
      width: 1280,
      height: 720,
      analysis: { sampledPixels: 100, opaqueRatio: 1, luminanceMean: 0.5, luminanceVariance: 0.2, likelyBlank },
    },
  };
}

function fakeDriver(request?: (input: PlaytestRequest) => Promise<PlaytestResult>): GameRuntimeAdapter & { requests: PlaytestRequest[] } {
  const requests: PlaytestRequest[] = [];
  return {
    requests,
    available: true,
    capabilities: WEB_GAME_USE_CAPABILITIES,
    close: vi.fn(),
    request: vi.fn(async (input: PlaytestRequest): Promise<PlaytestResult> => {
      requests.push(input);
      if (request) return request(input);
      if (input.operation === "open") {
        return { operation: "open", snapshot: { sessionId: "session-1", runtime: "web", capabilities: WEB_GAME_USE_CAPABILITIES, viewport: input.viewport } };
      }
      if (input.operation === "capture") return capture("ZmFrZQ==");
      if (input.operation === "inspect" || input.operation === "act") {
        return { operation: input.operation, snapshot: { sessionId: "session-1", runtime: "web", capabilities: WEB_GAME_USE_CAPABILITIES, viewport: { width: 1280, height: 720 } } };
      }
      return { operation: input.operation };
    }),
  };
}

function reviewModel(images = true): RuntimeModel {
  return { provider: "test", id: "reviewer", input: images ? ["text", "image"] : ["text"], maxTokens: 8_000 } as unknown as RuntimeModel;
}

function runtimeReturning(text: string): ModelRuntime {
  return {
    completeSimple: vi.fn(async () => ({ stopReason: "stop", content: [{ type: "text", text }] })),
  } as unknown as ModelRuntime;
}

describe("parseGameVisualReview", () => {
  it("parses a plain JSON report and normalizes issues", () => {
    const parsed = parseGameVisualReview(JSON.stringify({
      verdict: "needs-work",
      summary: "Layout is broken.",
      issues: [
        { severity: "major", area: "layout", where: "Gameplay screenshot 1", description: "HUD clips off screen.", suggestion: "Scale the HUD container." },
        { severity: "critical", area: "made-up", description: "   ", where: "" },
      ],
    }));
    expect(parsed.verdict).toBe("needs-work");
    expect(parsed.issues).toEqual([
      { severity: "major", area: "layout", where: "Gameplay screenshot 1", description: "HUD clips off screen.", suggestion: "Scale the HUD container." },
    ]);
  });

  it("parses fenced JSON with commentary and defaults unknown fields", () => {
    const parsed = parseGameVisualReview('Here is my review:\n```json\n{"verdict":"pass","summary":"Looks fine.","issues":[{"description":"Minor nit."}]}\n```\nDone.');
    expect(parsed.verdict).toBe("pass");
    expect(parsed.issues).toEqual([{ severity: "minor", area: "other", where: "unspecified", description: "Minor nit." }]);
  });

  it("rejects replies without a usable report", () => {
    expect(() => parseGameVisualReview("The game looks great!")).toThrow(/JSON report/);
    expect(() => parseGameVisualReview("{not json}")).toThrow(/malformed/);
    expect(() => parseGameVisualReview('{"summary":"x","issues":[]}')).toThrow(/verdict/);
  });
});

describe("formatGameVisualReview", () => {
  it("renders verdict, issues, and evidence notes", () => {
    const report: GameVisualReviewReport = {
      verdict: "reject",
      summary: "Core frame is blank.",
      issues: [{ severity: "blocker", area: "blank-frame", where: "Gameplay screenshot 1", description: "Black screen after start.", suggestion: "Fix the scene boot." }],
      screenshotsReviewed: 3,
      assetsReviewed: 2,
      model: { provider: "test", id: "reviewer" },
    };
    const text = formatGameVisualReview(report, ["The mobile resize did not complete."]);
    expect(text).toContain("verdict: reject");
    expect(text).toContain("[blocker] blank-frame");
    expect(text).toContain("Black screen after start.");
    expect(text).toContain("The mobile resize did not complete.");
    expect(formatGameVisualReview({ ...report, issues: [] }, [])).toContain("No visual issues reported.");
  });
});


describe("collectGameplayScreenshots", () => {
  it("captures the planned states and closes the session", async () => {
    const driver = fakeDriver();
    const { screenshots, notes } = await collectGameplayScreenshots(driver, async () => open.target);
    expect(screenshots.map((shot) => shot.label)).toEqual([
      "Gameplay screenshot 1 — initial screen at 1280x720",
      "Gameplay screenshot 2 — after a click at the center (likely the start or primary action)",
      "Gameplay screenshot 3 — after gameplay inputs (Space, ArrowRight, click)",
      "Gameplay screenshot 4 — mobile viewport 390x844",
    ]);
    expect(notes).toEqual([]);
    expect(driver.requests.some((request) => request.operation === "close")).toBe(true);
  });

  it("keeps earlier screenshots when later steps fail and still closes", async () => {
    const driver = fakeDriver(async (input) => {
      if (input.operation === "capture" && driver.requests.filter((request) => request.operation === "capture").length > 2) throw new Error("capture failed");
      if (input.operation === "open") return { operation: "open", snapshot: { sessionId: "session-1", runtime: "web", capabilities: WEB_GAME_USE_CAPABILITIES, viewport: input.viewport } };
      if (input.operation === "capture") return capture("ZmFrZQ==");
      return { operation: input.operation, snapshot: { sessionId: "session-1", runtime: "web", capabilities: WEB_GAME_USE_CAPABILITIES, viewport: { width: 1280, height: 720 } } };
    });
    const { screenshots, notes } = await collectGameplayScreenshots(driver, async () => open.target);
    expect(screenshots.length).toBe(2);
    expect(notes.some((note) => note.includes("stopped early"))).toBe(true);
    expect(driver.requests.some((request) => request.operation === "close")).toBe(true);
  });

  it("reports an early stop when the preview does not open", async () => {
    const driver = fakeDriver(async () => { throw new Error("no preview"); });
    const { screenshots, notes } = await collectGameplayScreenshots(driver, async () => open.target);
    expect(screenshots).toEqual([]);
    expect(notes.join("\n")).toContain("stopped early");
  });
});

describe("collectGameVisualReviewEvidence", () => {
  it("collects workspace image assets and skips ignored directories", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "ohmygame-visual-review-"));
    try {
      await mkdir(path.join(workspace, "assets"), { recursive: true });
      await mkdir(path.join(workspace, "node_modules", "pkg"), { recursive: true });
      await writeFile(path.join(workspace, "assets", "hero.png"), Buffer.from("png"));
      await writeFile(path.join(workspace, "icon.jpeg"), Buffer.from("jpg"));
      await writeFile(path.join(workspace, "notes.txt"), Buffer.from("text"));
      await writeFile(path.join(workspace, "node_modules", "pkg", "ignored.png"), Buffer.from("png"));
      const driver = fakeDriver();
      const evidence = await collectGameVisualReviewEvidence({ driver, resolveOpenTarget: async () => open.target, workspace });
      expect(evidence.screenshots.length).toBe(4);
      expect(evidence.assets.map((asset) => asset.label)).toEqual(["Game asset: assets/hero.png", "Game asset: icon.jpeg"]);
      expect(evidence.assets[0].image.mediaType).toBe("image/png");
      expect(evidence.assets[1].image.mediaType).toBe("image/jpeg");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

describe("runGameVisualReview", () => {
  const evidence = {
    screenshots: [{ label: "Gameplay screenshot 1 — initial screen", image: { mediaType: "image/jpeg" as const, data: "ZmFrZQ==" } }],
    assets: [{ label: "Game asset: assets/hero.png", image: { mediaType: "image/png" as const, data: "ZmFrZQ==" } }],
    notes: [],
    projectName: "Test Game",
    projectType: "web-game",
  };

  it("sends labeled images to a fresh context and returns the structured report", async () => {
    const runtime = runtimeReturning('{"verdict":"needs-work","summary":"Some issues.","issues":[{"severity":"major","area":"hud","where":"Gameplay screenshot 1","description":"HUD overlaps the score."}]}');
    const report = await runGameVisualReview(runtime, reviewModel(), evidence);
    expect(report).toMatchObject({
      verdict: "needs-work",
      screenshotsReviewed: 1,
      assetsReviewed: 1,
      model: { provider: "test", id: "reviewer" },
    });
    const call = (runtime.completeSimple as ReturnType<typeof vi.fn>).mock.calls[0] as [
      unknown,
      { systemPrompt: string; messages: Array<{ content: Array<{ type: string; text?: string }> }> },
      { signal: AbortSignal },
    ];
    expect(call[1].systemPrompt).toContain("independent game visual QA reviewer");
    const content = call[1].messages[0].content;
    expect(content.filter((part) => part.type === "image")).toHaveLength(2);
    expect(content.some((part) => part.type === "text" && part.text?.includes("Game asset: assets/hero.png"))).toBe(true);
    expect(call[2].signal.aborted).toBe(false);
  });

  it("refuses when there is no evidence or the model cannot see images", async () => {
    const runtime = runtimeReturning("{}");
    await expect(runGameVisualReview(runtime, reviewModel(), { ...evidence, screenshots: [], assets: [] })).rejects.toThrow(/No screenshots or image assets/);
    await expect(runGameVisualReview(runtime, reviewModel(false), evidence)).rejects.toThrow(/does not accept images/);
  });

  it("surfaces model failures instead of inventing a report", async () => {
    const runtime = { completeSimple: vi.fn(async () => ({ stopReason: "error", content: [], errorMessage: "quota exceeded" })) } as unknown as ModelRuntime;
    await expect(runGameVisualReview(runtime, reviewModel(), evidence)).rejects.toThrow(/quota exceeded/);
  });
});
