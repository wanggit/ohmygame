import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/daemon/app.js";
import { AssetLibrary } from "../src/daemon/asset-library.js";
import { CanvasStore } from "../src/daemon/canvas-workspace.js";
import { ProjectManager } from "../src/daemon/projects.js";
import { ToolRunner } from "../src/daemon/tools.js";
import { createAgentTools } from "../src/daemon/agent-tools.js";
import {
  confirmMainDesign,
  designGateForProject,
  mainDesignRevision,
  readDesignConfirmation,
  removeDesignConfirmation,
  writeDesignConfirmation,
} from "../src/daemon/design-confirmation.js";
import {
  DESIGN_CONFIRMATION_FILE,
  designGateBlockReason,
  designGateState,
  isDesignConfirmationRecord,
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
  const main = { documentId: "design", revision: "rev-2" };
  const record = { version: 1 as const, documentId: "design", revision: "rev-2", confirmedAt: "2026-10-21T00:00:00.000Z" };
  it("exempts asset-canvas projects and keeps projects without a main design closed", () => {
    expect(designGateState("asset-canvas", main, record)).toEqual({ status: "not-required" });
    expect(designGateState("web-game", undefined, undefined)).toEqual({ status: "no-main-document" });
    expect(designGateState("web-game", undefined, record)).toEqual({ status: "no-main-document" });
  });
  it("awaits confirmation before the first confirm and whenever the main document changes", () => {
    expect(designGateState("web-game", main, undefined)).toEqual({ status: "awaiting", ...main, reason: "missing" });
    expect(designGateState("web-game", main, { ...record, documentId: "other" })).toEqual({ status: "awaiting", ...main, reason: "missing" });
    expect(designGateState("web-game", main, { ...record, revision: "rev-1" })).toEqual({ status: "awaiting", ...main, reason: "stale" });
  });
  it("confirms only the recorded revision of the current main document", () => {
    expect(designGateState("web-game", main, record)).toEqual({ status: "confirmed", documentId: "design", revision: "rev-2", confirmedAt: record.confirmedAt });
  });
  it("explains how to open the gate whenever it blocks a production tool", () => {
    expect(designGateBlockReason(designGateState("asset-canvas", main, record))).toBeUndefined();
    expect(designGateBlockReason(designGateState("web-game", main, record))).toBeUndefined();
    expect(designGateBlockReason(designGateState("web-game", undefined, undefined))).toContain("no main design document");
    expect(designGateBlockReason(designGateState("web-game", main, undefined))).toContain("not confirmed");
    expect(designGateBlockReason(designGateState("web-game", main, { ...record, revision: "rev-1" }))).toContain("edited since the last confirmation");
    for (const blocked of [designGateState("web-game", undefined, undefined), designGateState("web-game", main, undefined), designGateState("web-game", main, { ...record, revision: "rev-1" })]) {
      expect(designGateBlockReason(blocked)).toContain("Confirm design");
    }
  });
  it("validates stored confirmation records", () => {
    expect(isDesignConfirmationRecord(record)).toBe(true);
    expect(isDesignConfirmationRecord({ ...record, version: 2 })).toBe(false);
    expect(isDesignConfirmationRecord({ ...record, documentId: "bad id!" })).toBe(false);
    expect(isDesignConfirmationRecord({ ...record, revision: "" })).toBe(false);
    expect(isDesignConfirmationRecord(null)).toBe(false);
  });
});

describe("design confirmation files", () => {
  it("records the main design revision, stales after edits and forgets on removal", async () => {
    const { project, store } = await runtime();
    expect(await designGateForProject(project.workspacePath, project.type)).toEqual({ status: "no-main-document" });
    await expect(confirmMainDesign(project.workspacePath)).rejects.toThrow("No main design document");
    const doc = await store.createDocument(project.id, "Design");
    const main = await mainDesignRevision(project.workspacePath);
    expect(main).toEqual({ documentId: doc.document.id, revision: doc.revision });
    expect(await designGateForProject(project.workspacePath, project.type)).toEqual({ status: "awaiting", ...main, reason: "missing" });
    const record = await confirmMainDesign(project.workspacePath);
    expect(record).toMatchObject({ version: 1, documentId: doc.document.id, revision: doc.revision });
    expect(await readDesignConfirmation(project.workspacePath)).toEqual(record);
    expect(await designGateForProject(project.workspacePath, project.type)).toEqual({ status: "confirmed", documentId: doc.document.id, revision: doc.revision, confirmedAt: record.confirmedAt });
    const saved = await store.save(project.id, { ...doc.document, markdown: "A tighter loop" }, doc.revision, doc.document.id);
    expect(await designGateForProject(project.workspacePath, project.type)).toEqual({ status: "awaiting", documentId: doc.document.id, revision: saved.revision, reason: "stale" });
    await removeDesignConfirmation(project.workspacePath);
    expect(await readDesignConfirmation(project.workspacePath)).toBeUndefined();
    expect(await designGateForProject(project.workspacePath, project.type)).toEqual({ status: "awaiting", documentId: doc.document.id, revision: saved.revision, reason: "missing" });
  });
  it("keeps the gate closed when the confirmation file is damaged and exempts asset-canvas", async () => {
    const { project, store } = await runtime();
    const doc = await store.createDocument(project.id, "Design");
    await confirmMainDesign(project.workspacePath);
    await writeFile(path.join(project.workspacePath, DESIGN_CONFIRMATION_FILE), "{damaged");
    expect(await readDesignConfirmation(project.workspacePath)).toBeUndefined();
    expect(await designGateForProject(project.workspacePath, project.type)).toEqual({ status: "awaiting", documentId: doc.document.id, revision: doc.revision, reason: "missing" });
    const { project: canvasProject } = await runtime("asset-canvas");
    expect(await designGateForProject(canvasProject.workspacePath, canvasProject.type)).toEqual({ status: "not-required" });
    expect(await readDesignConfirmation(canvasProject.workspacePath)).toBeUndefined();
  });
  it("rejects stored records that fail validation", async () => {
    const { project } = await runtime();
    await mkdir(path.join(project.workspacePath, "canvas"), { recursive: true });
    await writeFile(path.join(project.workspacePath, DESIGN_CONFIRMATION_FILE), JSON.stringify({ version: 1, documentId: "bad id!", revision: "r", confirmedAt: "t" }));
    expect(await readDesignConfirmation(project.workspacePath)).toBeUndefined();
    await writeDesignConfirmation(project.workspacePath, { version: 1, documentId: "ok_id-1", revision: "r", confirmedAt: "t" });
    expect(await readDesignConfirmation(project.workspacePath)).toMatchObject({ documentId: "ok_id-1" });
  });
});

