import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CASUAL_MECHANICS,
  CASUAL_MECHANIC_TIERS,
  casualMechanicLabel,
  mechanicsGroupedByTier,
  mechanicCreationBrief,
} from "../src/shared/casual-mechanics.js";

const PLAYBOOKS_DIR = fileURLToPath(
  new URL("../templates/casual-games", import.meta.url),
);

describe("casual mechanics catalog", () => {
  it("stays in sync with templates/casual-games directories", () => {
    // 玩法目录的定义：含 PLAYBOOK.md 的子目录（见 src/shared/casual-mechanics.ts 顶部契约）；
    // shared/ 等横切基建目录没有 PLAYBOOK.md，不参与对账。
    const directories = readdirSync(PLAYBOOKS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => existsSync(join(PLAYBOOKS_DIR, entry.name, "PLAYBOOK.md")))
      .map((entry) => entry.name)
      .sort();
    expect(CASUAL_MECHANICS.map((mechanic) => mechanic.id).sort()).toEqual(
      directories,
    );
  });

  it("labels every mechanic in Chinese and English", () => {
    for (const mechanic of CASUAL_MECHANICS) {
      expect(mechanic.zh.length).toBeGreaterThan(0);
      expect(mechanic.en.length).toBeGreaterThan(0);
      expect(mechanic.summary.length).toBeGreaterThan(0);
      expect(casualMechanicLabel(mechanic)).toBe(
        `${mechanic.zh} / ${mechanic.en}`,
      );
    }
    expect(
      new Set(CASUAL_MECHANICS.map((mechanic) => casualMechanicLabel(mechanic)))
        .size,
    ).toBe(CASUAL_MECHANICS.length);
  });

  it("groups every mechanic into one art-load tier", () => {
    const groups = mechanicsGroupedByTier();
    expect(groups.map((group) => group.tier)).toEqual([
      "core",
      "watch",
      "shrink",
    ]);
    // 每个玩法恰好出现在一组，分组总和与目录一致
    const grouped = groups.flatMap((group) =>
      group.mechanics.map((mechanic) => mechanic.id),
    );
    expect(grouped.sort()).toEqual(
      CASUAL_MECHANICS.map((mechanic) => mechanic.id).sort(),
    );
    for (const group of groups) {
      expect(group.mechanics.length).toBeGreaterThan(0);
      for (const mechanic of group.mechanics) {
        expect(mechanic.tier).toBe(group.tier);
      }
    }
    // 收窄目标的锚点：伪低美术陷阱（每关一张插画）必须在收缩圈
    for (const id of ["jigsaw", "spot-difference", "color-by-number", "runner"]) {
      const mechanic = CASUAL_MECHANICS.find((entry) => entry.id === id);
      expect(mechanic?.tier).toBe("shrink");
    }
    expect(CASUAL_MECHANIC_TIERS).toEqual(["core", "watch", "shrink"]);
  });

  it("prepends the mechanic brief and quality gates to the prompt", () => {
    const [waterSort] = CASUAL_MECHANICS;
    const brief = mechanicCreationBrief(waterSort!, "Make it fruity.");
    expect(brief).toContain('"Water Sort" mechanic (水排序)');
    expect(brief).toContain("3-second comprehension test");
    expect(brief).toContain("single input primitive");
    expect(brief).toContain("---\n\nMake it fruity.");
    expect(mechanicCreationBrief(waterSort!, "")).not.toContain("---");
  });
});
