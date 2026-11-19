#!/usr/bin/env node
/**
 * sprite-qa —— 素材集成前的自动质量检查 + 放大巡检拼图。
 *
 * 检查器（把人工返工压成脚本报错）：
 *   - keyFringe        fail：半透明边缘残留键色（品红边/绿边/紫边）
 *   - cellBleed        fail（--grid）：切格渗入的邻格碎边（贴格缝的小碎块）
 *   - opaqueBackground fail：图片没有 alpha 背景（根本没抠图）
 *   - stickerOutline   warn：贴主体的白色贴纸描边残留
 *   - strayFragments   warn：碎片/脏点（孤立小连通块 ≥ 3 处）
 *
 * 用法：
 *   node sprite-qa.mjs <file-or-dir>... [--key auto|magenta|green|white|#rrggbb] [--grid CxR] [--zoom 3] [--out dir] [--json]
 *
 * 有 fail 时退出码 2（拦截集成）；仅 warn 退出码 0 但必须过目巡检图。
 * 每张输入输出一张 <stem>-qa.png：3× 最近邻放大、问题像素染色（红=残边/渗色、黄=描边残留），一眼定位。
 */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

let sharpModule;
try {
  sharpModule = (await import("sharp")).default;
} catch {
  throw new Error(
    "sprite-qa 需要 sharp：请从 OhMyGame 仓库内运行此脚本（node_modules 已含 sharp），或在当前目录 npm i sharp",
  );
}
const sharp = sharpModule;

const KEY_FRINGE_DIST = 100; // 半透明像素距键色 ≤ 此值算残边候选
const KEY_FRINGE_RATIO = 0.08; // 残边像素占半透明像素比例阈值
const WHITE_MIN = 200; // 「近白」描边的最低通道值
const OUTLINE_RATIO = 0.3; // 白描边像素占边缘不透明像素比例阈值

/** 解析 CLI 参数。 */
export function parseArgs(argv) {
  const options = { key: "auto", zoom: 3 };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case "--key": options.key = next(); break;
      case "--grid": options.grid = parsePair(next(), "--grid"); break;
      case "--zoom": options.zoom = Number(next()); break;
      case "--out": options.outDir = next(); break;
      case "--json": options.json = true; break;
      default:
        if (arg.startsWith("--")) throw new Error(`未知参数：${arg}`);
        rest.push(arg);
    }
  }
  if (!rest.length) throw new Error("用法：node sprite-qa.mjs <file-or-dir>... [--key auto|magenta|green|white|#rrggbb] [--grid CxR] [--zoom 3] [--out dir] [--json]");
  return { ...options, inputs: rest };
}

function parsePair(value, flag) {
  const match = /^(\d+)x(\d+)$/.exec(value ?? "");
  if (!match) throw new Error(`${flag} 需要 WxH 格式，例如 2x2`);
  return [Number(match[1]), Number(match[2])];
}

