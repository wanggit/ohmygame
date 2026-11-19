---
name: sprite-pipeline
description: Create, integrate, and normalize consistent 2D game sprites, animation strips, frame anchors, atlases, and in-game previews.
---

# Sprite Pipeline

Use this skill for production 2D sprites and frame-based animation, not for generic illustrations. Preserve approved character identity, palette, scale, and anchor conventions already present in the game.

## Art Style Policy

Production art stays in a narrow style band that image generators reproduce reliably and that casual players accept at scale:

- **In policy**: flat / vector / minimal shapes; cartoon with clean outlines; simple cel shading; bold saturated palettes with ≤ 6 dominant hues per scene.
- **Out of policy for production games**: photorealistic rendering (style drifts between generations), hand-drawn painterly textures, and heavy per-frame pixel-art animations (per-frame consistency is the most expensive thing to maintain). Pixel-look single icons are acceptable when the whole game commits to one pixel scale.

When the user explicitly requests an out-of-policy style, state the consistency cost, propose the closest in-policy alternative, and honor the request only after they confirm.

## Generation Prompt Contract

Every production generation prompt carries the same constraints, because each omitted one is a defect that post-processing can only partially repair:

- **One subject per image.** Generate each static prop, UI element, icon, brick, and character as its own single-subject image. Multi-cell grid sheets are reserved for frame-based animation (see Animation Triage) and mockups; a grid sheet is never the production route for static art, because the generator's cell lines, cell sizes, and inter-cell bleed make slicing guesswork.
- **Forbidden in the output**: sticker outlines, decorative card frames or badges around the subject, glow halos, cast drop shadows, painted backgrounds or scenery, floor planes, labels, text, watermarks, checkerboard "transparency" patterns, and grid lines. State these prohibitions explicitly in the prompt ("no sticker outline, no decorative frame, no glow halo, no drop shadow, no text or watermark") — style words like "sticker art" invite painted outlines and must not be used for production art.
- **Chroma background for cutout.** Ask for a perfectly flat solid background chosen for maximum contrast with the subject — `#FF00FF` magenta or chroma green — described as "a technical cutout background", with the same color inside enclosed negative spaces. Never white when the subject contains white or near-white parts (a white background makes those parts indistinguishable and lets the generator paint white outlines).
- **Subject framing.** The subject fills the central ~80% of the frame with clean background margin on all sides, fully inside the frame (no clipped extremities), opaque surfaces (no generator "transparency"), one consistent camera angle, and the scale the runtime needs (art is authored at 2× the runtime display size and downscaled in post).

Record the prompt and its constraint checklist on the canvas generation node so a regeneration keeps the contract.

## Style Anchor

Cross-asset style consistency is enforced by a **style anchor**, not by hoping each generation matches:

1. **Establish the anchor first.** Before batch generation, produce one reference sheet showing the protagonist, the palette (named swatches), one environment sample, and one UI sample. Save it in the asset library and reference it in the asset manifest. The style anchor is a design document deliverable — record its asset key alongside the design doc.
2. **Every generation carries the anchor.** All sprite, prop, and background generation passes the anchor image as the reference (e.g. `generate_canvas_media` with the saved image node, or `generate_image` with the reference). Generations without the anchor are prototype-only and must be labeled as such.
3. **Variants derive from approved frames.** New characters and props start from an approved in-game frame or the anchor — never from a fresh prompt alone. Recolors and theme swaps reuse the same silhouettes with palette substitution.
4. **One anchor per game.** A second style direction requires a deliberate re-anchor and regenerating the whole set; mixing two anchors in one game is a defect.

## Animation Triage

Choose the production route by how much the pose actually changes across the action:

