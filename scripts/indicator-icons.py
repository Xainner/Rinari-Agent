"""Genera los iconos de los indicadores de atención (build/indicators/).

- overlay-<categoría>-<n>.png (16 px) y @2x (32 px): la insignia con el número
  de chats pendientes sobre el icono de la barra de tareas (1…9 y 9+).
- tray-<categoría>.png (16 px) y @2x: la cara de la bandeja (build/tray.ico)
  con una marca de color y símbolo en la esquina, recortada con un anillo
  transparente para que se lea sobre barras claras y oscuras.

Categorías: needs_you (ámbar, «!»), failed (rojo, «×»), done (verde, «✓»),
other (violeta, «•»). Color y forma, nunca solo color.

Se dibuja a 8× y se reduce, así los bordes quedan suaves a 16 px. Los PNG se
versionan; este script solo hace falta para cambiarlos:

    uv run --with pillow python scripts/indicator-icons.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "build" / "indicators"
FONT = Path("C:/Windows/Fonts/segoeuib.ttf")
SS = 8

COLORS = {
    "needs_you": ((245, 158, 11), (28, 18, 4)),
    "failed": ((220, 38, 38), (255, 255, 255)),
    "done": ((22, 163, 74), (255, 255, 255)),
    "other": ((139, 92, 246), (255, 255, 255)),
}


def _font(px: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT), px)


def _symbol(draw: ImageDraw.ImageDraw, kind: str, cx: float, cy: float, r: float, ink) -> None:
    w = max(1, round(r * 0.32))
    if kind == "needs_you":
        draw.line([(cx, cy - r * 0.55), (cx, cy + r * 0.12)], fill=ink, width=w)
        dot = w * 0.62
        draw.ellipse([cx - dot, cy + r * 0.42 - dot, cx + dot, cy + r * 0.42 + dot], fill=ink)
    elif kind == "failed":
        d = r * 0.42
        draw.line([(cx - d, cy - d), (cx + d, cy + d)], fill=ink, width=w)
        draw.line([(cx - d, cy + d), (cx + d, cy - d)], fill=ink, width=w)
    elif kind == "done":
        draw.line(
            [(cx - r * 0.48, cy + r * 0.02), (cx - r * 0.12, cy + r * 0.38), (cx + r * 0.52, cy - r * 0.36)],
            fill=ink,
            width=w,
            joint="curve",
        )
    else:
        dot = r * 0.3
        draw.ellipse([cx - dot, cy - dot, cx + dot, cy + dot], fill=ink)


def overlay(kind: str, label: str, size: int) -> Image.Image:
    big = size * SS
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    fill, ink = COLORS[kind]
    # Contorno oscuro fino: la insignia se lee sobre cualquier barra.
    draw.ellipse([0, 0, big - 1, big - 1], fill=(12, 10, 18, 235))
    pad = big * 0.07
    draw.ellipse([pad, pad, big - 1 - pad, big - 1 - pad], fill=fill)
    text_px = round(big * (0.74 if len(label) == 1 else 0.56))
    font = _font(text_px)
    # Centrado por la caja real del texto (no por ascendente/descendente).
    left, top, right, bottom = font.getbbox(label, anchor="ls")
    origin = (big / 2 - (left + right) / 2, big / 2 - (top + bottom) / 2)
    draw.text(origin, label, font=font, fill=ink, anchor="ls")
    return image.resize((size, size), Image.LANCZOS)


def tray(kind: str, size: int) -> Image.Image:
    with Image.open(ROOT / "build" / "tray.ico") as ico:
        ico.size = (size, size) if (size, size) in ico.info.get("sizes", ()) else max(ico.info["sizes"])
        base = ico.convert("RGBA").resize((size * SS, size * SS), Image.LANCZOS)
    big = size * SS
    r = big * 0.27
    cx = cy = big - r - big * 0.02
    # Anillo transparente alrededor de la marca: separa la marca de la cara.
    cut = Image.new("L", (big, big), 255)
    gap = r + big * 0.07
    ImageDraw.Draw(cut).ellipse([cx - gap, cy - gap, cx + gap, cy + gap], fill=0)
    alpha = base.getchannel("A")
    base.putalpha(Image.composite(alpha, Image.new("L", (big, big), 0), cut))
    draw = ImageDraw.Draw(base)
    fill, ink = COLORS[kind]
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)
    _symbol(draw, kind, cx, cy, r, ink)
    return base.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for kind in COLORS:
        for n in [*map(str, range(1, 10)), "9plus"]:
            label = "9+" if n == "9plus" else n
            overlay(kind, label, 16).save(OUT / f"overlay-{kind}-{n}.png")
            overlay(kind, label, 32).save(OUT / f"overlay-{kind}-{n}@2x.png")
        tray(kind, 16).save(OUT / f"tray-{kind}.png")
        tray(kind, 32).save(OUT / f"tray-{kind}@2x.png")
    print(f"{len(list(OUT.glob('*.png')))} iconos en {OUT}")


if __name__ == "__main__":
    main()