describe("design confirmation routes", () => {
  it("confirms, stales and resets the gate through the API", async () => {
    const app = createApp({ dataDirectory: await temp() }); apps.push(app);
    const project = (await app.inject({ method: "POST", url: "/projects", payload: {} })).json(), base = `/projects/${project.id}/canvas`;
    expect((await app.inject(`${base}/design-confirmation`)).json()).toEqual({ status: "no-main-document" });
    const failed = await app.inject({ method: "POST", url: `${base}/design-confirmation`, payload: { action: "confirm" } });
    expect(failed.statusCode).toBe(500);
    expect(failed.json().error).toContain("No main design document");
    const doc = (await app.inject({ method: "POST", url: `${base}/documents`, payload: { title: "Design" } })).json();
    expect((await app.inject(`${base}/design-confirmation`)).json()).toMatchObject({ status: "awaiting", reason: "missing", documentId: doc.document.id });
    const confirmed = await app.inject({ method: "POST", url: `${base}/design-confirmation`, payload: { action: "confirm" } });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json()).toMatchObject({ status: "confirmed", documentId: doc.document.id, revision: doc.revision });
    await app.inject({ method: "PUT", url: `${base}?documentId=${doc.document.id}`, payload: { ...doc, document: { ...doc.document, markdown: "Changed" } } });
    expect((await app.inject(`${base}/design-confirmation`)).json()).toMatchObject({ status: "awaiting", reason: "stale" });
    const reset = await app.inject({ method: "POST", url: `${base}/design-confirmation`, payload: { action: "reset" } });
    expect(reset.json()).toMatchObject({ status: "awaiting", reason: "missing" });
    expect((await app.inject({ method: "POST", url: `${base}/design-confirmation`, payload: { action: "skip" } })).statusCode).toBe(400);
  });
  it("reports the gate as not required for asset-canvas projects", async () => {
    const app = createApp({ dataDirectory: await temp() }); apps.push(app);
    const project = (await app.inject({ method: "POST", url: "/projects", payload: { type: "asset-canvas" } })).json();
    expect((await app.inject(`/projects/${project.id}/canvas/design-confirmation`)).json()).toEqual({ status: "not-required" });
    expect((await app.inject({ method: "POST", url: `/projects/${project.id}/canvas/design-confirmation`, payload: { action: "confirm" } })).json()).toEqual({ status: "not-required" });
  });
});

describe("agent media gate", () => {
  it("blocks generate_canvas_media until the user confirms and allows it afterwards", async () => {
    const generate = vi.fn(fakeGenerator.generate);
    const { project, store, projects, tools } = await runtime("web-game", { generate });
    const workspace = await store.workspace(project.id), boardId = workspace.boards[0]!.id;
    const detail = await store.board(project.id, boardId), node = createAssetGenerationNode("image", { x: 0, y: 0 });
    if (node.type === "image") node.data.prompt = "A gardener";
    detail.board.nodes.push(node); detail.board.editorLayout.nodes[node.id] = node.position;
    await store.saveBoard(project.id, detail.board, detail.revision);
    const doc = await store.createDocument(project.id, "Design");
    const registered = createAgentTools(project, tools, projects, undefined, undefined, undefined, undefined, store);
    const tool = registered.find((candidate) => candidate.name === "generate_canvas_media")!;
    await expect(tool.execute("blocked", { boardId, nodeId: node.id }, undefined, undefined, {} as never)).rejects.toThrow(/Design gate/);
    expect(generate).not.toHaveBeenCalled();
    await confirmMainDesign(project.workspacePath);
    const result = await tool.execute("allowed", { boardId, nodeId: node.id }, undefined, undefined, {} as never);
    expect(result.details).toMatchObject({ canvasGeneration: { status: "succeeded", context: { boardId, nodeId: node.id } } });
    expect(generate).toHaveBeenCalled();
  });
});
