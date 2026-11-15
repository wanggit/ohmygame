import type { BrowserWindow } from "electron";

/**
 * Bounds automatic renderer reloads so a crash loop cannot spin forever. It
 * mirrors the daemon supervisor's restart budget: a couple of attempts inside
 * a rolling window, then the person decides.
 */
export class RendererRecovery {
  #attempts: number[] = [];

  constructor(
    private readonly windowMs = 60_000,
    private readonly maxAttempts = 2,
    private readonly now: () => number = Date.now,
  ) {}

  /** True when a reload may run now; every granted reload consumes budget. */
  attempt(): boolean {
    const now = this.now();
    this.#attempts = this.#attempts.filter((time) => now - time < this.windowMs);
    if (this.#attempts.length >= this.maxAttempts) return false;
    this.#attempts.push(now);
    return true;
  }

  /** Restores the full budget, such as after the person reloads manually. */
  reset(): void {
    this.#attempts = [];
  }
}

/**
 * Pushes a state update to a window's renderer. The render frame can already be
 * disposed (renderer crash or a reload in flight) while the window object is
 * still alive, and a failed push must never break the caller that produced the
 * state; the renderer reads the current state again after it recovers.
 */
export function sendToWindow(window: BrowserWindow | undefined, channel: string, ...args: unknown[]): void {
  if (!window || window.isDestroyed()) return;
  try {
    if (window.webContents.isDestroyed()) return;
    window.webContents.send(channel, ...args);
  } catch {
    // "Render frame was disposed before WebFrameMain could be accessed".
  }
}