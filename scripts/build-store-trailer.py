"""Builds the Microsoft Store trailer, its thumbnail, and the 16:9 Super hero art.

The trailer re-frames the website's hero demonstration, a portrait capture of the
real app made by `mote-website/scripts/record-hero-demo.cjs`, onto the Store
screenshots' backdrop with one caption per chapter. Partner Center wants a
1920 x 1080 H.264 MP4 and a 1920 x 1080 PNG thumbnail, and only shows trailers at
the top of the listing when Super hero art is present.

Needs a full FFmpeg build with libx264 (`FFMPEG_PATH`, otherwise `ffmpeg` on PATH)
and the website repository beside this one (`MOTE_WEBSITE` to point elsewhere).
"""

import importlib.util
import os
import re
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
WEBSITE = Path(os.environ.get("MOTE_WEBSITE", ROOT.parent / "mote-website"))
DEMO = WEBSITE / "public" / "product" / "mote-hero-demo-hd.mp4"
POSTER = WEBSITE / "public" / "product" / "mote-hero-poster-hd.png"
TRAILER = ROOT / "store-assets" / "trailer"
FFMPEG = os.environ.get("FFMPEG_PATH", "ffmpeg")

_spec = importlib.util.spec_from_file_location("store_screenshots", ROOT / "scripts" / "build-store-screenshots.py")
shots = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(shots)

W, H = shots.W, shots.H
FPS = 24
FADE = 0.35
RADIUS = 18
# The demo is 2400 x 2650. Keep its shape, at the height of the screenshots' window.
VIDEO_BOX = (950, 65, 860, 950)

# Chapter starts come from the hero demo's manifest, which record-hero-demo.cjs
# leaves in mote-website/node_modules/.cache/hero-demo. Re-check them whenever
# the demo is recaptured.
CHAPTERS = [
    (0.0, "Your rooms,\ntogether.", "See every room and zone\nat a glance."),
    (8.79, "Set the\nroom's mood.", "Dim a room, then apply\na Hue scene."),
    (16.79, "Fine-tune\none light.", "Pick any color for\na single lamp."),
    (28.08, "A warmer\ndesk light.", "Switch to white and\nwarm it up."),
    (33.58, "Back to\nyour day.", "Your Hue lights,\nright from Windows."),
]


def duration(path: Path) -> float:
    probe = subprocess.run([FFMPEG, "-hide_banner", "-i", str(path)], capture_output=True, text=True)
    match = re.search(r"Duration: (\d+):(\d+):([\d.]+)", probe.stderr)
    if not match:
        raise RuntimeError(f"Could not read the duration of {path}")
    hours, minutes, seconds = match.groups()
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def backdrop() -> Image.Image:
    canvas = shots.base_canvas(0)
    shots.draw_brand(canvas)
    shots.draw_tag(canvas, "A QUICK TOUR")
    shots.draw_shadow(canvas, VIDEO_BOX, RADIUS)
    return canvas


def frame_over(back: Image.Image) -> Image.Image:
    """The backdrop with a rounded hole where the demo plays, laid over the video
    to round its corners."""
    x, y, width, height = VIDEO_BOX
    alpha = Image.new("L", (W, H), 255)
    alpha.paste(ImageOps.invert(shots.rounded_mask((width, height), RADIUS)), (x, y))
    frame = back.copy()
    frame.putalpha(alpha)
    return frame


def caption(title: str, subtitle: str) -> Image.Image:
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shots.draw_heading(layer, title, subtitle, max_width=VIDEO_BOX[0] - 180)
    return layer


