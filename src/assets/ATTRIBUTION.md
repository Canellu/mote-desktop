# Bundled image attribution

Every bitmap in this directory must appear here with its source and licence, per
AGENTS.md. Mote Desktop is a paid product, so an image without a clear
commercial-use licence is a liability rather than a shortcut.

Both paywall images are natural light: the same subject at night and at dawn,
which is the product described without a screenshot of it.

## `pro-hero-dark.webp`

- **Source**: <https://unsplash.com/photos/northern-lights-over-snow-capped-mountian-LtnPejWDSAY>
- **Author**: Lightscape on Unsplash. Shot in Tromsø, Norway.
- **Licence**: Unsplash License — free to use, including commercially,
  attribution optional. Recorded here anyway so the provenance survives.
- **Modifications**: resized to 1600px wide and re-encoded as WebP.

## `pro-hero-light.webp`

- **Source**: <https://unsplash.com/photos/soft-pink-and-orange-clouds-in-a-pastel-sky-A3u8Ugv1EAw>
- **Author**: Scott Goodwill on Unsplash
- **Licence**: Unsplash License — as above.
- **Modifications**: cropped to the upper band of cloud, lightly saturated,
  resized to 1600px wide and re-encoded as WebP. The crop matters: the lower
  third of the original is near-white sky, which filled half the dialog with
  nothing once it was used as a background.

## `mascot/moth-*.webp`

- **Source**: Mote's own moth mascot, generated for Mote Desktop with an image
  generation tool from the approved Dusk moth concept. Prompts and originals
  are in `output/moth-styles-2026-09-22/`.
- **Author**: Mote Desktop.
- **Licence**: owned by Mote Desktop for use in the product.
- **Modifications**: background cut out to transparency, floor shadows
  removed, cropped and resized to 256px, re-encoded as WebP, by
  `output/moth-12-frame-2026-10-30/pack_mascot.py`.
- **Watercolor static image update (2026-10-31)**: regenerated with the built-in
  image generation tool using the original icon and the approved animation
  sheet's first open-wing resting pose as references, repairing clipped wing
  contours. Original output and prompt are in
  `output/moth-watercolor-cleanup-2026-10-31/`. Resized inside a transparent
  256px square and encoded as lossless WebP; animation sheet unchanged.

## `mascot/moth-*-sheet.webp`

- **Source**: Mote's own moth mascot animations (idle, flutter, blink, glow,
  six poses each), generated for Mote Desktop with ChatGPT's image generation
  from the approved moth styles, on transparent backgrounds. Prompts and the
  sheets are in `output/moth-sheets-24-frame-2026-10-30/`.
- **Author**: Mote Desktop.
- **Licence**: owned by Mote Desktop for use in the product.
- **Modifications**: each animation's six poses played forward then back to
  twelve frames, every frame cropped to one shared box, resized to 160px and
  packed six to a row, by `output/moth-12-frame-2026-10-30/pack_mascot.py`
  (`--sheets`).
