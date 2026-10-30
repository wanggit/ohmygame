import { Clapperboard, Gamepad2, Globe2, Image } from "./icons.js";
import { PROJECT_TYPE_IDS, type ProjectType } from "../shared/contracts.js";
import { t } from "./i18n.js";
export { defaultProjectName } from "../shared/project-names.js";

export interface ProjectTypeOption {
  label: string;
  value: ProjectType;
}


/**
 * Godot Game and General Game stay supported in the contracts and keep working
 * for existing projects, but are no longer offered anywhere in the UI.
 */
const HIDDEN_PROJECT_TYPES = new Set<ProjectType>(["godot-game", "general"]);

export const PROJECT_TYPES: readonly ProjectTypeOption[] = PROJECT_TYPE_IDS
  .filter((value) => !HIDDEN_PROJECT_TYPES.has(value))
  .map((value) => ({ value, label: projectTypeLabel(value) }));

export const GAME_PROJECT_TYPES: readonly ProjectTypeOption[] = PROJECT_TYPES.filter(({ value }) => value !== "asset-canvas");

export function ProjectTypeIcon({ type, size = 14 }: { type: ProjectType; size?: number }) {
  if (type === "general") return <Gamepad2 size={size} aria-hidden="true" />;
  if (type === "web-game") return <Globe2 size={size} aria-hidden="true" />;
  if (type === "interactive-story") return <Clapperboard size={size} aria-hidden="true" />;
  if (type === "asset-canvas") return <Image size={size} aria-hidden="true" />;
  return <span className="project-type-godot-icon" style={{ width: size, height: size }} aria-hidden="true" />;
}

export function projectTypeLabel(type: ProjectType): string {
  return PROJECT_TYPE_IDS.includes(type) ? t(`projectType.${type}`) : type;
}
