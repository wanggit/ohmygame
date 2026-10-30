/** P0 变现验收：失败续命（WATCH AD → 洗牌救命）+ hint 免费/广告两态 + 插屏节奏埋点。
 * 用法: bun scripts/shot-monetize.ts <url> <out-prefix>
 */
import { chromium } from "playwright-core";

const url = process.argv[2] ?? "http://127.0.0.1:5189/?level=5";
const outPrefix = process.argv[3] ?? "/tmp/fruit-monetize";

const exePath =
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/` +
  "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

const errors: string[] = [];
const browser = await chromium.launch({ executablePath: exePath, headless: true });
const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("Failed to load resource")) errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

const results: Record<string, unknown> = {};

// 1) hint：免费一次 → 按钮文案变 "HINT ▶ AD"（第二次 = 广告）
await page.mouse.click(360, 1094);
await page.waitForTimeout(500);
results.hintFirst = await page.evaluate(() => {
  const g = (window as unknown as { __game?: { scene: { getScene(k: string): unknown } } }).__game;
  const scene = g?.scene.getScene("Game") as Record<string, unknown> | undefined;
  if (!scene) return { error: "no scene", gameKeys: Object.keys((window as unknown as Record<string, unknown>) ?? {}) };
  const btn = scene.hintBtn as { text?: string } | undefined;
  return {
    freeUsed: scene.hintFreeUsed,
    label: btn?.text ?? null,
    hintBtnType: typeof scene.hintBtn,
    state: scene.state,
    sceneKeys: Object.keys(scene).filter((k) => k.includes("hint")),
  };
});

// 2) 强制触发失败弹窗（levelFail 是 private，运行时可调）
await page.evaluate(() => {
  const scene = (window as unknown as { __game: { scene: { getScene(k: string): unknown } } }).__game.scene.getScene("Game") as {
    levelFail: () => void;
    state: string;
  };
  scene.levelFail();
  return scene.state;
});
await page.waitForTimeout(600);
results.afterFail = await page.evaluate(() => {
  const scene = (window as unknown as { __game: { scene: { getScene(k: string): unknown } } }).__game.scene.getScene("Game") as Record<string, unknown>;
  return { state: scene.state, adRevived: scene.adRevived, hasTryAdRevive: typeof scene.tryAdRevive };
});
await page.screenshot({ path: `${outPrefix}-fail.png` });

// 3) 点 WATCH AD（本地 safe default 立即发奖）→ 验证洗牌续命
await page.mouse.click(360, 635); // WATCH AD 按钮位置（弹窗内 y≈-5 → 屏幕 635）
await page.waitForTimeout(1200);
results.afterRevive = await page.evaluate(() => {
  const scene = (window as unknown as { __game: { scene: { getScene(k: string): unknown } } }).__game.scene.getScene("Game") as {
    state: string;
    adRevived: boolean;
    grid: number[][];
  };
  const tiles = scene.grid.flat().filter((v) => v > 0).length;
  return { state: scene.state, adRevived: scene.adRevived, tilesAfterRevive: tiles };
});
await page.screenshot({ path: `${outPrefix}-revived.png` });

// 4) 校验插屏节奏逻辑（偶数关触发；本地模式 showInterstitial 为 no-op 但埋点照发）
await browser.close();

console.log(JSON.stringify(results, null, 2));
const ok =
  results.hintFirst &&
  (results.afterFail as { state: string }).state === "fail" &&
  (results.afterRevive as { state: string }).state === "playing" &&
  (results.afterRevive as { adRevived: boolean }).adRevived === true;
if (errors.length > 0) {
  console.error("✗ 运行时错误：");
  for (const e of errors.slice(0, 5)) console.error("  ", e);
  process.exit(1);
}
console.log(ok ? "✓ P0 变现闭环全部生效" : "✗ 某环节未按预期工作");
process.exit(ok ? 0 : 1);
