/**
 * Playgama Bridge 封装：把事件驱动的广告 API Promise 化，
 * 并在无平台/本地开发环境提供 safe default（调用零报错，流程可测）。
 *
 * 广告状态监听采用"事件 + 轮询"双保险：不同平台适配器的事件名可能有差异，
 * 轮询 rewardedState/interstitialState 保证在任何适配器下都能收敛。
 */
import bridge from "@playgama/bridge";

const REWARDED_TIMEOUT_MS = 45_000;
const INTERSTITIAL_TIMEOUT_MS = 45_000;
const POLL_INTERVAL_MS = 300;
const INIT_TIMEOUT_MS = 1500;
const STORAGE_TIMEOUT_MS = 1200;

let initDone = false;

/** 超时保护：无平台适配器时 Bridge 的 promise 可能永不 resolve。 */
function withTimeout<T>(promise: Promise<T>, fallback: T, ms: number): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function initBridge(): Promise<void> {
  try {
    await withTimeout(bridge.initialize(), "timeout" as unknown as void, INIT_TIMEOUT_MS);
    initDone = true;
  } catch (error) {
    // 本地开发/初始化失败：游戏照常运行，广告走 safe default。
    console.warn("[bridge] initialize failed, running in local mode:", error);
    initDone = false;
  }
}

export function isBridgeReady(): boolean {
  return initDone;
}

/** 本地（无平台）模式下直接发放奖励，便于开发与自动化验收。 */
function rewardedSafeDefault(): boolean {
  console.info("[bridge] rewarded safe default: grant reward locally");
  return true;
}

function watchState<T extends string>(
  read: () => string,
  settle: (state: string) => T | undefined,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve) => {
    let done = false;
    const finish = (value: T) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      resolve(value);
    };
    const timer = setInterval(() => {
      const verdict = settle(read());
      if (verdict !== undefined) finish(verdict);
    }, POLL_INTERVAL_MS);
    setTimeout(() => finish(settle("failed") ?? ("failed" as T)), timeoutMs);
  });
}

/** 播放激励视频；返回是否发放奖励。 */
export async function showRewarded(placement: string): Promise<boolean> {
  if (!initDone || !bridge.advertisement.isRewardedSupported) return rewardedSafeDefault();
  try {
    bridge.advertisement.preloadRewarded(placement);
    bridge.advertisement.showRewarded(placement);
    const result = await watchState<"rewarded" | "no-reward" | "failed">(
      () => bridge.advertisement.rewardedState,
      (state) => {
        if (state === "rewarded") return "rewarded";
        if (state === "closed") return "no-reward";
        if (state === "failed") return "failed";
        return undefined;
      },
      REWARDED_TIMEOUT_MS,
    );
    return result === "rewarded";
  } catch (error) {
    console.warn("[bridge] showRewarded error:", error);
    return rewardedSafeDefault();
  }
}

/** 显示常驻 banner（默认底部）；本地/无平台适配器时 no-op。 */
export function showBanner(placement = "bottom"): void {
  if (!initDone || !bridge.advertisement.isBannerSupported) return;
  try {
    bridge.advertisement.showBanner(placement === "top" ? "top" : "bottom", placement);
  } catch (error) {
    console.warn("[bridge] showBanner error:", error);
  }
}

export function hideBanner(): void {
  if (!initDone || !bridge.advertisement.isBannerSupported) return;
  try {
    bridge.advertisement.hideBanner();
  } catch {
    /* 隐藏失败不影响游戏 */
  }
}

/** 播放插屏；返回 Promise 便于调用方在关闭后继续（不打断操作中状态由调用方保证）。 */
export async function showInterstitial(placement: string): Promise<void> {
  if (!initDone || !bridge.advertisement.isInterstitialSupported) return;
  try {
    bridge.advertisement.preloadInterstitial(placement);
    bridge.advertisement.showInterstitial(placement);
    await watchState<"closed" | "failed">(
      () => bridge.advertisement.interstitialState,
      (state) => {
        if (state === "closed") return "closed";
        if (state === "failed") return "failed";
        return undefined;
      },
      INTERSTITIAL_TIMEOUT_MS,
    );
  } catch (error) {
    console.warn("[bridge] showInterstitial error:", error);
  }
}

// ---------- 进度存档：Bridge 云存档 + localStorage 兜底 ----------

const LOCAL_KEY = "fruit-merge:progress";

export interface Progress {
  level: number;
  highScore: number;
  bestTile: number;
  gamesPlayed: number;
  muted: boolean;
  /** 各关星级（关卡 id → 1-3）；未通关的关不在此表中。 */
  stars?: Record<number, number>;
}

export async function saveProgress(progress: Progress): Promise<void> {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(progress));
  } catch {
    /* 隐私模式等场景忽略 */
  }
  if (!initDone) return;
  await withTimeout(bridge.storage.set("progress", progress), undefined, STORAGE_TIMEOUT_MS);
}

export async function loadProgress(): Promise<Progress | null> {
  if (initDone) {
    const cloud = await withTimeout(
      bridge.storage.get("progress", true) as Promise<Progress | null | undefined>,
      null,
      STORAGE_TIMEOUT_MS,
    );
    if (cloud && typeof cloud.highScore === "number") {
      const full = cloud as Partial<Progress>;
      return {
        level: full.level ?? 1,
        highScore: full.highScore ?? 0,
        bestTile: full.bestTile ?? 0,
        gamesPlayed: full.gamesPlayed ?? 0,
        muted: full.muted ?? false,
        stars: full.stars ?? {},
      };
    }
  }
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return JSON.parse(raw) as Progress;
  } catch {
    /* 忽略损坏数据 */
  }
  return null;
}

/** 事件埋点（约定：game_start / level_complete / fail / revive_rewarded / session_end）。 */
export function track(event: string, data?: Record<string, unknown>): void {
  if (!initDone) return;
  try {
    bridge.analytics.send(event, data);
  } catch {
    /* 埋点失败不影响游戏 */
  }
}
