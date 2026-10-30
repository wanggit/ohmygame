/** SVG → 256×256 透明 PNG（Twemoji 图标光栅化；复用 playwright，零新依赖）。
 * 用法: bun scripts/svg2png.ts [输入目录] [输出目录] [尺寸]
 */
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync, readdirSync } from "fs";

const inDir = process.argv[2] ?? "public/sprites";
const outDir = process.argv[3] ?? inDir;
const size = Number(process.argv[4] ?? 256);

const exePath =
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/` +
  "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

const browser = await chromium.launch({ executablePath: exePath, headless: true });
const page = await browser.newPage({ viewport: { width: size, height: size } });

const svgs = readdirSync(inDir).filter((f) => f.endsWith(".svg"));
for (const file of svgs) {
  const svg = readFileSync(`${inDir}/${file}`, "utf8").replace(
    "<svg",
    `<svg width="${size}" height="${size}"`,
  );
  await page.setContent(
    `<html><body style="margin:0;padding:0;background:transparent">${svg}</body></html>`,
  );
  const out = `${outDir}/${file.replace(/\.svg$/, ".png")}`;
  writeFileSync(out, await page.screenshot({ omitBackground: true }));
  console.log("✓", out);
}
await browser.close();
console.log(`完成：${svgs.length} 个图标 → ${outDir}/`);
