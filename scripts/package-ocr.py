"""Extract pinned portable OCR resources; never execute the Tesseract installer."""

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path


def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def download(spec, cache):
    path = cache / spec["sha256"]
    if not path.is_file() or sha256(path) != spec["sha256"]:
        with urllib.request.urlopen(spec["url"], timeout=60) as response, path.open("wb") as out:
            size = 0
            while chunk := response.read(1024 * 1024):
                size += len(chunk)
                if size > 100 * 1024 * 1024:
                    raise ValueError("OCR resource exceeded download limit")
                out.write(chunk)
        if sha256(path) != spec["sha256"]:
            raise ValueError("OCR resource checksum mismatch")
    return path


def run(argv):
    result = subprocess.run(
        [str(arg) for arg in argv], capture_output=True, text=True,
        encoding="utf-8", errors="replace", timeout=120,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )
    if result.returncode:
        raise RuntimeError(f"OCR packaging failed: {result.stdout[-2000:]} {result.stderr[-1000:]}")
    return result.stdout


def main():
    if os.name != "nt":
        raise RuntimeError("This resource bundle targets Windows x86_64")
    root = Path(__file__).resolve().parent.parent
    manifest = json.loads((root / "ocr-manifest.json").read_text(encoding="utf-8"))
    output = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root / "engine-dist/ocr"
    allowed_outputs = {
        (root / "engine-dist/ocr").resolve(),
    }
    if output not in allowed_outputs:
        raise ValueError("OCR output must be the fixed Electron Engine bundle directory")
    cache = root / "build/ocr-downloads"
    cache.mkdir(parents=True, exist_ok=True)
    bootstrap = download(manifest["extractor"]["bootstrap"], cache)
    archive = download(manifest["extractor"]["archive"], cache)
    installer = download(manifest["installer"], cache)
    with tempfile.TemporaryDirectory(prefix="extract-", dir=cache) as temporary:
        stage = Path(temporary)
        # The verified bootstrap extracts 7-Zip itself from its SFX archive.
        bootstrap_exe = stage / "7zr.exe"
        shutil.copyfile(bootstrap, bootstrap_exe)
        run([bootstrap_exe, "x", archive, f"-o{stage / '7zip'}", "-y"])
        run([stage / "7zip/7z.exe", "x", installer, f"-o{stage / 'tesseract'}", "-y"])
        source = stage / "tesseract"
        resources = [(source / "tesseract.exe", Path("tesseract.exe"))]
        resources += [(path, Path(path.name)) for path in source.glob("*.dll")]
        resources += [(path, Path("doc") / path.name) for path in (source / "doc").glob("*") if path.is_file()]
        for name, checksum in manifest["tessdata"].items():
            spec = {
                "url": f"https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/{manifest['tessdata_revision']}/{name}",
                "sha256": checksum,
            }
            resources.append((download(spec, cache), Path("tessdata") / name))
        # All downloads/extraction finish before updating the existing bundle.
        output.mkdir(parents=True, exist_ok=True)
        hashes = {}
        for path, relative in resources:
            destination = output / relative
            if not destination.resolve().is_relative_to(output.resolve()) or destination.is_symlink():
                raise ValueError("OCR resource path escaped bundle")
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, destination)
            hashes[relative.as_posix()] = sha256(destination)
        version = run([output / "tesseract.exe", "--version"])
        if "tesseract v5.4.0" not in version:
            raise RuntimeError("Unexpected OCR runtime version")
        languages = run([output / "tesseract.exe", "--tessdata-dir", output / "tessdata", "--list-langs"])
        if not {"eng", "spa", "osd"}.issubset(set(languages.splitlines())):
            raise RuntimeError("OCR language resources are incomplete")
        (output / "OCR_SOURCE.json").write_text(json.dumps({
            "version": manifest["version"], "installer_sha256": manifest["installer"]["sha256"],
            "tessdata_revision": manifest["tessdata_revision"], "files": hashes,
        }, indent=2) + "\n", encoding="utf-8")
    print(f"Portable OCR ready: {output} (eng, spa, osd)")


if __name__ == "__main__":
    main()
