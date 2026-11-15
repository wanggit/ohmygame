import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type, type TSchema } from "typebox";
import type {
  GameRuntimeAdapter,
  GameUseInputCapability,
  GameUseObservationCapability,
  GameUseOpenTarget,
  GameUseSnapshot,
  PlaytestAction,
  PlaytestSnapshot,
  PlaytestViewport,
} from "../shared/playtest.js";

const viewportSchema = Type.Object({
  width: Type.Integer({ minimum: 240, maximum: 4096 }),
  height: Type.Integer({ minimum: 240, maximum: 4096 }),
}, { additionalProperties: false });

const targetSchema = Type.Union([
  Type.Object({ selector: Type.String({ minLength: 1, maxLength: 500 }) }, { additionalProperties: false }),
  Type.Object({ testId: Type.String({ minLength: 1, maxLength: 200 }) }, { additionalProperties: false }),
  Type.Object({ text: Type.String({ minLength: 1, maxLength: 300 }) }, { additionalProperties: false }),
  Type.Object({
    role: Type.String({ minLength: 1, maxLength: 100 }),
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
  }, { additionalProperties: false }),
  Type.Object({
    x: Type.Number({ minimum: 0, maximum: 8192 }),
    y: Type.Number({ minimum: 0, maximum: 8192 }),
  }, { additionalProperties: false }),
]);

const semanticTargetSchema = Type.Union([
  Type.Object({ selector: Type.String({ minLength: 1, maxLength: 500 }) }, { additionalProperties: false }),
  Type.Object({ testId: Type.String({ minLength: 1, maxLength: 200 }) }, { additionalProperties: false }),
  Type.Object({ text: Type.String({ minLength: 1, maxLength: 300 }) }, { additionalProperties: false }),
  Type.Object({
    role: Type.String({ minLength: 1, maxLength: 100 }),
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
  }, { additionalProperties: false }),
]);

const resetBridgeAction = Type.Object({ type: Type.Literal("bridge"), method: Type.Literal("reset") }, { additionalProperties: false });
const valueBridgeAction = Type.Object({
  type: Type.Literal("bridge"),
  method: Type.Union([Type.Literal("setSeed"), Type.Literal("step")]),
  value: Type.Number(),
}, { additionalProperties: false });
/** Driver-level page time control; not part of any game bridge, so every runtime may offer it. */
const timeScaleAction = Type.Object({
  type: Type.Literal("bridge"),
  method: Type.Literal("setTimeScale"),
  value: Type.Number({ minimum: 0, maximum: 4, description: "Page time scale: 0 freezes the page clock, 0.05-0.5 slows it down for inspecting brief effects, 1 restores real time" }),
}, { additionalProperties: false });

const inputActions = [
  Type.Object({ type: Type.Literal("click"), target: targetSchema }, { additionalProperties: false }),
  Type.Object({ type: Type.Literal("type"), target: semanticTargetSchema, text: Type.String({ maxLength: 10_000 }) }, { additionalProperties: false }),
  Type.Object({
    type: Type.Literal("press"),
    key: Type.String({ minLength: 1, maxLength: 40 }),
    duration: Type.Optional(Type.Integer({ minimum: 0, maximum: 5_000, description: "How long to hold the key before releasing it, in milliseconds" })),
  }, { additionalProperties: false }),
  Type.Object({ type: Type.Literal("touch"), x: Type.Number({ minimum: 0, maximum: 8192 }), y: Type.Number({ minimum: 0, maximum: 8192 }) }, { additionalProperties: false }),
  Type.Object({ type: Type.Literal("wait"), milliseconds: Type.Integer({ minimum: 0, maximum: 5_000 }) }, { additionalProperties: false }),
  Type.Object({ type: Type.Literal("resize"), viewport: viewportSchema }, { additionalProperties: false }),
] as const;

const actionSchema = Type.Union([...inputActions, resetBridgeAction, valueBridgeAction, timeScaleAction]);

const parameters = gameUseParameters(actionSchema);

/**
 * The Playable Nodes player's bridge only resets, so its agent is not offered
 * setSeed or step; a web game may implement all of them. Driver-level time
 * control stays available either way.
 */
const resetOnlyParameters = gameUseParameters(Type.Union([...inputActions, resetBridgeAction, timeScaleAction])) as unknown as typeof parameters;

