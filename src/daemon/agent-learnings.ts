import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  AGENT_PREFERENCES_MAX,
  AGENT_PREFERENCE_MAX_LENGTH,
  AGENT_SKILL_BODY_MAX_BYTES,
  AGENT_SKILL_DESCRIPTION_MAX_LENGTH,
  AGENT_SKILL_NAME_MAX_LENGTH,
  AGENT_SKILL_NAME_PATTERN,
  type AgentLearnings,
  type AgentPreference,
  type AgentSkillSummary,
} from "../shared/agent-learnings.js";

interface StoredLearnings {
  version: 1;
  preferences: AgentPreference[];
  skills: AgentSkillSummary[];
}

export interface LearningSource {
  projectId?: string;
  projectName?: string;
}

export interface SaveSkillInput {
  name: string;
  description: string;
  content: string;
  source?: LearningSource;
}

const EMPTY: StoredLearnings = { version: 1, preferences: [], skills: [] };

/**
 * User-approved lessons that apply across projects. Preferences are injected
 * into every agent session; Skills are ordinary personal Skills in the agent
 * directory, so Pi and the coding-agent CLIs load them the same way.
 */
export class AgentLearningsStore {
  readonly #filePath: string;
  readonly #skillsDirectory: string;
  #loaded?: Promise<StoredLearnings>;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(dataDirectory: string, agentDirectory: string) {
    this.#filePath = path.join(dataDirectory, "agent-learnings.json");
    this.#skillsDirectory = path.join(agentDirectory, "skills");
  }

  async read(): Promise<AgentLearnings> {
    const stored = await this.#load();
    return {
      preferences: stored.preferences.map((preference) => ({ ...preference })),
      skills: stored.skills.map((skill) => ({ ...skill })),
    };
  }

  /** One line per preference, for the system prompt. */
  async preferenceTexts(): Promise<string[]> {
    return (await this.#load()).preferences.map(
      (preference) => preference.text,
    );
  }

  rememberPreference(
    text: string,
    source?: LearningSource,
  ): Promise<{ preference: AgentPreference; created: boolean }> {
    return this.#mutate(async () => {
      const stored = await this.#load();
      const normalized = normalizePreference(text);
      const key = preferenceKey(normalized);
      const existing = stored.preferences.find(
        (preference) => preferenceKey(preference.text) === key,
      );
      if (existing) return { preference: { ...existing }, created: false };
      if (stored.preferences.length >= AGENT_PREFERENCES_MAX) {
        throw new Error(
          `At most ${AGENT_PREFERENCES_MAX} personal preferences can be kept. Delete one in Settings first.`,
        );
      }
      const now = new Date().toISOString();
      const preference: AgentPreference = {
        id: randomUUID(),
        text: normalized,
        createdAt: now,
        updatedAt: now,
        ...(source?.projectId ? { projectId: source.projectId } : {}),
        ...(source?.projectName ? { projectName: source.projectName } : {}),
      };
      stored.preferences.push(preference);
      await this.#write(stored);
      return { preference: { ...preference }, created: true };
    });
  }

  updatePreference(id: string, text: string): Promise<AgentPreference> {
    return this.#mutate(async () => {
      const stored = await this.#load();
      const preference = stored.preferences.find((entry) => entry.id === id);
      if (!preference) throw new Error("Preference not found");
      const normalized = normalizePreference(text);
      const key = preferenceKey(normalized);
      if (
        stored.preferences.some(
          (entry) => entry.id !== id && preferenceKey(entry.text) === key,
        )
      ) {
        throw new Error("This preference is already saved");
      }
      preference.text = normalized;
      preference.updatedAt = new Date().toISOString();
      await this.#write(stored);
      return { ...preference };
    });
  }

  deletePreference(id: string): Promise<void> {
    return this.#mutate(async () => {
      const stored = await this.#load();
      const index = stored.preferences.findIndex(
        (preference) => preference.id === id,
      );
      if (index < 0) throw new Error("Preference not found");
      stored.preferences.splice(index, 1);
      await this.#write(stored);
    });
  }

  saveSkill(
    input: SaveSkillInput,
  ): Promise<{ skill: AgentSkillSummary; created: boolean }> {
    return this.#mutate(async () => {
      const stored = await this.#load();
      const name = normalizeSkillName(input.name);
      const description = normalizeSkillDescription(input.description);
      const content = normalizeSkillContent(input.content);
      const directory = this.#skillDirectory(name);
      const managed = stored.skills.find((skill) => skill.name === name);
      if (!managed && (await exists(directory))) {
        throw new Error(
          `A Skill named "${name}" already exists. Choose another name or ask the user to edit that Skill directly.`,
        );
      }
      const now = new Date().toISOString();
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(
        path.join(directory, "SKILL.md"),
        skillDocument(name, description, content),
        { mode: 0o600 },
      );
      const skill: AgentSkillSummary = managed
        ? { ...managed, description, updatedAt: now }
        : {
            name,
            description,
            createdAt: now,
            updatedAt: now,
            ...(input.source?.projectId
              ? { projectId: input.source.projectId }
              : {}),
            ...(input.source?.projectName
              ? { projectName: input.source.projectName }
              : {}),
          };
      if (managed) Object.assign(managed, skill);
      else stored.skills.push(skill);
      await this.#write(stored);
      return { skill: { ...skill }, created: !managed };
    });
  }

  deleteSkill(name: string): Promise<void> {
    return this.#mutate(async () => {
      const stored = await this.#load();
      const normalized = normalizeSkillName(name);
      const index = stored.skills.findIndex(
        (skill) => skill.name === normalized,
      );
      if (index < 0) throw new Error("Skill not found");
      stored.skills.splice(index, 1);
      await this.#write(stored);
      await rm(this.#skillDirectory(normalized), {
        recursive: true,
        force: true,
      });
    });
  }

  #skillDirectory(name: string): string {
    const root = path.resolve(this.#skillsDirectory);
    const directory = path.resolve(root, name);
    if (path.dirname(directory) !== root) throw new Error("Invalid Skill name");
    return directory;
  }

  #load(): Promise<StoredLearnings> {
    return (this.#loaded ??= this.#read().catch((cause) => {
      // A repaired file should load again without restarting the daemon.
      this.#loaded = undefined;
      throw cause;
    }));
  }

  async #read(): Promise<StoredLearnings> {
    let raw: string;
    try {
      raw = await readFile(this.#filePath, "utf8");
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT")
        return { ...EMPTY, preferences: [], skills: [] };
      throw cause;
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error("The saved agent preferences file is not valid JSON.");
    }
    const record =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    return {
      version: 1,
      preferences: Array.isArray(record.preferences)
        ? record.preferences.flatMap((entry) => parsePreference(entry) ?? [])
        : [],
      skills: Array.isArray(record.skills)
        ? record.skills.flatMap((entry) => parseSkill(entry) ?? [])
        : [],
    };
  }

  async #write(stored: StoredLearnings): Promise<void> {
    await mkdir(path.dirname(this.#filePath), { recursive: true });
    const temporary = `${this.#filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(stored, null, 2)}\n`, {
        mode: 0o600,
      });
      await rename(temporary, this.#filePath);
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  #mutate<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(operation, operation);
    this.#queue = result.catch(() => undefined);
    return result;
  }
}

