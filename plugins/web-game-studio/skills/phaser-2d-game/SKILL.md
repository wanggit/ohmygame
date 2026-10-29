---
name: phaser-2d-game
description: Build and modify Phaser 4 2D browser games with TypeScript, Vite, gameplay systems, scenes, cameras, animation, input, and DOM overlays.
---

# Phaser 2D Game

Use Phaser for new 2D games that benefit from sprites, tilemaps, cameras, timing, scene orchestration, or arcade-style interaction. Do not migrate a working non-Phaser game merely because this skill is available.

## Runtime Version

- New projects use Phaser 4. Pin the exact version in `package.json` (for example `phaser: "4.2.1"`); the v4 line is still iterating quickly, so do not float a `^` range.
- When modifying an existing Phaser 3 project, stay on its current major version unless the user explicitly asks to migrate. Read `package.json` before assuming the version.
- Phaser 3 stopped at 3.90.x and receives no further releases. Anything new goes to Phaser 4.

## Architecture

- Keep game rules, progression, inventory, combat, objectives, and saveable state outside Phaser scenes.
- Let scenes adapt simulation state into sprites, animations, cameras, particles, audio, and input events.
- Use a small scene set: boot or preload, menu when needed, gameplay, and optional overlay or debug scenes.
- Treat sprites, tweens, emitters, and camera rigs as disposable view state.
- Use stable asset keys and centralize loading.
- Put dense HUD, menus, settings, and accessible controls in DOM overlays.

## Phaser 4 API Notes

Phaser 4 rebuilt the WebGL renderer, but most gameplay APIs — sprites, groups, text, tweens, Arcade and Matter physics, scenes, input, audio, tilemaps — behave as they did in v3. The breaking changes below are the ones that silently produce v3-style code. Never write v3 idioms in Phaser 4 code.

| Do not write (Phaser 3) | Use instead (Phaser 4) |
| --- | --- |
| `new Phaser.Geom.Point(x, y)` | `new Phaser.Math.Vector2(x, y)` — `Geom.Point` is removed |
| `sprite.setTintFill(color)` | `sprite.setTint(color).setTintMode(Phaser.TintModes.FILL)` — `setTintFill()` still exists but is a deprecated method that does nothing |
| `sprite.setTint(color)` expecting a fill | v4 separates tint color and tint mode; set the mode explicitly (`Phaser.TintModes.MULTIPLY` is the default; `FILL` and `ADD` are available) |
| `BitmapMask` | the `Mask` filter in the unified filter system; `GeometryMask` remains available for Canvas only |
| preFX / postFX (for example `preFX.addBloom()`) | one Filter system with `filters.internal` (object only) and `filters.external` (screen context) lists; removed derived FX (`Bloom`, `Shine`, `Circle`, `Gradient`) have Action or GameObject equivalents |
| `Phaser.Structs.Set` | native `Set` — `Structs.Set` is removed; prefer native `Map` as well |
| `Math.PI2` | `Math.TAU` — and note `Math.TAU` now equals `Math.PI * 2`; in v3 it meant `Math.PI / 2` |
| custom WebGL pipelines (`Phaser.Renderer.WebGL.Pipelines.*`) | the RenderNode architecture (`Phaser.Renderer.WebGL.RenderNode`) |
| `Phaser.GameObjects.Mesh` / `Plane` | removed; use sprites or the newer `Mesh2D` where a mesh is truly required |
| `DynamicTexture` / `RenderTexture` drawing without a flush | call `.render()` after drawing; v4 no longer flushes implicitly |
| `ColorMatrix` direct calls | methods moved to the `.colorMatrix` property |
| `Phaser.CANVAS` renderer fallback | the Canvas renderer is deprecated; target WebGL |

- Compressed textures (KTX / Basis) changed Y-axis orientation in v4 and must be re-compressed. Plain PNG, WebP, or JPEG sprites are unaffected.
- The Shader API and GLSL loading changed; do not copy v3 custom shader code verbatim.

## Change Modes

- For a feature, trace the state owner, action mapping, scene adapter, HUD effects, and persistence impact before editing.
- For a bug, reproduce the relevant state transition and inspect timing, lifecycle, input, collision, and scene restart behavior before changing code.
- For a refactor, retain observable timing and controls unless the user requested behavior changes.

## Browser Requirements

- Resize the renderer and camera intentionally; do not stretch gameplay coordinates accidentally.
- Support keyboard and pointer input, and add touch controls when the target experience needs them.
- Pause or gate gameplay input under menus and dialogs.
- Keep effects readable: screen shake, hit stop, flashes, and particles should communicate state rather than hide it.

## Task Routing

Deep Phaser 4 subsystem skills live next to this skill. Consult the matching one when the task calls for its subsystem; this skill stays the entry point and keeps the architecture and version rules above.

| Task | Skill |
| --- | --- |
| Game config, boot, startup scale mode | `../phaser-game-setup-and-config/SKILL.md` |
| Scene lifecycle, transitions, parallel scenes | `../phaser-scenes/SKILL.md` |
| Asset loading, atlases, preloading | `../phaser-loading-assets/SKILL.md` |
| Keyboard, mouse, touch input | `../phaser-input-keyboard-mouse-touch/SKILL.md` |
| Arcade Physics bodies, collisions, groups | `../phaser-physics/SKILL.md` |
| Tweens and timelines | `../phaser-tweens/SKILL.md` |
| Particle emitters | `../phaser-particles/SKILL.md` |
| Filters, masks, lights, post-FX | `../phaser-fx/SKILL.md` |
| Tilemaps and Tiled levels | `../phaser-tilemap/SKILL.md` |
| HUD, health bars, buttons, dialogs | `../phaser-ui/SKILL.md` |
| Music and sound effects | `../phaser-audio-and-sound/SKILL.md` |
| RenderTexture and DynamicTexture | `../phaser-render-textures/SKILL.md` |
| Save data and autosave | `../phaser-saveload/SKILL.md` |
| Responsive scaling | `../phaser-scale-and-responsive/SKILL.md` |
| Mobile and PWA concerns | `../phaser-mobile/SKILL.md` |
| Data manager and registry | `../phaser-data-manager/SKILL.md` |
| What is new in Phaser 4 | `../phaser-v4-new-features/SKILL.md` |
| Migrating a Phaser 3 project | `../phaser-v3-to-v4-migration/SKILL.md` |

Keep the `../web-game-foundations/SKILL.md` boundaries regardless of which subsystem skill is in use.

## Verification

Build the project, boot the first actionable scene, exercise the affected player actions, and check scene transitions or restart paths. Use `../game-playtest/SKILL.md` for broader browser or visual verification. Type-check against the pinned Phaser 4 types: compile errors mentioning `Geom.Point`, `BitmapMask`, or `Structs.Set` mean v3 idioms remain, and silent no-ops such as `setTintFill()` will not surface as errors — review for them explicitly.
