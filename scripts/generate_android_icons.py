from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC_ICON = ROOT / "frontend" / "public" / "icon-512.png"
RES_DIR = ROOT / "frontend" / "android" / "app" / "src" / "main" / "res"

SIZES = {
    "mipmap-mdpi": (48, 108),
    "mipmap-hdpi": (72, 162),
    "mipmap-xhdpi": (96, 216),
    "mipmap-xxhdpi": (144, 324),
    "mipmap-xxxhdpi": (192, 432),
}

def make_round(img: Image.Image) -> Image.Image:
    size = img.size
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size[0], size[1]), fill=255)
    out = Image.new("RGBA", size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out

def main():
    if not SRC_ICON.exists() or not RES_DIR.exists():
        print("Source icon or Android res dir not found, skipping.")
        return

    src = Image.open(SRC_ICON).convert("RGBA")

    for folder, (launcher_px, fg_px) in SIZES.items():
        target_dir = RES_DIR / folder
        target_dir.mkdir(parents=True, exist_ok=True)

        # 1. Square / rounded launcher icon
        launcher_img = src.resize((launcher_px, launcher_px), Image.Resampling.LANCZOS)
        launcher_img.save(target_dir / "ic_launcher.png", "PNG")

        # 2. Circular launcher icon
        round_img = make_round(launcher_img)
        round_img.save(target_dir / "ic_launcher_round.png", "PNG")

        # 3. Adaptive foreground icon (centered within 108dp safe zone ~62%)
        fg_canvas = Image.new("RGBA", (fg_px, fg_px), (15, 15, 15, 0))
        inner_px = int(fg_px * 0.62)
        inner_img = src.resize((inner_px, inner_px), Image.Resampling.LANCZOS)
        offset = (fg_px - inner_px) // 2
        fg_canvas.paste(inner_img, (offset, offset), inner_img)
        fg_canvas.save(target_dir / "ic_launcher_foreground.png", "PNG")

    print("Android launcher icons generated successfully.")

if __name__ == "__main__":
    main()
