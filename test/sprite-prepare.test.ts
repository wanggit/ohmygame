import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
// @ts-ignore sprite-prepare 是 skill 附带的无类型 ESM 脚本
import { alphaBoundingBox, cutoutBackground, despillEdges, dropTinyFragments, parseArgs, prepareSprites } from "../plugins/web-game-studio/skills/sprite-pipeline/scripts/sprite-prepare.mjs";

/** 合成一张纯色背景 + 若干色块的测试图。 */
async function compose(width: number, height: number, background: string, blocks: Array<{ x: number; y: number; w: number; h: number; color: string }>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "sprite-prepare-"));
  const file = path.join(dir, "input.png");
  const composites = await Promise.all(blocks.map(async (block) => ({
    input: await sharp({ create: { width: block.w, height: block.h, channels: 4, background: block.color } }).png().toBuffer(),
    left: block.x,
    top: block.y,
  })));
  await sharp({ create: { width, height, channels: 4, background } }).composite(composites).png().toFile(file);
  return file;
}

async function rawOf(file: string): Promise<{ rgba: Uint8Array; width: number; height: number }> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { rgba: new Uint8Array(data), width: info.width, height: info.height };
}

function pixel(rgba: Uint8Array, width: number, x: number, y: number): [number, number, number, number] {
  const i = (y * width + x) * 4;
  return [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]];
}

describe("sprite-prepare parseArgs", () => {
  it("parses processing options", () => {
    const options = parseArgs(["hero.png", "--bg", "white", "--grid", "2x2", "--cell", "64x64", "--anchor", "bottom-center", "--sheet", "2x2", "--json"]);
    expect(options).toMatchObject({ input: "hero.png", background: "white", grid: [2, 2], cell: [64, 64], anchor: "bottom-center", sheet: [2, 2], json: true });
  });

  it("rejects breathe together with grid and missing input", () => {
    expect(() => parseArgs(["hero.png", "--breathe", "4", "--grid", "2x2"])).toThrow(/不能同时/);
    expect(() => parseArgs([])).toThrow(/用法/);
    expect(() => parseArgs(["hero.png", "--anchor", "left"])).toThrow(/无效/);
  });
});

describe("sprite-prepare cutout and bbox", () => {
  it("keys out the background color and reports the remaining alpha box", () => {
    const width = 4, height = 4;
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const red = x >= 2;
        rgba[i] = 255;
        rgba[i + 1] = red ? 0 : 255;
        rgba[i + 2] = red ? 0 : 255;
        rgba[i + 3] = 255;
      }
    }
    cutoutBackground(rgba, width, height, [255, 255, 255], 32);
    expect(pixel(rgba, width, 0, 0)[3]).toBe(0);
    expect(pixel(rgba, width, 3, 3)).toEqual([255, 0, 0, 255]);
    expect(alphaBoundingBox(rgba, width, height)).toEqual({ left: 2, top: 0, width: 2, height: 4 });
  });
});

