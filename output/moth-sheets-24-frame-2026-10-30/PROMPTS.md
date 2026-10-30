# Moth sprite sheets

Generated with the built-in image_gen tool from the five corresponding references in output/moth-styles-2026-09-22.

## Initial prompt (STYLE_NAME replaced for each reference)
Use case: stylized-concept. Create a production PNG sprite sheet for a desktop mascot using the supplied image as the EXACT character and style reference. Remove the reference's ivory backdrop completely.
Format: exactly 2304 x 1536 pixels; exactly 6 columns x 4 rows; 24 invisible cells of 384 x 384; no gaps, borders, labels, text, checkerboard, paper or ivory background. Real transparent alpha.
In every cell put ONE moth about 170 pixels wide centered at cell-local (192,192), at least 40 pixels clear on every side. All 24 have identical body size, body position, proportions, colors, face, fixed three-quarter view and camera. Never zoom, scale, translate or rotate the body. Exactly FOUR wings, two per side; cream fluffy head, indigo wings, amber abdomen and antenna tips. Match the supplied reference's STYLE exactly: STYLE_NAME.
Rows, six frames left-to-right, intended ping-pong playback:
Row 1 IDLE: only wings lift/lower subtly in six smooth steps; fixed body, eyes and normal amber brightness.
Row 2 FLUTTER: only four wings fold from fully open to nearly closed across six even steps, wing openness 100%,82%,64%,46%,28%,10%. Body, head, eyes and antennae absolutely identical and stationary. Wing span can narrow through folding, never rescale the entire moth.
Row 3 BLINK: only eyelids change: fully open,80%,60%,40%,20%,fully closed. All wings, body, head, antennae and light identical to idle first frame.
Row 4 GLOW: only the amber abdomen and two antenna tips brighten from normal to strongly luminous in six gradual steps. Shape, silhouette, size, wings, face and pose absolutely identical. Express glow through brighter amber inside these regions, no exterior halo or aura.
Edges: clean crisp silhouette with smooth alpha antialiasing (pixel style uses crisp pixel edges), no white/pale rim, fringe, sticker border, drop shadow or floor shadow. Every gap between antennae and head must be fully transparent. Watercolour/paper textures belong only inside the moth, never in background. No extra appendages or extra wings.
Prioritize exact uniform registration, four wings, true empty alpha background and correct 24-cell layout.

## Cleanup pass
Preserve all 24 poses and the reference style. Remove external haze, aura, glow spill, shadows and backdrop; use zero alpha outside the physical moth, including antenna gaps. Keep amber brightness internal to the abdomen and antenna tips. Register heads and bodies consistently; preserve four wings and row animation order.

## Packaging
One uniform scale per style, translation registered to the cream head, 384px cells on a 2304x1536 transparent canvas. Pixel art uses nearest-neighbour resampling.
