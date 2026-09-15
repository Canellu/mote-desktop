import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "store-assets" / "screenshots" / "raw"
# Both can be overridden to preview a candidate backdrop without replacing the
# final screenshots. The warm lamp replaced `store-backdrop.png` on 2026-09-16;
# the original is kept, so set STORE_BACKDROP to it to go back.
FINAL = Path(os.environ.get("STORE_SCREENSHOTS_OUT", ROOT / "store-assets" / "screenshots" / "final"))
BACKDROP = Path(os.environ.get("STORE_BACKDROP", ROOT / "store-assets" / "screenshots" / "backdrops" / "b-warm-lamp.png"))
ICON = ROOT / "src-tauri" / "icons" / "icon.png"

W, H = 1920, 1080
FONT_REGULAR = r"C:\Windows\Fonts\segoeui.ttf"
FONT_SEMIBOLD = r"C:\Windows\Fonts\seguisb.ttf"
FONT_BOLD = r"C:\Windows\Fonts\segoeuib.ttf"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def fit_font(text: str, path: str, size: int, max_width: int, min_size: int, spacing: int) -> ImageFont.FreeTypeFont:
    measure = ImageDraw.Draw(Image.new("L", (1, 1)))
    for candidate in range(size, min_size - 1, -1):
        face = font(path, candidate)
        left, _, right, _ = measure.multiline_textbbox((0, 0), text, font=face, spacing=spacing)
        if right - left <= max_width:
            return face
    raise ValueError(f"{text!r} does not fit in {max_width}px even at {min_size}px")


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius, fill=255)
    return mask


def draw_shadow(canvas: Image.Image, box: tuple[int, int, int, int], radius: int) -> None:
    x, y, width, height = box
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_shape = Image.new("RGBA", (width, height), (0, 0, 0, 210))
    shadow_shape.putalpha(rounded_mask((width, height), radius))
    shadow.alpha_composite(shadow_shape, (x + 12, y + 28))
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))
    canvas.alpha_composite(shadow)


def paste_window(canvas: Image.Image, source: Path, box: tuple[int, int, int, int], radius: int = 20) -> None:
    x, y, width, height = box
    shot = Image.open(source).convert("RGB")
    shot = ImageOps.fit(shot, (width, height), method=Image.Resampling.LANCZOS)
    draw_shadow(canvas, box, radius)
    canvas.paste(shot, (x, y), rounded_mask((width, height), radius))


def paste_floating(canvas: Image.Image, source: Path, position: tuple[int, int], max_size: tuple[int, int]) -> None:
    x, y = position
    shot = Image.open(source).convert("RGBA")
    shot.thumbnail(max_size, Image.Resampling.LANCZOS)

    shadow_shape = Image.new("RGBA", shot.size, (0, 0, 0, 205))
    shadow_shape.putalpha(shot.getchannel("A"))
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow.alpha_composite(shadow_shape, (x + 14, y + 24))
    shadow = shadow.filter(ImageFilter.GaussianBlur(24))
    canvas.alpha_composite(shadow)
    canvas.alpha_composite(shot, (x, y))


def base_canvas(variant: int) -> Image.Image:
    bg = Image.open(BACKDROP).convert("RGB")
    if variant % 2:
        bg = ImageOps.mirror(bg)
    bg = ImageOps.fit(bg, (W, H), method=Image.Resampling.LANCZOS)
    bg = ImageEnhance.Color(bg).enhance(0.92 + variant % 4 * 0.04)
    bg = ImageEnhance.Brightness(bg).enhance(0.86)
    canvas = bg.convert("RGBA")

    wash = Image.new("RGBA", (W, H), (3, 8, 18, 0))
    wd = ImageDraw.Draw(wash)
    wd.rectangle((0, 0, 900, H), fill=(3, 8, 18, 130))
    wash = wash.filter(ImageFilter.GaussianBlur(70))
    canvas.alpha_composite(wash)
    return canvas


def draw_brand(canvas: Image.Image) -> None:
    draw = ImageDraw.Draw(canvas)

    app_icon = Image.open(ICON).convert("RGBA")
    app_icon.thumbnail((76, 76), Image.Resampling.LANCZOS)
    canvas.alpha_composite(app_icon, (126, 92))
    draw.text((222, 111), "Mote Desktop", font=font(FONT_SEMIBOLD, 33), fill=(255, 255, 255, 240))

    draw.text((132, 826), "Designed for Windows 10 & 11", font=font(FONT_SEMIBOLD, 25), fill=(237, 240, 247, 215))


def draw_tag(canvas: Image.Image, eyebrow: str) -> None:
    draw = ImageDraw.Draw(canvas)
    tag_font = font(FONT_SEMIBOLD, 24)
    tag_box = draw.textbbox((0, 0), eyebrow, font=tag_font)
    tag_w = tag_box[2] - tag_box[0] + 42
    draw.rounded_rectangle((128, 244, 128 + tag_w, 292), radius=24, fill=(10, 14, 26, 185), outline=(255, 255, 255, 55), width=1)
    draw.text((149, 253), eyebrow, font=tag_font, fill=(245, 247, 252, 245))


