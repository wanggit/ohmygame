---
name: game-qa
description: Verify games across engines with targeted boot, input, progression, regression, visual, and performance checks using available runtime tools and existing project tests.
---

# Game QA

Match verification to the change and available runtime. Build success establishes compilation, not a successful playtest.

## Choose The Pass

- `smoke`: build, launch, reach the first actionable state, and exercise primary input.
- `feature`: exercise the changed behavior, its entry/exit states, failure cases, and nearby systems.
- `bug regression`: reproduce the prior failure when possible, verify the fix, and check related paths.
- `visual`: inspect representative gameplay screenshots for framing, legibility, missing art, clipping, and HUD obstruction.
- `performance`: reproduce and measure the reported bottleneck with the engine's diagnostics before recommending optimization.

## Use The Available Runtime

Read the project's existing scripts, test setup, and engine conventions. Prefer its established build and logic checks.

For a configured OhMyGame Web preview, prefer `game_use`. Reuse its session, send real input, inspect runtime errors and failed asset loads, capture representative rendered states, and close the session in the same turn even after failure. For brief effects slow or freeze page time (`bridge setTimeScale`) or burst captures (`frames: 3-8`) before judging them; for layout changes run `sweep` for the per-viewport pass. OhMyGame owns the preview server; do not leave another development server running.

For native engines, use available runtime tools, an engine Connection that actually supports launch or interaction, or project-owned automation. An editor MCP connection alone is not gameplay verification. Do not wrap a native game in a Web project merely to obtain screenshots. Do not install a new browser or automation framework solely for routine verification.

Use an existing deterministic reset, seed, state snapshot, or step operation when it helps reach the affected state. Still verify real input and what the player sees. Add a minimal test-only bridge only when normal input cannot reliably reach or identify a necessary state; normal gameplay must not depend on it.

## Physics And Motion Invariants

Games with simulated motion — balls, projectiles, physics, drifting entities — need invariant soak tests in the project's logic suite, written when the mechanic is first implemented, not after a bug report. Run a long deterministic seeded simulation with rendering disabled and assert at frame granularity:

- speeds stay inside the tuned range (no energy gain, no dead stalls);
- motion never degenerates: entities keep the minimum forward or vertical component the design promises and never travel along a degenerate axis indefinitely;
- entities stay inside the playfield;
- entity counts respect their caps (projectiles, balls, spawned units);
- positions and velocities remain finite.

Per-action unit tests miss this class of bug: a wrong angle convention or a broken bounce clamp still clears targets and passes logic tests while the game plays broken. Asserting only the final state is not a soak test.

## Player-Facing Checks

Check launch/loading, control discoverability and feedback, progression, transitions, pause/modal input, failure/restart, and missing assets. Inspect sprites at actual game scale and models for orientation, framing, lighting, animation, and collision alignment. Check representative supported devices when layout or input changes; mobile checks apply when mobile is a target.

Repair issues and repeat the affected checks. Report build, logic, runtime, interaction, visual, and performance evidence separately when relevant. If runtime interaction or screenshots are unavailable, run the strongest supported checks and state what remains unverified. One screenshot, DOM inspection, or an editor operation does not establish a complete playtest.
