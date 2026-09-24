# Hue Pomodoro / Focus Rituals

Status: **shipped in 0.6.0**.

## As built

- `/focus` with a Focus button on Home and a running clock in the title bar on
  every screen. Rituals are listed and edited there, and a new one is made in
  the `/focus/new` wizard — Rhythm, Lights, Vibe, Review, one step at a time,
  with every step already answered staying reachable from its header; a
  session shows
  a ring countdown, round dots, pause/resume, add time, skip, and end, a
  ten-second intermission with Start now and more time, and a completion
  summary with Run again.
- `services/automations/focus.rs` runs the session on monotonic time in the
  automation task, pauses it when the PC sleeps, and hands the lights to the
  runtime as the `Focus` holder, so snapshots, priority, PC Sync, and restoring
  come from the runtime. Rituals and the last-used ritual live in `focus.json`.
  Sessions end at exit and are not resumed; the runtime journal puts the
  lights back after a crash.
- All four personalities, with a capability-aware tint: XY on color lights,
  the nearest white on white-ambiance lights, and brightness on dimmers. Calm
  holds, then warms in quarter steps over the last 40%; Journey shifts a
  four-stop gradient each quarter; Light Race fills in twentieths; Minimal
  changes for the last minute only.
- Windows notifications between phases (per ritual), and a tray tooltip and
  menu with pause/resume, skip, and end.
- Conflicts with PC Sync follow the priority list instead of blocking startup.
- Not built: locking other controls on session lights, chimes, reduced-motion
  variants beyond the ring's transition, and keyboard controls other than
  Space to pause.

Shared runtime prerequisite: [automation-runtime-plan.md](./automation-runtime-plan.md).

## Summary

Create a dedicated `/focus` feature where users save reusable “rituals” combining:

- A timer rhythm.
- Selected rooms, zones, and individual lights.
- A lighting personality.
- Custom focus, warning, and break colors/brightness.

Sessions run in the Rust backend, continue in the tray, restore previous light state afterward, and expose a calm but playful UI. Implement as separate sequential tasks: backend engine first, functional frontend second, visual micro-interactions last.

## Product and UX

- Add a Focus button to the Home header and a compact global status pill while a session is active.
- Provide immutable starter templates:
  - **Clear Mind:** 25/5, four rounds, 15-minute long break, Calm lighting.
  - **Deep Dive:** 50/10, two rounds, 20-minute long break, Journey lighting.
  - **Momentum:** 15/3, four rounds, 10-minute long break, Light Race.
  - **Quiet Cue:** Classic timing with Minimal lighting.
- Let users create named rituals through a three-step editor:
  1. **Rhythm:** choose a preset or custom focus, break, long-break, and round values.
  2. **Lights:** select rooms, zones, or lights; identify them; deduplicate overlapping membership; report unreachable or Hue Sync-controlled lights.
  3. **Vibe:** choose choreography, preview it, customize focus-start, focus-end, and break colors plus brightness.
- Lighting personalities:
  - **Calm:** unified cool focus look that gently warms near completion.
  - **Journey:** a gradient distributed across lights and shifted at quarter milestones.
  - **Light Race:** lights become progress segments and change as work is completed.
  - **Minimal:** phase-start look, final-minute warning, and one gentle completion pulse.
- Adapt every personality by capability: XY colors for color lights, temperature shifts for white-ambiance lights, and brightness-only cues for basic dimmable lights.
- Active session view:
  - Large animated countdown, phase label, next phase, and glowing round indicators.
  - Pause/resume, skip, end, and extend controls.
  - Ten-second intermission between phases with **Start now** and **Add time**; add five minutes to focus or two minutes to breaks.
  - Automatically begin the next phase after the intermission.
- Completion restores the snapshot, then shows focused minutes, completed rounds, and **Run again**. Exclude streaks, achievements, and long-term statistics from v1.
- Respect reduced-motion settings and provide keyboard controls only while the Focus route is active.

## Backend, Persistence, and Interfaces