function gameUseParameters<Action extends TSchema>(action: Action) {
  return Type.Object({
    operation: Type.Union([
      Type.Literal("open"),
      Type.Literal("inspect"),
      Type.Literal("act"),
      Type.Literal("capture"),
      Type.Literal("sweep"),
      Type.Literal("close"),
    ]),
    path: Type.Optional(Type.String({ maxLength: 1_000, description: "Path, query, or hash within a web game target; used only by open" })),
    viewport: Type.Optional(viewportSchema),
    sessionId: Type.Optional(Type.String({ minLength: 1, maxLength: 100, description: "Session returned by open; required for inspect, act, capture, sweep, and close" })),
    actions: Type.Optional(Type.Array(action, { minItems: 1, maxItems: 20, description: "Actions to run; required for act" })),
    frames: Type.Optional(Type.Integer({ minimum: 1, maximum: 8, description: "capture only: burst this many screenshots back to back to catch brief effects; the default 1 takes a single shot" })),
    intervalMs: Type.Optional(Type.Integer({ minimum: 40, maximum: 2_000, description: "capture only: gap between burst frames, default 120" })),
    viewports: Type.Optional(Type.Array(viewportSchema, { minItems: 1, maxItems: 4, description: "sweep only: viewport sizes to check; defaults to 375x667, 768x1024 and 1280x720" })),
  }, { additionalProperties: false });
}

export function createGameUseTool(
  driver: GameRuntimeAdapter,
  resolveOpenTarget: () => Promise<GameUseOpenTarget>,
  { bridge = "full" }: { bridge?: "full" | "reset" } = {},
): ToolDefinition<typeof parameters> {
  return defineTool<typeof parameters, unknown>({
    name: "game_use",
    label: "Game Use",
    description: "Use the current game runtime as a player: open and control the game, inspect interactive elements and canvas state, capture screenshots, review console and network failures, and call an optional deterministic game bridge. Open and act return a fresh state snapshot. Reuse the returned sessionId and close the session when finished. Reopening the same project route reloads the existing session. For brief effects (explosions, flashes, ultimates) use the setTimeScale action to slow or freeze page time before capturing, and capture with frames>1 to burst screenshots. Use sweep for one-call responsive verification across representative viewports.",
    promptSnippet: "Use the current game with real player input, runtime inspection, and screenshots",
    promptGuidelines: [
      "Use game_use for game runtime or visual verification; a successful build alone is not a playtest",
      "Batch adjacent input and wait steps into one act call; open and act already return fresh state, so inspect only when a separate refresh is needed",
      "Capture screenshots for Canvas or WebGL verification and close playtest sessions when finished",
      "Transient effects: act with bridge setTimeScale (0 freezes the clock, 0.2 slows it) right before capture, or capture with frames 3-8 — a single screenshot often misses short-lived effects and a missed frame is not evidence that the effect is broken",
      "Run sweep after layout-affecting changes: it checks 375x667, 768x1024 and 1280x720 with screenshots and flags blank frames, horizontal overflow, console errors and failed requests",
    ],
    parameters: bridge === "reset" ? resetOnlyParameters : parameters,
    executionMode: "sequential",
    execute: async (_toolCallId, input, signal) => {
      if (!driver.available) throw new Error("Game use is not available in this environment");
      if (input.operation === "open") {
        const target = await resolveOpenTarget();
        signal?.throwIfAborted();
        if (target.runtime !== driver.capabilities.runtime) {
          throw new Error(`Game target runtime ${target.runtime} does not match adapter runtime ${driver.capabilities.runtime}`);
        }
        const resolvedTarget = input.path
          ? withOpenPath(target, input.path)
          : target;
        const result = await driver.request({
          operation: "open",
          target: resolvedTarget,
          viewport: input.viewport ?? { width: 1280, height: 720 },
        }, signal);
        if (result.operation !== "open") throw new Error("Unexpected game use response");
        return snapshotResult(result.snapshot);
      }
      if (input.operation === "capture") {
        requireCapability(driver, "screenshot", "observation");
        const frames = input.frames ?? 1;
        const result = await driver.request({
          operation: "capture",
          sessionId: requiredSessionId(input.operation, input.sessionId),
          ...(frames > 1 ? { frames, ...(input.intervalMs ? { intervalMs: input.intervalMs } : {}) } : {}),
        }, signal);
        if (result.operation !== "capture") throw new Error("Unexpected game use response");
        const captures = result.captures ?? [result.capture];
        return {
          content: [
            { type: "text", text: JSON.stringify({
              sessionId: result.capture.sessionId,
              frames: captures.map((frame, index) => ({
                frame: index,
                width: frame.width,
                height: frame.height,
                analysis: frame.analysis,
              })),
            }, null, 2) },
            ...captures.map((frame) => ({ type: "image" as const, data: frame.data, mimeType: frame.mediaType })),
          ],
          details: { playtestCapture: { ...result.capture, data: undefined } },
        };
      }
      if (input.operation === "sweep") {
        requireCapability(driver, "screenshot", "observation");
        requireCapability(driver, "resize", "input");
        return sweepViewports(driver, requiredSessionId(input.operation, input.sessionId), input.viewports, signal);
      }
      if (input.operation === "close") {
        const sessionId = requiredSessionId(input.operation, input.sessionId);
        await driver.request({ operation: "close", sessionId }, signal);
        return { content: [{ type: "text", text: `Closed game session ${sessionId}` }], details: undefined };
      }
      const sessionId = requiredSessionId(input.operation, input.sessionId);
      const result = input.operation === "inspect"
        ? await driver.request({ operation: "inspect", sessionId }, signal)
        : await driver.request({ operation: "act", sessionId, actions: supportedActions(driver, requiredActions(input.actions)) }, signal);
      if (result.operation !== "inspect" && result.operation !== "act") throw new Error("Unexpected game use response");
      return snapshotResult(result.snapshot);
    },
  });
}

