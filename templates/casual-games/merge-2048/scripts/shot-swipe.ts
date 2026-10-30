// 复现测试：鼠标拖拽滑动 30 次，统计 LEVEL CLEAR 弹窗数量（>1 = 叠加 bug）。
// 运行：bun scripts/shot-swipe.ts <url> <out.png>
import { chromium } from "playwright-core";

const url = process.argv[2] ?? "http://localhost:5197/";
const out = process.argv[3] ?? "/tmp/fm-swipe.png";

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
await page.waitForTimeout(1500);

// 诊断：scene create/init 调用次数（检测双启动）
const bootCount = await page.evaluate(() => (window as unknown as { __creates?: number }).__creates ?? -1);

// 鼠标拖拽滑动（真实 pointer 事件路径）
const dirs: [number, number][] = [
  [0, -200],
  [200, 0],
  [0, 200],
  [-200, 0],
];
for (let i = 0; i < 30; i++) {
  const [dx, dy] = dirs[i % 4];
  await page.mouse.move(360, 700);
  await page.mouse.down();
  await page.mouse.move(360 + dx, 700 + dy, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}
await page.waitForTimeout(600);

// 统计页面上 "LEVEL CLEAR" 文本出现次数（弹窗叠加 = >1）
const clearCount = await page.evaluate(() => {
  const texts = Array.from(document.querySelectorAll("canvas"));
  return texts.length; // canvas 数（Phaser 单 canvas）；弹窗数用 scene 计数
});
const clearOverlays = await page.evaluate(() => (window as unknown as { __clears?: number }).__clears ?? -1);
const levelText = await page.evaluate(() => (window as unknown as { __level?: number }).__level ?? -1);

await page.waitForTimeout(800); // 媒体请求完成，避免 close 时资源中断噪音
await page.screenshot({ path: out });
await browser.close();

console.log(`canvas=${clearCount} createCalls=${bootCount} clearOverlays=${clearOverlays} level=${levelText}`);
if (errors.length > 0) {
  console.error("✗ 运行时错误：");
  for (const e of errors.slice(0, 5)) console.error("  console:", e);
  process.exit(1);
}
console.log(`✓ console 零错误，截图: ${out}`);