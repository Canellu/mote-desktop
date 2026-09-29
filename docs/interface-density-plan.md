# Interface density plan

Status: **Implemented; not yet released.** Proposed 2026-09-27, built
2026-09-28.

## Why

Feedback (sfmthd, 2026-09) asked to see a much longer column of lights in a
narrow window and pointed at the empty space in the main interface. Two
settings answer it, both free and main-window only:

- **Interface scale** (Settings → General, Ctrl +/−/0) zooms the whole webview,
  text included.
- **Spacing** (Settings → General): Spacious, Default, or Compact (stored as
  `roomy`, `comfortable`, `compact`). Steps spacing and tile icons up or down
  while text stays the same size.

## How it works

`UiDensityStore` (`src/stores/UiDensityStore.ts`) persists `roomy`,
`comfortable`, or `compact` in `localStorage` key `uiDensity` and applies it
as `data-density` on `document.documentElement` before first paint.
Comfortable sets no attribute.

`src/App.css` defines Comfortable's tokens on `:root` and overrides them under
`:root[data-density="roomy"]` and `:root[data-density="compact"]`. Roomy is the
pre-density look.

Tailwind's base `--spacing` is deliberately untouched: it drives sizes as well
as padding and gaps, so shrinking it would shrink buttons and hit targets while
text stayed the same.

| Token                      | Roomy | Comfortable | Compact | Used by                                                                |
| -------------------------- | ----- | ----------- | ------- | ---------------------------------------------------------------------- |
| `--page-gutter-x`          | 48px  | 36px        | 24px    | Route viewport, banners (`RootLayout`)                                 |
| `--page-gutter-y`          | 24px  | 20px        | 16px    | Route viewport, light side pane padding                                |
| `--section-gap`            | 24px  | 20px        | 16px    | `HomeScreen`, `SpaceScreen` section stacks                             |
| `--tile-min-width`         | 320px | 290px       | 260px   | Home and room light grids                                              |
| `--tile-grid-gap`          | 16px  | 14px        | 12px    | Home room/zone grids                                                   |
| `--light-grid-gap`         | 12px  | 10px        | 9px     | Room light grid, accessory grid                                        |
| `--tile-spacing`           | 16px  | 14px        | 12px    | Tile padding (overrides `Card`'s sm spacing)                           |
| `--tile-inner-gap`         | 24px  | 18px        | 12px    | Header-to-slider gap in `SpaceTile`, `LightCard`                       |
| `--tile-summary-y`         | 20px  | 16px        | 12px    | Home "All lights" card                                                 |
| `--tile-icon-box`          | 48px  | 44px        | 40px    | Tile icon box                                                          |
| `--tile-icon`              | 26px  | 24px        | 22px    | Tile icon glyph                                                        |
| `--tile-radius`            | 16px  | 14px        | 12px    | Tiles, accessory cards, Home and room sections, drop zones             |
| `--section-pad`            | 16px  | 12px        | 8px     | Padding reserved around each Home and room section (edit-mode outline) |
| `--section-header-gap`     | 12px  | 10px        | 8px     | Section heading to its content, Home and room sections                 |
| `--home-section-stack-gap` | 32px  | 24px        | 16px    | Gap between Home sections                                              |

Below a 56rem viewport, `--page-gutter-x` drops to 24px (Roomy), 20px
(Comfortable), and 16px (Compact), so narrow windows lose less width to margins.

Tile grids use `minmax(min(var(--tile-min-width), 100%), 1fr)` so a single
column never overflows a very narrow window.

## Not covered

- Settings screens keep their own spacing.
- The scene rail (`ScenesSection`) computes columns from a fixed 128px tile and
  12px gap in JS, so it is unchanged.
- A one-line compact light row (icon, name, inline slider, switch) is still an
  open idea, pending the reporter's answers.
- The 627px minimum window width is unchanged; lowering it needs the light side
  pane to become an overlay at narrow widths first.
