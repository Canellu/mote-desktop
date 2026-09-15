"""Paints candidate backdrops for the Store screenshots and trailer.

Each is procedural, 1920 x 1080, and built from the website's palette in
mote-website/DESIGN.md: graphite night, with Hue light (amber, orange, coral,
magenta, violet, aqua, and blue) falling off from outside or behind the product
window. The warm lamp is the one in use; the others remain as alternatives, and
`STORE_BACKDROP` renders the screenshots with any of them, or with the original
`store-backdrop.png`.
"""

from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "store-assets" / "screenshots" / "backdrops"

W, H = 1920, 1080
YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)
# The standard screenshot's product window, which several backdrops light from behind.
WINDOW = (1050, 65, 790, 950)


def rgb(hex_color: str) -> np.ndarray:
    return np.array([int(hex_color[i : i + 2], 16) for i in (1, 3, 5)], np.float32) / 255


def fill(hex_color: str) -> np.ndarray:
    return np.broadcast_to(rgb(hex_color), (H, W, 3)).copy()


def light(cx: float, cy: float, rx: float, ry: float, hex_color: str, strength: float) -> np.ndarray:
    """A very large soft light; centers may sit off the canvas so only the falloff shows."""
    distance = ((XX - cx) / rx) ** 2 + ((YY - cy) / ry) ** 2
    return (np.exp(-distance) * strength)[..., None] * rgb(hex_color)


def vignette(strength: float) -> np.ndarray:
    falloff = ((XX / W - 0.55) ** 2) * 1.4 + ((YY / H - 0.5) ** 2) * 2.2
    return np.clip(1 - strength * falloff, 0, 1)[..., None]


def finish(image: np.ndarray, name: str, seed: int) -> None:
    # Soft shoulder rather than a hard clip where lights overlap, then grain so
    # the long gradients do not band once the Store recompresses them.
    image = image / (1 + np.maximum(image - 0.75, 0))
    image += np.random.default_rng(seed).standard_normal((H, W, 1)).astype(np.float32) * 0.006
    pixels = (np.clip(image, 0, 1) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(pixels, "RGB").save(OUT / name)


def ambient_hue() -> None:
    """The website's canvas: four large Hue lights with their centers off screen."""
    image = fill("#0a0b10")
    image += light(2150, 1250, 1150, 900, "#ffb342", 0.85)
    image += light(1650, -280, 950, 720, "#d72be8", 0.55)
    image += light(2250, 480, 620, 650, "#71e0cf", 0.35)
    image += light(650, 1420, 1150, 620, "#2a5bd7", 0.5)
    finish(image * vignette(0.35), "a-ambient-hue.png", 1)


def warm_lamp() -> None:
    """A warm lamp rising from the lower right, as a desk lamp lights a wall,
    with a violet light in the corner beside it meeting it in rose."""
    image = fill("#0d0a0e")
    image += light(1550, 1200, 1150, 850, "#ff4500", 0.72)
    image += light(1450, 950, 700, 500, "#ffb342", 0.45)
    image += light(2150, 1100, 800, 750, "#8a2be2", 0.7)
    image += light(1950, 1250, 500, 350, "#d72be8", 0.2)
    finish(image * vignette(0.45), "b-warm-lamp.png", 2)


def dusk_gradient() -> None:
    """A diagonal dusk from deep indigo through violet and magenta to coral."""
    t = np.clip(XX / W * 0.72 + YY / H * 0.28, 0, 1)
    stops = [(0.0, "#07061a"), (0.42, "#170d3f"), (0.66, "#3f1c98"), (0.85, "#a3239a"), (1.0, "#ff6a3d")]
    image = np.zeros((H, W, 3), np.float32)
    for (start, low), (end, high) in zip(stops, stops[1:]):
        span = ((t >= start) & (t <= end))[..., None]
        mix = ((t - start) / (end - start))[..., None]
        image = np.where(span, rgb(low) * (1 - mix) + rgb(high) * mix, image)
    image *= 0.72
    image += light(1900, 1150, 700, 480, "#ffb342", 0.3)
    finish(image * vignette(0.4), "c-dusk-gradient.png", 3)


def ambilight() -> None:
    """Light spilling from behind the product window, the way a Hue gradient
    lightstrip lights the wall behind a screen during PC Sync."""
    x, y, width, height = WINDOW
    cx, cy, hx, hy = x + width / 2, y + height / 2, width / 2, height / 2
    qx, qy = np.abs(XX - cx) - hx, np.abs(YY - cy) - hy
    edge = np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2) + np.minimum(np.maximum(qx, qy), 0)
    glow = np.where(edge > 0, np.exp(-edge / 230), np.exp(edge / 140))

    # Color by direction around the window: magenta above, blue to the right,
    # amber below, and coral toward the text.
    angle = np.arctan2(YY - cy, XX - cx)
    colors = [(-np.pi / 2, "#d72be8"), (0.0, "#2a5bd7"), (np.pi / 2, "#ffb342"), (np.pi, "#ff5a36")]
    weights = [np.maximum(np.cos(angle - direction), 0) ** 2 for direction, _ in colors]
    total = sum(weights) + 1e-6
    tint = sum(w[..., None] * rgb(color) for w, (_, color) in zip(weights, colors)) / total[..., None]

    image = fill("#09090c") + glow[..., None] * tint * 0.95
    finish(image * vignette(0.3), "d-ambilight.png", 4)


def cool_field() -> None:
    """The website's widget story: a calm teal, blue, and violet field that lets
    warm scene colors in the screenshots stand out."""
    image = fill("#06090f")
    image += light(1500, 1180, 950, 600, "#1fa69a", 0.55)
    image += light(1920, 700, 520, 460, "#71e0cf", 0.28)
    image += light(1150, -220, 1050, 600, "#1e56c8", 0.5)
    image += light(2000, 90, 720, 600, "#5123bc", 0.6)
    finish(image * vignette(0.35), "e-cool-field.png", 5)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    ambient_hue()
    warm_lamp()
    dusk_gradient()
    ambilight()
    cool_field()


if __name__ == "__main__":
    main()
