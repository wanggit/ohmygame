#!/usr/bin/env node
/**
 * sprite-prepare —— 生成素材的确定性后处理（抠背景 / 裁边 / 切帧 / 归一 / 拼表 / 呼吸帧）。
 *
 * 用法示例：
 *   node sprite-prepare.mjs hero-sheet.png --bg magenta --grid 2x2 --cell 256x256 --anchor bottom-center --sheet 2x2 --json
 *   node sprite-prepare.mjs hero.png --bg auto --pad 4 --max-edge 512 --json
 *   node sprite-prepare.mjs hero.png --bg auto --breathe 4 --json
 *
 * 流水线：切帧（可选）→ 逐帧 [泛洪色键抠背景 → 过渡带收边 → defringe 去键色溢出 → 碎片过滤 → 裁透明边
 *        → 归一画布 + 锚点对齐（统一留白）] → 输出单帧 + 可选拼表 + manifest。
 * 全程确定性：同一输入永远得到同一输出。输出为全彩 RGBA PNG（不做调色板量化）。
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

const FEATHER = 16; // 过渡带宽度（像素色差带）
const RING = 3; // 过渡带环宽（距被清背景的像素距离）
const EDGE_A0 = 20; // 过渡带 alpha 平滑下界（色差）
const EDGE_A1 = 72; // 过渡带 alpha 平滑上界（色差）
const DEFAULT_PAD = 2; // 归一画布默认留白（像素），内容不贴边

/** 解析 CLI 参数。 */
export function parseArgs(argv) {
  const options = { tolerance: 32, anchor: "bottom-center", background: "auto", pad: DEFAULT_PAD };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case "--out": options.outDir = next(); break;
      case "--bg": options.background = next(); break;
      case "--tolerance": options.tolerance = Number(next()); break;
      case "--pad": options.pad = Number(next()); break;
      case "--max-edge": options.maxEdge = Number(next()); break;
      case "--keep-fragments": options.keepFragments = true; break;
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
  if (rest.length !== 1) throw new Error("用法：node sprite-prepare.mjs <input.png> [--bg auto|none|white|green|magenta|#rrggbb] [--tolerance 32] [--pad N] [--max-edge N] [--keep-fragments] [--grid CxR] [--cell WxH] [--anchor bottom-center|center|top-center] [--sheet CxR] [--breathe N] [--json]");
  if (!["bottom-center", "center", "top-center"].includes(options.anchor)) throw new Error(`无效 --anchor：${options.anchor}`);
  if (options.breathe && options.grid) throw new Error("--breathe 与 --grid 不能同时使用");
  if (!Number.isFinite(options.pad) || options.pad < 0) throw new Error(`无效 --pad：${options.pad}`);
  if (options.maxEdge !== undefined && (!Number.isFinite(options.maxEdge) || options.maxEdge < 8)) throw new Error(`无效 --max-edge：${options.maxEdge}`);
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

/** 与键色的切比雪夫距离。 */
export function colorDist(rgba, i, key) {
  return Math.max(Math.abs(rgba[i] - key[0]), Math.abs(rgba[i + 1] - key[1]), Math.abs(rgba[i + 2] - key[2]));
}

/**
 * 边缘泛洪：只清除与图像边界连通、且键色距离 ≤ tolerance*1.6 的背景区域，
 * 返回 removed 掩码（1=背景）。主体内部与背景同色的像素不受影响。
 */
export function floodKeyMask(rgba, width, height, key, tolerance) {
  const hardBg = tolerance * 1.6;
  const visited = new Uint8Array(width * height);
  const removed = new Uint8Array(width * height);
  const stack = [];
  for (let x = 0; x < width; x += 1) stack.push(x, x + (height - 1) * width);
  for (let y = 0; y < height; y += 1) stack.push(y * width, y * width + width - 1);
  while (stack.length) {
    const p = stack.pop();
    if (visited[p]) continue;
    visited[p] = 1;
    if (colorDist(rgba, p * 4, key) > hardBg) continue;
    removed[p] = 1;
    const x = p % width;
    const y = (p / width) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < width - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - width);
    if (y < height - 1) stack.push(p + width);
  }
  return removed;
}

/**
 * 过渡带收边：被清背景边界 RING 圈内、且色差 < EDGE_A1 的像素做 smoothstep alpha 收边，
 * 消除硬切锯齿。传播沿「疑似背景像素」进行、被主体像素截断 —— 被主体包围的同色孔洞
 * （拓扑上不连通背景）不受影响。主体内部颜色与 alpha 不动。
 */
