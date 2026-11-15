---
name: web-game-foundations
description: Set or repair browser-game architecture, including engine choice, game-state ownership, input, assets, save data, debugging, and performance boundaries.
---

# Web Game Foundations

Use this skill for architecture decisions or cross-cutting changes. For focused work in an established project, preserve its working boundaries and change only what the request requires.

## Choose The Runtime

- Preserve the existing runtime for features and bug fixes unless it blocks the requested outcome.
- Prefer Phaser 4 for a new sprite, tilemap, arcade, tactics, or side-view 2D game.
- Prefer plain Three.js for a new imperative 3D runtime in TypeScript or Vite.
- Prefer React Three Fiber only when React state and composition are genuine requirements.
- Keep a working Canvas, Babylon.js, PlayCanvas, or custom runtime when the user or project has already chosen it.

## Stable Boundaries

- Simulation owns rules, entities, progression, timers, collisions, and saveable state.
- Rendering owns scene composition, animation playback, cameras, particles, and presentation state.
- Map keyboard, pointer, touch, and gamepad inputs to named game actions in one place.
- Keep text-heavy HUD and menus in DOM unless the visual design requires canvas or WebGL UI.
- Address assets through stable manifest keys rather than scattering file paths through gameplay code.
- Save serializable game state, not renderer objects.
- Keep debug and performance probes removable or easy to disable.

Use these boundaries in proportion to the project. A small game does not need an enterprise framework, but its rules should not become inseparable from rendering callbacks.

## Project Scripts

- `package.json` declares every dependency and carries a `dev` script, a `build` script, and a `test` script. The editor preview runs `dev` (with `--host 127.0.0.1 --port <port> --strictPort` appended, so accept those flags as Vite does) and publishing runs `build`.
- When node cannot import the TypeScript sources directly (for example Phaser projects), make the `test` script bundle the pure-logic module first and then run the tests against that bundle — `esbuild src/game/logic.ts --bundle --format=esm --outfile=build-test/logic.mjs && node test/logic.test.mjs` — so a test can never run against a stale bundle. Encode this order in the script instead of hand-sequencing it in ad-hoc shell commands.
- Do not rely on the dev server's default `localhost` binding: it may resolve to IPv6 `::1` and break tooling that connects over 127.0.0.1. Prefer `127.0.0.1` explicitly and let the editor choose the port.

## Game Data Tables

- Balance numbers, tuning values and configuration lists live in canvas tables (`canvas/tables/<tableId>.json`), which the user reviews and adopts in the canvas. One table per system (for example economy, enemy stats, item stats, stage config); typed columns and stable column IDs are the data contract.
- Load each table once at startup — import the JSON module or fetch the workspace-relative path — and read values through the column IDs. Do not scatter raw balance numbers through gameplay code.
- A table save reloads the preview page automatically, so saved tuning takes effect without code changes. Keep the game cleanly restartable so tuning stays observable.

## Before Implementation

For a new or substantially changed game, establish:

- player fantasy and primary verbs
- core loop, success, failure, and restart behavior
- camera and input model
- simulation and rendering ownership
- asset organization and loading states
- which game data tables hold balance and configuration values
- HUD and menu surfaces
- save, debug, and performance expectations

Once the stack is clear, continue with the relevant runtime skill rather than expanding the architecture indefinitely.

## Resize And Reflow

Generated layouts (brick grids, tile fields, procedural formations) have a recurring trap: they are computed for one viewport and later rebuilt or reflowed for another, silently losing state or overflowing. Treat these as checklist items, not afterthoughts:

- Resize must never reset progress. When a resize rebuilds a generated grid, preserve what the player did (cleared fraction remap, score, entities), not the pre-resize absolute counts. Assert this in a test: generate → mutate → resize → assert state survives.
- Recompute layout from logical coordinates, not from stale screen coordinates; clamp gaps/spacing so the rebuilt grid always fits the narrower width instead of overflowing to the right.
- Verify at three viewports at minimum (375x667 portrait phone, 768x1024 tablet, 1280x720 desktop) with screenshots — the `game_use` `sweep` operation does exactly this pass and reports horizontal overflow and blank frames. A layout checked at one viewport is not checked.
- Keep the smallest interactive target ≥ 44px after every reflow; HUD groupings that fit on desktop routinely collide on 375px.