- **Poses that genuinely change** (walk, run, attack, jump, cast): generate the frames together as one sheet, with an explicit per-frame pose-difference list in the prompt (see Frame Difference Lists).
- **Micro-animations** (idle breathing, hover, float, pulse, blink): do not generate multi-frame sheets — image generators copy one pose into every cell. Generate one frame and animate it in code (tween scale, position, rotation) or derive frames with procedural transforms (squash/stretch, small offsets); this also guarantees a shared anchor.
- **Joint motion on a reusable character** (walk cycles, idle sway, arm swings, aim, reactions on characters that will move again later): prefer the **Part-Based Rig** route over generated sheets. Slice one approved full-body frame into parts (head, torso, left/right arms, left/right legs — or semantic equivalents for non-humanoids), key each part's pivot at its joint, and drive rotations in code with the procedural rig helpers in `../../../../templates/casual-games/shared/juice/juice.ts` (`walkCycle`, `idlePose`, `limbSway`, `followThrough`). Part spec: one transparent PNG per part, pivot named `part-<name>-pivot` at the joint, run each part through `sprite-prepare.mjs` (`--bg`, `--anchor center`); mirror sides by negating angles and `scaleX = -1`. This route costs zero generated frames, stays adjustable per joint, and is the default for characters that walk or idle on screen.

## Workflow

1. Inspect the runtime's frame size, facing convention, anchor, palette, manifest, and animation definitions.
2. Start from an approved in-game frame when one exists. Do not regenerate unrelated sprite sets for a focused change.
3. Define action, direction, frame count, slot layout, timing, loop behavior, and background before generation; run the Animation Triage above first.
4. Generate or edit the whole strip together when possible; independent frame generation causes identity and scale drift.
5. **Post-process every generated image before integration (required)**: run `scripts/sprite-prepare.mjs` (or an equivalent deterministic pass when it cannot run) to cut out the background, trim, slice frames, and normalize every frame to one canvas size, shared scale, and shared anchor, usually bottom-center. Raw generator output is source art and never ships as-is.
6. Update the asset manifest and animation metadata through stable keys.
7. Inspect a preview and the animation at actual game scale before approval; check the prepared output for provider watermarks and painted-in checkerboards.

Use `generate_canvas_media` with saved image nodes and references when working on a canvas; use `generate_image` for standalone source art without a canvas. If the available generator cannot preserve an approved reference or transparency reliably, state the limitation and use the project's existing asset workflow rather than pretending consistency was verified.

## Generation Invariants

- the style anchor reference is attached to every generation (see Style Anchor); prototype-only images are labeled as such
- same character identity, silhouette, outfit proportions, and palette family
- consistent facing and camera angle
- a plain uniform background (true alpha when the generator supports it; otherwise solid white or chroma green) with no scenery, labels, or poster composition, cut out in post-processing
- exact frame count and grid layout
- readable action silhouettes at gameplay scale
- stable feet or contact point across frames
- every frame states its own concrete pose difference in the prompt, so the sheet's frames are visibly different and no pose repeats

## Frame Difference Lists

Generators answer consistency constraints ("same scale", "same anchor") by copying one pose into every cell, so keep those constraints for character design and post-processing normalization only, and express frame variation as a numbered per-frame list of drawable changes:

```
Frame 1: standing neutral, both feet on ground, arms relaxed.
Frame 2: body stretched 3% taller, chin up, plume tilted 20 degrees backward.
Frame 3: body squashed 3% shorter, knees bent, plume tilted 20 degrees forward.
Frame 4: same squash as frame 3, head turned 5 degrees toward viewer, one eye blinking.
```

Use concrete quantities (angles, percentages, limb positions); words like "subtle" or "slightly" are ignored by image generators. State that every frame must be visibly different and no pose may repeat.

## Post-Processing (required)

Generated images are raw source art. Every generated asset goes through one deterministic post-processing pass before integration — `scripts/sprite-prepare.mjs`, or an equivalent script when it cannot run:

```
node <skill>/scripts/sprite-prepare.mjs <input.png> --bg auto|white|green|magenta|#rrggbb [--tolerance 32] \
  [--pad 2] [--max-edge N] [--keep-fragments] [--grid CxR] [--cell WxH] [--anchor bottom-center|center|top-center] \
  [--sheet CxR] [--breathe N] [--json]
```

