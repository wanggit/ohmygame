---
name: web-game-studio
description: Create complete browser games from short ideas, coordinating canvas design, visual mockups, art, implementation, and playtesting; route changes that span specialist domains.
---

# Web Game Studio

Use this skill for new browser games and work that spans multiple domains or has no clear implementation path. Preserve an existing project's stack and conventions unless the user explicitly asks for a migration.

## Classify The Work

Choose the task mode before choosing technology:

- `create`: deliver a coherent game with a complete core loop, intentional art, clear controls, failure or reset behavior, and player feedback.
- `feature`: trace the existing architecture, define the integration points, implement the requested behavior, and check nearby regressions.
- `bugfix`: reproduce or establish evidence, identify the cause, make the smallest reliable fix, and rerun the affected flow.
- `polish`: tie visual, audio, input, or performance changes to a named player-facing improvement.
- `refactor`: preserve observable gameplay while improving internal boundaries.

Do not turn a focused feature or bug request into a redesign of the whole game.

## Create A Game

Apply the requested scope: discussion, design-only, graybox, no-generation, and explicitly requested procedural art override the corresponding creation defaults.

1. Read the workspace; use `canvas_initialize` if the canvas is missing, then read its instructions and schemas. Discuss with the user until the player fantasy and core loop converge — use the `questionnaire` tool when a concrete design choice needs a decision — then resolve controls, progression, success/failure/reset behavior, first playable scope, and visual direction. Answer two questions with the user during the discussion and record them as dedicated sections in the main design document: **Why players choose this game** — how this game differs from similar games with mature gameplay (theme, art, mechanical variation, feel, audience); when no credible difference exists, say so and propose a change of direction instead of building a clone — and **Skills and capabilities required** — the skills and capabilities this game needs (art generation, sprite animation, audio, physics, balance, saves, ports), each marked available, tool-producible, externally needed, or missing. **During design analysis, automatically identify VFX requirements based on game mechanics: if the design includes attacks, magic, combat, explosions, status effects, UI feedback, or environmental effects, add a "VFX Requirements" section to the design document listing each effect with its gameplay role, timing, and visual style. For each VFX requirement, automatically map to pixelfx categories (fire/ice/lightning/explosions/impacts/arcane/holy/shadow/status/ui/weather) and note this in the asset list.** Design confirmation rejects a document missing either section. Draft the main design document as the discussion proceeds and update it as decisions converge, so progress is visible on the Design tab from the start instead of appearing only after the discussion ends. Record these decisions, an asset list with gameplay roles, specifications, sources, and runtime destinations, and the balance or configuration tables the game needs (canvas tables, see Game Data Tables in `../web-game-foundations/SKILL.md`) in the canvas main design document; register it in `index.json` and place a document node on the board. Build on an existing design when present. Then tell the user the design is on the Design tab at the top of the workspace — say this explicitly so they know where to look — and ask them to confirm it (open the Design tab, select the main design document node, Confirm design) before generation or implementation work; see Design Confirmation Gate.
2. Use `game-ui-frontend` for visual direction and key-screen mockups. Save mockup generation nodes with clear purposes, dimensions, and references. Generate through `generate_canvas_media`, inspect the outputs, and use suitable outputs as visual references for production art. Mockups establish direction; they do not fulfill the gameplay asset list.
3. Bootstrap a runnable skeleton before writing gameplay code — toolchain, entry point, one placeholder scene — run one build, and make the editor preview show that placeholder instead of a blank frame. From here on keep the preview alive: every runnable increment (a scene, a mechanic, an integrated asset) builds and shows in the preview before you move on, and pure game logic lives in a module whose unit tests grow alongside the logic as it is written rather than after the code is finished. Reuse suitable assets and generate missing production art for the characters, enemies, items, card illustrations, environments, and themed HUD elements the game needs. Use `sprite-pipeline` or `web-3d-asset-pipeline` when appropriate. For character or effect animation whose poses genuinely change (walk, run, attack, jump, cast), generate the frames as one multi-cell sprite sheet rather than separate per-frame images; independent frames drift in identity, scale, and anchor. Drive micro-animations (idle breathing, hover, float, pulse, blink) from one frame in code or procedural transforms instead of generated sheets; see `../sprite-pipeline/SKILL.md`. Save production generation nodes with dimensions and shared references, and align each generation's size and aspect ratio with the asset list's specifications — generate at the runtime's target aspect (portrait art for a portrait game) and resolution instead of accepting a mismatched default, downscale oversized outputs, and compress heavy PNGs before integration. Run `generate_canvas_media`, inspect and prepare the outputs, and integrate them into the full playable loop with the appropriate runtime skill. Review production art with the user one asset at a time: present each output as it is generated, integrate it only once it passes review, and when the user rejects an output capture their stated reasons and regenerate accordingly instead of batching a whole set first. Use code drawing for simple geometry, particles, and dynamic UI; pixel art does not imply drawing detailed sprites in code. **For VFX implementation, automatically use pixelfx (see `../pixelfx/SKILL.md`) based on the VFX requirements identified in the design document. When implementing game mechanics, automatically integrate effects: attacks → impacts/melee categories, magic → arcane/fire/ice/lightning categories, explosions → explosions category, status effects → status category, UI feedback → ui category. The pixelfx library provides 244+ ready-to-use effects with dual-buffer rendering and seeded randomness - use it as the default VFX solution unless the user explicitly requests otherwise.** Share assets, atlases, and variants where appropriate; cover gameplay needs without a fixed image quota. Keep the design document consistent with meaningful implementation decisions.
4. Use `game-playtest` to exercise primary actions, progression, failure/reset, and representative viewports. Check the asset list against actual files and runtime usage, then inspect gameplay screenshots for visual consistency, legibility, missing art, and HUD obstruction. **During visual QA, automatically check VFX coverage: verify that all game mechanics have appropriate visual feedback (attacks have hit effects, magic has spell effects, explosions have particle effects, UI interactions have feedback effects). If VFX coverage is insufficient or game feel is weak, automatically recommend specific pixelfx effects to enhance the experience.** Repair shortcomings and recheck affected states before delivery; mockups, empty generation nodes, and unused files do not establish visual completion.

