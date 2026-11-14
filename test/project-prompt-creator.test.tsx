import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MechanicMenuList, ProjectPromptCreator, workspaceFolderName } from "../src/renderer/project-prompt-creator.js";

function render(): string {
  return renderToStaticMarkup(<ProjectPromptCreator projectType="web-game" placeholder="Describe the game" onCreate={() => undefined} />);
}

describe("project prompt creator workspace", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("defaults to a new managed folder when the desktop folder picker is available", () => {
    vi.stubGlobal("window", { ohMyGameDesktop: { selectProjectDirectory: async () => undefined } });
    const html = render();
    expect(html).toContain("New folder");
    expect(html).toContain('aria-label="Workspace: new folder in OhMyGame storage"');
  });

  it("hides the workspace selector without the desktop folder picker", () => {
    vi.stubGlobal("window", {});
    expect(render()).not.toContain("New folder");
  });

  it("labels external workspaces by folder name", () => {
    expect(workspaceFolderName("/Users/me/Games/space-race")).toBe("space-race");
    expect(workspaceFolderName("/Users/me/Games/space-race/")).toBe("space-race");
    expect(workspaceFolderName("C:\\Games\\space-race")).toBe("space-race");
  });
});

describe("mechanic picker tiers", () => {
  it("groups options under core, conditional, and deprioritized headings", () => {
    const html = renderToStaticMarkup(
      <MechanicMenuList onSelect={() => undefined} />,
    );
    const core = html.indexOf(">Core<");
    const conditional = html.indexOf(">Conditional<");
    const deprioritized = html.indexOf(">Deprioritized<");
    expect(core).toBeGreaterThan(-1);
    expect(conditional).toBeGreaterThan(core);
    expect(deprioritized).toBeGreaterThan(conditional);
    // 分组标签带负担说明 tooltip
    expect(html).toContain("Low art load");
    expect(html).toContain("High art cost");
  });

  it("renders every mechanic inside a labeled tier group", () => {
    const html = renderToStaticMarkup(
      <MechanicMenuList onSelect={() => undefined} />,
    );
    expect(html.match(/role="menuitemradio"/g)).toHaveLength(29);
    expect(html.match(/role="group"/g)).toHaveLength(3);
    // 核心圈成员在核心圈标题之后、观察圈标题之前
    const coreLabel = html.indexOf(">Core<");
    const conditionalLabel = html.indexOf(">Conditional<");
    const waterSort = html.indexOf("Water Sort");
    expect(waterSort).toBeGreaterThan(coreLabel);
    expect(waterSort).toBeLessThan(conditionalLabel);
    // 收缩圈成员排在最后
    const jigsaw = html.indexOf("Jigsaw");
    expect(jigsaw).toBeGreaterThan(html.indexOf(">Deprioritized<"));
  });
});
