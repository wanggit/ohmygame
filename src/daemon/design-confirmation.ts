import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  DESIGN_CONFIRMATION_FILE,
  countVisualMockups,
  designGateRequired,
  designGateState,
  designStructure,
  isDesignConfirmationRecord,
  missingDesignSections,
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

/** Confirms the current main design document at its current revision. Throws when no main design exists or required sections are missing. */
export async function confirmMainDesign(workspace: string): Promise<DesignConfirmationRecord> {
  const main = await mainDesignRevision(workspace);
  if (!main) throw new Error("No main design document exists to confirm. Create the main design document first.");
  const detail = await readCanvasDocument(workspace, main.documentId);
  const missing = detail ? missingDesignSections(detail.document.markdown) : [];
  if (missing.length) {
    throw new Error(
      `The main design document must answer two questions in dedicated sections before confirmation. Missing sections: ${missing.join("; ")}. `
      + 'Add "Why players choose this game" (why players choose this over similar games with mature gameplay) and '
      + '"Skills and capabilities required" (the skills building this game needs and their availability), then confirm again.',
    );
  }
  const record: DesignConfirmationRecord = {
    version: 1,
    documentId: main.documentId,
    revision: main.revision,
    structure: designStructure(detail?.document.markdown ?? ""),
    visualMockups: countVisualMockups(detail?.document.markdown ?? ""),
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
    const detail = main ? await readCanvasDocument(workspace, main.documentId) : undefined;
    return designGateState(projectType, main && { ...main, structure: designStructure(detail?.document.markdown ?? "") }, await readDesignConfirmation(workspace));
  } catch {
    // An unreadable canvas workspace keeps the gate closed rather than silently allowing production.
    return { status: "no-main-document" };
  }
}