/** 解析键色：auto / white / green / magenta / #rrggbb。auto 采样四角平均色。 */
export function resolveKey(mode, rgba, width, height) {
  if (mode === "white") return [255, 255, 255];
  if (mode === "green") return [0, 255, 0];
  if (mode === "magenta") return [255, 0, 255];
  const hex = /^#?([0-9a-f]{6})$/i.exec(mode ?? "");
  if (hex) {
    const value = Number.parseInt(hex[1], 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }
  if (mode !== "auto") throw new Error(`无效 --key：${mode}`);
  const corners = [[0, 0], [width - 8, 0], [0, height - 8], [width - 8, height - 8]].filter(([x, y]) => x >= 0 && y >= 0);
  const sums = [0, 0, 0];
  let count = 0;
  for (const [cx, cy] of corners) {
    for (let y = cy; y < Math.min(cy + 8, height); y += 1) {
      for (let x = cx; x < Math.min(cx + 8, width); x += 1) {
        const i = (y * width + x) * 4;
        if (rgba[i + 3] === 0) continue;
        sums[0] += rgba[i]; sums[1] += rgba[i + 1]; sums[2] += rgba[i + 2];
        count += 1;
      }
    }
  }
  return count ? [Math.round(sums[0] / count), Math.round(sums[1] / count), Math.round(sums[2] / count)] : [255, 0, 255];
}

function dist(rgba, i, key) {
  return Math.max(Math.abs(rgba[i] - key[0]), Math.abs(rgba[i + 1] - key[1]), Math.abs(rgba[i + 2] - key[2]));
}

/** alpha > 8 的四连通块：{ area, members, touchesBorder } 列表。 */
export function components(rgba, width, height) {
  const label = new Int32Array(width * height).fill(-1);
  const blocks = [];
  for (let start = 0; start < width * height; start += 1) {
    if (rgba[start * 4 + 3] <= 8 || label[start] !== -1) continue;
    const id = blocks.length;
    const stack = [start];
    label[start] = id;
    let area = 0;
    let touchesBorder = false;
    const members = [];
    while (stack.length) {
      const p = stack.pop();
      members.push(p);
      area += 1;
      const x = p % width;
      const y = (p / width) | 0;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true;
      const neighbors = [];
      if (x > 0) neighbors.push(p - 1);
      if (x < width - 1) neighbors.push(p + 1);
      if (y > 0) neighbors.push(p - width);
      if (y < height - 1) neighbors.push(p + width);
      for (const n of neighbors) {
        if (label[n] !== -1 || rgba[n * 4 + 3] <= 8) continue;
        label[n] = id;
        stack.push(n);
      }
    }
    blocks.push({ area, members, touchesBorder });
  }
  return blocks;
}

/**
 * 分析单张素材。返回 findings 与标记掩码（1=键色残边/渗色染红，2=白描边染黄）。
 * grid=[cols,rows] 时逐帧做切格渗色检测。
 */
export function analyzeImage(rgba, width, height, key, grid) {
  const findings = [];
  const marks = new Uint8Array(width * height);
  let opaque = 0;
  let semi = 0;
  let fringe = 0;
  let edgeOpaque = 0;
  let whiteEdge = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      const i = p * 4;
      const a = rgba[i + 3];
      if (a > 8) opaque += 1;
      if (a >= 8 && a <= 240) {
        semi += 1;
        if (dist(rgba, i, key) < KEY_FRINGE_DIST) {
          fringe += 1;
          marks[p] = 1;
        }
      }
      // 贴着透明度显著更低区域的不透明像素 = 描边候选（覆盖描边外再包一层半透明光晕的情况）
      if (a > 200) {
        const touchesClear =
          (x > 0 && rgba[i - 4 + 3] < a - 100) ||
          (x < width - 1 && rgba[i + 4 + 3] < a - 100) ||
          (y > 0 && rgba[i - width * 4 + 3] < a - 100) ||
          (y < height - 1 && rgba[i + width * 4 + 3] < a - 100);
        if (touchesClear) {
          edgeOpaque += 1;
          const [r, g, b] = [rgba[i], rgba[i + 1], rgba[i + 2]];
          if (Math.min(r, g, b) > WHITE_MIN && Math.max(r, g, b) - Math.min(r, g, b) < 30) {
            whiteEdge += 1;
            if (marks[p] === 0) marks[p] = 2;
          }
        }
      }
    }
  }

  const total = width * height;
  if (opaque / total > 0.98) {
    findings.push({ id: "opaqueBackground", level: "fail", message: `不透明像素占 ${(100 * opaque / total).toFixed(0)}%：没有 alpha 背景（未抠图），或内容占满画布（裁边/留白失败，内容贴边会被运行时裁切）` });
  }
  if (semi > 0 && fringe / semi > KEY_FRINGE_RATIO) {
    findings.push({ id: "keyFringe", level: "fail", message: `半透明边缘 ${(100 * fringe / semi).toFixed(0)}% 残留键色（${key.join(",")}）：色键溢边/描边未清干净` });
  }
  const outlineByEdge = edgeOpaque > 20 && whiteEdge / edgeOpaque > OUTLINE_RATIO;

  const blocks = components(rgba, width, height);
  if (blocks.length) {
    const maxArea = Math.max(...blocks.map((b) => b.area));
    const tiny = blocks.filter((b) => b.area < Math.max(maxArea * 0.005, 8));
    if (tiny.length >= 3) {
      for (const t of tiny) for (const p of t.members) if (marks[p] === 0) marks[p] = 1;
      findings.push({ id: "strayFragments", level: "warn", message: `${tiny.length} 处孤立碎片/脏点（最大连通块的 0.5% 以下）` });
    }
  }

  // 白描边/光晕圈：近白不透明连通块「包围非白主体、自身呈环/框形」——
  // 生成器画进主体的贴纸描边或厚白光晕圈，抠图去不掉，只能按 Prompt 契约重新生成
  const nearWhiteMask = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p += 1) {
    const i = p * 4;
    const a = rgba[i + 3];
    if (a <= 200) continue;
    const mn = Math.min(rgba[i], rgba[i + 1], rgba[i + 2]);
    const mx = Math.max(rgba[i], rgba[i + 1], rgba[i + 2]);
    if (mn > 180 && mx - mn < 60) nearWhiteMask[p] = 1;
  }
  const isNearWhite = (p) => nearWhiteMask[p] === 1;
  let outlineRing = 0;
  const seen = new Uint8Array(width * height);
  for (let start = 0; start < width * height; start += 1) {
    if (!isNearWhite(start) || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    const members = [];
    let minX = width, minY = height, maxX = -1, maxY = -1;
    while (stack.length) {
      const p = stack.pop();
      members.push(p);
      const x = p % width;
      const y = (p / width) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const neighbors = [];
      if (x > 0) neighbors.push(p - 1);
      if (x < width - 1) neighbors.push(p + 1);
      if (y > 0) neighbors.push(p - width);
      if (y < height - 1) neighbors.push(p + width);
      for (const n of neighbors) {
        if (seen[n] || !isNearWhite(n)) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    const boxArea = (maxX - minX + 1) * (maxY - minY + 1);
    let enclosedSubject = 0;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const p = y * width + x;
        if (isNearWhite(p) || rgba[p * 4 + 3] <= 200) continue;
        enclosedSubject += 1;
      }
    }
    // 包围着别的主体、自身又不是实心白块 = 环/框形描边
    if (members.length > 30 && enclosedSubject > members.length * 0.3 && members.length < boxArea * 0.8) {
      outlineRing += members.length;
      for (const p of members) if (marks[p] === 0) marks[p] = 2;
    }
  }
  const outlineByRing = outlineRing > 30;
  if (outlineByEdge || outlineByRing) {
    const parts = [];
    if (outlineByEdge) parts.push(`贴主体边缘的不透明像素中 ${(100 * whiteEdge / edgeOpaque).toFixed(0)}% 是近白色`);
    if (outlineByRing) parts.push(`${outlineRing} 个近白像素构成包裹主体的白描边/光晕圈`);
    findings.push({ id: "stickerOutline", level: "warn", message: `${parts.join("；")}：生成器画进主体的描边/光晕，抠图去不掉，需按 Prompt 契约重新生成` });
  }

  if (grid) {
    const [cols, rows] = grid;
    let bleedCells = 0;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const x0 = Math.round((c * width) / cols);
        const y0 = Math.round((r * height) / rows);
        const w = Math.round(((c + 1) * width) / cols) - x0;
        const h = Math.round(((r + 1) * height) / rows) - y0;
        const cell = new Uint8Array(w * h * 4);
        for (let y = 0; y < h; y += 1) {
          const src = ((y0 + y) * width + x0) * 4;
          cell.set(rgba.subarray(src, src + w * 4), y * w * 4);
        }
        const cellBlocks = components(cell, w, h);
        if (!cellBlocks.length) continue;
        const maxArea = Math.max(...cellBlocks.map((b) => b.area));
        const bleed = cellBlocks.filter((b) => b.touchesBorder && b.area < maxArea * 0.05 && b.area >= 8);
        if (bleed.length) {
          bleedCells += 1;
          for (const b of bleed) {
            for (const p of b.members) {
              const gx = x0 + (p % w);
              const gy = y0 + ((p / w) | 0);
              marks[gy * width + gx] = 1;
            }
          }
        }
      }
    }
    if (bleedCells) {
      findings.push({ id: "cellBleed", level: "fail", message: `${bleedCells} 帧的格缝带内有贴边小碎块：切格渗入邻格碎边（碎片过滤可清理，或重新对齐格界）` });
    }
  }

  return { findings, marks, stats: { opaque, semi, fringe, edgeOpaque, whiteEdge, blocks: blocks.length } };
}