def encode(work: Path, seconds: float) -> None:
    length = f"{seconds:.3f}"

    def still(name: str) -> list[str]:
        return ["-loop", "1", "-framerate", str(FPS), "-t", length, "-i", str(work / name)]

    inputs = [*still("backdrop.png"), "-i", str(DEMO), *still("frame.png")]
    for index in range(len(CHAPTERS)):
        inputs += still(f"caption-{index}.png")
    inputs += ["-f", "lavfi", "-t", length, "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]

    x, y, width, height = VIDEO_BOX
    graph = [
        f"[1:v]fps={FPS},scale={width}:{height}:flags=lanczos,setsar=1[demo]",
        f"[0:v][demo]overlay={x}:{y}:shortest=1[v0]",
        "[v0][2:v]overlay=0:0[v1]",
    ]
    last = "v1"
    for index, (start, _, _) in enumerate(CHAPTERS):
        end = CHAPTERS[index + 1][0] if index + 1 < len(CHAPTERS) else seconds
        filters = ["format=rgba"]
        if index > 0:
            filters.append(f"fade=t=in:st={start:.3f}:d={FADE}:alpha=1")
        if index + 1 < len(CHAPTERS):
            filters.append(f"fade=t=out:st={end - FADE:.3f}:d={FADE}:alpha=1")
        graph.append(f"[{3 + index}:v]{','.join(filters)}[c{index}]")
        graph.append(f"[{last}][c{index}]overlay=0:0[v{index + 2}]")
        last = f"v{index + 2}"
    graph.append(f"[{last}]fade=t=in:st=0:d=0.5,fade=t=out:st={seconds - 0.8:.3f}:d=0.8,format=yuv420p[out]")

    # Partner Center's MP4 guidance: H.264 High profile, progressive, two B-frames,
    # closed GOPs of half the frame rate, AAC-LC stereo at 48 kHz. The demo is
    # silent, so the audio track is silence. CRF 23 keeps the file under 10 MB,
    # small enough to upload through browser automation; the Store re-encodes
    # trailers anyway.
    subprocess.run(
        [
            FFMPEG, "-hide_banner", "-loglevel", "error", "-y", *inputs,
            "-filter_complex", ";".join(graph),
            "-map", "[out]", "-map", f"{3 + len(CHAPTERS)}:a",
            "-c:v", "libx264", "-profile:v", "high", "-preset", "slow", "-crf", "23",
            "-maxrate", "50M", "-bufsize", "50M",
            "-g", str(FPS // 2), "-keyint_min", str(FPS // 2), "-sc_threshold", "0", "-bf", "2", "-flags", "+cgop",
            "-r", str(FPS),
            "-c:a", "aac", "-b:a", "384k", "-ar", "48000", "-ac", "2",
            "-t", length, "-movflags", "+faststart", "-map_metadata", "-1",
            str(TRAILER / "mote-desktop-trailer.mp4"),
        ],
        check=True,
    )


def render_thumbnail(back: Image.Image) -> None:
    canvas = back.copy()
    x, y, width, height = VIDEO_BOX
    poster = ImageOps.fit(Image.open(POSTER).convert("RGB"), (width, height), method=Image.Resampling.LANCZOS)
    canvas.paste(poster, (x, y), shots.rounded_mask((width, height), RADIUS))
    shots.draw_heading(
        canvas,
        "Watch Mote\nat work.",
        "Rooms, scenes, and color for a\nsingle light, in under a minute.",
        max_width=x - 180,
    )
    canvas.convert("RGB").save(TRAILER / "trailer-thumbnail.png")


def render_super_hero_art() -> None:
    """Microsoft asks for no text and no app UI here, so it is the backdrop and
    the app icon, kept out of the bottom third."""
    bg = ImageOps.fit(Image.open(shots.BACKDROP).convert("RGB"), (W, H), method=Image.Resampling.LANCZOS)
    canvas = ImageEnhance.Brightness(bg).enhance(0.9).convert("RGBA")
    icon = Image.open(shots.ICON).convert("RGBA")
    size, center_y = 320, 420

    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    glow.alpha_composite(icon.resize((size * 2, size * 2), Image.Resampling.LANCZOS), ((W - size * 2) // 2, center_y - size))
    glow = glow.filter(ImageFilter.GaussianBlur(90))
    glow.putalpha(glow.getchannel("A").point(lambda a: int(a * 0.6)))
    canvas.alpha_composite(glow)

    canvas.alpha_composite(icon.resize((size, size), Image.Resampling.LANCZOS), ((W - size) // 2, center_y - size // 2))
    canvas.convert("RGB").save(TRAILER / "super-hero-art.png")


def main() -> None:
    TRAILER.mkdir(parents=True, exist_ok=True)
    seconds = duration(DEMO)
    back = backdrop()
    with tempfile.TemporaryDirectory() as temp:
        work = Path(temp)
        back.convert("RGB").save(work / "backdrop.png")
        frame_over(back).save(work / "frame.png")
        for index, (_, title, subtitle) in enumerate(CHAPTERS):
            caption(title, subtitle).save(work / f"caption-{index}.png")
        encode(work, seconds)
    render_thumbnail(back)
    render_super_hero_art()


if __name__ == "__main__":
    main()
