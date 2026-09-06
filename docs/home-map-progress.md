# Home Map implementation progress

Updated: **2026-09-06**. Branch: `codex/home-map-foundation`.

The [UX plan](./home-map-plan.md) defines the intended complete experience.
Each chunk gets its own focused verification and commit. Existing unrelated
working-tree changes are excluded from these commits.

## Core foundation — current work

| Chunk | Deliverable | Status |
| --- | --- | --- |
| 1 | Versioned map model, orthogonal geometry validation, units, measured wall constraints and calibration | Complete |
| 2 | Pure room split/combine operations with shared boundaries and preserved light positions | Complete |
| 3 | Immutable draft history, publish/discard, validated storage codec and ordered persistence interface | Complete |
| 4a | Native per-bridge files, atomic replacement, compare-before-save protection, and desktop adapter | Complete |
| 4b | Active-bridge state, durable autosave/publish/discard, and explicit failure recovery | In progress |

These modules do not yet add a visible Map view or perform Hue writes. The
native adapter stores a separate JSON file per bridge under the application's
data directory in `home-maps/`. It does not fall back to browser storage.

Writes flush a temporary file before replacing the previous file, and compare
the last-read contents under a native mutex. Stale windows cannot silently
overwrite newer saves. Invalid, unsupported, oversized, or unreadable files
remain untouched for recovery. A forced process exit can leave a harmless
temporary file; power-loss recovery beyond the filesystem's rename guarantees
is not claimed.

## Next independently committable chunks

4. Finish active-bridge state and failure recovery on the native adapter. Keep
   core IPC work separate from UI interaction polish.
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

- Native storage checkpoint: **8 Rust tests and 6 frontend adapter tests
  passed**. Native tests run against temporary files on Windows and cover
  replacement, file failures, recovery, path isolation, and concurrent saves.
- Foundation checkpoint: **34 Bun tests passed**, covering 217 assertions.
  Targeted ESLint and Prettier checks, frontend typecheck, and production build
  passed. The production build reports its existing large-bundle advisory.
- Bun tests exercise geometry, measurement constraints, draft history, codecs,
  identity isolation, and async storage failures/order as those modules land.
- Run targeted ESLint/Prettier and frontend typecheck/build for core commits.
- Later UI chunks require browser inspection and interaction verification.
- Native storage/Hue changes require the relevant desktop checks; frontend
  tests alone do not establish native persistence or bridge behavior.