/** 最近邻放大 zoom 倍并把标记像素染色（1=红、2=黄），棋盘格底衬出透明区。 */
export function renderQaTile(rgba, width, height, marks, zoom) {
  const w = width * zoom;
  const h = height * zoom;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const sx = (x / zoom) | 0;
      const sy = (y / zoom) | 0;
      const sp = sy * width + sx;
      const si = sp * 4;
      const di = (y * w + x) * 4;
      const a = rgba[si + 3] / 255;
      const checker = ((x >> 3) + (y >> 3)) % 2 ? 210 : 245;
      out[di] = Math.round(rgba[si] * a + checker * (1 - a));
      out[di + 1] = Math.round(rgba[si + 1] * a + checker * (1 - a));
      out[di + 2] = Math.round(rgba[si + 2] * a + checker * (1 - a));
      out[di + 3] = 255;
      if (marks[sp] === 1) {
        out[di] = 255; out[di + 1] = 40; out[di + 2] = 40;
      } else if (marks[sp] === 2) {
        out[di] = 255; out[di + 1] = 210; out[di + 2] = 40;
      }
    }
  }
  return { data: out, width: w, height: h };
}

/** 收集输入（文件或目录一层 *.png）。 */
async function collectFiles(inputs) {
  const files = [];
  for (const input of inputs) {
    const resolved = path.resolve(input);
    const stat = await import("node:fs/promises").then((fs) => fs.stat(resolved));
    if (stat.isDirectory()) {
      for (const name of (await readdir(resolved)).sort()) {
        if (name.toLowerCase().endsWith(".png") && !name.includes("-qa")) files.push(path.join(resolved, name));
      }
    } else {
      files.push(resolved);
    }
  }
  return files;
}

