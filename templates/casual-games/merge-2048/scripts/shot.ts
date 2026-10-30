/** headless 截图 + console 零错误验收。用法: bun scripts/shot.ts <url> <输出路径> [等待ms] */
import { chromium } from "playwright-core";

const [url, out, waitMs = "5000"] = process.argv.slice(2);
if (!url || !out) {
  console.error("用法: bun scripts/shot.ts <url> <输出路径> [等待ms]");
  process.exit(1);
}

const exePath =
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/` +
  "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

const browser = await chromium.launch({ executablePath: exePath, headless: true });
const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
const errors: string[] = [];
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("Failed to load resource")) {
    const loc = m.location();
    errors.push(`console: ${m.text()} @ ${loc.url || "?"}`);
  }
});
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(Number(waitMs));
await page.screenshot({ path: out });
await browser.close();

if (errors.length > 0) {
  console.log("✗ 运行时错误：");
  for (const e of errors) console.log("  " + e);
  process.exit(1);
}
console.log("✓ console 零错误，截图已保存:", out);