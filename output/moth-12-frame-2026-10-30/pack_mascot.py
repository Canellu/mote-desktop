"""Packs the mascot assets for the widget.

usage: python pack_mascot.py <frames dir> <stills dir> <assets dir>
       python pack_mascot.py <frames dir> <stills dir> <assets dir> --export <dir>
       python pack_mascot.py <frames dir> <stills dir> <assets dir> --cleaned <dir>
       python pack_mascot.py <frames dir> <stills dir> <assets dir> --sheets <dir>

--export writes each style's distinct poses, cut out at full size, plus a
manifest, for cleaning by hand. --cleaned packs the sheets from such a folder
once it comes back, instead of cutting the frames out again. --sheets packs
transparent 6x4 sheets of 384px cells instead (one row per animation, six
frames played forward then back), such as `output/moth-sheets-24-frame-*/`;
a `<style>-v2.png` there wins over `<style>.png`.

<frames dir> is this folder: the 12-frame sets, packed into one transparent
WebP sprite sheet per style. <stills dir> holds the original single drawings
(`output/moth-styles-2026-09-22/`), cut out as the Settings picker's stills.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

FRAMES = Path(sys.argv[1])
STILLS = Path(sys.argv[2])
OUT = Path(sys.argv[3])
MODE, HAND = (sys.argv[4], Path(sys.argv[5])) if len(sys.argv) > 5 else (None, None)
CELL = 160
STILL = 256
COLS = 6
NAMES = ["idle", "flutter", "blink", "glow"]
STYLES = {
    "01-low-poly": "low-poly",
    "02-pixel-art": "pixel-art",
    "03-cel-shaded": "cel-shaded",
    "04-paper-cutout": "paper-cutout",
    "05-watercolor": "watercolor",
}
# Background is what's within this distance of the paper colour, on top of
# the paper's own noise. Tight, because the cream head is close to it.
MARGIN = 8.0
# Bridges narrower than this many pixels are cut, so a pale highlight touching
# the edge can't carry the background into the head.
BRIDGE = 1
# Only this ring of pixels next to the background is feathered.
RING = 2
SOFT = 40.0


def fill_from_border(mask: np.ndarray) -> np.ndarray:
    # Padded with a ring of background, so one fill from a corner reaches
    # every border-touching region. Copied: fromarray can share a read-only
    # buffer, and the fill would silently do nothing.
    image = Image.fromarray(np.pad(mask, 1, constant_values=True).astype(np.uint8) * 255, "L").copy()
    ImageDraw.floodfill(image, (0, 0), 128)
    return np.asarray(image)[1:-1, 1:-1] == 128


def morph(mask: np.ndarray, size: int, grow: bool) -> np.ndarray:
    image = Image.fromarray(mask.astype(np.uint8) * 255, "L")
    image = image.filter(ImageFilter.MaxFilter(size) if grow else ImageFilter.MinFilter(size))
    return np.asarray(image) > 127


def cut_out(frame: Image.Image, ring_px: int = RING, soft: float = SOFT) -> np.ndarray:
    rgb = np.asarray(frame.convert("RGB"), dtype=np.float32)
    edge = np.concatenate([rgb[:8].reshape(-1, 3), rgb[-8:].reshape(-1, 3), rgb[:, :8].reshape(-1, 3), rgb[:, -8:].reshape(-1, 3)])
    paper = np.median(edge, axis=0)
    dist = np.linalg.norm(rgb - paper, axis=2)
    hard = np.percentile(np.linalg.norm(edge - paper, axis=1), 99) + MARGIN
    background = fill_from_border(dist < hard)
    size = 2 * BRIDGE + 1
    background = fill_from_border(morph(morph(background, size, False), size, True) & background)
    ring = morph(background, 2 * ring_px + 1, True) & ~background
    alpha = np.ones(dist.shape, dtype=np.float32)
    alpha[background] = 0
    alpha[ring] = np.clip((dist[ring] - hard) / (soft - hard), 0, 1)
    # Take the paper back out of the half-transparent fringe.
    a = np.maximum(alpha, 1e-3)[..., None]
    color = np.clip((rgb - paper * (1 - a)) / a, 0, 255)
    rgba = np.dstack([color, alpha * 255]).round().astype(np.uint8)
    rgba[alpha <= 0] = 0
    return rgba


# The generator leaves a pale rim, a pixel or two wide, outside each outline.
# Rim pixels are bright and nearly grey; the outlines inside them are dark.
PEEL_STEPS = 2
PALE_LUMA = 185.0
PALE_CHROMA = 45.0
# Near-grey whites, such as the paper caught between the antennae, peel much
# deeper. The cream head is warmer than this, so it stays.
WHITE_STEPS = 10
WHITE_LUMA = 228.0
WHITE_CHROMA = 22.0
EDGE_SOFTEN = 0.6


def cut_out_clean(frame: Image.Image) -> np.ndarray:
    """`cut_out`, then the pale rim peeled off layer by layer from the outside.

    A dark outline stops the peel, so outlined parts keep their shape; an
    unoutlined cream head loses at most `PEEL_STEPS` pixels of its edge.
    """
    rgb = np.asarray(frame.convert("RGB"), dtype=np.float32)
    rgba = cut_out(frame)
    luma = rgb.mean(axis=2)
    chroma = rgb.max(axis=2) - rgb.min(axis=2)
    pale = (luma > PALE_LUMA) & (chroma < PALE_CHROMA)
    gone = rgba[..., 3] == 0
    for _ in range(PEEL_STEPS):
        gone |= morph(gone, 3, True) & pale
    white = (luma > WHITE_LUMA) & (chroma < WHITE_CHROMA)
    for _ in range(WHITE_STEPS):
        gone |= morph(gone, 3, True) & white
    # The peel leaves a hard edge; a slight blur of the mask anti-aliases it.
    # Only ever lowers alpha, so nothing peeled comes back as a pale rim.
    kept = Image.fromarray((~gone).astype(np.uint8) * 255, "L")
    soft = np.asarray(kept.filter(ImageFilter.GaussianBlur(EDGE_SOFTEN)), dtype=np.float32)
    alpha = np.minimum(rgba[..., 3].astype(np.float32), soft)
    alpha[gone] = 0
    out = rgba.copy()
    out[..., 3] = alpha.round().astype(np.uint8)
    out[gone] = 0
    return out


def only_moth(rgba: np.ndarray, source: Image.Image) -> np.ndarray:
    """Drops the floor shadow and anything else not joined to the moth."""
    rgb = np.asarray(source.convert("RGB"), dtype=np.float32)
    paper = np.median(rgb[:8].reshape(-1, 3), axis=0)
    # A shadow is the paper, darker: the same hue at a lower brightness. Only
    # looked for in the lower part, where the shadow falls and no cream head is.
    unit = rgb / np.maximum(np.linalg.norm(rgb, axis=2, keepdims=True), 1)
    paper_unit = paper / np.linalg.norm(paper)
    paper_hued = (unit @ paper_unit) > 0.998
    ys, _ = np.where(rgba[..., 3] > 8)
    lower = np.arange(rgb.shape[0])[:, None] > ys.min() + (ys.max() - ys.min()) * 0.7
    rgba = rgba.copy()
    rgba[paper_hued & lower] = 0
    solid = rgba[..., 3] > 8
    ys, xs = np.where(rgba[..., 3] == 255)
    # The opaque pixel nearest the middle of the drawing is on the moth.
    cy, cx = np.mean(ys), np.mean(xs)
    seed = np.argmin((ys - cy) ** 2 + (xs - cx) ** 2)
    image = Image.fromarray(solid.astype(np.uint8) * 255, "L").copy()
    ImageDraw.floodfill(image, (int(xs[seed]), int(ys[seed])), 128)
    keep = np.asarray(image) == 128
    rgba[~keep] = 0
    return rgba


def square_box(masks: list[np.ndarray], pad: int) -> tuple[int, int, int, int]:
    ys, xs = np.where(np.any(np.stack(masks), axis=0))
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    side = max(xs.max() - xs.min(), ys.max() - ys.min()) + pad
    return tuple(int(round(v)) for v in (cx - side / 2, cy - side / 2, cx + side / 2, cy + side / 2))


def pack_frames(frames: list[np.ndarray], slug: str, resample) -> None:
    # One crop for every frame, so the moth never shifts between them.
    box = square_box([f[..., 3] > 8 for f in frames], 8)
    rows = -(-len(frames) // COLS)
    sheet = Image.new("RGBA", (COLS * CELL, rows * CELL), (0, 0, 0, 0))
    for i, rgba in enumerate(frames):
        cell = Image.fromarray(rgba, "RGBA").crop(box).resize((CELL, CELL), resample)
        sheet.paste(cell, ((i % COLS) * CELL, (i // COLS) * CELL))
    sheet.save(OUT / f"moth-{slug}-sheet.webp", "WEBP", quality=88, method=6)


def pack_still(folder: str, slug: str, resample) -> None:
    # A wider soft edge than the frames: the originals glow onto the paper
    # around the antenna tips, which a hard edge leaves as pale blobs.
    original = Image.open(STILLS / f"{folder}.png")
    still = only_moth(cut_out(original, ring_px=14, soft=90.0), original)
    box = square_box([still[..., 3] > 8], 24)
    Image.fromarray(still, "RGBA").crop(box).resize((STILL, STILL), resample).save(
        OUT / f"moth-{slug}.webp", "WEBP", quality=90, method=6
    )


for folder, slug in STYLES.items():
    resample = Image.NEAREST if slug == "pixel-art" else Image.LANCZOS

    if MODE == "--sheets":
        sheet_file = HAND / f"{folder}-v2.png"
        if not sheet_file.exists():
            sheet_file = HAND / f"{folder}.png"
        source = np.asarray(Image.open(sheet_file).convert("RGBA"))
        size = 384
        frames = []
        for row in range(len(NAMES)):
            poses = [
                source[row * size : (row + 1) * size, col * size : (col + 1) * size].copy()
                for col in range(6)
            ]
            # Half cycles: forward, then back, so the last frame meets the first.
            frames += poses + poses[::-1]
        pack_frames(frames, slug, resample)
        pack_still(folder, slug, resample)
        print(slug, "ok from", sheet_file.name)
        continue

    src = FRAMES / folder
    atlas = json.loads((src / "atlas.json").read_text())
    keys = [key for name in NAMES for key in atlas["animations"][name]["frames"]]
    # Frames played forward then back reuse a pose; each pose is one file.
    pose_file: dict[int, str] = {}
    for key in keys:
        pose_file.setdefault(atlas["frames"][key]["sourcePose"], f"{key}.png")
    file_of = {key: pose_file[atlas["frames"][key]["sourcePose"]] for key in keys}

    if MODE == "--export":
        target = HAND / folder
        target.mkdir(parents=True, exist_ok=True)
        for name in sorted(set(file_of.values())):
            Image.fromarray(cut_out_clean(Image.open(src / name)), "RGBA").save(target / name)
        (target / "manifest.json").write_text(json.dumps(file_of, indent=2))
        print(slug, len(set(file_of.values())), "poses exported")
        continue

    if MODE == "--cleaned":
        size = Image.open(src / f"{keys[0]}.png").size
        frames = []
        for key in keys:
            cleaned = Image.open(HAND / folder / file_of[key]).convert("RGBA")
            # Kept on the same canvas, so every pose stays where it was drawn.
            if cleaned.size != size:
                raise SystemExit(f"{folder}/{file_of[key]} is {cleaned.size}, expected {size}")
            frames.append(np.asarray(cleaned).copy())
    else:
        frames = [cut_out_clean(Image.open(src / f"{key}.png")) for key in keys]
    pack_frames(frames, slug, resample)
    pack_still(folder, slug, resample)
    print(slug, "ok")
