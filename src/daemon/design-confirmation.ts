import { designGateRequired, designGateState, type DesignGateState } from "../shared/design-confirmation.js";
import { readCanvasDocument, readCanvasIndex } from "./canvas-workspace.js";

export async function mainDesignRevision(workspace: string): Promise<{ documentId: string; revision: string } | undefined> {
  const index = await readCanvasIndex(workspace);
  if (!index?.mainDocumentId) return undefined;
  const detail = await readCanvasDocument(workspace, index.mainDocumentId);
  return detail ? { documentId: detail.document.id, revision: detail.revision } : undefined;
}

/**
 * Resolves the design gate from the current main design document on every check.
 * A document with every required section is complete and therefore treated as
 * human-approved automatically — no confirmation record exists and edits never
 * reopen anything.
 */
export async function designGateForProject(workspace: string, projectType: string): Promise<DesignGateState> {
  if (!designGateRequired(projectType)) return { status: "not-required" };
  try {
    const index = await readCanvasIndex(workspace);
    const detail = index?.mainDocumentId ? await readCanvasDocument(workspace, index.mainDocumentId) : undefined;
    return designGateState(projectType, detail && { documentId: detail.document.id, revision: detail.revision, markdown: detail.document.markdown });
  } catch {
    // An unreadable canvas workspace keeps the gate closed rather than silently allowing production.
    return { status: "no-main-document" };
  }
}