export function featherRing(rgba, width, height, removed, key) {
  const dist = new Uint8Array(width * height).fill(255);
  const queue = [];
  const nearKey = (p) => colorDist(rgba, p * 4, key) < EDGE_A1;
  for (let p = 0; p < width * height; p += 1) {
    if (removed[p] || !nearKey(p)) continue;
    const x = p % width;
    const y = (p / width) | 0;
    if ((x > 0 && removed[p - 1]) || (x < width - 1 && removed[p + 1]) || (y > 0 && removed[p - width]) || (y < height - 1 && removed[p + width])) {
      dist[p] = 1;
      queue.push(p);
    }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const p = queue[head];
    const d = dist[p];
    if (d >= RING) continue;
    const x = p % width;
    const y = (p / width) | 0;
    const neighbors = [];
    if (x > 0) neighbors.push(p - 1);
    if (x < width - 1) neighbors.push(p + 1);
    if (y > 0) neighbors.push(p - width);
    if (y < height - 1) neighbors.push(p + width);
    for (const n of neighbors) {
      if (removed[n] || dist[n] <= d + 1 || !nearKey(n)) continue;
      dist[n] = d + 1;
      queue.push(n);
    }
  }
  for (let p = 0; p < width * height; p += 1) {
    if (removed[p] || dist[p] > RING) continue;
    const i = p * 4;
    const d = colorDist(rgba, i, key);
    let a = Math.max(0, Math.min(1, (d - EDGE_A0) / (EDGE_A1 - EDGE_A0)));
    a = a * a * (3 - 2 * a);
    rgba[i + 3] = Math.min(rgba[i + 3], Math.round(255 * a));
  }
}

/**
 * 标准色键 defringe（unmix）：半透明边缘像素是「主体色·α + 键色·(1−α)」的合成残留，
 * 反混合恢复主体色 c = (c_observed − key·(1−α)) / α，从根上消除键色溢边（紫边/绿边）。
 * α < 0.35 的像素不反混合（噪声放大），保持原样。
 */
export function despillEdges(rgba, width, height, key) {
  for (let p = 0; p < width * height; p += 1) {
    const i = p * 4;
    const alpha = rgba[i + 3];
    if (alpha === 0 || alpha >= 255) continue;
    const a = alpha / 255;
    if (a < 0.35) continue;
    for (let c = 0; c < 3; c += 1) {
      const value = Math.round((rgba[i + c] - key[c] * (1 - a)) / a);
      rgba[i + c] = Math.max(0, Math.min(255, value));
    }
  }
}

/**
 * 色键抠背景一条龙：边缘泛洪清底 → 过渡带收边 → defringe 去键色溢出。
 * 签名与旧行为兼容（距离语义下应清的像素仍会被清）。
 */
export function cutoutBackground(rgba, width, height, key, tolerance) {
  const removed = floodKeyMask(rgba, width, height, key, tolerance);
  for (let p = 0; p < width * height; p += 1) {
    if (removed[p]) rgba[p * 4 + 3] = 0;
  }
  featherRing(rgba, width, height, removed, key);
  despillEdges(rgba, width, height, key);
  return rgba;
}

/**
 * 碎片过滤：删除面积 < max(最大连通块×minRatio, minPx) 的孤立小块（切格渗入的邻格碎边、脏点）。
 * 多部件图标（部件面积同量级）不受影响；返回删除像素数。
 */
