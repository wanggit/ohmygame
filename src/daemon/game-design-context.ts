import type { ProjectState, PromptContext } from "../shared/contracts.js";
import { CANVAS_INDEX_FILE, canvasDocumentPath, type CanvasDocumentDetail } from "../shared/canvas-document.js";
import { readCanvasDocuments, readCanvasIndex } from "./canvas-workspace.js";
import { canvasBoardPath } from "../shared/canvas-workspace.js";
import { designGateForProject } from "./design-confirmation.js";

async function designGateLine(project: ProjectState): Promise<string | undefined> {
  const gate = await designGateForProject(project.workspacePath, project.type);
  if (gate.status === "not-required") return undefined;
  if (gate.status === "confirmed") return `Design gate: the main design is user-confirmed (revision ${gate.revision.slice(0, 8)}). Media generation is allowed.`;
  const wait = "Media generation tools are blocked until the user confirms the main design document. Discuss and finalize the core loop first, then tell the user the design is on the Design tab at the top of the workspace and ask them to confirm it (open the Design tab, select the main design document node, Confirm design).";
  if (gate.status === "awaiting") return `Design gate: the main design is ${gate.reason === "stale" ? "edited since the last user confirmation" : "not confirmed by the user yet"}. ${wait}`;
  return `Design gate: this project has no main design document yet. ${wait}`;
}

export function gameDesignReference(detail: CanvasDocumentDetail): PromptContext {
  return {
    kind: "design-document",
    label: `${(detail.document.title || "Document").slice(0, 189)} (${detail.revision.slice(0, 8)})`,
    text: [
      "The user explicitly referenced this document snapshot for this message. It was captured from the saved Markdown source when the message was sent.",
      `Source: ${canvasDocumentPath(detail.document.id)}\nRevision: ${detail.revision}`,
      "Use this snapshot as context for the turn. The user's current request takes priority; mention relevant differences without changing the document unless asked. Before editing the document, reread the current Markdown source to preserve changes made since this snapshot.",
      "Image paths are relative to the Markdown file. Image links do not include image pixels. Read relevant images when evaluating visual direction.",
      `Document snapshot:\n${detail.document.markdown}`,
    ].join("\n\n"),
  };
}

export async function gameDesignMetadata(project: ProjectState, hadDesign = false): Promise<string | undefined> {
  try {
    const index = await readCanvasIndex(project.workspacePath);
    if (!index) return hadDesign ? `This project currently has no saved main game design in ${CANVAS_INDEX_FILE}. Do not rely on an earlier document snapshot as the current design.` : undefined;
    const documents = await readCanvasDocuments(project.workspacePath, index);
    const detail = project.type !== "asset-canvas" ? documents.find((document) => document.document.id === index.mainDocumentId) : undefined;
    const gate = await designGateLine(project);
    return [
      detail ? `Game design: ${JSON.stringify(detail.document.title)}. Source: ${canvasDocumentPath(detail.document.id)}. Revision: ${detail.revision}.` : project.type === "asset-canvas" ? "Asset Canvas: documents are production references; this project has no game runtime or main game design document." : "No main design document is selected.",
      ...(gate ? [gate] : []),
      `Canvas workspace: canvas/AGENTS.md; index: ${CANVAS_INDEX_FILE}; assets: canvas/assets.json. Boards: ${JSON.stringify(index.boards.map((board) => ({ ...board, source: canvasBoardPath(board.id) })))}. Documents: ${JSON.stringify(documents.map((document) => ({ id: document.document.id, title: document.document.title, source: canvasDocumentPath(document.document.id), revision: document.revision })))}`,
      "Read relevant boards and Markdown documents for the requested work. A game's main design document guides implementation. Names, descriptions and prompts identify assets; read their local files to inspect actual visuals. Reread current files before editing. Casual conversation needs no canvas reads. An explicit document snapshot in this message is the referenced version.",
    ].join("\n");
  } catch (cause) {
    return `The current canvas workspace could not be read: ${cause instanceof Error ? cause.message : String(cause)}. Inspect ${CANVAS_INDEX_FILE} if it is relevant to the request; do not assume an earlier snapshot is current.`;
  }
}
