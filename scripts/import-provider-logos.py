#!/usr/bin/env python3
"""Importa los logos de proveedores a public/logos/.

Los originales son marcas 1254x1254 RGBA (transparencia, sin fondo). Para la UI
se reescalan a 256x256 y se optimiza el PNG. La marca de xAI es arte negro
sobre transparente y desaparece en el tema oscuro: para esa se invierte la
luminancia preservando el canal alpha (variante clara del mismo glifo).

Uso:
    python scripts/import-provider-logos.py --source "C:/Users/Xainner/Downloads/Logos"

El script es idempotente: vuelve a generar exactamente los mismos archivos.
Requiere Pillow (`pip install pillow`).
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "public" / "logos"
SIZE = 256

# origen -> (destino, invertir_luminancia)
LOGOS: dict[str, tuple[str, bool]] = {
    "OpenAI.png": ("openai.png", False),
    "Claude.png": ("claude.png", False),
    "OpenCode.png": ("opencode.png", False),
    "DeepSeek.png": ("deepseek.png", False),
    "Gemini.png": ("gemini.png", False),
    "Mistral.png": ("mistral.png", False),
    "xAI.png": ("xai.png", True),
}


def invert_luminance(image: Image.Image) -> Image.Image:
    """Convierte una marca oscura en su variante clara conservando el alpha."""
    pixels = image.load()
    width, height = image.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
            value = max(200, round(255 - luminance))
            pixels[x, y] = (value, value, value, a)
    return image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, help="Carpeta con los PNG originales")
    args = parser.parse_args()

    source = Path(args.source)
    TARGET.mkdir(parents=True, exist_ok=True)

    for name, (dest, invert) in LOGOS.items():
        origin = source / name
        if not origin.is_file():
            raise SystemExit(f"Falta el origen: {origin}")
        image = Image.open(origin).convert("RGBA")
        if invert:
            image = invert_luminance(image)
        image = image.resize((SIZE, SIZE), Image.LANCZOS)
        output = TARGET / dest
        image.save(output, format="PNG", optimize=True)
        print(f"{name:15s} -> {output.relative_to(ROOT).as_posix()}  ({output.stat().st_size // 1024} KiB)")


if __name__ == "__main__":
    main()
