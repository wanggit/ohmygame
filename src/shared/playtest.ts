import type { ProjectType } from "./contracts.js";

export interface PlaytestViewport {
  width: number;
  height: number;
}

export type GameRuntime = "web" | "godot" | "unity";
export type GameProjectType = ProjectType;
export type GameUseInputCapability = "pointer" | "keyboard" | "text" | "touch" | "resize";
export type GameUseObservationCapability = "screenshot" | "dom" | "canvas" | "console" | "network";
export type GameUseDeterminismCapability = "snapshot" | "reset" | "seed" | "step";

export interface GameUseCapabilities {
  runtime: GameRuntime;
  projectTypes: readonly GameProjectType[];
  input: readonly GameUseInputCapability[];
  observation: readonly GameUseObservationCapability[];
  deterministic: readonly GameUseDeterminismCapability[];
  watch: boolean;
  /** The driver can scale page time (slow motion / freeze) without game-side support. */
  timeControl: boolean;
}

export const WEB_GAME_USE_CAPABILITIES: GameUseCapabilities = {
  runtime: "web",
  projectTypes: ["web-game", "interactive-story", "general"],
  input: ["pointer", "keyboard", "text", "touch", "resize"],
  observation: ["screenshot", "dom", "canvas", "console", "network"],
  deterministic: [],
  watch: true,
  timeControl: true,
};

export type GameUseOpenTarget =
  | { runtime: "web"; url: string }
  | { runtime: "godot" | "unity"; projectPath: string };

export type PlaytestTarget =
  | { selector: string }
  | { testId: string }
  | { text: string }
  | { role: string; name?: string }
  | { x: number; y: number };

export type PlaytestAction =
  | { type: "click"; target: PlaytestTarget }
  | { type: "type"; target: Exclude<PlaytestTarget, { x: number; y: number }>; text: string }
  | { type: "press"; key: string; duration?: number }
  | { type: "touch"; x: number; y: number }
  | { type: "wait"; milliseconds: number }
  | { type: "resize"; viewport: PlaytestViewport }
  | { type: "bridge"; method: "reset" }
  | { type: "bridge"; method: "setSeed" | "step"; value: number }
  /**
   * Driver-level page time scale: 0 freezes the page clock (frame-by-frame
   * inspection of transient effects), values in (0, 1) slow it down, 1 restores
   * real time. Applies to rAF/performance.now/Date.now regardless of any game
   * playtest bridge, so effects too brief to screenshot become capturable.
   */
  | { type: "bridge"; method: "setTimeScale"; value: number };

export interface PlaytestElement {
  index: number;
  tag: string;
  role?: string;
  name?: string;
  text?: string;
  testId?: string;
  disabled: boolean;
  box: { x: number; y: number; width: number; height: number };
}

export interface PlaytestCanvas {
  index: number;
  width: number;
  height: number;
  box: { x: number; y: number; width: number; height: number };
  visible: boolean;
}

export interface PlaytestLog {
  level: "debug" | "info" | "warning" | "error";
  message: string;
  source?: string;
  line?: number;
  timestamp: string;
}

export interface PlaytestFailedRequest {
  url: string;
  error: string;
  timestamp: string;
}

export interface GameUseSnapshot {
  sessionId: string;
  runtime: GameRuntime;
  capabilities: GameUseCapabilities;
  viewport: PlaytestViewport;
  gameState?: unknown;
  bridgeCapabilities?: string[];
}

export interface PlaytestSnapshot extends GameUseSnapshot {
  url: string;
  title: string;
  readyState: string;
  elements: PlaytestElement[];
  canvases: PlaytestCanvas[];
  /** Visible text of the page and its frames, truncated. */
  text?: string;
  /** The document scrolls horizontally beyond the viewport (layout overflow). */
  overflowX?: boolean;
  logs: PlaytestLog[];
  failedRequests: PlaytestFailedRequest[];
}

export interface PlaytestCapture {
  sessionId: string;
  mediaType: "image/jpeg";
  data: string;
  width: number;
  height: number;
  analysis: {
    sampledPixels: number;
    opaqueRatio: number;
    luminanceMean: number;
    luminanceVariance: number;
    likelyBlank: boolean;
  };
}

export interface PlaytestWatchState {
  visible: boolean;
  activeSessions: number;
}

export type PlaytestRequest =
  | { operation: "open"; target: GameUseOpenTarget; viewport: PlaytestViewport }
  | { operation: "inspect"; sessionId: string }
  | { operation: "act"; sessionId: string; actions: PlaytestAction[] }
  /**
   * `frames` > 1 bursts several screenshots back to back (default interval 120ms),
   * which catches transient effects that a single capture misses.
   */
  | { operation: "capture"; sessionId: string; frames?: number; intervalMs?: number }
  | { operation: "close"; sessionId: string }
  | { operation: "closeAll" };

export type PlaytestResult =
  | { operation: "open"; snapshot: GameUseSnapshot }
  | { operation: "inspect"; snapshot: GameUseSnapshot }
  | { operation: "act"; snapshot: GameUseSnapshot }
  | { operation: "capture"; capture: PlaytestCapture; captures?: PlaytestCapture[] }
  | { operation: "close" | "closeAll" };

export interface GameRuntimeAdapter {
  readonly available: boolean;
  readonly capabilities: GameUseCapabilities;
  request(request: PlaytestRequest, signal?: AbortSignal): Promise<PlaytestResult>;
  close(): void;
}

export type PlaytestIpcMessage =
  | { channel: "ohmygame:playtest-request"; id: string; request: PlaytestRequest }
  | { channel: "ohmygame:playtest-cancel"; id: string }
  | { channel: "ohmygame:playtest-response"; id: string; result?: PlaytestResult; error?: string };
