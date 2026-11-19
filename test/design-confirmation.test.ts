import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/daemon/app.js";
import { AssetLibrary } from "../src/daemon/asset-library.js";
import { CanvasStore } from "../src/daemon/canvas-workspace.js";
import { ProjectManager } from "../src/daemon/projects.js";
import { ToolRunner } from "../src/daemon/tools.js";
import { createAgentTools } from "../src/daemon/agent-tools.js";
import { designGateForProject, mainDesignRevision } from "../src/daemon/design-confirmation.js";
import {
  countVisualMockups,
  designGateBlockReason,
  designGateState,
  missingDesignSections,
} from "../src/shared/design-confirmation.js";
import type { ImageGenerator } from "../src/daemon/openai-image.js";
import type { ProjectType } from "../src/shared/contracts.js";
import { createAssetGenerationNode } from "../src/shared/asset-canvas.js";

const directories: string[] = [], stores: CanvasStore[] = [], apps: ReturnType<typeof createApp>[] = [];
afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});
async function temp() { const directory = await mkdtemp(path.join(tmpdir(), "ohmygame-design-gate-")); directories.push(directory); return directory; }
const REQUIRED_DESIGN_SECTIONS = "## Why players choose this game\n\nA fresh juice theme and tighter feel than other sort games.\n\n## Skills and capabilities required\n\n- Art generation: available";
const fakeGenerator: ImageGenerator = { generate: async () => ({ bytes: Buffer.from("image"), mediaType: "image/png" }) };
async function runtime(projectType: ProjectType = "web-game", generator: ImageGenerator = fakeGenerator) {
  const directory = await temp(), library = new AssetLibrary(directory), projects = new ProjectManager(directory, library);
  const tools = new ToolRunner(directory, generator, undefined, undefined, library);
  await Promise.all([library.load(), projects.load(), tools.load()]);
  const project = await projects.create("Garden", projectType), store = new CanvasStore(projects, library, tools);
  stores.push(store);
  return { directory, project, store, projects, tools };
}

describe("design gate state", () => {
  const main = (markdown: string) => ({ documentId: "design", revision: "rev-2", markdown });
  it("exempts asset-canvas projects and keeps projects without a main design closed", () => {
    expect(designGateState("asset-canvas", main(REQUIRED_DESIGN_SECTIONS))).toEqual({ status: "not-required" });
    expect(designGateState("web-game", undefined)).toEqual({ status: "no-main-document" });
  });
  it("treats a complete main design document as human-approved automatically", () => {
    expect(designGateState("web-game", main(REQUIRED_DESIGN_SECTIONS))).toEqual({ status: "confirmed", documentId: "design", revision: "rev-2", visualMockups: 0 });
    const withMockups = main(`${REQUIRED_DESIGN_SECTIONS}\n\n![Title mock](a.png)\n\n![Gameplay mock](b.png)`);
    expect(designGateState("web-game", withMockups)).toEqual({ status: "confirmed", documentId: "design", revision: "rev-2", visualMockups: 2 });
  });
  it("keeps the gate closed and reports the missing sections until the document answers both questions", () => {
    expect(designGateState("web-game", main("## Core loop\n\nShoot and dodge."))).toEqual({ status: "awaiting", documentId: "design", revision: "rev-2", reason: "missing-sections", missing: ["Why players choose this game", "Skills and capabilities required"] });
    expect(designGateState("web-game", main("## Why players choose this game\n\nFresh theme."))).toEqual({ status: "awaiting", documentId: "design", revision: "rev-2", reason: "missing-sections", missing: ["Skills and capabilities required"] });
  });
  it("explains how to complete the design whenever it blocks a production tool", () => {
    expect(designGateBlockReason(designGateState("asset-canvas", main(REQUIRED_DESIGN_SECTIONS)))).toBeUndefined();
    expect(designGateBlockReason(designGateState("web-game", main(REQUIRED_DESIGN_SECTIONS)))).toBeUndefined();
    const noDocument = designGateBlockReason(designGateState("web-game", undefined))!;
    expect(noDocument).toContain("no main design document");
    expect(noDocument).toContain("human-approved automatically");
    const incomplete = designGateBlockReason(designGateState("web-game", main("## Core loop")))!;
    expect(incomplete).toContain("missing required sections");
    expect(incomplete).toContain("Why players choose this game");
    expect(incomplete).toContain("human-approved automatically");
    for (const blocked of [noDocument, incomplete]) expect(blocked).toContain("do not work around this gate");
  });
});