// CLI 入口
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const files = await collectFiles(options.inputs);
    if (!files.length) throw new Error("输入里没有 PNG 文件");
    const outDir = path.resolve(options.outDir ?? path.dirname(files[0]));
    await mkdir(outDir, { recursive: true });

    const report = [];
    let hasFail = false;
    for (const file of files) {
      const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const rgba = Buffer.from(data);
      const key = resolveKey(options.key, rgba, info.width, info.height);
      const { findings, marks } = analyzeImage(rgba, info.width, info.height, key, options.grid);
      if (findings.some((f) => f.level === "fail")) hasFail = true;

      const tile = renderQaTile(rgba, info.width, info.height, marks, options.zoom);
      const qaFile = `${path.basename(file).replace(/\.png$/i, "")}-qa.png`;
      await sharp(tile.data, { raw: { width: tile.width, height: tile.height, channels: 4 } })
        .png()
        .toFile(path.join(outDir, qaFile));
      report.push({ file, key, qa: qaFile, findings });
    }

    for (const item of report) {
      const status = item.findings.some((f) => f.level === "fail") ? "FAIL" : item.findings.length ? "WARN" : "PASS";
      process.stdout.write(`${status} ${path.basename(item.file)}\n`);
      for (const f of item.findings) process.stdout.write(`  [${f.level}] ${f.id}: ${f.message}\n`);
      process.stdout.write(`  巡检图：${item.qa}\n`);
    }
    if (options.json) await writeFile(path.join(outDir, "qa-report.json"), `${JSON.stringify(report, null, 2)}\n`);
    if (hasFail) {
      process.stdout.write("sprite-qa：存在 fail 级问题，修复后再集成（红=残边/渗色，黄=描边残留，见巡检图）\n");
      process.exit(2);
    }
  } catch (error) {
    process.stderr.write(`sprite-qa 失败：${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}