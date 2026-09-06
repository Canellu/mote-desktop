# Home Map implementation progress

Updated: **2026-09-06**. Branch: `codex/home-map-foundation`.

The [UX plan](./home-map-plan.md) defines the intended complete experience.
Each chunk gets its own focused verification and commit. Existing unrelated
working-tree changes are excluded from these commits.

## Core foundation — current work

| Chunk | Deliverable | Status |
| --- | --- | --- |
| 1 | Versioned map model, orthogonal geometry validation, units, measured wall constraints and calibration | In progress |
| 2 | Pure room split/combine operations with shared boundaries and preserved light positions | In progress |
| 3 | Immutable draft history, publish/discard, validated storage codec and ordered persistence interface | In progress |

These modules do not yet add a visible Map view, perform Hue writes, or persist
to the desktop filesystem. The storage interface deliberately requires a
durable adapter; it does not silently fall back to browser storage.

## Next independently committable chunks

4. Dedicated native map storage adapter and failure-safe loading/saving; wire a
   single repository instance to the active bridge. Keep core IPC work separate
   from UI interaction polish.
5. Home Dashboard / Map entry, floor selection, SVG room rendering, and a
   synchronized accessible room list using sample geometry in development.
6. Selected-room power, brightness, and scenes through existing Hue actions;
   show offline/sync exclusions and explicit control scope.
7. Initial map creation: rectangle/L-shape, mode and units selection, recoverable
   draft, and save/discard flow.
8. Corner/outline drawing and shared-wall manipulation with validation feedback.
9. Divide/combine preview, names, and existing room/zone links. Keep Hue creation
   operations out of the initial geometry editor.
10. Measured dimension controls, scale calibration, constraint release, and
    keyboard alternatives.
11. Light placement, Identify, unplaced tray, marker controls, and multiple floors.
12. Explicit queued Hue room/zone and membership changes, scene decisions, and
    partial-failure reconciliation before publishing map links.
13. Floor control scope, missing resource recovery, and final interaction,
    accessibility, theme, and narrow-window checks.

## Verification

- Bun tests exercise geometry, measurement constraints, draft history, codecs,
  identity isolation, and async storage failures/order as those modules land.
- Run targeted ESLint/Prettier and frontend typecheck/build for core commits.
- Later UI chunks require browser inspection and interaction verification.
- Native storage/Hue changes require the relevant desktop checks; frontend
  tests alone do not establish native persistence or bridge behavior.