describe("design required sections", () => {
  it("reports the sections missing from a design document's Markdown", () => {
    expect(missingDesignSections("# Core loop\n\nShoot and dodge.")).toEqual(["Why players choose this game", "Skills and capabilities required"]);
    expect(missingDesignSections("## Why players choose this game\n\nOnly this one.")).toEqual(["Skills and capabilities required"]);
    expect(missingDesignSections(REQUIRED_DESIGN_SECTIONS)).toEqual([]);
    expect(missingDesignSections("## Why This Game\n\nA fresh theme.\n\n## Skills needed\n\n- Art: available")).toEqual([]);
    expect(missingDesignSections("## 玩家为什么选我们\n\n差异化主题。\n\n## 技能需求清单\n\n- 美术：可用")).toEqual([]);
  });
  it("opens the gate automatically once a document answers both questions", async () => {
    const { project, store } = await runtime();
    const doc = await store.createDocument(project.id, "Design");
    const skipped = await store.save(project.id, { ...doc.document, markdown: "## Core loop\n\nShoot and dodge." }, doc.revision, doc.document.id);
    expect(await designGateForProject(project.workspacePath, project.type)).toMatchObject({ status: "awaiting", reason: "missing-sections", missing: ["Why players choose this game", "Skills and capabilities required"] });
    await store.save(project.id, { ...doc.document, markdown: REQUIRED_DESIGN_SECTIONS }, skipped.revision, doc.document.id);
    expect(await designGateForProject(project.workspacePath, project.type)).toMatchObject({ status: "confirmed", documentId: doc.document.id });
  });
  it("counts embedded visual mockups", async () => {
    const { project, store } = await runtime();
    const doc = await store.createDocument(project.id, "Design");
    const withMockups = `${REQUIRED_DESIGN_SECTIONS}\n\n![Title mock](assets/mock-title.png)\n\n![Gameplay mock](assets/mock-game.png)`;
    await store.save(project.id, { ...doc.document, markdown: withMockups }, doc.revision, doc.document.id);
    expect(countVisualMockups(withMockups)).toBe(2);
    expect(countVisualMockups(REQUIRED_DESIGN_SECTIONS)).toBe(0);
    expect(await designGateForProject(project.workspacePath, project.type)).toMatchObject({ status: "confirmed", visualMockups: 2 });
  });
});

describe("design gate resolution", () => {
  it("follows the main design document automatically and never needs re-approval", async () => {
    const { project, store } = await runtime();
    expect(await designGateForProject(project.workspacePath, project.type)).toEqual({ status: "no-main-document" });
    const doc = await store.createDocument(project.id, "Design");
    expect(await designGateForProject(project.workspacePath, project.type)).toEqual({ status: "awaiting", documentId: doc.document.id, revision: doc.revision, reason: "missing-sections", missing: ["Why players choose this game", "Skills and capabilities required"] });
    const answered = await store.save(project.id, { ...doc.document, markdown: REQUIRED_DESIGN_SECTIONS }, doc.revision, doc.document.id);
    expect(await mainDesignRevision(project.workspacePath)).toEqual({ documentId: doc.document.id, revision: answered.revision });
    expect(await designGateForProject(project.workspacePath, project.type)).toEqual({ status: "confirmed", documentId: doc.document.id, revision: answered.revision, visualMockups: 0 });
    // Later edits follow the document automatically: refinements and structural changes never reopen the gate.
    const refined = await store.save(project.id, { ...doc.document, markdown: `${REQUIRED_DESIGN_SECTIONS}\n\n## Implementation notes\n\nTuning lives in canvas tables.` }, answered.revision, doc.document.id);
    expect(await designGateForProject(project.workspacePath, project.type)).toEqual({ status: "confirmed", documentId: doc.document.id, revision: refined.revision, visualMockups: 0 });
    const stripped = await store.save(project.id, { ...doc.document, markdown: "## Core loop\n\nShoot and dodge." }, refined.revision, doc.document.id);
    expect(await designGateForProject(project.workspacePath, project.type)).toEqual({ status: "awaiting", documentId: doc.document.id, revision: stripped.revision, reason: "missing-sections", missing: ["Why players choose this game", "Skills and capabilities required"] });
  });
  it("exempts asset-canvas projects", async () => {
    const { project: canvasProject } = await runtime("asset-canvas");
    expect(await designGateForProject(canvasProject.workspacePath, canvasProject.type)).toEqual({ status: "not-required" });
  });
});

