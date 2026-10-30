// 中盘交互截图：加载后模拟一串方向键（含合并），再截图。用于验收合并动画/中盘视觉。
// 运行：bun scripts/shot-play.ts <url> <out.png>
import { chromium } from "playwright-core";

const url = process.argv[2] ?? "http://localhost:5192/";
const out = process.argv[3] ?? "/tmp/fm-play.png";

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
await page.waitForTimeout(1200);

// 30 步方向键（浏览器键盘事件），制造中盘局面
const keys = ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"];
for (let i = 0; i < 30; i++) {
  await page.keyboard.press(keys[i % 4]);
  await page.waitForTimeout(180);
}
await page.waitForTimeout(400);

await page.waitForTimeout(800); // 媒体请求完成，避免 close 时资源中断噪音
await page.screenshot({ path: out });
await browser.close();

if (errors.length > 0) {
  console.error("✗ 运行时错误：");
  for (const e of errors.slice(0, 5)) console.error("  console:", e);
  process.exit(1);
}
console.log(`✓ console 零错误，中盘截图已保存: ${out}`);