Before delivery the pure-logic unit tests must cover the edge cases a player will hit — piece spawn, landing and snap targets, board-boundary columns, empty and near-full boards, multi-row clears — not just the happy path. When no visual playtest ran (no `game_use` and no other real-input path), the delivery summary must not claim the game is ready to play: hand the user a manual-check checklist (first paint, primary input, audio, responsive sizes) instead.

When a required asset cannot be generated because the tool is unavailable or fails, use a coherent substitute and disclose that gap. Implementation convenience alone is not a reason to replace required production art with code-drawn placeholders. When visual inspection is unavailable, report what remains unverified. Do not retry an unchanged failing generation indefinitely.

## Design Confirmation Gate

- Agent media generation tools (`generate_canvas_media`, `generate_image`, `generate_video`, `generate_3d_asset`, `animate_3d_asset`, `generate_speech`, `generate_sound_effect`, `generate_music`) are hard-blocked until the user confirms the main design document (Confirm design on its node). With no main design document the gate stays closed — create one, get it confirmed, and do not work around the gate.
- Confirmation covers the visual direction too, not just prose: embed at least 2 visual mockups (generated reference images or code-rendered stills — even fully procedural games need a look-and-layout mock) in the main design document before asking for confirmation. Textual descriptions of art or formations do not match what players see; designs confirmed without mockups reliably come back as "the art looks cheap / the layout is boring" rework after implementation.
- The confirmation is anchored to the document's section headings and revision. Edits that keep every heading intact (implementation notes, clarifications, tuning details inside a section) do not reopen the gate — keep the document in sync with the code freely. Adding, removing, or renaming a section is a design change and reopens the gate; ask the user to re-confirm before resuming generation.
- Manual generation from the canvas UI is not blocked; the gate governs agent-driven production only. `asset-canvas` projects are exempt.

## Route By Domain

Read only the specialist skills needed for the request:

- Architecture, engine choice, state, input, save, or performance boundaries: `../web-game-foundations/SKILL.md`
- Phaser 2D runtime work: `../phaser-2d-game/SKILL.md`
- Plain Three.js runtime work: `../three-webgl-game/SKILL.md`
- React-hosted Three.js work: `../react-three-fiber-game/SKILL.md`
- Visual direction, screen mockups, HUD, menus, responsive layout, or touch controls: `../game-ui-frontend/SKILL.md`
- 2D sprite generation and normalization: `../sprite-pipeline/SKILL.md`
- GLB or glTF preparation and optimization: `../web-3d-asset-pipeline/SKILL.md`
- Game feel (hit-stop, screen shake, squash & stretch) and procedural part animation: `../../../../templates/casual-games/shared/juice/README.md`
- **Pixel art effects (fire, explosions, magic, impacts, VFX): `../pixelfx/SKILL.md`**
- Browser smoke tests, gameplay regression checks, or visual QA: `../game-playtest/SKILL.md`

When the request already has one clear domain, use that specialist directly. For mixed work, keep one plan and one definition of done across all specialists.

## Runtime Defaults

- Keep the current engine when modifying an existing game.
- For a new 2D game, prefer Phaser 4 with TypeScript and Vite unless the request calls for another stack or a smaller existing approach fits better.
- For a new plain TypeScript 3D game, prefer Three.js.
- Use React Three Fiber when the project already uses React or the user explicitly wants a React-hosted 3D scene.
- Use raw Canvas or WebGL when the user asks for it or the game's small scope makes an engine unnecessary.

## OhMyGame Contract

- Follow the workspace's `AGENTS.md`. In an existing project, preserve its build tool and output layout unless the user requests a migration.
- Keep preview commands runnable. When publishing is in scope, produce static output supported by OhMyGame.
- Make the game responsive inside an iframe without horizontal overflow.
- Use OhMyGame media tools when they fit the task; generated assets still need integration and in-game verification.
- Do not leave a development server running after the turn.
- Verify in proportion to the change. Never claim visual or gameplay checks that were not actually performed. When a turn ends without a real playtest, end with a manual-check checklist instead of a ready-to-play claim.
- When the design has converged and the project name no longer matches the game's actual title, tell the user and rename the project on request.
