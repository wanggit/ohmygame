/** Limits for user-approved lessons that apply across projects. */
export const AGENT_PREFERENCE_MAX_LENGTH = 400;
export const AGENT_PREFERENCES_MAX = 40;
export const AGENT_SKILL_NAME_MAX_LENGTH = 64;
export const AGENT_SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
export const AGENT_SKILL_DESCRIPTION_MAX_LENGTH = 500;
export const AGENT_SKILL_BODY_MAX_BYTES = 64 * 1024;

/** A short default behavior the user asked OhMyGame to apply in every project. */
export interface AgentPreference {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  projectId?: string;
  projectName?: string;
}

/** A personal Skill created from a lesson in a project. */
export interface AgentSkillSummary {
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  projectId?: string;
  projectName?: string;
}

export interface AgentLearnings {
  preferences: AgentPreference[];
  skills: AgentSkillSummary[];
}
