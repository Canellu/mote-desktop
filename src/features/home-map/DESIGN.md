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

Editing puts the plan at the centre. The canvas grows to `min(74vh, 860px)`,
rulers run along its top and left edges in the map's units, the tools sit in a
floating pill centred at the bottom of the canvas, and the zoom group keeps the
lower right. The header keeps only the floor picker, layer toggles, and Done
editing. The right panel is a single full-height column that changes with what
is selected: floor, room or point, light tray, and wall list.

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

Editor handles are told apart by shape, not only by size: corners are small
squares, the dashed circles between them add a corner, and lights stay circles.
Corner and midpoint handles belong to their tools — Select shows corners and
walls, Points adds the dashed midpoints, and Place lights shows markers alone —
so the plan is never covered in dots that mean different things.

## Components

- **Navigation:** Dashboard / Map and the last selected floor and room are
  remembered per bridge. Saved floor selection clears the current room.
- **Room selection:** Map polygons and list buttons expose the same pressed
  state. Enter or Space selects a focused polygon. Clicking blank canvas,
  pressing Escape within the canvas, or using Clear room selection clears it.
  Keep focus visibly distinct from selection.
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