function normalizePreference(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) throw new Error("A preference cannot be empty");
  if (normalized.length > AGENT_PREFERENCE_MAX_LENGTH) {
    throw new Error(
      `A preference can be at most ${AGENT_PREFERENCE_MAX_LENGTH} characters`,
    );
  }
  return normalized;
}

function preferenceKey(text: string): string {
  return text.toLowerCase();
}

function normalizeSkillName(name: string): string {
  const normalized = name.trim();
  if (
    !normalized ||
    normalized.length > AGENT_SKILL_NAME_MAX_LENGTH ||
    !AGENT_SKILL_NAME_PATTERN.test(normalized)
  ) {
    throw new Error(
      "A Skill name uses lowercase letters, digits, and hyphens, starting with a letter or digit",
    );
  }
  return normalized;
}

function normalizeSkillDescription(description: string): string {
  const normalized = description.trim().replace(/\s+/g, " ");
  if (!normalized) throw new Error("A Skill needs a description");
  if (normalized.length > AGENT_SKILL_DESCRIPTION_MAX_LENGTH) {
    throw new Error(
      `A Skill description can be at most ${AGENT_SKILL_DESCRIPTION_MAX_LENGTH} characters`,
    );
  }
  return normalized;
}

function normalizeSkillContent(content: string): string {
  // The tool takes the body; drop frontmatter if the caller passed a whole SKILL.md.
  const normalized = content
    .trim()
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n+/, "")
    .trim();
  if (!normalized) throw new Error("A Skill needs content");
  if (Buffer.byteLength(normalized) > AGENT_SKILL_BODY_MAX_BYTES) {
    throw new Error(
      `Skill content can be at most ${AGENT_SKILL_BODY_MAX_BYTES} bytes`,
    );
  }
  return normalized;
}

function skillDocument(
  name: string,
  description: string,
  content: string,
): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${content}\n`;
}

async function exists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw cause;
  }
}

function parsePreference(value: unknown): AgentPreference | undefined {
  if (!value || typeof value !== "object") return undefined;
  const entry = value as Record<string, unknown>;
  if (typeof entry.id !== "string" || typeof entry.text !== "string")
    return undefined;
  if (
    typeof entry.createdAt !== "string" ||
    typeof entry.updatedAt !== "string"
  )
    return undefined;
  return {
    id: entry.id,
    text: entry.text,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    ...(typeof entry.projectId === "string"
      ? { projectId: entry.projectId }
      : {}),
    ...(typeof entry.projectName === "string"
      ? { projectName: entry.projectName }
      : {}),
  };
}

function parseSkill(value: unknown): AgentSkillSummary | undefined {
  if (!value || typeof value !== "object") return undefined;
  const entry = value as Record<string, unknown>;
  if (typeof entry.name !== "string" || typeof entry.description !== "string")
    return undefined;
  if (
    typeof entry.createdAt !== "string" ||
    typeof entry.updatedAt !== "string"
  )
    return undefined;
  return {
    name: entry.name,
    description: entry.description,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    ...(typeof entry.projectId === "string"
      ? { projectId: entry.projectId }
      : {}),
    ...(typeof entry.projectName === "string"
      ? { projectName: entry.projectName }
      : {}),
  };
}
