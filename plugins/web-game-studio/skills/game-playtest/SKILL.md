---
name: game-playtest
description: Test browser games through boot, input, gameplay states, regression paths, responsive layouts, screenshots, and structured player-facing QA.
---

# Game Playtest

Test the game as a player experiences it. Match the depth of verification to the change and distinguish build success from actual browser or gameplay validation.

## Choose The Pass

- `smoke`: build, boot, reach the first actionable state, and confirm primary input.
- `feature`: exercise the new behavior, its entry and exit states, failure cases, and nearby systems.
- `bug regression`: reproduce the old failure when possible, verify the fix, and check the nearest related paths.
- `visual`: capture representative states and inspect playfield visibility, hierarchy, clipping, and feedback.
- `performance`: measure the reported bottleneck with browser or renderer diagnostics before recommending optimization.

## Workflow

1. Read the project's existing scripts and test setup.
2. Build or run the narrowest relevant automated checks. Treat this as build or logic evidence, not proof that the game works in a browser.
3. Prefer the built-in `game_use` tool. Open the current project preview, reuse its `sessionId`, and close the session in the same turn even when a check fails. Reopening the same route reloads the existing session, so repeated open → drive → capture loops are cheap.
4. Inspect the initial runtime state for loading failures, console errors, failed requests, interactive elements, canvas visibility, and optional game-bridge state.
5. Exercise primary actions, pause or modal states, restart or failure paths, and the changed behavior with real browser input.
6. Capture every representative Canvas or WebGL state. DOM inspection cannot establish that a rendered frame is nonblank, correctly framed, or unobstructed. Cover every level, stage, or distinct theme palette with its own screenshot before claiming visual verification — sampling one level misses per-level art, palette, and layout differences even when levels share rendering code.
7. Check representative desktop and mobile viewport sizes when layout is affected — run `game_use` `sweep`, which resizes through 375x667, 768x1024 and 1280x720, screenshots each, and flags blank frames, horizontal overflow, console errors and failed requests. Reinspect and recapture after resizing. After any resize also assert game state survives: progress, score and entity layout must reflow, never reset (a resize that rebuilds a generated grid must preserve cleared fraction, not silently restart the level).
8. Record build, runtime, interaction, visual, and responsive results separately, including anything that remains unverified.

## Transient Effects

Short-lived effects (explosions, hit flashes, ultimates, particles) are the easiest thing to misjudge: a single screenshot lands mid-fade or after the effect, and "not captured" gets reported as "not working".

- Slow or freeze page time before capturing: act with `bridge setTimeScale` — `0` freezes the page clock (the frame stays still and capturable), `0.05-0.5` gives slow motion — then capture, then restore with `1`. This is driver-level and needs no game-side support.
- Or burst captures: `capture` with `frames: 3-8` (and `intervalMs`) returns several back-to-back screenshots so a 300ms effect is caught somewhere in the sequence.
- Only after time control and bursts show nothing should you suspect the effect logic; verify the trigger path (event firing, draw order — an effect drawn before a later overlay can be hidden) before concluding it is broken.
- Do not lengthen or brighten an effect just to make it screenshot-friendly; change it for the player, not the camera.

## Game Use Policy

- `game_use` is the OhMyGame path for game interaction and verification. Use `open`, `inspect`, `act`, `capture`, `sweep`, and `close`; it starts or reuses the current project preview and does not accept arbitrary external sites.
- Prefer semantic targets such as role, name, test ID, or text for DOM controls. Use coordinates for the canvas playfield when the game has no semantic target.
- When `bridgeCapabilities` are present, use `snapshot` state for assertions and `reset`, `setSeed`, or `step` to reach deterministic states. Still send real input and inspect screenshots; the bridge is not a substitute for player-facing verification.
- `bridge setTimeScale` is driver-level (it scales the page's rAF/performance.now/Date.now clocks) and works without any game bridge. Use it to freeze or slow brief effects before capturing; always restore it to `1` afterwards so later checks run at real speed.
- Use `capture` with `frames: 3-8` for effects under a second; use `sweep` for the per-viewport responsive pass. A missed screenshot is not proof an effect or layout is broken.
- Vary the input strategy across the pass: interact at playfield edges, deliberately miss or fail an objective, and repeat input rapidly — not only the optimal path. Degenerate states (stuck entities, wrong bounce angles, dropped clicks) hide in boundary and failure paths that a well-played run never touches.
- Do not add a game bridge for routine playtesting. Add the smallest test-only bridge only when real input cannot reliably reach or identify an important state, and do not restructure the game solely to support the bridge.
- Fall back to automation already owned by the project when the built-in runtime adapter is unavailable.
- Do not install Playwright, Puppeteer, browser binaries, or other automation packages only to complete a playtest. Add test infrastructure only when the user asks for it or it is part of the requested implementation.
- `game_use` is registered only when the Electron desktop app owns the daemon (`bun run dev:desktop`); a browser dev session never has it. When `game_use` is absent, do not fake one — run the strongest build and logic checks available, state plainly that the game was not visually playtested, and end with a manual-check checklist (first paint, primary input, audio, responsive sizes) instead of a ready-to-play claim.

Treat screenshot blank-frame analysis as a warning signal, not a complete visual assertion. A uniformly colored loading screen can look blank to the heuristic, while a broken but noisy frame can pass it.

## Review Focus

- first actionable screen and control discoverability
- input feedback, timing, and state transitions
- HUD obstruction, clipping, and responsive behavior
- scene or route transitions and restart behavior
- loading, missing assets, console errors, and blank canvas states
- camera, pointer lock, modal focus, and touch controls where relevant
- sprite anchors for 2D and framing, lighting, collision, and loading for 3D

When reporting issues, lead with severity, reproduction, player impact, and the likely owning subsystem. When asked to fix issues, make focused changes and rerun the affected checks. Do not claim a full playtest from a successful build, a DOM-only inspection, or one screenshot.