function requiredSessionId(operation: string, sessionId?: string): string {
  if (!sessionId) throw new Error(`sessionId is required for ${operation}`);
  return sessionId;
}

const DEFAULT_SWEEP_VIEWPORTS: readonly PlaytestViewport[] = [
  { width: 375, height: 667 },
  { width: 768, height: 1024 },
  { width: 1280, height: 720 },
];

/**
 * One-call responsive verification: resize through representative viewports,
 * screenshot each, flag blank frames, horizontal overflow and console errors,
 * then restore the original viewport. Covers the per-viewport screenshot pass
 * that visual QA otherwise forgets.
 */
async function sweepViewports(
  driver: GameRuntimeAdapter,
  sessionId: string,
  viewports: PlaytestViewport[] | undefined,
  signal?: AbortSignal,
) {
  const sizes = viewports ?? [...DEFAULT_SWEEP_VIEWPORTS];
  const before = await driver.request({ operation: "inspect", sessionId }, signal);
  if (before.operation !== "inspect") throw new Error("Unexpected game use response");
  const original = before.snapshot.viewport;
  const results: Array<Record<string, unknown>> = [];
  const images: Array<{ type: "image"; data: string; mimeType: string }> = [];
  const issues: string[] = [];
  try {
    for (const viewport of sizes) {
      signal?.throwIfAborted();
      const resized = await driver.request({ operation: "act", sessionId, actions: [{ type: "resize", viewport }] }, signal);
      if (resized.operation !== "act") throw new Error("Unexpected game use response");
      const shot = await driver.request({ operation: "capture", sessionId }, signal);
      if (shot.operation !== "capture") throw new Error("Unexpected game use response");
      const snapshot = resized.snapshot;
      const label = `${viewport.width}x${viewport.height}`;
      const consoleErrors = isPlaytestSnapshot(snapshot) ? snapshot.logs.filter((log) => log.level === "error").length : 0;
      const failedRequests = isPlaytestSnapshot(snapshot) ? snapshot.failedRequests.length : 0;
      const overflowX = isPlaytestSnapshot(snapshot) ? snapshot.overflowX === true : false;
      const likelyBlank = shot.capture.analysis.likelyBlank;
      if (likelyBlank) issues.push(`${label}: captured frame looks blank`);
      if (overflowX) issues.push(`${label}: page overflows horizontally (scrollWidth > viewport)`);
      if (consoleErrors > 0) issues.push(`${label}: ${consoleErrors} console error(s) in session log`);
      if (failedRequests > 0) issues.push(`${label}: ${failedRequests} failed request(s) in session log`);
      results.push({
        viewport,
        likelyBlank,
        overflowX,
        consoleErrors,
        failedRequests,
        luminanceMean: shot.capture.analysis.luminanceMean,
      });
      images.push({ type: "image", data: shot.capture.data, mimeType: shot.capture.mediaType });
    }
  } finally {
    await driver.request({ operation: "act", sessionId, actions: [{ type: "resize", viewport: original }] }, signal).catch(() => undefined);
  }
  return {
    content: [
      { type: "text" as const, text: JSON.stringify({ sessionId, originalViewport: original, results, issues }, null, 2) },
      ...images,
    ],
    details: { playtestSweep: { sessionId, originalViewport: original, results, issues } },
  };
}

