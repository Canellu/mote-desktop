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

Edit walls now opens a direct-manipulation canvas rather than a list-driven
one. Dragging a corner moves the two straight runs that meet there, because an
orthogonal plan has no free corners; dragging a wall moves its whole run. A
drag previews continuously and commits one draft edit when the pointer is
released, so a draft records whole moves rather than every pixel. Dragging the
background pans, the wheel zooms around the pointer, and a click on the
background clears the selection. Snapping is adjustable from the map: on or
off, increments from 5 cm to 1 m, alignment to existing corners, and an
optional grid. Alignment to a corner draws a guide through it and wins over the
grid per axis. Settings persist locally and are validated when read. The wall
list, its step buttons, and arrow keys remain, so nothing depends on dragging.

The editor has Select and Draw room tools. Draw places a corner per click, with
the wall constrained to the axis the pointer moved furthest along and then
snapped, a live rubber band, alignment guides, and a hint that follows the
step. Clicking the first corner closes the room; Enter also finishes a valid
outline, Backspace removes the last corner, and Escape abandons the drawing.

A drawn room reuses any corner it lands on, and both sides of a wall it touches
gain every corner along that wall, so a room drawn against a neighbour shares
that boundary and can then be resized as one. Overlaps, unclosed outlines, and
non-orthogonal walls are refused with the reason. New rooms are named by
position; renaming and Hue links follow with divide and combine.

## Next independently committable chunks

8b. Drawing canvas in the creation wizard on top of the drafting helpers. 8. Corner/outline drawing and shared-wall manipulation with validation feedback. 9. Divide/combine preview, names, and existing room/zone links. Keep Hue creation
operations out of the initial geometry editor. 10. Measured dimension controls, scale calibration, constraint release, and
keyboard alternatives. 11. Light placement, Identify, unplaced tray, marker controls, and multiple floors. 12. Explicit queued Hue room/zone and membership changes, scene decisions, and
partial-failure reconciliation before publishing map links. 13. Floor control scope, missing resource recovery, and final interaction,
accessibility, theme, and narrow-window checks.

## Verification

- Units and drawing checkpoint: **162 Home Map Bun tests (870 assertions)
  passed**, including a drawn outline becoming the floor exactly as drawn and
  refusing outlines that are not rooms, round grid and ruler steps per unit,
  and increments restated when the unit changes. Frontend typecheck, production
  build, targeted ESLint/Prettier passed. Browser checks drew a six-corner
  outline and created the map from it, and switched a map to feet: rulers then
  read 5, 10, 15, 20 ft and snapping offered 1 in through 2 ft, with the stored
  10 cm restated as 3 in. Three test expectations written from memory were
  wrong about which step wins at a given zoom; the code was right and the
  expectations were corrected. A later browser check drew a plan from the
  origin: the pending wall read 7.5 m, and the created map's corners were
  exactly 0.00, 0.00 through 7.50, 5.50. A layout pass then measured the bottom
  row: bar, zoom group and panel all sit 24 px from the bottom, the bar and
  zoom group no longer overlap, and the panel's clear space above equals the
  24 px below once the ruler strip is allowed for.
- Floating panel checkpoint: **160 Home Map Bun tests (876 assertions)
  passed**; presentation only. Frontend typecheck, production build, targeted
  ESLint/Prettier passed. Browser checks measured the canvas spanning the full
  window in both the editor and creation, the plan centred in the visible
  strip beside the panel, and the tool pill, zoom group, and shape bar clear of
  it, at 1400 px and 860 px. **Resizing was not verified**: ResizeObserver
  never fires in that browser pane, including a fresh observer created by hand,
  so only the mount-time measurement could be exercised. A window resize
  listener was added alongside the observer for that path.
