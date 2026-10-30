# Mascot source assets

Retained inputs for the shipped mascot:

- `moth-styles-2026-09-22/`: original stills and generation prompts.
- `moth-sheets-24-frame-2026-10-30/`: animation source sheets, prompts,
  packing scripts, and validation records.
- `moth-12-frame-2026-10-30/pack_mascot.py`: the asset packer referenced in
  `src/assets/ATTRIBUTION.md`; use `--sheets` with the animation source sheets.
- `low-poly-blink-fix/`: eye correction scripts, their source inputs, and
  validation records. The final sprite sheet is in `src/assets/mascot/`.

Exploratory variants, extracted frames, and rendered previews are not required
to build the app and are kept out of this source set.
