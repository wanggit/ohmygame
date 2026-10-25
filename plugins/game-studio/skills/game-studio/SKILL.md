---
name: game-studio
description: Create complete games across engines by coordinating design, visual direction, production assets, implementation, and playtesting; use for new games or changes spanning several game-production domains.
---

# Game Studio

Preserve the user's chosen engine, platform, and existing project conventions. For a new game with no chosen stack, select a suitable runtime from the intended experience, target devices, available tools, and delivery needs. General Game is an engine-independent workspace; it does not require Web output.

## Match The Task

- `create`: deliver a complete playable core loop with clear controls, progression, success or failure, restart, intentional art, and player feedback.
- `feature`: identify existing state owners and integration points, implement the requested behavior, and check nearby regressions.
- `bugfix`: establish evidence, identify the cause, make a focused fix, and replay the affected flow.
- `polish`: connect art, audio, input, or performance work to a specific player-facing improvement.
- `refactor`: improve boundaries while preserving observable gameplay.

Discussion, design-only, graybox, no-generation, and explicitly requested procedural art override the corresponding creation defaults. Applications, tools, and content requests use an appropriate workflow rather than the full game creation process. A focused change does not require a redesign or new art unrelated to that change.

## Create A Game

1. Read the workspace. When game design or asset planning needs a canvas, use `canvas_initialize` if none exists, then follow its instructions. Discuss with the user until the player fantasy and core loop converge — use the `questionnaire` tool when a concrete design choice needs a decision — then establish primary actions, controls, progression, success/failure/restart behavior, first playable scope, and visual direction. Record the design and an asset list with gameplay roles, specifications, sources, and runtime destinations in the canvas main design document. Keep balance numbers and configuration lists in canvas tables (`canvas/tables/<tableId>.json`) instead of code constants: load each table once at startup through the column IDs, and note that a table save reloads the preview page automatically so saved tuning takes effect without code changes. Build on an existing design when present. Then tell the user the design is on the Design tab at the top of the workspace — say this explicitly so they know where to look — and ask them to confirm it (open the Design tab, select the main design document node, Confirm design) before generation or implementation work; see Design Confirmation Gate.
2. Establish a cohesive palette, typography, composition, and feedback language. Use key-screen mockups when substantial visual decisions need them. Save canvas generation nodes with dimensions, purposes, and shared references; generate through `generate_canvas_media` and inspect the outputs. Mockups guide implementation and do not fulfill the production asset list.
3. Reuse suitable assets and generate missing production art for the game's main subjects and themed UI. For frame-based 2D character or effect animation, generate one sprite sheet with a fixed multi-cell grid instead of separate per-frame images, and keep the frame count, grid, cell size, transparency, scale, and anchor consistent with the runtime animation metadata. Review production art with the user one asset at a time: present each output as it is generated, integrate it only once it passes review, and when the user rejects an output capture their stated reasons and regenerate accordingly instead of batching a whole set first. Keep sprite identity, frame sizes, anchors, and timing consistent; normalize 3D scale, axes, pivots, materials, and animation names for the chosen engine. Use code drawing for simple geometry, particles, and dynamic UI, or for explicitly requested procedural art. Prepare and import assets through the engine's real pipeline, then integrate them into the playable loop. Keep significant implementation decisions reflected in the design document.
4. Exercise the primary actions, progression, failure/restart, and affected device sizes using available runtime tools. Compare actual gameplay screenshots with the visual direction. Check the asset list against real files and runtime usage; mockups, empty generation nodes, and unused files do not establish completion. Fix shortcomings and repeat the affected checks.

When a required generation tool is unavailable or fails, use a coherent substitute and disclose the remaining gap. Implementation convenience alone is not a reason to replace required production art with placeholders. Do not retry an unchanged failing generation indefinitely.

## Design Confirmation Gate

- Agent media generation tools (`generate_canvas_media`, `generate_image`, `generate_video`, `generate_3d_asset`, `animate_3d_asset`, `generate_speech`, `generate_sound_effect`, `generate_music`) are hard-blocked until the user confirms the main design document (Confirm design on its node). With no main design document the gate stays closed — create one, get it confirmed, and do not work around the gate.
- The confirmation is anchored to the document revision: editing the main design document reopens the gate. Ask the user to re-confirm before resuming generation.
- Manual generation from the canvas UI is not blocked; the gate governs agent-driven production only. `asset-canvas` projects are exempt.

## Specialist Work

- For engine choice, state ownership, input, saving, or performance boundaries, read [Game Foundations](../game-foundations/SKILL.md).
- For playtest scope, runtime evidence, regression paths, or visual QA, read [Game QA](../game-qa/SKILL.md).
- Use relevant installed engine Skills or Connections when available. Follow the workspace's own authoring contract, including Playable Nodes rules for Interactive Story. These optional enhancements do not replace the engine-independent workflow.

For a single-domain request, use the relevant specialist directly. Keep one plan and one definition of done for mixed work. Verification must match available tools; never claim gameplay or visual checks that were not performed.
