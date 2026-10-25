import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentLearningsStore } from "../src/daemon/agent-learnings.js";
import { AGENT_PREFERENCE_MAX_LENGTH } from "../src/shared/agent-learnings.js";

const roots: string[] = [];

async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), "ohmygame-learnings-"));
  roots.push(root);
  return {
    root,
    data: path.join(root, "data"),
    agent: path.join(root, "pi-agent"),
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("agent learnings", () => {
  it("keeps one copy of a preference and survives a reload", async () => {
    const { data, agent } = await setup();
    const store = new AgentLearningsStore(data, agent);

    const first = await store.rememberPreference(
      "  Generate sprite sheets\n for frame animation.  ",
      { projectId: "p1", projectName: "Puzzle" },
    );
    expect(first.created).toBe(true);
    expect(first.preference.text).toBe(
      "Generate sprite sheets for frame animation.",
    );

    const duplicate = await store.rememberPreference(
      "generate sprite sheets for frame animation.",
      { projectId: "p2" },
    );
    expect(duplicate.created).toBe(false);
    expect(duplicate.preference.id).toBe(first.preference.id);

    const reloaded = new AgentLearningsStore(data, agent);
    expect(await reloaded.preferenceTexts()).toEqual([
      "Generate sprite sheets for frame animation.",
    ]);
    expect((await reloaded.read()).preferences[0]).toMatchObject({
      projectId: "p1",
      projectName: "Puzzle",
    });
  });

  it("updates and deletes preferences", async () => {
    const { data, agent } = await setup();
    const store = new AgentLearningsStore(data, agent);
    const { preference } = await store.rememberPreference("Prefer pixel art.");
    await store.rememberPreference("Keep HUDs minimal.");

    const updated = await store.updatePreference(
      preference.id,
      "Prefer hand-painted art.",
    );
    expect(updated.text).toBe("Prefer hand-painted art.");
    await expect(
      store.updatePreference(preference.id, "Keep HUDs minimal."),
    ).rejects.toThrow(/already saved/);

    await store.deletePreference(preference.id);
    expect(await store.preferenceTexts()).toEqual(["Keep HUDs minimal."]);
    await expect(store.deletePreference(preference.id)).rejects.toThrow(
      /not found/,
    );
  });

  it("rejects oversized preferences", async () => {
    const { data, agent } = await setup();
    const store = new AgentLearningsStore(data, agent);
    await expect(
      store.rememberPreference("x".repeat(AGENT_PREFERENCE_MAX_LENGTH + 1)),
    ).rejects.toThrow(/at most/);
    await expect(store.rememberPreference("   ")).rejects.toThrow(
      /cannot be empty/,
    );
  });

  it("writes personal Skills with frontmatter and updates them in place", async () => {
    const { data, agent } = await setup();
    const store = new AgentLearningsStore(data, agent);

    const created = await store.saveSkill({
      name: "sprite-sheet-animation",
      description: "Use when a game needs frame-based 2D character animation.",
      content: "# Sprite sheets\n\nGenerate one multi-cell sheet.",
      source: { projectId: "p1", projectName: "Puzzle" },
    });
    expect(created.created).toBe(true);
    const file = path.join(
      agent,
      "skills",
      "sprite-sheet-animation",
      "SKILL.md",
    );
    expect(await readFile(file, "utf8")).toBe(
      [
        "---",
        "name: sprite-sheet-animation",
        "description: Use when a game needs frame-based 2D character animation.",
        "---",
        "",
        "# Sprite sheets",
        "",
        "Generate one multi-cell sheet.",
        "",
      ].join("\n"),
    );

    const updated = await store.saveSkill({
      name: "sprite-sheet-animation",
      description: "Use when a game needs frame-based animation.",
      content: "Updated guidance.",
    });
    expect(updated.created).toBe(false);
    expect((await store.read()).skills).toMatchObject([
      {
        name: "sprite-sheet-animation",
        description: "Use when a game needs frame-based animation.",
        projectId: "p1",
      },
    ]);
    expect(await readFile(file, "utf8")).toContain("Updated guidance.");
  });

  it("does not overwrite a Skill it does not manage", async () => {
    const { data, agent } = await setup();
    await mkdir(path.join(agent, "skills", "plugin-creator"), {
      recursive: true,
    });
    await writeFile(
      path.join(agent, "skills", "plugin-creator", "SKILL.md"),
      "---\nname: plugin-creator\ndescription: Built in.\n---\n",
    );
    const store = new AgentLearningsStore(data, agent);

    await expect(
      store.saveSkill({
        name: "plugin-creator",
        description: "Mine",
        content: "x",
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("deletes only the Skills it manages", async () => {
    const { data, agent } = await setup();
    const store = new AgentLearningsStore(data, agent);
    await store.saveSkill({
      name: "sprite-sheet-animation",
      description: "Use for animation.",
      content: "Body.",
    });

    await store.deleteSkill("sprite-sheet-animation");
    expect((await store.read()).skills).toEqual([]);
    await expect(
      readFile(
        path.join(agent, "skills", "sprite-sheet-animation", "SKILL.md"),
        "utf8",
      ),
    ).rejects.toThrow();
    await expect(store.deleteSkill("sprite-sheet-animation")).rejects.toThrow(
      /not found/,
    );
    await expect(store.deleteSkill("../escape")).rejects.toThrow(
      /lowercase letters/,
    );
  });

  it("reports a corrupt store instead of silently forgetting it", async () => {
    const { data, agent } = await setup();
    await mkdir(data, { recursive: true });
    await writeFile(path.join(data, "agent-learnings.json"), "{not json");
    const store = new AgentLearningsStore(data, agent);
    await expect(store.read()).rejects.toThrow(/not valid JSON/);
  });
});
