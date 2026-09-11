from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "store-assets" / "screenshots" / "raw"
FINAL = ROOT / "store-assets" / "screenshots" / "final"
BACKDROP = ROOT / "store-assets" / "screenshots" / "store-backdrop.png"
ICON = ROOT / "src-tauri" / "icons" / "icon.png"

W, H = 1920, 1080
FONT_REGULAR = r"C:\Windows\Fonts\segoeui.ttf"
FONT_SEMIBOLD = r"C:\Windows\Fonts\seguisb.ttf"
FONT_BOLD = r"C:\Windows\Fonts\segoeuib.ttf"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius, fill=255)
    return mask


def paste_window(canvas: Image.Image, source: Path, box: tuple[int, int, int, int], radius: int = 20) -> None:
    x, y, width, height = box
    shot = Image.open(source).convert("RGB")
    shot = ImageOps.fit(shot, (width, height), method=Image.Resampling.LANCZOS)
    mask = rounded_mask((width, height), radius)

    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_shape = Image.new("RGBA", (width, height), (0, 0, 0, 210))
    shadow_shape.putalpha(mask)
    shadow.alpha_composite(shadow_shape, (x + 12, y + 28))
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))
    canvas.alpha_composite(shadow)

    canvas.paste(shot, (x, y), mask)


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
    bg = ImageEnhance.Color(bg).enhance(0.92 + variant * 0.04)
    bg = ImageEnhance.Brightness(bg).enhance(0.86)
    canvas = bg.convert("RGBA")

    wash = Image.new("RGBA", (W, H), (3, 8, 18, 0))
    wd = ImageDraw.Draw(wash)
    wd.rectangle((0, 0, 900, H), fill=(3, 8, 18, 130))
    wash = wash.filter(ImageFilter.GaussianBlur(70))
    canvas.alpha_composite(wash)
    return canvas


def draw_copy(canvas: Image.Image, eyebrow: str, title: str, subtitle: str) -> None:
    draw = ImageDraw.Draw(canvas)

    app_icon = Image.open(ICON).convert("RGBA")
    app_icon.thumbnail((76, 76), Image.Resampling.LANCZOS)
    canvas.alpha_composite(app_icon, (126, 92))
    draw.text((222, 111), "Mote Desktop", font=font(FONT_SEMIBOLD, 33), fill=(255, 255, 255, 240))

    tag_font = font(FONT_SEMIBOLD, 24)
    tag_box = draw.textbbox((0, 0), eyebrow, font=tag_font)
    tag_w = tag_box[2] - tag_box[0] + 42
    draw.rounded_rectangle((128, 244, 128 + tag_w, 292), radius=24, fill=(10, 14, 26, 185), outline=(255, 255, 255, 55), width=1)
    draw.text((149, 253), eyebrow, font=tag_font, fill=(245, 247, 252, 245))

    draw.multiline_text((124, 330), title, font=font(FONT_BOLD, 76), fill=(255, 255, 255, 255), spacing=5)
    draw.multiline_text((130, 565), subtitle, font=font(FONT_REGULAR, 33), fill=(228, 231, 240, 220), spacing=12)

    draw.text((132, 826), "Designed for Windows 10 & 11", font=font(FONT_SEMIBOLD, 25), fill=(237, 240, 247, 215))


def render_standard(filename: str, screenshot: str, eyebrow: str, title: str, subtitle: str, variant: int) -> None:
    canvas = base_canvas(variant)
    draw_copy(canvas, eyebrow, title, subtitle)
    paste_window(canvas, RAW / screenshot, (1050, 65, 790, 950), radius=18)
    canvas.convert("RGB").save(FINAL / filename, quality=96)


def render_widget() -> None:
    canvas = base_canvas(2)
    draw_copy(
        canvas,
        "DESKTOP WIDGETS",
        "Your lights,\nalways within reach.",
        "Pin a compact controller to your desktop\nfor instant access to lights and scenes.",
    )
    paste_window(canvas, RAW / "04-widgets-settings.png", (875, 155, 780, 790), radius=18)
    paste_floating(canvas, RAW / "05-desktop-widget.png", (1450, 98), (420, 865))
    canvas.convert("RGB").save(FINAL / "03-desktop-widgets.png", quality=96)


def main() -> None:
    FINAL.mkdir(parents=True, exist_ok=True)
    render_standard(
        "01-control-dashboard.png",
        "01-dashboard.png",
        "FREE CORE CONTROLS",
        "Your lights,\nright at hand.",
        "Control rooms, zones, and scenes from\none fast, focused desktop dashboard.",
        0,
    )
    render_standard(
        "02-pc-sync.png",
        "03-pc-sync-controls.png",
        "MOTE PRO  ·  PC SYNC",
        "Light that follows\nthe moment.",
        "Sync your lights with video, games,\nand music playing on your PC.",
        1,
    )
    render_widget()
    render_standard(
        "04-custom-widgets.png",
        "06-widget-config.png",
        "MOTE PRO  ·  CUSTOM WIDGETS",
        "Make Mote\nwork your way.",
        "Build widgets with the controls, scenes,\nlayout, and size that fit your desktop.",
        3,
    )


if __name__ == "__main__":
    main()
