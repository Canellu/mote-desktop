"""Re-cuts the 6x4 sheets from the generated images without slicing wings.

usage: python recut.py

`pack.mjs` cut each pose out on an even grid, but the generator doesn't keep
every moth inside its grid square, so wings crossing a grid line were sliced
off flat. This cuts along the emptiest seam near each grid line instead,
through the thinnest point where two moths touch, and otherwise lays the
sheets out as `pack.mjs` did: one scale per style, each pose placed by its
head so the moth doesn't jump between frames. Run `fix-pixel-idle.mjs` after
it to rebuild `02-pixel-art-v2.png`.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

DIR = Path(__file__).parent
CELL = 384
# How far from a grid line a seam may wander.
REACH = 70
# The window around each grid square a pose is cut from.
PAD = 90


def seam(cost: np.ndarray) -> np.ndarray:
    """The cheapest top-to-bottom path through `cost`, moving at most one
    column per row. Returns the column for each row."""
    h, w = cost.shape
    total = cost.astype(np.float64).copy()
    for y in range(1, h):
        prev = total[y - 1]
        best = np.minimum(prev, np.minimum(np.r_[np.inf, prev[:-1]], np.r_[prev[1:], np.inf]))
        total[y] += best
    path = np.empty(h, dtype=int)
    path[-1] = int(np.argmin(total[-1]))
    for y in range(h - 2, -1, -1):
        x = path[y + 1]
        lo, hi = max(0, x - 1), min(w, x + 2)
        path[y] = lo + int(np.argmin(total[y, lo:hi]))
    return path


def head(rgba: np.ndarray, top: float, bottom: float) -> tuple[float, float]:
    """The cream head's centre, as `pack.mjs` finds it."""
    r, g, b, a = (rgba[..., i].astype(float) for i in range(4))
    ys = np.arange(rgba.shape[0])[:, None]
    cream = (ys > top) & (ys < bottom) & (a > 200) & (r > 170) & (g > 140) & (b > 90) & (r > b * 1.12) & (g > b * 1.07)
    yy, xx = np.nonzero(cream)
    if not len(xx):
        return rgba.shape[1] / 2, (top + bottom) / 2
    return float(xx.mean()), float(yy.mean())


def largest_part(rgba: np.ndarray) -> np.ndarray:
    """Keeps the biggest connected shape, plus a 2px rim, as `pack.mjs` did."""
    solid = rgba[..., 3] > 32
    h, w = solid.shape
    seen = np.zeros_like(solid)
    main: list[int] = []
    flat = solid.ravel()
    seen_flat = seen.ravel()
    for start in np.flatnonzero(flat):
        if seen_flat[start]:
            continue
        seen_flat[start] = True
        group = [int(start)]
        for q in group:
            y, x = divmod(q, w)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w:
                        p = ny * w + nx
                        if flat[p] and not seen_flat[p]:
                            seen_flat[p] = True
                            group.append(p)
        if len(group) > len(main):
            main = group
    if not main:
        return rgba
    mask = np.zeros(h * w, dtype=np.uint8)
    mask[main] = 255
    grown = Image.fromarray(mask.reshape(h, w), "L").filter(ImageFilter.MaxFilter(5))
    keep = np.asarray(grown) > 0
    out = rgba.copy()
    out[~keep] = 0
    return out


def cut(source: np.ndarray) -> list[dict]:
    h, w = source.shape[:2]
    cw, ch = w / 6, h / 4
    cost = source[..., 3].astype(np.float64)
    # Row seams run left to right: the same search on the transpose.
    rows = [np.zeros(w, dtype=int)]
    for r in range(1, 4):
        g = int(r * ch)
        rows.append(g - REACH + seam(cost[g - REACH : g + REACH].T))
    rows.append(np.full(w, h))
    cells = []
    xs = np.arange(w)
    ys = np.arange(h)[:, None]
    for r in range(4):
        band = (ys >= rows[r][None, :]) & (ys < rows[r + 1][None, :])
        cols = [np.zeros(h, dtype=int)]
        for c in range(1, 6):
            g = int(c * cw)
            local = np.where(band[:, g - REACH : g + REACH], cost[:, g - REACH : g + REACH], 0)
            cols.append(g - REACH + seam(local))
        cols.append(np.full(h, w))
        for c in range(6):
            region = band & (xs[None, :] >= cols[c][:, None]) & (xs[None, :] < cols[c + 1][:, None])
            x0, y0 = max(0, int(c * cw) - PAD), max(0, int(r * ch) - PAD)
            x1, y1 = min(w, int((c + 1) * cw) + PAD), min(h, int((r + 1) * ch) + PAD)
            window = source[y0:y1, x0:x1].copy()
            window[~region[y0:y1, x0:x1]] = 0
            window = largest_part(window)
            yy, xx = np.nonzero(window[..., 3] > 127)
            gy = r * ch - y0  # the grid square's top, in window pixels
            ax, ay = head(window, gy + ch * 0.2, gy + ch * 0.55)
            cells.append(
                {"rgba": window, "left": xx.min(), "right": xx.max(), "top": yy.min(), "bottom": yy.max(), "ax": ax, "ay": ay}
            )
    return cells


def main() -> None:
    report = []
    for entry in json.loads((DIR / "sources.json").read_text()):
        name = entry["name"]
        source = np.asarray(Image.open(entry["source"]).convert("RGBA"))
        cells = cut(source)
        base = cells[0]
        scale = 170 / max(c["right"] - c["left"] + 1 for c in cells[:6])
        target_x = 192 + (base["ax"] - (base["left"] + base["right"]) / 2) * scale
        target_y = 192 + (base["ay"] - (base["top"] + base["bottom"]) / 2) * scale
        resample = Image.NEAREST if "pixel" in name else Image.LANCZOS
        sheet = Image.new("RGBA", (6 * CELL, 4 * CELL), (0, 0, 0, 0))
        tight = []
        for i, c in enumerate(cells):
            image = Image.fromarray(c["rgba"], "RGBA")
            size = (round(image.width * scale), round(image.height * scale))
            image = image.resize(size, resample)
            # Laid on its own cell, so a pose can never spill into the next.
            frame = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
            frame.alpha_composite(image, (round(target_x - c["ax"] * scale), round(target_y - c["ay"] * scale)))
            alpha = np.asarray(frame)[..., 3]
            yy, xx = np.nonzero(alpha > 8)
            margin = min(xx.min(), yy.min(), CELL - 1 - xx.max(), CELL - 1 - yy.max())
            if margin < 4:
                tight.append((i, int(margin)))
            sheet.paste(frame, ((i % 6) * CELL, (i // 6) * CELL))
        sheet.save(DIR / f"{name}.png")
        report.append({"file": f"{name}.png", "uniformScale": scale, "cellsNearEdge": tight})
        print(name, "scale", round(scale, 3), "cells near edge:", tight or "none")
    (DIR / "validation.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
