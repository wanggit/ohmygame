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

/** 播放插屏；返回 Promise 便于调用方在关闭后继续（不打断操作中状态由调用方保证）。 */
export async function showInterstitial(placement: string): Promise<void> {
  if (!initDone || !bridge.advertisement.isInterstitialSupported) return;
  try {
    // 插屏期间收起 banner（部分平台不自动管理），关闭后恢复常驻
    hideBannerSafe();
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
  } finally {
    showBannerSafe();
  }
}

// ---------- Banner（常驻底部广告位，变现） ----------

/** 展示底部 banner：平台支持则展示；不支持/失败静默 no-op（游戏不受影响）。 */
export function showBannerSafe(placement = "bottom"): void {
  if (!initDone || !bridge.advertisement.isBannerSupported) return;
  try {
    bridge.advertisement.showBanner(undefined, placement);
  } catch {
    /* 平台不支持忽略 */
  }
}

export function hideBannerSafe(): void {
  if (!initDone || !bridge.advertisement.isBannerSupported) return;
  try {
    bridge.advertisement.hideBanner();
  } catch {
    /* 忽略 */
  }
}

// ---------- 进度存档：Bridge 云存档 + localStorage 兜底 ----------

const LOCAL_KEY = "juice-sort:progress";

export interface Progress {
  level: number;
  totalPoured: number;
}

export async function saveProgress(progress: Progress): Promise<void> {
  // totalPoured 是累计值：调用方传本关增量，这里合并旧值，避免每次存档被清零
  let merged = progress;
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) {
      const prev = JSON.parse(raw) as Partial<Progress>;
      merged = { level: progress.level, totalPoured: (prev.totalPoured ?? 0) + progress.totalPoured };
    }
  } catch {
    /* 读取失败则按增量写入 */
  }
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(merged));
  } catch {
    /* 隐私模式等场景忽略 */
  }
  if (!initDone) return;
  await withTimeout(bridge.storage.set("progress", merged), undefined, STORAGE_TIMEOUT_MS);
}

export async function loadProgress(): Promise<Progress | null> {
  if (initDone) {
    const cloud = await withTimeout(
      bridge.storage.get("progress", true) as Promise<Progress | null | undefined>,
      null,
      STORAGE_TIMEOUT_MS,
    );
    if (cloud && typeof cloud.level === "number") return cloud;
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

/**
 * 告知平台"游戏已就绪"。
 * Playgama Bridge 收到 game_ready 会移除 #loading-overlay（z-index 9999999 且
 * pointer-events:auto，会挡住全部点击），并向平台回报加载耗时 time_s。
 * 不发这句的话 overlay 会按默认时长（实测约 3 秒）一直挡着玩家——开局前 3 秒点不动是流失点。
 *
 * 时序坑：Bridge 可能在我们发 game_ready 之后才插入 overlay，而它内部用一次性标志
 * 拒绝第二次 game_ready，于是 overlay 会永久挡住玩家。所以这里除了发消息，还直接
 * 移除 DOM 并延迟再兜一次底。
 */
export async function notifyGameReady(): Promise<void> {
  const strip = () => document.getElementById("loading-overlay")?.remove();
  if (initDone) {
    try {
      await withTimeout(bridge.platform.sendMessage("game_ready"), undefined, STORAGE_TIMEOUT_MS);
    } catch {
      /* 重复发送或平台不支持：忽略，下面用 DOM 兜底 */
    }
  }
  strip();
  setTimeout(strip, 400);
  setTimeout(strip, 1500);
}