- Creation shell checkpoint: **160 Home Map Bun tests (876 assertions)
  passed**; this pass changed presentation and routing, not map behaviour.
  Frontend typecheck, production build, targeted ESLint/Prettier passed.
  Browser checks opened creation from the example map, measured the work area
  filling a 1400x900 window with a 320px floating panel, switched shape from
  the top-right toolbar and watched the cut-out fields appear and the preview
  refit around a 14 m by 6 m L-shape, created the map, and checked the light
  theme at 1200x850.
- Full-bleed checkpoint: **160 Home Map Bun tests (876 assertions) passed**.
  Frontend typecheck, production build, targeted ESLint/Prettier passed.
  Browser checks measured the editor filling a 1400x900 window with a 320px
  floating panel over it, and stepped through nine zoom levels comparing wall
  positions with grid lines: walls sat exactly on a line at every level whose
  step divides their coordinate, and otherwise exactly half a step away, which
  is a round grid rather than a drifting one.
- Editor shell checkpoint: **160 Home Map Bun tests (876 assertions) passed**,
  with no behaviour change intended in this presentation pass. Frontend
  typecheck, production build, targeted ESLint/Prettier passed. Browser checks
  confirmed the floating toolbar exposes all six tools plus snapping and Undo
  by accessible name, rulers render ticks that follow the viewport, the
  toolbar and zoom group do not overlap at 900 px, and the light theme renders
  the new shell correctly.
- Point editing checkpoint: **160 Home Map Bun tests (876 assertions) passed**,
  including removing a corner into a valid triangle, refusing to take a
  triangle below three corners, refusing removal under a kept length, merging
  two corners into a shared one, refusing merges that flatten a room, and
  finding the nearest corner. Frontend typecheck, targeted ESLint/Prettier
  passed. Browser checks confirmed Select shows no add handles while Points
  shows all of them, added a corner and saw it selected with Remove and Merge
  offered, removed it, dragged one corner onto another with the target
  highlighted and the merge applied on release, and scrolled the light list
  inside the ScrollArea with the plan still fully visible.
- Editing UX checkpoint: **154 Home Map Bun tests (849 assertions) passed**,
  including adding a corner on a shared wall so both rooms gain it, refusing a
  corner away from a wall or on an existing corner, and dragging a newly added
  corner into an angle that splits the run into two walls. Frontend typecheck,
  targeted ESLint/Prettier passed. Browser checks pressed a midpoint handle and
  dragged the new corner outward, dropped a tray light onto the map with a real
  drag, and scrolled a long light list to the bottom with the plan still fully
  visible and no page scrolling.
- Free-form geometry checkpoint: **151 Home Map Bun tests (833 assertions)
  passed**, including angled and triangular rooms, a bow tie rejected for
  crossing itself, overlap between angled rooms, a corner drag that moves only
  its own corner, a corner refused on top of another, angle snapping at 45 and
  90 degrees, closing an outline with an angled last wall, and a diagonal
  divider splitting a room. Frontend typecheck, targeted ESLint/Prettier
  passed. Browser checks dragged the plan's top-left corner and saw only its
  two walls follow, then drew a free-angle triangular room with Any angle.
- Hue operations checkpoint: **148 Home Map Bun tests (811 assertions)
  passed**, including queue validation, one change per room, review copy for
  both kinds, a later failure keeping earlier successes, retry running only
  unresolved work, reconciliation linking an area to the created zone, and the
  runner's command sequence for moving devices out of their old room. Rust
  compiles with `cargo check`. Frontend typecheck, production build, targeted
  ESLint/Prettier passed. Browser checks queued a zone from a room's placed
  lights, read the review, saw a duplicate queueing refused with its reason,
  and removed the change. **The bridge write path itself is not verified
  here**: creating a zone and moving devices need the desktop app and a real
  bridge, and were exercised only through an injected fake.