describe("sprite-prepare pipeline", () => {
  it("cuts out the background, trims, and normalizes a single sprite", async () => {
    const input = await compose(100, 100, "#ffffff", [{ x: 30, y: 20, w: 40, h: 60, color: "#ff0000" }]);
    const manifest = await prepareSprites({ input, background: "white", json: true, pad: 0 });

    expect(manifest.cell).toEqual({ width: 40, height: 60 });
    expect(manifest.frames).toHaveLength(1);
    const dir = path.join(path.dirname(input), "input-prepared");
    const frame = await rawOf(path.join(dir, manifest.frames[0].file));
    expect([frame.width, frame.height]).toEqual([40, 60]);
    expect(pixel(frame.rgba, frame.width, 0, 0)).toEqual([255, 0, 0, 255]);
    const written = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
    expect(written.frames).toHaveLength(1);
  });

  it("slices a 2x2 sheet and bottom-anchors frames of different heights", async () => {
    const input = await compose(200, 200, "#ffffff", [
      { x: 40, y: 80, w: 20, h: 20, color: "#ff0000" },   // 左上格：矮块贴底
      { x: 140, y: 70, w: 20, h: 30, color: "#00ff00" },  // 右上格：高块贴底
      { x: 40, y: 180, w: 20, h: 10, color: "#0000ff" },  // 左下格：更矮贴底
      { x: 140, y: 160, w: 20, h: 40, color: "#ffff00" }, // 右下格：最高贴底
    ]);
    const manifest = await prepareSprites({ input, background: "white", grid: [2, 2], cell: [50, 50], anchor: "bottom-center", pad: 0 });

    expect(manifest.frames).toHaveLength(4);
    expect(manifest.sheet).toMatchObject({ cols: 2, rows: 2 });
    const dir = path.join(path.dirname(input), "input-prepared");
    const second = await rawOf(path.join(dir, manifest.frames[1].file));
    // 第 2 帧是 20x30 绿块，bottom-center 后应贴住 50x50 画布底部
    expect(pixel(second.rgba, second.width, 25, 49)[3]).toBeGreaterThan(0);
    expect(pixel(second.rgba, second.width, 25, 10)[3]).toBe(0);
    const sheet = await rawOf(path.join(dir, manifest.sheet.file));
    expect([sheet.width, sheet.height]).toEqual([100, 100]);
  });

  it("derives a breathing idle sheet from one frame", async () => {
    const input = await compose(100, 100, "#ffffff", [{ x: 30, y: 20, w: 40, h: 60, color: "#ff0000" }]);
    const manifest = await prepareSprites({ input, background: "white", breathe: 4, pad: 0 });

    expect(manifest.frames).toHaveLength(4);
    expect(manifest.breathe).toMatchObject({ frames: 4 });
    const dir = path.join(path.dirname(input), "input-prepared");
    const first = await rawOf(path.join(dir, manifest.frames[0].file));
    const third = await rawOf(path.join(dir, manifest.frames[2].file));
    const firstBox = alphaBoundingBox(first.rgba, first.width, first.height);
    const thirdBox = alphaBoundingBox(third.rgba, third.width, third.height);
    // cosine 采样：第 1 帧（+2.5%）高于第 3 帧（-2.5%），且都贴底
    expect(firstBox!.height).toBeGreaterThan(thirdBox!.height);
    expect(firstBox!.top + firstBox!.height).toBe(manifest.cell.height);
    expect(thirdBox!.top + thirdBox!.height).toBe(manifest.cell.height);
  });

  it("keys chroma green and keeps opaque sprites untouched", async () => {
    const input = await compose(80, 80, "#00ff00", [{ x: 20, y: 10, w: 30, h: 50, color: "#0000ff" }]);
    const manifest = await prepareSprites({ input, background: "green", json: true, pad: 0 });
    expect(manifest.cell).toEqual({ width: 30, height: 50 });
    expect(manifest.background).toMatchObject({ mode: "green" });
  });

describe("sprite-prepare cutout v2 (flood + defringe)", () => {
  it("unmixes key color from semi-transparent edges (defringe)", () => {
    // 主体红 (200,50,50) 与品红键 (255,0,255) 以 α≈0.5 混合的边缘像素
    const rgba = new Uint8Array([228, 25, 153, 128]);
    despillEdges(rgba, 1, 1, [255, 0, 255]);
    expect(rgba[0]).toBeGreaterThan(194);
    expect(rgba[0]).toBeLessThan(206);
    expect(rgba[1]).toBeGreaterThan(44);
    expect(rgba[1]).toBeLessThan(56);
    expect(rgba[2]).toBeGreaterThan(44);
    expect(rgba[2]).toBeLessThan(56);
  });

  it("keeps same-colored pixels inside the subject (flood only clears connected background)", () => {
    // 白底 20x20，中间 6x6 红块内挖 2x2 白窗：白窗不连通背景，必须保留
    const width = 20, height = 20;
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const inBlock = x >= 7 && x < 13 && y >= 7 && y < 13;
        const inWindow = x >= 9 && x < 11 && y >= 9 && y < 11;
        const red = inBlock && !inWindow;
        rgba[i] = red ? 200 : 255;
        rgba[i + 1] = red ? 40 : 255;
        rgba[i + 2] = red ? 40 : 255;
        rgba[i + 3] = 255;
      }
    }
    cutoutBackground(rgba, width, height, [255, 255, 255], 32);
    const windowPixel = (9 * width + 9) * 4;
    expect(rgba[windowPixel + 3]).toBe(255); // 白窗保留
    expect(pixel(rgba, width, 2, 2)[3]).toBe(0); // 边缘白底清掉
  });
});

describe("sprite-prepare fragment filter and normalization spec", () => {
  it("drops tiny bleed specks and keeps multi-part icons", () => {
    const width = 60, height = 60;
    const rgba = new Uint8Array(width * height * 4);
    const paint = (x0: number, y0: number, w: number, h: number, color: [number, number, number]) => {
      for (let y = y0; y < y0 + h; y += 1) {
        for (let x = x0; x < x0 + w; x += 1) {
          const i = (y * width + x) * 4;
          rgba[i] = color[0]; rgba[i + 1] = color[1]; rgba[i + 2] = color[2]; rgba[i + 3] = 255;
        }
      }
    };
    paint(15, 15, 30, 30, [200, 40, 40]); // 主块 900px
    paint(2, 2, 3, 3, [40, 40, 200]);     // 碎点 9px
    paint(55, 2, 3, 3, [40, 40, 200]);
    paint(2, 55, 3, 3, [40, 40, 200]);
    const dropped = dropTinyFragments(rgba, width, height);
    expect(dropped).toBe(27);
    expect(alphaBoundingBox(rgba, width, height)).toEqual({ left: 15, top: 15, width: 30, height: 30 });
  });

  it("normalizes to content box plus uniform pad and records it in the manifest", async () => {
    const input = await compose(100, 100, "#ffffff", [{ x: 30, y: 20, w: 40, h: 60, color: "#ff0000" }]);
    const manifest = await prepareSprites({ input, background: "white" });
    expect(manifest.pad).toBe(2);
    expect(manifest.cell).toEqual({ width: 44, height: 64 });
    expect(manifest.frames[0].content).toEqual({ left: 2, top: 2, width: 40, height: 60 });
  });

  it("downscales content to --max-edge (2x runtime budget)", async () => {
    const input = await compose(300, 300, "#ffffff", [{ x: 50, y: 50, w: 200, h: 100, color: "#ff0000" }]);
    const manifest = await prepareSprites({ input, background: "white", maxEdge: 50, pad: 0 });
    expect(manifest.maxEdge).toBe(50);
    expect(manifest.frames[0].content.width).toBe(50);
    expect(manifest.frames[0].content.height).toBe(25);
  });
});
});