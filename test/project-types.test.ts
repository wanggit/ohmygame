import { describe, expect, it } from "vitest";
import { defaultProjectName, GAME_PROJECT_TYPES, PROJECT_TYPES, projectTypeLabel } from "../src/renderer/project-types.js";

describe("project types", () => {
  it("keeps the shared labels and display order", () => {
    expect(PROJECT_TYPES).toEqual([
      { label: "Web Game", value: "web-game" },
      { label: "Interactive Story", value: "interactive-story" },
      { label: "Asset Canvas", value: "asset-canvas" },
    ]);
  });

  it("keeps Asset Canvas out of the home game types", () => {
    expect(GAME_PROJECT_TYPES.map(({ value }) => value)).toEqual(["web-game", "interactive-story"]);
  });

  it("hides Godot Game and General Game from the UI while keeping their labels", () => {
    expect(PROJECT_TYPES.map(({ value }) => value)).not.toContain("godot-game");
    expect(PROJECT_TYPES.map(({ value }) => value)).not.toContain("general");
    // Existing projects of hidden types still label themselves correctly.
    expect(projectTypeLabel("godot-game")).toBe("Godot");
    expect(projectTypeLabel("general")).toBe("General Game");
  });

  it("provides labels and default names", () => {
    expect(projectTypeLabel("general")).toBe("General Game");
    expect(defaultProjectName("general")).toBe("Untitled project");
    expect(projectTypeLabel("interactive-story")).toBe("Interactive Story");
    expect(defaultProjectName("interactive-story")).toBe("Untitled story");
    expect(defaultProjectName("web-game")).toBe("Untitled project");
  });
});