- Floor scope checkpoint: **140 Home Map Bun tests (783 assertions) passed**,
  including exact floor scope, off-floor and unplaced members disabling the
  action, shared targets counted once, and offline, loading, unlinked, and
  sync-excluded states. Frontend typecheck, targeted ESLint/Prettier passed.
  Browser checks saw the action disabled with its reason, placed the last
  light, saw it become "All off · 10 on", used it, and saw it disable again
  with nothing on. Browser review found two defects: a singular count reading
  "1 light ... are not placed", and the toolbar overflowing the window at
  660 px because its button group could not wrap. Both are fixed, and the
  narrow layout was rechecked in light theme with no horizontal page scroll.
- Floors checkpoint: **134 Home Map Bun tests (762 assertions) passed**,
  including adding, renaming, and removing floors, the removal summary, and
  the refusal to remove the last floor. Frontend typecheck, targeted
  ESLint/Prettier passed. Browser checks added a floor, drew its first room at
  the default scale, renamed the floor and saw the picker and canvas label
  follow, and removed it through the confirmation, which named the room it
  took with it. Browser review found an empty floor opening at 1000% zoom and
  a wall panel claiming a room existed; both are fixed.
- Measured checkpoint: **131 Home Map Bun tests (742 assertions) passed**,
  including measuring an unmeasured wall, anchor choice, reusing an existing
  measurement, a locked length refusing a conflicting entry until released,
  and calibration rescaling geometry and markers. Frontend typecheck, targeted
  ESLint/Prettier passed. Browser checks set a scale on the sketch preview
  (10 m read as 8 m, the map became measured with dimensions shown), entered
  an exact 9.5 m length on another wall, saw a move refused by a kept length,
  and completed it after releasing that length. Browser review found the
  refusal named a length the selected wall's own Release could not clear;
  every kept length is now listed with its own Release.
- Placement checkpoint: **125 Home Map Bun tests (705 assertions) passed**,
  including placing, moving between floors, rejected floors and coordinates,
  unplacing, and locating a marker's area. Frontend typecheck, targeted
  ESLint/Prettier passed. Browser checks placed an unplaced light by clicking,
  saw the progress line move from 12 to 13, dragged a marker with a live
  preview and a committed drop, removed a marker, and dragged one into another
  room to confirm the tray discloses that its Hue target has not changed.
  Identify calls the existing native signal and was not exercised against
  hardware.
- Rooms checkpoint: **120 Home Map Bun tests (681 assertions) passed**,
  including rename, link and unlink, rejected non-Hue references, and removal
  that drops only the geometry. Frontend typecheck, targeted ESLint/Prettier
  passed. Browser checks renamed a room and saw the map label follow, divided
  it with two clicks, combined the halves back, changed and cleared the Hue
  link from the picker, and confirmed that combining rooms with no shared wall
  is refused with the reason and no geometry change. Light theme checked.
- Draw tool checkpoint: **117 Home Map Bun tests (658 assertions) passed**,
  including drawn rooms that reuse corners, node a partly shared wall on both
  sides, refuse overlaps and duplicate IDs, and stay separate when drawn away
  from other rooms. Frontend typecheck, targeted ESLint/Prettier passed.
  Browser checks drew a detached room and a room flush against an existing
  wall, and confirmed the second became a shared boundary in the wall list;
  an overlapping attempt was refused with the reason and no geometry change.
- Direct-manipulation checkpoint: **113 Home Map Bun tests (643 assertions)
  passed**, including viewport, snapping, and corner-drag units. Frontend
  typecheck, targeted ESLint/Prettier passed. Browser checks drove the canvas
  with real pointer events: corner drags moving both walls, wall drags,
  background pan, wheel zoom holding the point under the pointer, zoom and Fit
  controls, grid and snapping toggles with persisted settings, alignment
  guides, and keyboard moves. Browser review found two defects: a dropped first
  pointer move on fast drags, since a pointermove can arrive before React
  commits state, now held in refs; and a crash in the snapping menu from a menu
  label outside a group. Durable draft writes still require the desktop app.
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
