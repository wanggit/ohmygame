#!/usr/bin/env node
/**
 * sprite-prepare —— 生成素材的确定性后处理（抠背景 / 裁边 / 切帧 / 归一 / 拼表 / 呼吸帧）。
 *
 * 用法示例：
 *   node sprite-prepare.mjs hero-sheet.png --bg white --grid 2x2 --cell 256x256 --anchor bottom-center --sheet 2x2 --json
 *   node sprites/hero.png --bg auto --breathe 4 --json
 *
 * 流水线：切帧（可选）→ 逐帧 [色键抠背景 → 裁透明边 → 归一画布 + 锚点对齐] → 输出单帧 + 可选拼表 + manifest。
 * 零配置依赖，仅需 sharp（随 OhMyGame 仓库 node_modules 解析）。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

let sharpModule;
try {
  sharpModule = (await import("sharp")).default;
} catch {
  throw new Error(
    'sprite-prepare 需要 sharp：请从 OhMyGame 仓库内运行此脚本（node_modules 已含 sharp），或在当前目录 npm i sharp',
  );
}
const sharp = sharpModule;

const FEATHER = 16; // 色键边缘羽化宽度（像素色差带）

/** 解析 CLI 参数。 */
export function parseArgs(argv) {
  const options = { tolerance: 32, anchor: "bottom-center", background: "auto" };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case "--out": options.outDir = next(); break;
      case "--bg": options.background = next(); break;
      case "--tolerance": options.tolerance = Number(next()); break;
      case "--trim": options.trim = true; break;
      case "--no-trim": options.trim = false; break;
      case "--grid": options.grid = parsePair(next(), "--grid"); break;
      case "--cell": options.cell = parsePair(next(), "--cell"); break;
      case "--anchor": options.anchor = next(); break;
      case "--sheet": options.sheet = parsePair(next(), "--sheet"); break;
      case "--breathe": options.breathe = Number(next()); break;
      case "--amplitude": options.breatheAmplitude = Number(next()); break;
      case "--json": options.json = true; break;
      default:
        if (arg.startsWith("--")) throw new Error(`未知参数：${arg}`);
        rest.push(arg);
    }
  }
  if (rest.length !== 1) throw new Error("用法：node sprite-prepare.mjs <input.png> [--bg auto|none|white|green|magenta|#rrggbb] [--grid CxR] [--cell WxH] [--anchor bottom-center|center|top-center] [--sheet CxR] [--breathe N] [--json]");
  if (!["bottom-center", "center", "top-center"].includes(options.anchor)) throw new Error(`无效 --anchor：${options.anchor}`);
  if (options.breathe && options.grid) throw new Error("--breathe 与 --grid 不能同时使用");
  return { ...options, input: rest[0] };
}

function parsePair(value, flag) {
  const match = /^(\d+)x(\d+)$/.exec(value ?? "");
  if (!match) throw new Error(`${flag} 需要 WxH 格式，例如 2x2`);
  return [Number(match[1]), Number(match[2])];
}

