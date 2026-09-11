---
name: Mote Home Map
description: The finished chunk 5 floor-plan display within Mote's existing desktop UI.
---

# Design System: Mote Home Map

## Overview

This record covers the Home Map display completed on 2026-09-06. It preserves
Mote's neutral surfaces, Geist typography, rounded controls, and quiet selection
states. The floor plan carries the visual emphasis; the room list provides an
equivalent way to select and inspect a room.

Scope follows [implementation progress](../../../docs/home-map-progress.md):
published-map display and an explicitly labeled, synthetic DEV preview. Drawing,
editing, light placement, and inline lighting controls remain deferred. The
preview is excluded from production and never saved.

## Colors

Use the existing theme tokens in [App.css](../../App.css); this feature defines
no separate palette. Canvas framing uses the muted surface and border tokens.
Unselected rooms use the off-tile surface; selected rooms use a subtle primary
fill and foreground outline. The matching list row uses the selection surface.

Shared walls use foreground at 50% opacity (`stroke-foreground/50`) and a fixed
stroke width (1.5px). This is the finished wall-legibility correction: keep room
boundaries readable against both themes. Labels use foreground, with unselected
labels slightly softened; secondary details use muted foreground.

## Typography

Use the inherited **Geist Variable, sans-serif** stack. Room labels remain
medium weight at a fixed screen size (14px) while zooming. Labels are placed
inside their room, reserve wall padding, and truncate by Unicode code point with
an ellipsis; omit a label when there is insufficient safe width. The accessible
room name remains complete.

List names use medium body text (14px), counts and dimensions use small text
(12px), section headings use 16px, and the selected-room heading uses 20px.
Dimensions and the zoom readout use tabular numerals. Selected-room names wrap;
list names truncate.

## Layout

At viewport widths of at least 1000px, a flexible canvas sits beside a 240px
room list with a 24px gap. Below that breakpoint, the list stacks below the
canvas; it uses two columns from 750px through 999px. Toolbar controls wrap.

Canvas height is the smaller of 64vh and 720px, with a 400px minimum. Zoomed
content scrolls within the canvas. Floor selection and layer toggles sit above;
the compact zoom group stays at the lower right. Room details sit below the
list, separated by a fine divider.

Editing takes over the window, like the entertainment placement editor. The
plan fills the whole content area and runs behind a floating panel, so it can
be panned across the full editor instead of being clipped. Everything that floats sits in one bar, 24px from the bottom and centred on
the workspace the panel leaves visible: floor and layer controls, the tools,
snapping, and undo. Nothing else floats over the plan — app-wide controls such
as feedback live in the title bar, so the work area stays clear at every window
width. The chosen tool carries its name beside its icon; the rest stay icons. Zoom lives at the top right of the
panel as a readout that opens its own menu — zoom in, out, to fit, and to 50,
100 or 200 per cent — as drawing tools usually place it. Guidance appears at the top, centred on the
same strip rather than on the window. The panel is a 320px card inset by 24px
right and bottom (`2xl:w-88`), starting below the ruler strip so its clear space
above matches the space below. It scrolls its own content with a pinned footer. A small floating bar at the top left holds
the floor picker and the dimensions toggle, the tools sit in a floating pill
centred at the bottom, and the zoom group keeps the lower right. Rulers run
along the top and left edges in the map's units.

Creating a map uses the same shell: a full-bleed work area with the editor's
grid and rulers, the title at the top left, shape and snapping at the top
right, and a floating settings panel whose footer pins Create map and Cancel.
The preview refits whenever the shape changes, so the outline is always framed.
A drawn plan is stored from its first corner, normalised when the outline
closes rather than by moving the work area under the pointer. Each pending wall
carries its length until the corner is placed.

Nothing is hidden: every tool states its keys in the hint above the plan — Esc
cancels or clears, Enter finishes an outline, Backspace removes the last corner,
Shift keeps a dragged wall square, arrow keys nudge a selected wall — and a
quiet line at the bottom right of the work area says drag to pan and scroll to
zoom.

Grid and ruler steps come from one ladder of round values (5 cm to 100 m), so
lines land on whole metres at every zoom instead of drifting with the snap
increment.

## Elevation & Depth

Tonal surfaces and borders establish the canvas and selection. The zoom group
uses the existing small shadow to read above the plan. Preserve this restrained
depth treatment.

## Shapes

The canvas uses Mote's large rounded corners, list rows use smaller rounded
corners, and the zoom group is a pill. Rooms may take any shape, including
angled walls and triangles; snapping offers 90, 45, and 15 degree steps and a
free angle. Walls
have rounded line ends and shared segments render once. Light markers are
fixed-size circles (5px radius) with a background fill and foreground outline
(2px); they indicate placement and are not individual light controls.