- Add a Pomodoro consumer to the shared automation runtime with immutable session state. Use monotonic timing, pause on system sleep/resume gaps, and never depend on webview timers.
- Add Tauri commands:
  - `get-pomodoro-data`
  - `save-pomodoro-ritual`
  - `delete-pomodoro-ritual`
  - `start-pomodoro`
  - `pause-pomodoro`
  - `resume-pomodoro`
  - `skip-pomodoro-phase`
  - `extend-pomodoro-phase`
  - `stop-pomodoro`
  - `preview-pomodoro-look`
- Emit `pomodoro-status` on lifecycle changes and periodic reconciliation. Status includes lifecycle, phase, deadline/remaining time, round progress, next phase, locked light IDs, skipped lights, warnings, and errors.
- Public types:
  - `PomodoroRitual`: id, name, schedule, targets, vibe, palette, focus/break brightness.
  - `PomodoroSchedule`: preset/custom durations and round count.
  - `PomodoroTarget`: room, zone, or light v2 UUID.
  - `PomodoroStatus`: idle, running, paused, intermission, restoring, completed, or error.
- Persist rituals, last-used ritual, alert preferences, and a versioned active-session journal in `pomodoro-store.json`.
- Before changing lights, resolve targets to deduplicated v2 light IDs and persist snapshots containing power, brightness, color mode, XY/mirek, and supported effects.
- Use the shared runtime for light snapshots, paced writes, ownership, restoration,
  and recovery journals.
- Continue timing through temporary bridge outages; skip obsolete cues and apply only the current phase look after reconnection.
- Block startup when selected lights overlap active entertainment sync, with an action to exclude conflicting lights. If overlap begins externally mid-session, stop controlling overlapping lights and do not restore them against the new owner.
- Expose locked IDs globally. Disable intersecting room/zone grouped controls, lights, scenes, widgets, and PC Sync startup because grouped or scene writes could overwrite session-owned lights.
- Add native notification support and local soft chimes. Request notification permission only when enabled; degrade to light and in-app cues if denied.
- Update the tray tooltip/menu with phase, remaining time, pause/resume, show Focus, and end-session actions.

## Implementation Sequence

1. **Backend task:** Pomodoro timer state machine, ritual persistence, Hue cue
   scheduling, and commands/events on top of the shared automation runtime.
2. **Functional frontend task:** route, store, ritual CRUD/editor, target selection, active-session controls, capability warnings, global status, notifications, and control locking.
3. **Visual task:** ambient gradients, countdown animation, light-progress visualization, intermission transitions, completion treatment, sound polish, and reduced-motion variants.

## Test Plan

- Verify all preset and custom phase sequences, long-break placement, pause/resume, skip, extension, intermission, and final restoration using a fake clock.
- Test target deduplication across overlapping rooms, zones, and individual lights.
- Test color, white-ambiance, dimming-only, unreachable, and mixed-capability selections.
- Verify light-write pacing, omission of redundant fields, partial command failure, reconnect behavior, and exactly-once restoration.
- Verify exit/crash journal recovery and retained retry state when the bridge is unavailable.
- Verify Hue Sync conflicts before and during a session and locks across Home, Space, scenes, widgets, and sync startup.
- Verify hidden-window timing, tray controls, denied notification permission, muted sound, reduced motion, and route navigation during an active session.
- Run targeted Rust engine tests, `bun run build`, and `bun tauri build`.

## Assumptions

- The app remains running in the tray; explicitly quitting ends and restores the session.
- Custom colors affect color-capable lights; other lights receive semantic temperature or brightness equivalents.
- A session owns selected lights until it ends. External non-entertainment Hue controllers cannot be prevented from writing, but subsequent cues and final restoration may overwrite those changes.
- Rituals and session journals are local to this desktop app; cloud synchronization and bridge-side schedules are out of scope.
- Preserve completed PC Sync behavior and regression tests while extracting
  reusable snapshot behavior through the shared runtime plan.
