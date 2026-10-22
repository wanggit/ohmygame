import {
  PROJECT_TYPE_IDS,
  type PreviewStatus,
  type ProjectState,
  type ProjectType,
} from "./contracts.js";

export function isProjectType(value: unknown): value is ProjectType {
  return PROJECT_TYPE_IDS.some((type) => type === value);
}

/** These workspaces can use the platform's Web runtime when configured. */
export function isWebRuntimeProjectType(type: ProjectType): boolean {
  return type === "web-game" || type === "general";
}

/** Capability is independent of the preview process's readiness or errors. */
export function supportsWebPreview(
  project?: Pick<ProjectState, "type" | "webPreviewEnabled">,
): boolean {
  return (
    project?.type === "web-game" ||
    (project?.type === "general" && project.webPreviewEnabled === true)
  );
}

/**
 * Design is the landing spot when a Web project opens with no runnable preview and design work
 * already on the canvas: the preview panel would only show a startup error there. Projects whose
 * preview can run (including every project with game code) are unaffected.
 */
export function shouldOpenDesignByDefault(input: {
  projectType: ProjectType | undefined;
  previewStatus: PreviewStatus | undefined;
  hasDesignContent: boolean;
}): boolean {
  if (input.projectType !== "web-game" && input.projectType !== "general") return false;
  return input.previewStatus === "waiting" && input.hasDesignContent;
}

export function webPreviewSettingsChanged(
  before: ProjectState,
  after: ProjectState,
): boolean {
  const mode = before.previewMode ?? "auto";
  if (
    supportsWebPreview(before) !== supportsWebPreview(after) ||
    (before.startupDirectory ?? ".") !== (after.startupDirectory ?? ".") ||
    mode !== (after.previewMode ?? "auto") ||
    before.previewPort !== after.previewPort
  )
    return true;
  if (mode === "static") return false;
  if (mode === "command")
    return (
      (before.previewCommand ?? "").trim() !==
      (after.previewCommand ?? "").trim()
    );
  return (
    (before.startupScript ?? "dev") !== (after.startupScript ?? "dev") ||
    before.packageManager !== after.packageManager ||
    JSON.stringify(before.previewArguments) !==
      JSON.stringify(after.previewArguments)
  );
}
