import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({
  appEvents: new Map<string, (...args: any[]) => void>(),
  ipcEvents: new Map<string, (...args: any[]) => void>(),
  handlers: new Map<string, (...args: any[]) => any>(),
  windowEvents: new Map<string, (...args: any[]) => void>(),
  contentsEvents: new Map<string, (...args: any[]) => void>(),
  sender: {
    id: 1,
    send: vi.fn(),
    reload: vi.fn(),
    isDestroyed: () => false,
    on: (name: string, fn: (...args: any[]) => void) => host.contentsEvents.set(name, fn),
  },
  showMessageBox: vi.fn(async () => ({ response: 0 })),
  quit: vi.fn(),
  close: vi.fn(),
}));
vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    on: (name: string, fn: (...args: any[]) => void) => host.appEvents.set(name, fn),
    whenReady: async () => {}, getPath: () => "/tmp/ohmygame-recovery-test", getVersion: () => "0.0.0",
    isReady: () => true, quit: host.quit, relaunch: vi.fn(), exit: vi.fn(),
  },
  ipcMain: {
    handle: (name: string, fn: (...args: any[]) => any) => host.handlers.set(name, fn),
    on: (name: string, fn: (...args: any[]) => void) => host.ipcEvents.set(name, fn),
  },
  nativeTheme: {}, session: { fromPartition: () => ({ setProxy: async () => {} }), defaultSession: { setProxy: async () => {} } },
  BrowserWindow: { getAllWindows: () => [] }, clipboard: {},
  dialog: { showErrorBox: vi.fn(), showMessageBox: host.showMessageBox }, Menu: {}, shell: {},
}));
vi.mock("undici/index.js", () => ({ setGlobalDispatcher: vi.fn() }));
vi.doMock(path.resolve("src/daemon/environment.ts"), () => ({ loadEnvironmentFiles: vi.fn() }));
vi.doMock(path.resolve("src/daemon/proxy.ts"), () => ({ createNetworkDispatcher: vi.fn() }));
vi.doMock(path.resolve("src/desktop/network.ts"), () => ({
  prepareDesktopNetwork: async () => ({ active: {}, environment: {} }), electronProxyConfig: () => ({}), proxyCredentials: vi.fn(),
}));
vi.doMock(path.resolve("src/desktop/daemon-process.ts"), () => ({
  startDaemon: async () => ({ runtime: { url: "http://127.0.0.1:12345", token: "test" }, stop: async () => {} }),
}));
vi.doMock(path.resolve("src/desktop/oauth.ts"), () => ({
  isOAuthAuthorizationUrl: vi.fn(), OAuthCallbackFlow: class { cancel = async () => {}; },
}));
vi.doMock(path.resolve("src/desktop/playtest-driver.ts"), () => ({ ElectronPlaytestDriver: class { close() {} } }));
vi.doMock(path.resolve("src/desktop/web-game-player.ts"), () => ({ WebGamePlayerWindows: class { close() {} synchronize() {} } }));
vi.doMock(path.resolve("src/desktop/updater.ts"), () => ({ DesktopUpdater: class { subscribe() {} check() {} }, DesktopUpdatePreparationError: class extends Error {} }));
vi.doMock(path.resolve("src/desktop/window.ts"), () => ({
  createDesktopWindow: async (options: { hidden?: boolean; beforeLoad(window: unknown): void }) => {
    const window = {
      webContents: host.sender, isDestroyed: () => false, close: host.close,
      on: (name: string, fn: (...args: any[]) => void) => host.windowEvents.set(name, fn),
      once: (name: string, fn: (...args: any[]) => void) => host.windowEvents.set(name, fn),
    };
    options.beforeLoad(window);
    return window;
  },
  waitForRenderer: async () => {}, fitPlaytestContentSize: vi.fn(), isValidPlaytestViewport: () => true, windowsTitleBarOverlay: vi.fn(),
}));

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers();
  host.showMessageBox.mockReset().mockResolvedValue({ response: 0 });
  host.appEvents.clear(); host.ipcEvents.clear(); host.handlers.clear();
  host.windowEvents.clear(); host.contentsEvents.clear();
  process.argv.push("--built-renderer");
  await import("../src/desktop/main.js");
});
afterEach(() => { process.argv.splice(process.argv.lastIndexOf("--built-renderer"), 1); vi.useRealTimers(); });

const settle = async () => { await vi.advanceTimersByTimeAsync(0); };
function crashGone() { host.contentsEvents.get("render-process-gone")!({}, { reason: "crashed", exitCode: 1 }); }

it("reloads a crashed renderer within the automatic budget", () => {
  crashGone();
  crashGone();
  expect(host.sender.reload).toHaveBeenCalledTimes(2);
  expect(host.showMessageBox).not.toHaveBeenCalled();
});

it("stops reloading a crash loop and recovers only when the person chooses to", async () => {
  crashGone(); crashGone(); crashGone();
  expect(host.sender.reload).toHaveBeenCalledTimes(2);
  expect(host.showMessageBox).toHaveBeenCalledOnce();
  await settle();
  // The dialog's default button reloads and restarts the budget.
  expect(host.sender.reload).toHaveBeenCalledTimes(3);
  crashGone();
  expect(host.sender.reload).toHaveBeenCalledTimes(4);
});

it("quits when the person gives up on a crash loop", async () => {
  host.showMessageBox.mockResolvedValueOnce({ response: 1 });
  crashGone(); crashGone(); crashGone();
  await settle();
  expect(host.sender.reload).toHaveBeenCalledTimes(2);
  expect(host.quit).toHaveBeenCalledOnce();
});

it("ignores a renderer that disappears while the app is quitting", async () => {
  host.appEvents.get("before-quit")!({ preventDefault() {} });
  const sent = host.sender.send.mock.calls.findLast(([channel]) => channel === "ohmygame:prepare-close")!;
  host.ipcEvents.get("ohmygame:ready-to-close")!({ sender: host.sender }, sent[1]);
  await settle();
  host.sender.reload.mockClear();
  crashGone();
  expect(host.sender.reload).not.toHaveBeenCalled();
  expect(host.showMessageBox).not.toHaveBeenCalled();
});

it("offers help once for an unresponsive window and reloads on request", async () => {
  host.showMessageBox.mockResolvedValueOnce({ response: 1 });
  const unresponsive = host.contentsEvents.get("unresponsive")!;
  unresponsive();
  unresponsive();
  expect(host.showMessageBox).toHaveBeenCalledOnce();
  await settle();
  expect(host.sender.reload).toHaveBeenCalledOnce();
});

it("keeps waiting when the person dismisses the unresponsive dialog", async () => {
  host.contentsEvents.get("unresponsive")!();
  await settle();
  expect(host.sender.reload).not.toHaveBeenCalled();
});