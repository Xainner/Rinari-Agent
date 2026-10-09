"""Extract the pinned whisper.cpp CLI for local dictation; never run an installer.

Only the CLI and the libraries it loads are kept: the official archive also
ships demos, tests and an LLM runtime the Engine never uses. The model is not
bundled: the Engine downloads it on first use, pinned by SHA-256.
"""

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
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
                if size > spec["max_bytes"]:
                    raise ValueError("Speech resource exceeded download limit")
                out.write(chunk)
        if sha256(path) != spec["sha256"]:
            raise ValueError("Speech resource checksum mismatch")
    return path


def main():
    if os.name != "nt":
        raise RuntimeError("This resource bundle targets Windows x86_64")
    root = Path(__file__).resolve().parent.parent
    manifest = json.loads((root / "speech-manifest.json").read_text(encoding="utf-8"))
    output = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root / "engine-dist/speech"
    if output.name != "speech" or output.parent.name != "engine-dist":
        raise ValueError("Speech output must be the Engine bundle's speech directory")
    cache = root / "build/speech-downloads"
    cache.mkdir(parents=True, exist_ok=True)
    archive = download(manifest["archive"], cache)
    wanted = set(manifest["files"])
    with tempfile.TemporaryDirectory(prefix="extract-", dir=cache) as temporary:
        stage = Path(temporary)
        with zipfile.ZipFile(archive) as bundle:
            for member in bundle.infolist():
                name = Path(member.filename).name
                if member.is_dir() or name not in wanted:
                    continue
                # Only flat file names from the manifest: no path from the archive is trusted.
                (stage / name).write_bytes(bundle.read(member))
        missing = wanted - {path.name for path in stage.iterdir()}
        if missing:
            raise RuntimeError(f"whisper.cpp archive is missing {sorted(missing)}")
        if output.exists():
            shutil.rmtree(output)
        output.mkdir(parents=True)
        hashes = {}
        for name in sorted(wanted):
            shutil.copyfile(stage / name, output / name)
            hashes[name] = sha256(output / name)
    cli = output / "whisper-cli.exe"
    result = subprocess.run(
        [str(cli), "--help"], capture_output=True, text=True, encoding="utf-8",
        errors="replace", timeout=60, creationflags=subprocess.CREATE_NO_WINDOW,
    )
    if "--no-timestamps" not in (result.stdout + result.stderr):
        raise RuntimeError("Unexpected whisper.cpp CLI")
    (output / "SPEECH_SOURCE.json").write_text(json.dumps({
        "build": manifest["build"], "archive_sha256": manifest["archive"]["sha256"], "files": hashes,
    }, indent=2) + "\n", encoding="utf-8")
    print(f"Local dictation ready: {output} (whisper.cpp {manifest['build']})")


if __name__ == "__main__":
    main()
