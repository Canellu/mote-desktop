# Home Map implementation progress

Updated: **2026-09-06**. Branch: `codex/home-map-foundation`.

The [UX plan](./home-map-plan.md) defines the intended complete experience.
Each chunk gets its own focused verification and commit. Existing unrelated
working-tree changes are excluded from these commits.

## Completed chunks

| Chunk | Deliverable | Status |
| --- | --- | --- |
| 1 | Versioned map model, orthogonal geometry validation, units, measured wall constraints and calibration | Complete |
| 2 | Pure room split/combine operations with shared boundaries and preserved light positions | Complete |
| 3 | Immutable draft history, publish/discard, validated storage codec and ordered persistence interface | Complete |
| 4a | Native per-bridge files, atomic replacement, compare-before-save protection, and desktop adapter | Complete |
| 4b | Active-bridge state, durable autosave/publish/discard, and explicit failure recovery | Complete |
| 5 | Dashboard / Map switch, saved floors, SVG map, accessible room list, selection details and development preview | Complete |

Home now includes a Map view. It renders published maps and offers a clearly
labeled synthetic example in development builds. The example is excluded from
production and never saved. There is no map creation UI yet; new users see an
empty state with a path back to Dashboard. Draft-only and failed-load states
remain explicit.

The view includes floor selection, synchronized map/list selection, keyboard
activation and clearing, fixed-size room labels and light markers, dimension
visibility, zoom, scrolling, and Fit floor. View preference and last room/floor
selection are scoped to each bridge in browser preferences; floor plan data
remains in native storage. Narrow windows stack the room list below the map.
Existing linked rooms/zones open their current control screen. Inline lighting
controls and the editor follow in separate chunks.

The native adapter stores a separate JSON file per bridge under the application's
data directory in `home-maps/`. It does not fall back to browser storage.

The active Hue session now loads its map through one shared repository/store.
Switching bridges preserves per-bridge drafts and pending saves. Completed edits
autosave; publish/discard expose success only after their durable write.
Failures preserve local work, retry checks the saved baseline, and an explicit
discard-local-and-reload action resolves conflicts without replacing local work
when the reload fails. These state actions will be surfaced by the editor UI.

Writes flush a temporary file before replacing the previous file, and compare
the last-read contents under a native mutex. Stale windows cannot silently
overwrite newer saves. Invalid, unsupported, oversized, or unreadable files
remain untouched for recovery. A forced process exit can leave a harmless
temporary file; power-loss recovery beyond the filesystem's rename guarantees
is not claimed.

## Next independently committable chunks

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

- Map view checkpoint: **67 Home Map Bun tests (424 assertions) passed**.
  Frontend build/typecheck, targeted ESLint/Prettier, and the UI detector passed.
  Browser checks covered keyboard selection, selection clearing, floor changes,
  layers, zoom/Fit, empty state, and light/dark appearance at 1200×1000 and
  627×800. The synthetic preview is absent from production assets. Browser
  testing does not verify hardware actions or native persistence. No Rust or
  Hue state changes were made in this UI chunk. Review found faint shared walls;
  their contrast was increased and the reviewer scored that fix resolved.
- Active-bridge checkpoint: **57 Home Map Bun tests (393 assertions) and 8 Rust
  storage tests passed**. Frontend typecheck/build, targeted ESLint, and
  formatting checks passed. Native and bridge-state code received a focused
  review; the save-response ambiguity and explicit conflict recovery findings
  were resolved and covered by tests.
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