export function dropTinyFragments(rgba, width, height, { minRatio = 0.01, minPx = 32 } = {}) {
  const label = new Int32Array(width * height).fill(-1);
  const blocks = [];
  for (let start = 0; start < width * height; start += 1) {
    if (rgba[start * 4 + 3] <= 8 || label[start] !== -1) continue;
    const id = blocks.length;
    const stack = [start];
    label[start] = id;
    let area = 0;
    const members = [];
    while (stack.length) {
      const p = stack.pop();
      members.push(p);
      area += 1;
      const x = p % width;
      const y = (p / width) | 0;
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
    blocks.push({ area, members });
  }
  if (!blocks.length) return 0;
  const maxArea = Math.max(...blocks.map((b) => b.area));
  const threshold = Math.max(maxArea * minRatio, minPx);
  let dropped = 0;
  for (const block of blocks) {
    if (block.area >= threshold) continue;
    for (const p of block.members) rgba[p * 4 + 3] = 0;
    dropped += block.area;
  }
  return dropped;
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

/**
 * 把一帧（raw RGBA）归一到统一画布并按锚点摆放（内容四周留 pad 像素，不贴边），返回 PNG buffer 与内容盒。
 * 归一化规格：画布 = 内容包围盒 + 2×pad；输出全彩 RGBA PNG。
 */
async function normalizeFrame(rgba, width, height, cellW, cellH, anchor, pad = 0) {
  const image = await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const left = Math.floor((cellW - width) / 2);
  const top = anchor === "bottom-center" ? cellH - height - pad : anchor === "top-center" ? pad : Math.floor((cellH - height) / 2);
  if (left < 0 || top < 0) process.stderr.write(`警告：帧 ${width}x${height} 超出画布 ${cellW}x${cellH}，超出部分被裁切\n`);
  const place = { left: Math.max(0, left), top: Math.max(0, top) };
  const buffer = await sharp({ create: { width: cellW, height: cellH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: image, ...place }])
    .png()
    .toBuffer();
  return { buffer, content: { ...place, width, height } };
}

/** 内容超出 maxEdge 时按最长边降采样（lanczos3 + 轻锐化），对应「运行时 2×」素材规格。 */
async function shrinkToMaxEdge(frame, maxEdge) {
  if (!maxEdge || Math.max(frame.width, frame.height) <= maxEdge) return frame;
  const scale = maxEdge / Math.max(frame.width, frame.height);
  const w = Math.max(1, Math.round(frame.width * scale));
  const h = Math.max(1, Math.round(frame.height * scale));
  const resized = await sharp(frame.rgba, { raw: { width: frame.width, height: frame.height, channels: 4 } })
    .resize(w, h, { kernel: "lanczos3" })
    .sharpen({ sigma: 0.7 })
    .raw()
    .toBuffer();
  return { ...frame, rgba: resized, width: w, height: h };
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

  // 逐帧：抠背景 → 碎片过滤 → 裁边 → 记录内容包围盒
  const processed = [];
  for (const slice of slices) {
    const frame = new Uint8Array(slice.width * slice.height * 4);
    for (let y = 0; y < slice.height; y += 1) {
      const srcStart = ((slice.top + y) * width + slice.left) * 4;
      frame.set(rgba.subarray(srcStart, srcStart + slice.width * 4), y * slice.width * 4);
    }
    if (key) cutoutBackground(frame, slice.width, slice.height, key, options.tolerance ?? 32);
    if (!options.keepFragments) dropTinyFragments(frame, slice.width, slice.height);
    const box = alphaBoundingBox(frame, slice.width, slice.height);
    if (!box) throw new Error(`第 ${slice.col + 1} 列第 ${slice.row + 1} 行的帧是全透明的，检查 --bg 键色与容差`);
    if (trim && (box.width !== slice.width || box.height !== slice.height)) {
      const trimmed = new Uint8Array(box.width * box.height * 4);
      for (let y = 0; y < box.height; y += 1) {
        const srcStart = ((box.top + y) * slice.width + box.left) * 4;
        trimmed.set(frame.subarray(srcStart, srcStart + box.width * 4), y * box.width * 4);
      }
      processed.push(await shrinkToMaxEdge({ rgba: trimmed, width: box.width, height: box.height, col: slice.col, row: slice.row }, options.maxEdge));
    } else {
      processed.push(await shrinkToMaxEdge({ rgba: frame, width: slice.width, height: slice.height, col: slice.col, row: slice.row }, options.maxEdge));
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

  // 归一画布：默认取所有帧内容的最大尺寸 + 统一留白（内容不贴边）
  const pad = options.pad ?? DEFAULT_PAD;
  const cellW = options.cell?.[0] ?? Math.max(...sequence.map((f) => f.width)) + pad * 2;
  const cellH = options.cell?.[1] ?? Math.max(...sequence.map((f) => f.height)) + pad * 2;
  const anchor = options.anchor ?? "bottom-center";

  const frames = [];
  for (const frame of sequence) {
    const file = `${stem}-frame-${String(frames.length + 1).padStart(2, "0")}.png`;
    const normalized = await normalizeFrame(frame.rgba, frame.width, frame.height, cellW, cellH, anchor, pad);
    await writeFile(path.join(outDir, file), normalized.buffer);
    frames.push({ file, width: cellW, height: cellH, content: normalized.content });
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
    pad,
    cell: { width: cellW, height: cellH },
    ...(options.maxEdge ? { maxEdge: options.maxEdge } : {}),
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