/** 解析背景键色：auto / none / white / green / magenta / #rrggbb。auto 采样四角平均色。 */
async function resolveBackground(mode, rgba, width, height) {
  if (mode === "none") return null;
  if (mode === "white") return [255, 255, 255];
  if (mode === "green") return [0, 255, 0];
  if (mode === "magenta") return [255, 0, 255];
  const hex = /^#?([0-9a-f]{6})$/i.exec(mode ?? "");
  if (hex) {
    const value = Number.parseInt(hex[1], 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }
  if (mode !== "auto") throw new Error(`无效 --bg：${mode}`);
  // 四角 8x8 采样平均
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
  if (!count) return null;
  return [Math.round(sums[0] / count), Math.round(sums[1] / count), Math.round(sums[2] / count)];
}

/** 色键抠背景：与键色的切比雪夫距离 ≤ tolerance 置透明，tolerance~tolerance+FEATHER 线性羽化。 */
export function cutoutBackground(rgba, width, height, key, tolerance) {
  const [kr, kg, kb] = key;
  const feather = FEATHER;
  for (let i = 0; i < rgba.length; i += 4) {
    const alpha = rgba[i + 3];
    if (alpha === 0) continue;
    const dist = Math.max(Math.abs(rgba[i] - kr), Math.abs(rgba[i + 1] - kg), Math.abs(rgba[i + 2] - kb));
    if (dist <= tolerance) rgba[i + 3] = 0;
    else if (dist < tolerance + feather) rgba[i + 3] = Math.round((alpha * (dist - tolerance)) / feather);
  }
  return rgba;
}

/** alpha > 8 的包围盒；全透明返回 null。 */
export function alphaBoundingBox(rgba, width, height) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (rgba[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** 把一帧（raw RGBA）归一到统一画布并按锚点摆放，返回 PNG buffer。 */
async function normalizeFrame(rgba, width, height, cellW, cellH, anchor) {
  const image = await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const left = Math.floor((cellW - width) / 2);
  const top = anchor === "bottom-center" ? cellH - height : anchor === "top-center" ? 0 : Math.floor((cellH - height) / 2);
  if (left < 0 || top < 0) process.stderr.write(`警告：帧 ${width}x${height} 超出画布 ${cellW}x${cellH}，超出部分被裁切\n`);
  return sharp({ create: { width: cellW, height: cellH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: image, left: Math.max(0, left), top: Math.max(0, top) }])
    .png()
    .toBuffer();
}

/**
 * 主流程：生成素材 → 后处理帧 + manifest。
 * 网格模式按 CxR 等分切帧；breathe 模式从单帧生成 N 帧呼吸表；其余为单帧模式。
 */
export async function prepareSprites(options) {
  const input = path.resolve(options.input);
  const outDir = path.resolve(options.outDir ?? defaultOutDir(input));
  await mkdir(outDir, { recursive: true });

  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = Buffer.from(data);
  const { width, height, channels } = info;
  if (channels !== 4) throw new Error("输入图片需要 4 通道（alpha）");

  const key = await resolveBackground(options.background ?? "auto", rgba, width, height);
  const trim = options.trim !== false;

  // 切帧边界（等分）；单帧 / breathe 模式为整图
  const [cols, rows] = options.grid ?? [1, 1];
  const slices = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const left = Math.round((c * width) / cols);
      const top = Math.round((r * height) / rows);
      slices.push({ left, top, width: Math.round(((c + 1) * width) / cols) - left, height: Math.round(((r + 1) * height) / rows) - top, col: c, row: r });
    }
  }

  // 逐帧：抠背景 → 裁边 → 记录内容包围盒
  const processed = [];
  for (const slice of slices) {
    const frame = new Uint8Array(slice.width * slice.height * 4);
    for (let y = 0; y < slice.height; y += 1) {
      const srcStart = ((slice.top + y) * width + slice.left) * 4;
      frame.set(rgba.subarray(srcStart, srcStart + slice.width * 4), y * slice.width * 4);
    }
    if (key) cutoutBackground(frame, slice.width, slice.height, key, options.tolerance ?? 32);
    const box = alphaBoundingBox(frame, slice.width, slice.height);
    if (!box) throw new Error(`第 ${slice.col + 1} 列第 ${slice.row + 1} 行的帧是全透明的，检查 --bg 键色与容差`);
    if (trim && (box.width !== slice.width || box.height !== slice.height)) {
      const trimmed = new Uint8Array(box.width * box.height * 4);
      for (let y = 0; y < box.height; y += 1) {
        const srcStart = ((box.top + y) * slice.width + box.left) * 4;
        trimmed.set(frame.subarray(srcStart, srcStart + box.width * 4), y * box.width * 4);
      }
      processed.push({ rgba: trimmed, width: box.width, height: box.height, col: slice.col, row: slice.row });
    } else {
      processed.push({ rgba: frame, width: slice.width, height: slice.height, col: slice.col, row: slice.row });
    }
  }

  const stem = path.basename(input).replace(/\.[^.]+$/, "");
  let sequence = processed;
  if (options.breathe) {
    // 呼吸帧：垂直 squash/stretch，cosine 采样保证首尾循环平滑
    const n = options.breathe;
    const amplitude = options.breatheAmplitude ?? 0.025;
    const src = processed[0];
    sequence = [];
    for (let i = 0; i < n; i += 1) {
      const factor = 1 + amplitude * Math.cos((2 * Math.PI * i) / n);
      const h2 = Math.max(1, Math.round(src.height * factor));
      const resized = await sharp(src.rgba, { raw: { width: src.width, height: src.height, channels: 4 } })
        .resize(src.width, h2)
        .raw()
        .toBuffer();
      sequence.push({ rgba: resized, width: src.width, height: h2, col: i, row: 0 });
    }
  }

  // 归一画布：默认取所有帧内容的最大尺寸（含呼吸变形后的帧）
  const cellW = options.cell?.[0] ?? Math.max(...sequence.map((f) => f.width));
  const cellH = options.cell?.[1] ?? Math.max(...sequence.map((f) => f.height));
  const anchor = options.anchor ?? "bottom-center";

  const frames = [];
  for (const frame of sequence) {
    const file = `${stem}-frame-${String(frames.length + 1).padStart(2, "0")}.png`;
    await writeFile(path.join(outDir, file), await normalizeFrame(frame.rgba, frame.width, frame.height, cellW, cellH, anchor));
    frames.push({ file, width: cellW, height: cellH });
  }

  // 拼回 sheet（多帧时默认拼；breathe 默认一行 N 列）
  let sheet;
  const [sheetCols, sheetRows] = options.sheet ?? (options.breathe ? [sequence.length, 1] : [cols, rows]);
  if (frames.length > 1) {
    const composites = [];
    for (let i = 0; i < frames.length && i < sheetCols * sheetRows; i += 1) {
      composites.push({ input: path.join(outDir, frames[i].file), left: (i % sheetCols) * cellW, top: Math.floor(i / sheetCols) * cellH });
    }
    sheet = `${stem}-sheet.png`;
    await sharp({ create: { width: sheetCols * cellW, height: sheetRows * cellH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(composites)
      .png()
      .toFile(path.join(outDir, sheet));
  }

  const manifest = {
    source: input,
    background: key ? { mode: options.background ?? "auto", key, tolerance: options.tolerance ?? 32 } : { mode: "none" },
    anchor,
    cell: { width: cellW, height: cellH },
    frames,
    ...(sheet ? { sheet: { file: sheet, cols: sheetCols, rows: sheetRows } } : {}),
    ...(options.breathe ? { breathe: { frames: options.breathe, amplitude: options.breatheAmplitude ?? 0.025 } } : {}),
  };
  if (options.json) await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function defaultOutDir(input) {
  return path.join(path.dirname(input), `${path.basename(input).replace(/\.[^.]+$/, "")}-prepared`);
}

// CLI 入口
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const manifest = await prepareSprites(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`sprite-prepare 失败：${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}
