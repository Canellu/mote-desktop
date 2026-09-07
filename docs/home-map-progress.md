# Home Map implementation progress

Updated: **2026-09-07**. Branch: `codex/home-map-foundation`.

The [UX plan](./home-map-plan.md) defines the intended complete experience.
Each chunk gets its own focused verification and commit. Existing unrelated
working-tree changes are excluded from these commits.

## Completed chunks

| Chunk | Deliverable                                                                                                    | Status   |
| ----- | -------------------------------------------------------------------------------------------------------------- | -------- |
| 1     | Versioned map model, orthogonal geometry validation, units, measured wall constraints and calibration          | Complete |
| 2     | Pure room split/combine operations with shared boundaries and preserved light positions                        | Complete |
| 3     | Immutable draft history, publish/discard, validated storage codec and ordered persistence interface            | Complete |
| 4a    | Native per-bridge files, atomic replacement, compare-before-save protection, and desktop adapter               | Complete |
| 4b    | Active-bridge state, durable autosave/publish/discard, and explicit failure recovery                           | Complete |
| 5     | Dashboard / Map switch, saved floors, SVG map, accessible room list, selection details and development preview | Complete |
| 6     | Selected-room power, brightness, and scenes with explicit control scope                                        | Complete |
| 7     | Initial map creation: rectangle/L-shape outline, mode and units, draft creation and save/discard               | Complete |

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

Room controls act on the linked Hue room/zone's membership, never on marker
positions. The inspector states the real scope: how many lights the target
holds, other linked areas and floors it also controls, members placed outside
the selected area or off this floor, unplaced members, and offline or
sync-excluded lights. Controls and scenes disable with a stated reason.

Home now offers map creation for a bridge with no saved plan. The wizard draws
one floor as a rectangle or an L-shape with a chosen cut-out corner, in quick
sketch or measured mode, in meters or feet, with a live outline preview and the
reason beside the fields whenever the entered sizes cannot form a floor.
Measured maps lock and mark verified the entered width and depth; sketches keep
the same lengths as unverified estimates. Changing units restates the entered
lengths instead of resizing the floor, and dimensions are placed on walls that
exist end to end, so an L-shape measures its full-length sides.

Creating a map produces an autosaved draft, not a published map. A review bar
states that the draft is unsaved, keeps any published map in place until Save
map succeeds, and exposes Discard draft and, after a failed write, Retry
saving. Drawing corner by corner, dividing rooms, naming and linking Hue
targets, and light placement remain in later chunks.

Edit walls turns the map into a wall editor. A wall is a whole straight
boundary run, not a single segment: moving part of a straight boundary would
leave a diagonal that orthogonal plans cannot represent, so collinear connected
segments move together and every room along them resizes in one edit. The list
beside the map names each wall, the rooms it borders, and its length, and marks
whether it separates rooms or faces outside. Moves use buttons with a chosen
step or the arrow keys while the map has focus, so nothing depends on dragging.
A move that would push a wall onto another one, or that would change a locked
length, is refused with the reason and leaves the floor untouched. Accepted
moves become autosaved draft edits with Undo, reviewed through the same draft
bar as creation.

Drafting helpers for drawing an outline corner by corner are complete and
tested: grid snapping, axis constraint from the previous corner, a named reason
for every rejected corner or close, and a floor builder shared with the creation
wizard. The drawing canvas that uses them is still to come; the wizard offers
rectangle and L-shape outlines today.

## Next independently committable chunks

8b. Drawing canvas in the creation wizard on top of the drafting helpers. 8. Corner/outline drawing and shared-wall manipulation with validation feedback. 9. Divide/combine preview, names, and existing room/zone links. Keep Hue creation
operations out of the initial geometry editor. 10. Measured dimension controls, scale calibration, constraint release, and
keyboard alternatives. 11. Light placement, Identify, unplaced tray, marker controls, and multiple floors. 12. Explicit queued Hue room/zone and membership changes, scene decisions, and
partial-failure reconciliation before publishing map links. 13. Floor control scope, missing resource recovery, and final interaction,
accessibility, theme, and narrow-window checks.

## Verification

- Wall editing checkpoint: **101 Home Map Bun tests (606 assertions) passed**,
  including outline drafting and wall runs. Frontend typecheck, production
  build, targeted ESLint/Prettier passed. Browser checks used a temporary
  preview harness: selecting a wall from the map and the list, moving it with
  buttons and arrow keys, both bordering rooms resizing, a refused move onto
  another wall keeping the geometry, Undo, and light/dark appearance. Browser
  review found that moving a single segment of a longer boundary produced a
  diagonal wall; walls became whole runs and a T-junction test now covers it.
  Durable draft writes still require the desktop app.
- Creation checkpoint: **86 Home Map Bun tests (535 assertions) passed**,
  including 9 new creation tests covering outlines, every cut-out corner,
  rejected sizes, dimension placement, identity uniqueness, and validation of
  the produced document. Frontend typecheck, targeted ESLint/Prettier passed.
  Browser checks used a temporary harness for the wizard: rectangle and
  L-shape previews, corner changes moving dimensions to full-length walls,
  unit switching restating 8 m as 26.25 ft without resizing, invalid sizes
  disabling Create with a stated reason, and light/dark and narrow layouts.
  The harness was removed after verification. Durable draft creation through
  the store and its review bar were not exercised in the browser: native
  storage requires the desktop app.
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
