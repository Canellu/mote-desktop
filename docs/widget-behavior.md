# Widget behavior

How a desktop widget shows its background ("shell") and title bar, and how it
collapses and expands. The code is `src/features/widget-screen/WidgetScreen.tsx`.

## Shell and title bar

| Widget | Shell (background, border, shadow) | Title bar buttons |
| --- | --- | --- |
| Unpinned | Always shown | Always shown |
| Pinned, at rest | Hidden: the cards float bare | Hidden |
| Pinned, top edge hovered or focused | Shown | Shown |
| Pinned, just expanded from its collapsed look | Shown until the pointer leaves the widget | Only on top edge hover |
| Connecting to the bridge | Shown, so the window isn't an empty floating line of text | — |
| Folding or unfolding | Shown, so the shell morphs into the pill | — |

Hovering the cards of a pinned widget never brings the shell up. Pinning is
for people who keep a widget on the desktop permanently, and the widget should
stay quiet there.

An unfold is the one exception: the shell grows out of the moth, pill or
bubble, so dropping it the moment the animation ends would flash the
background away under the pointer. It stays until the pointer leaves, and
from then on the widget behaves like any pinned widget.

Whether the pointer is anywhere on the widget still matters for auto collapse,
which waits for it to leave. It does not affect what's drawn.

## Collapsing and expanding

The user-facing words are **Collapse** and **Expand**: the title bar's
"Collapse widget" button, "Expand <name>" on the collapsed widget, and the
**Expand direction** setting. Avoid "open" and "close" for this: Close
removes the widget.

- **Collapsed looks**: Mascot (the moth), Pill (icon and name), Bubble (icon).
- **Collapse**: the shell shrinks into its collapse corner inside the
  full-size window. The collapsed look fades in as the shell leaves, then the
  window is clipped to it (`SetWindowRgn`). The window never shrinks: a
  resized WebView2 shows its last frame pinned to the window's top-left for a
  frame, which made a moth in any other corner blink out as it landed.
  Outside the clip nothing is drawn and clicks reach whatever is behind.
- **While collapsed** the window keeps the open widget's size, placed so the
  collapsed look sits in its collapse corner. The stored collapsed position is
  the look's own spot on screen, not the window's.
- **Expand**: the collapsed look is hidden first, the clip comes off, and the
  window moves only if it has to expand the other way. A held copy of the
  look (the "ghost") stands in while the shell grows out of the corner.
- **Expand direction** is a preference. The backend flips each axis when there
  is no room on the screen that way.

## The mascot

Sprite sheets live in `src/assets/mascot/`. Every style has the same four
animations of twelve frames each, defined in `mascot.ts`:

| Animation | When |
| --- | --- |
| `breathe` | At rest, looping: a slow, roughly 3 s glow |
| `blink` | Every 2–7 s of breathing, about ⅓ s; sometimes twice |
| `bob` | Instead of a blink about one time in eight |
| `flutter` | While hovered |

Only a circle over the moth's body takes the pointer, not the padding around
it. The padding is there so the float and flutter stay inside the window.

The sheets are cut by `output/moth-sheets-24-frame-2026-10-30/recut.py` and
packed by `output/moth-12-frame-2026-10-30/pack_mascot.py --sheets`. The cut
follows the gap between neighbouring moths rather than an even grid, because
the generated images don't keep each moth inside its grid square.
