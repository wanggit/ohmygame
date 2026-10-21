# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

OhMyGame is a local-first app (Electron desktop + web) for making games with an AI agent, built on Pi with BYOK model providers. Everything runs locally except publishing, which uploads static builds to OhMyGame Cloud (private `ohmygame-cloud` repo; access optional for contributions).

## Repository workflow

`AGENTS.md` and `CONTRIBUTING.md` hold the contribution rules — follow them. Key points that are easy to get wrong:

- Start branches from `dev` and open PRs against `dev`. `main` is the maintainer release branch. Never open a PR whose head branch is `dev` or `main` (head branches get deleted on merge).
- Branch names: `feat/`, `fix/`, `chore/`, `refactor/`, or `docs/` + short name. PR titles use Conventional Commits, e.g. `fix(runtime): handle missing tween state`.
- Keep each PR focused on one feature, fix, docs change, chore, or refactor. PR descriptions state what changed, why, and how it was checked (commands, results, skipped checks). Ordinary PRs do not edit `CHANGELOG.md` — maintainers update it at release.
- `README.md` is the source for `README.zh-CN.md`; update both in the same PR. New UI text goes in both `src/renderer/locales/en.ts` and `zh-CN.ts` in the same PR; text sent to the agent stays in English.

## Commands

Toolchain: Bun ≥1.4.2 (installs, builds, tests, most scripts) and Node.js ≥22.19 (standalone daemon, pinned plugin prep). CI pins Bun 1.4.2 / Node 22.19.0. `bunfig.toml` deliberately does not substitute `node` with Bun — `node` runs the real Node.

```bash
bun install --frozen-lockfile    # install
bun run dev                      # web dev: renderer http://127.0.0.1:43120 + daemon 127.0.0.1:43110 (Vite proxies /api)
bun run dev:desktop              # Electron + daemon; only this registers the game_use playtest tool

bun run test                     # all tests (vitest, test/**/*.test.{ts,tsx})
bun run test -- test/preview.test.ts   # one or more focused suites
bun run typecheck
bun run build                    # host (tsc) + renderer + player
bun run build:renderer           # vite renderer + sandbox
bun run test:node-runtime        # builds host+player, then boots the daemon under real Node and hits its API

# Full public checks (what CI runs on PRs) — run these before finishing app/dependency/CI changes:
bun run prepare:preinstalled-plugins
bun run changelog:check
bun run typecheck
bun run test
bun run build:renderer
bun run test:node-runtime
```

Notes:

- First startup needs network: `prepare:preinstalled-plugins` downloads checksum-pinned plugin archives into `.runtime/`, and `prepare:examples` clones/builds examples with npm. If preparation fails, fix connectivity and re-run the same command. Browser dev uses fixed ports 43120/43110; desktop dev picks a free daemon port.
- `test/publish.test.ts` remote contract tests skip without an adjacent `ohmygame-cloud` checkout (or `OHMYGAME_CLOUD_ROOT`); expected for public-only checkouts — mention the skips in the PR. A passing public suite does not verify the hosted service.
- No repo-wide lint/format enforcement (the repo is not fully Prettier-formatted). Match surrounding style; check *new* supported files with `bunx --bun --no-install prettier --check <files>`. Keep broad formatting cleanup in separate PRs.
- For isolated manual testing set `OHMYGAME_DATA_DIR` and `PI_CODING_AGENT_DIR` to temp directories. Browser dev stores data in `.data/`; desktop uses the app user-data dir. Neither belongs in a PR.
- Desktop packaging (maintainer task): `bun run package:mac:dir` / `package:mac` / `package:win`. Signing and update feeds are documented in `docs/desktop-releases.md`.

## Architecture

Three process layers; the boundaries matter more than any single file (details in `docs/runtime.md`):

1. **Renderer** — `src/renderer/`, React + Vite, no Node.js access. In desktop it reaches the daemon only through an isolated preload bridge carrying the daemon address and a process-scoped token. Locale bundles: `src/renderer/locales/`.
2. **Local daemon** — `src/daemon/`, Fastify on 127.0.0.1. Owns Pi agent sessions, project workspaces, Asset Canvas, plugins/MCP, preview dev servers, checkpoints, publishing. Talks to the renderer over HTTP + an SSE event stream; reconnects replay recent events and conversations restore from Pi session files. Provider credentials live here and are never written to workspaces or returned to the renderer. The daemon token is passed to child processes' exclusion: previews, dependency installs, publish builds, agent shells, stdio MCP servers, and Git never inherit it.
3. **Electron main** — `src/desktop/`, desktop lifecycle only: spawns/supervises the compiled daemon, owns native game windows (Play moves the shared WebContentsView between editor and player), and hosts the `game_use` playtest tool (hidden isolated BrowserWindows driven over private child-process IPC; registered only when Electron owns the daemon). Godot/Unity projects do not get this tool yet.

Cross-cutting:

- `src/shared/` holds contracts used across processes (`publish-v1.ts` is the public cloud client contract, `events.ts` the event payloads, plus canvas/playable schemas). Change a contract together with its tests.
- `src/story-web/` is the Interactive Story runtime; story projects connect it via `src/daemon/story-web-project.ts` and `playable-*.ts` modules (`docs/playable-nodes/README.md`).
- **Bundled plugins** (`plugins/`: game-studio, web-game-studio, threejs-world, godot) ship agent Skills and instructions prepared into `.runtime/`. Editing SKILL.md files changes shipped agent behavior — verify the affected workflow in a real project, not just tests.
- **Checkpoints** (`src/daemon/checkpoints.ts`): per-turn workspace snapshots in a bare Git repository under `projects/<id>/checkpoints/`, independent of the workspace's own `.git`; they back Undo/Reapply/Restore. Project layout under the daemon data dir is in `docs/runtime.md#persistence`.
- **Trust boundary**: Pi runs in trusted-local mode — enabled tools execute without approval prompts. `cwd` is not a security boundary; treat workspace files as untrusted input where relevant.
- **Tests** (`test/`, vitest, 30s timeout because some suites run real builds) mirror the module map — `docs/README.md#where-to-change-things` lists, per area, the code entry points, the guide to read first, and example test files. Use it instead of guessing file ownership.

## Docs map

`docs/README.md` is the index. Read the module guide before changing behavior: `docs/runtime.md` (process boundaries, proxies, trust, game use, persistence, publishing), `docs/canvas-agent.md`, `docs/preview-runtime.md`, `docs/runtime-recovery.md`, `docs/coding-agents.md`, `docs/plugins.md`, `docs/custom-models.md`, `docs/checkpoints.md`, `docs/playable-nodes/README.md`, and others listed there.
