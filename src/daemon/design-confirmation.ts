import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  DESIGN_CONFIRMATION_FILE,
  designGateRequired,
  designGateState,
  isDesignConfirmationRecord,
  type DesignConfirmationRecord,
  type DesignGateState,
} from "../shared/design-confirmation.js";
import { readCanvasDocument, readCanvasIndex } from "./canvas-workspace.js";

export async function readDesignConfirmation(workspace: string): Promise<DesignConfirmationRecord | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path.join(workspace, DESIGN_CONFIRMATION_FILE), "utf8"));
    return isDesignConfirmationRecord(parsed) ? parsed : undefined;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") return undefined;
    return undefined;
  }
}

export async function writeDesignConfirmation(workspace: string, record: DesignConfirmationRecord): Promise<void> {
  const file = path.join(workspace, DESIGN_CONFIRMATION_FILE);
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(record), { mode: 0o600 });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function removeDesignConfirmation(workspace: string): Promise<void> {
  await rm(path.join(workspace, DESIGN_CONFIRMATION_FILE), { force: true });
}

/** Confirms the current main design document at its current revision. Throws when no main design exists. */
export async function confirmMainDesign(workspace: string): Promise<DesignConfirmationRecord> {
  const main = await mainDesignRevision(workspace);
  if (!main) throw new Error("No main design document exists to confirm. Create the main design document first.");
  const record: DesignConfirmationRecord = {
    version: 1,
    documentId: main.documentId,
    revision: main.revision,
    confirmedAt: new Date().toISOString(),
  };
  await writeDesignConfirmation(workspace, record);
  return record;
}

export async function mainDesignRevision(workspace: string): Promise<{ documentId: string; revision: string } | undefined> {
  const index = await readCanvasIndex(workspace);
  if (!index?.mainDocumentId) return undefined;
  const detail = await readCanvasDocument(workspace, index.mainDocumentId);
  return detail ? { documentId: detail.document.id, revision: detail.revision } : undefined;
}

export async function designGateForProject(workspace: string, projectType: string): Promise<DesignGateState> {
  if (!designGateRequired(projectType)) return { status: "not-required" };
  try {
    const main = await mainDesignRevision(workspace);
    return designGateState(projectType, main, await readDesignConfirmation(workspace));
  } catch {
    // An unreadable canvas workspace keeps the gate closed rather than silently allowing production.
    return { status: "no-main-document" };
  }
}
