import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CASUAL_MECHANICS,
  casualMechanicLabel,
  mechanicCreationBrief,
} from "../src/shared/casual-mechanics.js";

const PLAYBOOKS_DIR = fileURLToPath(
  new URL("../templates/casual-games", import.meta.url),
);

describe("casual mechanics catalog", () => {
  it("stays in sync with templates/casual-games directories", () => {
    const directories = readdirSync(PLAYBOOKS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
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