describe("design gate routes", () => {
  it("reports the gate state and offers no confirm action", async () => {
    const app = createApp({ dataDirectory: await temp() }); apps.push(app);
    const project = (await app.inject({ method: "POST", url: "/projects", payload: {} })).json(), base = `/projects/${project.id}/canvas`;
    expect((await app.inject(`${base}/design-confirmation`)).json()).toEqual({ status: "no-main-document" });
    const doc = (await app.inject({ method: "POST", url: `${base}/documents`, payload: { title: "Design" } })).json();
    expect((await app.inject(`${base}/design-confirmation`)).json()).toMatchObject({ status: "awaiting", reason: "missing-sections", documentId: doc.document.id });
    const answered = (await app.inject({ method: "PUT", url: `${base}?documentId=${doc.document.id}`, payload: { ...doc, document: { ...doc.document, markdown: REQUIRED_DESIGN_SECTIONS } } })).json();
    expect((await app.inject(`${base}/design-confirmation`)).json()).toEqual({ status: "confirmed", documentId: doc.document.id, revision: answered.revision, visualMockups: 0 });
    await app.inject({ method: "PUT", url: `${base}?documentId=${doc.document.id}`, payload: { ...answered, document: { ...answered.document, markdown: "Changed" } } });
    expect((await app.inject(`${base}/design-confirmation`)).json()).toMatchObject({ status: "awaiting", reason: "missing-sections" });
    // The gate opens from the document alone; there is no confirm/reset action left to call.
    expect((await app.inject({ method: "POST", url: `${base}/design-confirmation`, payload: { action: "confirm" } })).statusCode).toBe(404);
  });
  it("reports the gate as not required for asset-canvas projects", async () => {
    const app = createApp({ dataDirectory: await temp() }); apps.push(app);
    const project = (await app.inject({ method: "POST", url: "/projects", payload: { type: "asset-canvas" } })).json();
    expect((await app.inject(`/projects/${project.id}/canvas/design-confirmation`)).json()).toEqual({ status: "not-required" });
  });
});

describe("agent media gate", () => {
  it("blocks generate_canvas_media until the main design is complete and allows it right after", async () => {
    const generate = vi.fn(fakeGenerator.generate);
    const { project, store, projects, tools } = await runtime("web-game", { generate });
    const workspace = await store.workspace(project.id), boardId = workspace.boards[0]!.id;
    const detail = await store.board(project.id, boardId), node = createAssetGenerationNode("image", { x: 0, y: 0 });
    if (node.type === "image") node.data.prompt = "A gardener";
    detail.board.nodes.push(node); detail.board.editorLayout.nodes[node.id] = node.position;
    await store.saveBoard(project.id, detail.board, detail.revision);
    const registered = createAgentTools(project, tools, projects, undefined, undefined, undefined, undefined, store);
    const tool = registered.find((candidate) => candidate.name === "generate_canvas_media")!;
    await expect(tool.execute("blocked", { boardId, nodeId: node.id }, undefined, undefined, {} as never)).rejects.toThrow(/Design gate/);
    expect(generate).not.toHaveBeenCalled();
    const doc = await store.createDocument(project.id, "Design");
    const incomplete = await store.save(project.id, { ...doc.document, markdown: "## Core loop\n\nPlant seeds." }, doc.revision, doc.document.id);
    await expect(tool.execute("blocked-again", { boardId, nodeId: node.id }, undefined, undefined, {} as never)).rejects.toThrow(/missing required sections/);
    expect(generate).not.toHaveBeenCalled();
    // Completing the required sections opens the gate automatically — no user confirmation happens in between.
    await store.save(project.id, { ...doc.document, markdown: REQUIRED_DESIGN_SECTIONS }, incomplete.revision, doc.document.id);
    const result = await tool.execute("allowed", { boardId, nodeId: node.id }, undefined, undefined, {} as never);
    expect(result.details).toMatchObject({ canvasGeneration: { status: "succeeded", context: { boardId, nodeId: node.id } } });
    expect(generate).toHaveBeenCalled();
  });
});
