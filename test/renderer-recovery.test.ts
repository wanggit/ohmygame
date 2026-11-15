import { describe, expect, it, vi } from "vitest";
import { RendererRecovery, sendToWindow } from "../src/desktop/renderer-recovery.js";

describe("renderer recovery budget", () => {
  it("allows bounded reloads and refuses a crash loop", () => {
    let now = 0;
    const recovery = new RendererRecovery(60_000, 2, () => now);

    expect(recovery.attempt()).toBe(true);
    expect(recovery.attempt()).toBe(true);
    expect(recovery.attempt()).toBe(false);

    now = 61_000;
    expect(recovery.attempt()).toBe(true);
    expect(recovery.attempt()).toBe(true);
    expect(recovery.attempt()).toBe(false);
  });

  it("keeps earlier attempts inside the window", () => {
    let now = 0;
    const recovery = new RendererRecovery(60_000, 2, () => now);

    expect(recovery.attempt()).toBe(true);
    now = 30_000;
    expect(recovery.attempt()).toBe(true);
    now = 61_000;
    // Only the attempt at 30s is still inside the window, so one slot is free.
    expect(recovery.attempt()).toBe(true);
    expect(recovery.attempt()).toBe(false);
  });

  it("restores the full budget after a manual reload", () => {
    const recovery = new RendererRecovery(60_000, 2, () => 0);
    expect(recovery.attempt()).toBe(true);
    expect(recovery.attempt()).toBe(true);
    expect(recovery.attempt()).toBe(false);
    recovery.reset();
    expect(recovery.attempt()).toBe(true);
    expect(recovery.attempt()).toBe(true);
    expect(recovery.attempt()).toBe(false);
  });
});

describe("sendToWindow", () => {
  it("delivers state to a live render frame", () => {
    const send = vi.fn();
    const window = { isDestroyed: () => false, webContents: { isDestroyed: () => false, send } };
    sendToWindow(window as never, "channel", 1, "two");
    expect(send).toHaveBeenCalledWith("channel", 1, "two");
  });

  it("drops state for a destroyed window without touching its webContents", () => {
    const webContents = { isDestroyed: vi.fn(), send: vi.fn() };
    const window = { isDestroyed: () => true, webContents };
    sendToWindow(window as never, "channel");
    expect(webContents.isDestroyed).not.toHaveBeenCalled();
    expect(webContents.send).not.toHaveBeenCalled();
    sendToWindow(undefined, "channel");
  });

  it("drops state for a destroyed render frame", () => {
    const send = vi.fn();
    const window = { isDestroyed: () => false, webContents: { isDestroyed: () => true, send } };
    sendToWindow(window as never, "channel");
    expect(send).not.toHaveBeenCalled();
  });

  it("swallows the disposed-frame error so callers keep working", () => {
    const send = vi.fn(() => {
      throw new TypeError("Render frame was disposed before WebFrameMain could be accessed");
    });
    const window = { isDestroyed: () => false, webContents: { isDestroyed: () => false, send } };
    expect(() => sendToWindow(window as never, "channel")).not.toThrow();
    expect(send).toHaveBeenCalledOnce();
  });
});