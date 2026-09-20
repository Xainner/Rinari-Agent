"""Check the packaged engine contract without touching the user's Rinari home."""

import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


def check_ocr(python):
    from PIL import Image, ImageDraw, ImageFont

    folder = python.parent / "ocr"
    manifest = json.loads((folder / "OCR_SOURCE.json").read_text(encoding="utf-8"))
    for relative, expected in manifest["files"].items():
        path = (folder / relative).resolve()
        assert path.is_relative_to(folder.resolve()), "Invalid OCR resource path"
        with path.open("rb") as stream:
            assert hashlib.file_digest(stream, "sha256").hexdigest() == expected, relative
    with tempfile.TemporaryDirectory(prefix="rinari-ocr-smoke-") as work:
        image_path = Path(work) / "spanish.png"
        image = Image.new("RGB", (2200, 300), "white")
        font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 64)
        ImageDraw.Draw(image).text(
            (50, 90), "Ma\u00f1ana habr\u00e1 caf\u00e9: a\u00f1o 2026.", font=font, fill="black"
        )
        image.save(image_path, dpi=(300, 300))
        result = subprocess.run(
            [str(folder / "tesseract.exe"), str(image_path), "stdout",
             "--tessdata-dir", str(folder / "tessdata"), "-l", "spa+eng", "--psm", "6"],
            capture_output=True, text=True, encoding="utf-8", timeout=30,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        assert result.returncode == 0, "Packaged OCR failed"
        assert all(word in result.stdout for word in ("Ma\u00f1ana", "caf\u00e9", "a\u00f1o")), result.stdout
        pdf_path = Path(work) / "scanned spanish.pdf"
        image.save(pdf_path, format="PDF", resolution=150)
        extraction = subprocess.run(
            [str(python), "-c",
             "import json,sys; from pathlib import Path; "
             "from rinari.artifacts.attachments import _extract_pdf; "
             "print(json.dumps(_extract_pdf(Path(sys.argv[1]))))", str(pdf_path)],
            capture_output=True, text=True, encoding="utf-8", timeout=45,
            env={**os.environ, "RINARI_HOME": str(Path(work) / "home"),
                 "RINARI_KEYRING": "0", "PYTHONUTF8": "1",
                 "RINARI_TESSERACT_BIN": str(folder / "tesseract.exe")},
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        assert extraction.returncode == 0, "Packaged PDF extraction failed: " + extraction.stderr
        extracted, used_ocr, warning = json.loads(extraction.stdout)
        assert used_ocr and warning is None
        assert all(word in extracted for word in ("Ma\u00f1ana", "caf\u00e9", "a\u00f1o")), extracted
    print("Packaged OCR: hashes, Spanish recognition and scanned PDF extraction OK")


def main():
    root = Path(__file__).resolve().parent.parent
    python = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root / "engine-dist/python.exe"
    manifest = json.loads((root / "engine-manifest.json").read_text(encoding="utf-8"))
    requests = [
        {"id": "info", "method": "engine.info", "params": {}},
        {"id": "tools", "method": "tool.list", "params": {}},
    ]
    with tempfile.TemporaryDirectory(prefix="rinari-contract-smoke-") as home:
        result = subprocess.run(
            [str(python), "-m", "rinari", "engine", "--stdio"],
            input="".join(json.dumps(row) + "\n" for row in requests),
            capture_output=True, text=True, encoding="utf-8", timeout=45,
            env={**os.environ, "RINARI_HOME": home, "RINARI_KEYRING": "0", "PYTHONUTF8": "1"},
        )
    assert result.returncode == 0, "Packaged engine exited unsuccessfully"
    frames = [json.loads(line) for line in result.stdout.splitlines() if line.strip()]
    replies = {frame.get("id"): frame for frame in frames if frame.get("id")}
    assert replies["info"]["ok"] and replies["tools"]["ok"], "Engine requests failed"
    info = replies["info"]["result"]
    for name in manifest["required_capabilities"]:
        assert info["capabilities"].get(name) is True, f"Missing capability: {name}"
    rows = replies["tools"]["result"]["tools"]
    from rinari.tools.catalog import builtin_catalog

    expected = set(builtin_catalog().names())
    names = {row["name"] for row in rows}
    assert len(rows) == len(names), "Duplicate tool names"
    assert names == expected, f"Tool catalog mismatch: missing={expected - names}, extra={names - expected}"
    assert all(row.get("input_schema") and row.get("output_schema") for row in rows)
    print(f"Packaged engine: {len(names)} unique tools, input/output contracts and required capabilities OK")
    check_ocr(python)


if __name__ == "__main__":
    main()