- `--bg` keys out the flat generator background (auto samples the four corners; `none` skips). Match the background the generation prompt requested; chroma magenta/green keys most reliably. The cutout is three deterministic stages: edge flood-clear (only background regions connected to the frame border are removed, so same-colored pixels inside the subject survive), a narrow transition ring that smooths the alpha edge, and a chroma defringe that unmixes key color from semi-transparent edge pixels (`c = (c_observed − key·(1−α)) / α`) — the standard fix for magenta/green edge halos.
- `--grid CxR` slices a multi-cell sheet; each frame is then cut out, filtered, trimmed, and normalized independently. Tiny fragments (below 1% of the largest connected block) are dropped by default to erase inter-cell bleed slivers; `--keep-fragments` disables that for genuinely multi-part frames.
- **Normalization spec**: the canvas is the content bounding box plus a uniform `--pad` margin on every side (default 2px) — content never touches the canvas edge — placed at one shared `--anchor` (bottom-center for grounded characters). Outputs are full-color RGBA PNGs; never palette-quantize. `--max-edge N` downscales content longer than N (lanczos3 + light sharpen) to hold the 2× runtime-size budget.
- `--cell WxH` with `--anchor` places every frame on one explicit canvas (the pad still keeps content off the edge).
- `--breathe N` derives a breathing idle sheet from one frame — the micro-animation route from Animation Triage — with cosine squash/stretch that loops smoothly.
- `--sheet CxR` repacks prepared frames; `--json` writes `manifest.json` with frame geometry for the runtime — every frame records its `content` box inside the cell, so the runtime scales by content, never by canvas (a wide sprite on a square canvas is the classic "squashed paddle" bug).

The pass is deterministic: the same input always yields the same frames, cells, and anchors.

## Automated QA (required)

After the post-processing pass and before any integration, run `scripts/sprite-qa.mjs` on the prepared outputs (or the raw cutout when debugging) and read its findings:

```
node <skill>/scripts/sprite-qa.mjs <file-or-dir>... [--key auto|magenta|green|white|#rrggbb] [--grid CxR] [--zoom 3] [--out dir] [--json]
```

- **keyFringe** (fail): semi-transparent edge pixels still carrying the key color — magenta/green/purple halos the eye reads as low quality at 100%.
- **cellBleed** (fail, `--grid`): neighbor-cell slivers stuck to a slice's seams.
- **opaqueBackground** (fail): no alpha at all — the asset was never cut out.
- **stickerOutline** (warn): a white sticker outline hugging the subject, which cutout cannot remove because it is painted subject matter — regenerate with the Generation Prompt Contract prohibitions.
- **strayFragments** (warn): 3+ isolated specks/dirt blobs.

A fail blocks integration (exit code 2) until fixed. Every run writes `<stem>-qa.png` inspection tiles — the image at 3× nearest-neighbor zoom on a checkerboard with problem pixels tinted red (fringe/bleed) or yellow (outline). Read the tiles; automated thresholds cannot see everything. Surface warns to the user with the reason, and regenerate instead of shipping a warned asset when the cause is a prompt violation (outline, frame, halo).

## Quality Gates

- every integrated image went through the post-processing pass and the automated QA (`sprite-qa.mjs`) with no fail-level finding; no raw generator output ships
- every production generation prompt followed the Generation Prompt Contract: one subject per image, explicit no-outline/no-frame/no-halo/no-shadow/no-text prohibitions, chroma cutout background — and the QA inspection tiles were read, not just their JSON
- assets in one game read as one style: no frame or prop visibly departs from the style anchor's palette, outline weight, or shading (see Style Anchor); out-of-policy styles were confirmed by the user (see Art Style Policy)
- prepared outputs checked for provider watermarks and painted-in checkerboards (fake transparency); sticker-outline warns were regenerated with contract prompts instead of shipped
- no frame-to-frame scale or anchor drift; content boxes in the manifest match the runtime's scaling basis (scale by `content`, never by cell)
- a generated sheet matches its per-frame pose-difference list; no cell copies another cell's pose
- no clipped effects or unintended opaque background
- idle and transition frames connect without a visible jump
- timing matches the gameplay event
- manifest, preload, and runtime animation names agree

Use `../phaser-2d-game/SKILL.md` for runtime integration, `../game-playtest/SKILL.md` for in-game verification, and `../../../../templates/casual-games/shared/juice/README.md` for game feel (hit-stop, shake, squash & stretch) and the Part-Based Rig helpers.