function requiredActions(actions?: PlaytestAction[]): PlaytestAction[] {
  if (!actions?.length) throw new Error("actions are required for act");
  return actions;
}

export function previewUrl(baseValue: string, relativeValue?: string): string {
  const base = new URL(baseValue);
  const resolved = relativeValue ? new URL(relativeValue, base) : base;
  if (resolved.origin !== base.origin) throw new Error("Playtest path must stay inside the current project preview");
  return resolved.href;
}

function withOpenPath(target: GameUseOpenTarget, path: string): GameUseOpenTarget {
  if (target.runtime !== "web") throw new Error("path is only supported by the web game runtime");
  return { ...target, url: previewUrl(target.url, path) };
}

function supportedActions(driver: GameRuntimeAdapter, actions: PlaytestAction[]): PlaytestAction[] {
  for (const action of actions) {
    if (action.type === "bridge" && action.method === "setTimeScale" && !driver.capabilities.timeControl) {
      throw new Error("Game runtime does not support time control (setTimeScale)");
    }
    const required = actionCapabilities(action);
    const missingInput = required.input.filter((capability) => !driver.capabilities.input.includes(capability));
    if (missingInput.length > 0) throw new Error(`Game runtime does not support ${missingInput.join(" and ")} input for ${action.type}`);
    const missingObservation = required.observation.filter((capability) => !driver.capabilities.observation.includes(capability));
    if (missingObservation.length > 0) throw new Error(`Game runtime does not support ${missingObservation.join(" and ")} observation for ${action.type}`);
  }
  return actions;
}

function actionCapabilities(action: PlaytestAction): { input: GameUseInputCapability[]; observation: GameUseObservationCapability[] } {
  switch (action.type) {
    case "click": return { input: ["pointer"], observation: "x" in action.target ? [] : ["dom"] };
    case "type": return { input: ["text"], observation: ["dom"] };
    case "press": return { input: ["keyboard"], observation: [] };
    case "touch": return { input: ["touch"], observation: [] };
    case "resize": return { input: ["resize"], observation: [] };
    case "wait":
    case "bridge": return { input: [], observation: [] };
  }
}

function requireCapability(
  driver: GameRuntimeAdapter,
  capability: GameUseInputCapability | GameUseObservationCapability,
  kind: "input" | "observation",
): void {
  const available: readonly string[] = kind === "input" ? driver.capabilities.input : driver.capabilities.observation;
  if (!available.includes(capability)) throw new Error(`Game runtime does not support ${capability} ${kind}`);
}

function snapshotResult(snapshot: GameUseSnapshot) {
  const compact = compactSnapshot(snapshot);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(compact, null, 2) }],
    details: { playtest: snapshot },
  };
}

function compactSnapshot(snapshot: GameUseSnapshot) {
  const webSnapshot = isPlaytestSnapshot(snapshot) ? snapshot : undefined;
  return {
    ...snapshot,
    ...(webSnapshot ? { elements: webSnapshot.elements.slice(0, 80) } : {}),
    ...(webSnapshot ? { logs: webSnapshot.logs.slice(-30).map((log) => ({ ...log, message: log.message.slice(0, 1_000) })) } : {}),
    ...(webSnapshot ? { failedRequests: webSnapshot.failedRequests.slice(-30) } : {}),
    ...(snapshot.gameState === undefined ? {} : { gameState: boundedJson(snapshot.gameState, 20_000) }),
  };
}

function isPlaytestSnapshot(snapshot: GameUseSnapshot): snapshot is PlaytestSnapshot {
  return "url" in snapshot && "elements" in snapshot && "logs" in snapshot && "failedRequests" in snapshot;
}

function boundedJson(value: unknown, limit: number): unknown {
  const serialized = JSON.stringify(value);
  if (serialized === undefined || serialized.length <= limit) return value;
  return { truncated: true, preview: serialized.slice(0, limit) };
}
