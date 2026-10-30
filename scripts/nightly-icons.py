"""Nightly icons: the normal art plus a crescent-moon badge, readable down to 16 px."""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

REPO = Path(sys.argv[1])
OUT = REPO / "build" / "nightly"
OUT.mkdir(parents=True, exist_ok=True)

NAVY = (12, 18, 46, 255)
RING = (255, 209, 102, 255)   # warm gold, reads on purple and on the taskbar
MOON = (255, 214, 120, 255)


def badge(size: int) -> Image.Image:
    """A navy disc with a gold ring and a crescent, drawn 8x and downsampled."""
    k = 8
    s = size * k
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ring = max(k, round(s * 0.09))
    d.ellipse((0, 0, s - 1, s - 1), fill=RING)
    d.ellipse((ring, ring, s - 1 - ring, s - 1 - ring), fill=NAVY)
    # Crescent on its own layer: the bite only erases moon pixels, so it can
    # never spill over the ring or outside the badge.
    moon = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    md = ImageDraw.Draw(moon)
    m = round(s * 0.24)
    md.ellipse((m, m, s - 1 - m, s - 1 - m), fill=MOON)
    off = round(s * 0.17)
    md.ellipse((m + off, m - round(off * 0.55), s - 1 - m + off, s - 1 - m - round(off * 0.55)), fill=(0, 0, 0, 0))
    img.alpha_composite(moon)
    return img.resize((size, size), Image.LANCZOS)


def branded(base: Image.Image, size: int) -> Image.Image:
    art = base.resize((size, size), Image.LANCZOS).convert("RGBA")
    # Small icons need a proportionally bigger badge to stay legible.
    ratio = 0.6 if size <= 24 else 0.5 if size <= 48 else 0.42 if size <= 64 else 0.33
    b = max(9, round(size * ratio))
    pad = 0 if size <= 32 else round(size * 0.02)
    art.alpha_composite(badge(b), (size - b - pad, size - b - pad))
    return art


def save_ico(base: Image.Image, sizes, path: Path) -> None:
    frames = [branded(base, n) for n in sizes]
    big = frames[-1]
    big.save(path, format="ICO", sizes=[(n, n) for n in sizes], append_images=frames[:-1])


source = Image.open(REPO / "build" / "icon-source.png").convert("RGBA")
save_ico(source, [16, 24, 32, 48, 64, 128, 256], OUT / "icon.ico")
branded(source, 1024).save(OUT / "icon-source.png")

tray = Image.open(REPO / "build" / "tray.ico")
tray.size = (64, 64)
tray.load()
save_ico(tray.convert("RGBA"), [16, 20, 24, 32, 40, 48, 64], OUT / "tray.ico")

# Previews for review.
prev = Image.new("RGBA", (16 + 24 + 32 + 48 + 256 + 60, 256), (32, 32, 36, 255))
x = 0
for n in (16, 24, 32, 48, 256):
    prev.alpha_composite(branded(source, n), (x, 256 - n))
    x += n + 12
prev.save(Path(sys.argv[2]) / "preview-app.png")
prev = Image.new("RGBA", (16 + 24 + 32 + 64 + 40, 64), (32, 32, 36, 255))
x = 0
for n in (16, 24, 32, 64):
    prev.alpha_composite(branded(tray.convert("RGBA"), n), (x, 64 - n))
    x += n + 10
prev.resize((prev.width * 3, prev.height * 3), Image.NEAREST).save(Path(sys.argv[2]) / "preview-tray.png")
print("ok")