def draw_heading(canvas: Image.Image, title: str, subtitle: str, max_width: int) -> None:
    draw = ImageDraw.Draw(canvas)
    title_font = fit_font(title, FONT_BOLD, 76, max_width, 60, 5)
    subtitle_font = fit_font(subtitle, FONT_REGULAR, 33, max_width, 28, 12)
    draw.multiline_text((124, 330), title, font=title_font, fill=(255, 255, 255, 255), spacing=5)
    draw.multiline_text((130, 565), subtitle, font=subtitle_font, fill=(228, 231, 240, 220), spacing=12)


def draw_copy(canvas: Image.Image, eyebrow: str, title: str, subtitle: str, max_width: int = 870) -> None:
    draw_brand(canvas)
    draw_tag(canvas, eyebrow)
    draw_heading(canvas, title, subtitle, max_width)


def render_standard(filename: str, screenshot: str, eyebrow: str, title: str, subtitle: str, variant: int) -> None:
    canvas = base_canvas(variant)
    draw_copy(canvas, eyebrow, title, subtitle)
    paste_window(canvas, RAW / screenshot, (1050, 65, 790, 950), radius=18)
    canvas.convert("RGB").save(FINAL / filename, quality=96)


def render_whole(filename: str, screenshot: str, eyebrow: str, title: str, subtitle: str, variant: int) -> None:
    """Shows the whole capture at its own shape. The website's captures are wider
    than the portrait window `render_standard` crops to, and cropping them would
    cut off inspectors and side panels."""
    canvas = base_canvas(variant)
    with Image.open(RAW / screenshot) as shot:
        scale = min(1060 / shot.width, 900 / shot.height)
        width, height = round(shot.width * scale), round(shot.height * scale)
    x, y = W - 80 - width, (H - height) // 2
    draw_copy(canvas, eyebrow, title, subtitle, max_width=x - 180)
    paste_window(canvas, RAW / screenshot, (x, y, width, height), radius=18)
    canvas.convert("RGB").save(FINAL / filename, quality=96)


def render_widget(filename: str, variant: int) -> None:
    canvas = base_canvas(variant)
    draw_copy(
        canvas,
        "DESKTOP WIDGETS",
        "Your lights,\nalways within reach.",
        "Pin a compact controller to your desktop\nfor instant access to lights and scenes.",
    )
    paste_window(canvas, RAW / "04-widgets-settings.png", (875, 155, 780, 790), radius=18)
    paste_floating(canvas, RAW / "05-desktop-widget.png", (1450, 98), (420, 865))
    canvas.convert("RGB").save(FINAL / filename, quality=96)


def main() -> None:
    FINAL.mkdir(parents=True, exist_ok=True)
    # The variant is the upload position, so neighbouring screenshots alternate
    # the backdrop's direction.
    render_standard(
        "01-control-dashboard.png",
        "01-dashboard.png",
        "FREE CORE CONTROLS",
        "Your lights,\nright at hand.",
        "Control rooms, zones, and scenes from\none fast, focused desktop dashboard.",
        0,
    )
    render_whole(
        "02-room-controls.png",
        "07-room-controls.png",
        "FREE  ·  ROOM CONTROLS",
        "Every light,\njust right.",
        "Set brightness, color, and white\nfor a whole room or a single light.",
        1,
    )
    render_whole(
        "03-scene-gallery.png",
        "08-scene-gallery.png",
        "FREE  ·  HUE SCENES",
        "Set the mood\nin one tap.",
        "Preview Hue scene palettes live,\nthen save the one you want.",
        2,
    )
    render_standard(
        "04-pc-sync.png",
        "03-pc-sync-controls.png",
        "MOTE PRO  ·  PC SYNC",
        "Light that follows\nthe moment.",
        "Sync your lights with video, games,\nand music playing on your PC.",
        3,
    )
    render_whole(
        "05-light-placement.png",
        "09-light-placement-3d.png",
        "FREE  ·  ENTERTAINMENT AREAS",
        "Lights where\nthey really are.",
        "Place each light around your screen in\na 3D view, so sync knows where it sits.",
        4,
    )
    render_widget("06-desktop-widgets.png", 5)
    render_standard(
        "07-custom-widgets.png",
        "06-widget-config.png",
        "MOTE PRO  ·  CUSTOM WIDGETS",
        "Make Mote\nwork your way.",
        "Build widgets with the controls, scenes,\nlayout, and size that fit your desktop.",
        6,
    )
    render_whole(
        "08-sync-box.png",
        "10-sync-box.png",
        "FREE  ·  HUE SYNC BOX",
        "Your Sync Box,\nat your desk.",
        "Switch sources, sync styles, and\nintensity for a Hue Play HDMI Sync Box.",
        7,
    )


if __name__ == "__main__":
    main()
