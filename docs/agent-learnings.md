# Agent preferences and learned Skills

Users can save a lesson from one project and have it apply to the next. Two
kinds exist, and the difference matters because only one is always in view:

- **Preference** — a one-line default behavior. Every agent session receives
  it in the system prompt, so the model does not have to decide to look it up.
  Use this for rules such as "generate character animation as one multi-cell
  sprite sheet".
- **Skill** — a procedure with steps, checks, or examples. It is an ordinary
  personal Skill that the model loads when its description matches the task.
  Use this for a pipeline, not for a one-sentence default.

Project-specific conventions stay in the project: the workspace `AGENTS.md`
or `.pi/skills/`. They do not become personal lessons on their own.

## Storage

| Item                            | Location                                |
| ------------------------------- | --------------------------------------- |
| Preferences and the Skill index | `<data>/agent-learnings.json`           |
| Learned Skills                  | `<pi-agent-dir>/skills/<name>/SKILL.md` |

`<data>` is `.data/` in browser development and the Electron user-data folder
in the desktop app. `<pi-agent-dir>` is `<data>/pi-agent` unless
`PI_CODING_AGENT_DIR` overrides it.

Preferences are stored as structured records (id, text, source project, dates)
rather than as Markdown, so they can be deduplicated, edited, and deleted. A
new preference that matches an existing one, ignoring case and whitespace, is
not added twice.

Learned Skills are recorded in the same file. The store only edits and deletes
the Skills it recorded; a Skill placed in the agent directory by hand, such as
the built-in `plugin-creator`, is never overwritten or removed by these
operations.

## Capture

The agent has a `remember` tool with `kind: "preference" | "skill"`. The
system prompt tells it to propose saving a lesson once when the user states a
default that should apply beyond the project, or repeats a correction. It
calls `remember` only after the user agrees; nothing is saved silently.
Project-specific details are not proposed.

The same list is editable in **Settings → Preferences**: users can add a
preference, edit or delete one, and delete a learned Skill. Deleting a Skill
removes its folder from the agent directory.

## When it takes effect

Preferences are passed into `appendSystemPromptForProject`, which supplies the
system prompt for Pi and the `instructions` of every coding-agent runtime. A
Skill reaches Pi through its agent Skill directory and reaches Claude Code,
Codex, and OpenCode through the same Skill staging used for plugin Skills.

Both are read when a session is created. After a save, the daemon invalidates
the project's sessions, so the next turn rebuilds with the new preference or
Skill. A running turn finishes first.

## Limits

- Preferences: at most 40, each at most 400 characters. They are in every
  system prompt, so they stay short and one line each.
- Skill name: lowercase letters, digits, and hyphens, up to 64 characters.
- Skill description: up to 500 characters.
- Skill body: up to 64 KiB.

## Code

- `src/daemon/agent-learnings.ts` — store, validation, Skill files.
- `src/daemon/agent-tools.ts` — the `remember` tool.
- `src/daemon/agent-prompts.ts` — preference block and the proposal rule.
- `src/daemon/app.ts` — routes and session invalidation.
- `src/renderer/agent-learnings-settings.tsx` — the Settings page.

Tests: `test/agent-learnings.test.ts`, `test/agent-prompts.test.ts`, and the
`remember` cases in `test/agent-tools.test.ts`.