A marker stands for a fixture, not a bulb. Some products are one Hue device
carrying several light services, so a three-head spot bar is one device and one
marker. Others — a Centris plate, a run of downlights — register every spot as
its own device, and those are joined back up by what they are and where they
are: the same fixed archetype (spot, ceiling, downlight, pendant), the same Hue
room or zone, and a name that starts the same way for two words. Portable lamps,
light strips and Play bars are never joined, however they are named. A joined
product takes the shared start of its heads' names ("Hue Centris"), places,
moves and removes as one marker, and draws a filled dot inside its ring to say
it carries several bulbs. The guess is always reversible: a joined row offers
Split, a split row offers to group back, and the map records either decision in
`fixtures` so it survives a reload. Membership still decides what a control
affects; the marker only says where the product is.

Editor handles are told apart by shape, not only by size: corners are small
squares, the dashed circle on a wall adds a corner, and lights stay circles.
Handles belong to their tools — Move shows corners and walls, Place lights
shows markers alone — so the plan is never covered in dots that mean different
things. Move keeps one dashed circle for the wall under the pointer instead of
one on every wall, so a dot always means "add a corner here" and the wall
itself always means "drag this wall".

## Components

- **Navigation:** Dashboard / Map and the last selected floor and room are
  remembered per bridge. Saved floor selection clears the current room.
- **Move:** One tool covers reshaping. Dragging a wall carries it in any
  direction, not only straight out from itself; Shift restores the square move,
  and the arrow keys still nudge by the snap increment. A corner within reach
  pulls the wall onto it, and releasing there welds the two into one shared
  corner. A corner the wall passes leaves the room whose boundary no longer
  reaches it and joins the room that grew over it: a point is not a wall, so
  meeting one never ends a drag. Hovering a wall reveals the dashed circle that
  adds a corner; the corner can be dragged straight out of that same press.
- **Room selection:** Map polygons and list buttons expose the same pressed
  state. Enter or Space selects a focused polygon. Clicking blank canvas,
  pressing Escape within the canvas, or using Clear room selection clears it.
  Keep focus visibly distinct from selection.
- **Entry points:** The map screen names both ways into the editor. Edit map
  opens it on Move for walls and rooms; Place lights opens it on the light tray
  and counts the fixtures still missing from the map ("Place lights · 3 left"),
  so lights are never something the user has to find inside a wall editor.
- **Fixture tray:** Place fixtures opens a 320px palette docked to the right
  edge, in the same column the create-map panel uses. It runs the full height
  of the grid — the top inset clears the ruler strip, the bottom matches it,
  since only the top edge carries a ruler — and scrolls its own list, while the
  tool bar, the map controls and the framed plan all step clear of the strip it
  claims. It never floats over the middle of the plan, because the plan is
  where the fixture is going. Rows sit under their placement bucket (Not
  placed, On this floor, On other floors) and, within it, under the Hue room or
  zone that controls them, so the space is named once instead of on every row.
  A whole row is the grab target: the leading bulb becomes a grip under the
  pointer, so the affordance is the row, not a handle. Hover raises the row
  surface and its hairline; selection adds the selection surface, a 2px
  selection border, and the line that says to click the map.
- **Taking a fixture off the map:** dragging a placed marker, or its tray row,
  turns the tray itself into the bin: a dashed overlay reading "Drop here to
  remove <name> from the map" covers it, and arms in the destructive colour
  once the pointer is inside. One drag carries the whole product, so a
  multi-head fixture leaves as one marker and every bulb with it. The row keeps
  its own remove button for anyone who would rather click.
- **Layers:** Lights and Dimensions expose pressed states. Lights start visible;
  dimensions start visible for measured maps. Dimension labels show meters or
  feet with a background stroke for legibility and rotate along vertical walls.
- **Zoom:** Minus and plus step from 1× to 3× in 0.5× increments. Disable the
  corresponding control at each limit. Fit floor restores 1× and resets scrolling.
- **Details:** Show room name and area, marking sketch areas approximate. Valid
  linked Hue spaces open their existing control screen. Missing links and the
  synthetic preview have explicit explanatory copy.
- **Unavailable maps:** Loading, failure, draft-only, and empty states remain
  explicit, with a path back to Dashboard. Empty state does not imply that an
  editor is available.

## Do's and Don'ts

- **Do** retain fixed-size labels, dimensions, markers, and wall strokes during
  zoom and preserve readable shared boundaries in light and dark themes.
- **Do** keep map and list selection synchronized and keyboard accessible.
- **Don't** present synthetic preview content as the user's home or live lights.
- **Don't** describe deferred drawing or inline controls as shipped behavior.
