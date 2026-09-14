#!/usr/bin/env python3
"""Importa los logos de proveedores a public/logos/.

Los originales son marcas 1254x1254 RGBA (transparencia, sin fondo). Para la UI
se reescalan a 256x256 y se optimiza el PNG.

Marcas de color (OpenAI, Claude, DeepSeek, Gemini, Mistral): una sola variante,
visible en ambos temas del escritorio.

Marcas monocromas: dos variantes, porque un glifo blanco desaparece sobre
superficie clara y uno negro desaparece sobre oscura.
    <nombre>.png        tinta clara  -> tema oscuro
    <nombre>-light.png  tinta oscura -> tema claro
La tinta se recalcula preservando el canal alpha (y por tanto el sombreado).

Uso:
    python scripts/import-provider-logos.py --source "C:/Users/Xainner/Downloads/Logos"

Idempotente: repetir la ejecución regenera exactamente los mismos archivos.
Requiere Pillow (`pip install pillow`).
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "public" / "logos"
SIZE = 256

# origen -> (destino, monocroma)
LOGOS: dict[str, tuple[str, bool]] = {
    "OpenAI.png": ("openai.png", False),
    "Claude.png": ("claude.png", False),
    "DeepSeek.png": ("deepseek.png", False),
    "Gemini.png": ("gemini.png", False),
    "Mistral.png": ("mistral.png", False),
    "OpenCode.png": ("opencode.png", True),
    "xAI.png": ("xai.png", True),
}


def luminance(r: int, g: int, b: int) -> float:
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def retint(image: Image.Image, *, light_ink: bool) -> Image.Image:
    """Reescribe la tinta del glifo para un tema, conservando alpha y sombreado."""
    pixels = image.load()
    width, height = image.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            value = luminance(r, g, b)
            if light_ink:
                value = value if value >= 128 else 255 - value
                value = max(190, round(value))
            else:
                value = value if value <= 128 else 255 - value
                value = min(90, round(value))
            pixels[x, y] = (value, value, value, a)
    return image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, help="Carpeta con los PNG originales")
    args = parser.parse_args()

    source = Path(args.source)
    TARGET.mkdir(parents=True, exist_ok=True)

    for name, (dest, monochrome) in LOGOS.items():
        origin = source / name
        if not origin.is_file():
            raise SystemExit(f"Falta el origen: {origin}")
        base = Image.open(origin).convert("RGBA")
        variants = (
            [
                (dest, retint(base.copy(), light_ink=True)),
                (dest.replace(".png", "-light.png"), retint(base.copy(), light_ink=False)),
            ]
            if monochrome
            else [(dest, base)]
        )
        for filename, image in variants:
            output = TARGET / filename
            image.resize((SIZE, SIZE), Image.LANCZOS).save(output, format="PNG", optimize=True)
            print(
                f"{name:15s} -> {output.relative_to(ROOT).as_posix()}"
                f"  ({output.stat().st_size // 1024} KiB)"
            )


if __name__ == "__main__":
    main()
