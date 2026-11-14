import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
// @ts-ignore sprite-prepare 是 skill 附带的无类型 ESM 脚本
import { alphaBoundingBox, cutoutBackground, parseArgs, prepareSprites } from "../plugins/web-game-studio/skills/sprite-pipeline/scripts/sprite-prepare.mjs";

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
    const manifest = await prepareSprites({ input, background: "white", json: true });

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
    const manifest = await prepareSprites({ input, background: "white", grid: [2, 2], cell: [50, 50], anchor: "bottom-center" });

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
    const manifest = await prepareSprites({ input, background: "white", breathe: 4 });

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
    const manifest = await prepareSprites({ input, background: "green", json: true });
    expect(manifest.cell).toEqual({ width: 30, height: 50 });
    expect(manifest.background).toMatchObject({ mode: "green" });
  });
});