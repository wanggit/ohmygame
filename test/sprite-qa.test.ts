import { describe, expect, it } from "vitest";
// @ts-ignore sprite-qa 是 skill 附带的无类型 ESM 脚本
import { analyzeImage, components, renderQaTile, resolveKey } from "../plugins/web-game-studio/skills/sprite-pipeline/scripts/sprite-qa.mjs";

/** 透明底画布 + 任意像素写入器。 */
function canvas(width: number, height: number): { rgba: Uint8Array; set(x: number, y: number, color: [number, number, number], alpha: number): void } {
  const rgba = new Uint8Array(width * height * 4);
  return {
    rgba,
    set(x, y, color, alpha) {
      const i = (y * width + x) * 4;
      rgba[i] = color[0]; rgba[i + 1] = color[1]; rgba[i + 2] = color[2]; rgba[i + 3] = alpha;
    },
  };
}

function paintRect(c: ReturnType<typeof canvas>, x0: number, y0: number, w: number, h: number, color: [number, number, number], alpha: number): void {
  for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) c.set(x, y, color, alpha);
}

describe("sprite-qa findings", () => {
  it("passes a clean cutout sprite", () => {
    const width = 64, height = 64;
    const c = canvas(width, height);
    paintRect(c, 20, 20, 24, 24, [200, 40, 40], 255);
    const { findings } = analyzeImage(c.rgba, width, height, [255, 0, 255]);
    expect(findings).toEqual([]);
  });

  it("fails on key-color fringe on semi-transparent edges", () => {
    const width = 64, height = 64;
    const c = canvas(width, height);
    paintRect(c, 22, 22, 20, 20, [200, 40, 40], 255);
    paintRect(c, 20, 20, 24, 24, [230, 60, 200], 128); // 品红溢边圈
    paintRect(c, 22, 22, 20, 20, [200, 40, 40], 255);
    const { findings } = analyzeImage(c.rgba, width, height, [255, 0, 255]);
    expect(findings.map((f: { id: string }) => f.id)).toContain("keyFringe");
    expect(findings.find((f: { id: string }) => f.id === "keyFringe").level).toBe("fail");
  });

  it("fails when the image was never cut out", () => {
    const width = 32, height = 32;
    const c = canvas(width, height);
    paintRect(c, 0, 0, width, height, [255, 255, 255], 255);
    const { findings } = analyzeImage(c.rgba, width, height, [255, 255, 255]);
    expect(findings.map((f: { id: string }) => f.id)).toContain("opaqueBackground");
  });

  it("warns on a white sticker outline hugging the subject", () => {
    const width = 64, height = 64;
    const c = canvas(width, height);
    paintRect(c, 16, 16, 32, 32, [255, 255, 255], 255); // 白描边
    paintRect(c, 18, 18, 28, 28, [200, 40, 40], 255);   // 主体
    const { findings } = analyzeImage(c.rgba, width, height, [255, 0, 255]);
    const outline = findings.find((f: { id: string }) => f.id === "stickerOutline");
    expect(outline).toBeTruthy();
    expect(outline.level).toBe("warn");
  });

  it("warns on a white halo ring wrapping the subject even when semi-transparent glow sits outside", () => {
    // 青球 → 白圈 → 半透明淡光晕（ball.png 的真实缺陷结构）
    const width = 64, height = 64;
    const c = canvas(width, height);
    const cx = 32, cy = 32;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const d = Math.round(Math.hypot(x - cx, y - cy));
        if (d <= 12) c.set(x, y, [80, 220, 230], 255);     // 青球
        else if (d <= 16) c.set(x, y, [252, 252, 252], 255); // 白圈
        else if (d <= 22) c.set(x, y, [240, 245, 250], 150); // 淡光晕
      }
    }
    const { findings } = analyzeImage(c.rgba, width, height, [255, 0, 255]);
    expect(findings.map((f: { id: string }) => f.id)).toContain("stickerOutline");
  });

  it("warns on stray fragments", () => {
    const width = 64, height = 64;
    const c = canvas(width, height);
    paintRect(c, 20, 20, 24, 24, [200, 40, 40], 255);
    paintRect(c, 2, 2, 2, 2, [40, 40, 200], 255);
    paintRect(c, 60, 2, 2, 2, [40, 40, 200], 255);
    paintRect(c, 2, 60, 2, 2, [40, 40, 200], 255);
    const { findings } = analyzeImage(c.rgba, width, height, [255, 0, 255]);
    expect(findings.map((f: { id: string }) => f.id)).toContain("strayFragments");
  });

  it("fails on neighbor-cell bleed slivers in grid mode", () => {
    const width = 64, height = 32;
    const c = canvas(width, height);
    paintRect(c, 4, 6, 20, 20, [200, 40, 40], 255);   // 左格主块 400px
    paintRect(c, 29, 14, 3, 3, [40, 40, 200], 255);   // 贴中缝的邻格碎边 9px
    paintRect(c, 36, 6, 20, 20, [40, 200, 40], 255);  // 右格主块
    const { findings } = analyzeImage(c.rgba, width, height, [255, 0, 255], [2, 1]);
    expect(findings.map((f: { id: string }) => f.id)).toContain("cellBleed");
    expect(findings.find((f: { id: string }) => f.id === "cellBleed").level).toBe("fail");
  });
});

describe("sprite-qa helpers", () => {
  it("resolves chroma keys and corner-sampled auto keys", () => {
    expect(resolveKey("magenta", new Uint8Array(4), 1, 1)).toEqual([255, 0, 255]);
    expect(resolveKey("#00ff00", new Uint8Array(4), 1, 1)).toEqual([0, 255, 0]);
    const width = 16, height = 16;
    const c = canvas(width, height);
    paintRect(c, 0, 0, width, height, [10, 250, 10], 255);
    expect(resolveKey("auto", c.rgba, width, height)).toEqual([10, 250, 10]);
  });

  it("labels connected blocks with border contact", () => {
    const width = 16, height = 16;
    const c = canvas(width, height);
    paintRect(c, 0, 0, 4, 4, [200, 40, 40], 255);   // 贴边
    paintRect(c, 8, 8, 4, 4, [40, 40, 200], 255);   // 不贴边
    const blocks = components(c.rgba, width, height);
    expect(blocks).toHaveLength(2);
    expect(blocks.filter((b: { touchesBorder: boolean }) => b.touchesBorder)).toHaveLength(1);
  });

  it("renders zoomed QA tiles with tinted problem pixels", () => {
    const width = 8, height = 8;
    const c = canvas(width, height);
    paintRect(c, 2, 2, 4, 4, [200, 40, 40], 255);
    const marks = new Uint8Array(width * height);
    marks[2 * width + 2] = 1;
    const tile = renderQaTile(c.rgba, width, height, marks, 3);
    expect([tile.width, tile.height]).toEqual([24, 24]);
    const i = (2 * 3 * tile.width + 2 * 3) * 4;
    expect([tile.data[i], tile.data[i + 1], tile.data[i + 2]]).toEqual([255, 40, 40]);
  });
});