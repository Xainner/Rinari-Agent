# Portable OCR runtime

Rinari Engine owns document extraction and OCR. Rinari Agent distributes a local
Tesseract runtime alongside its embedded Python interpreter; it does not install
Tesseract globally or change the user's PATH.

## Reproducible Windows resources

`ocr-manifest.json` pins the Windows x64 Tesseract distribution, extraction
utility, and Spanish, English and orientation language data. Each download must
match its SHA-256 before use. The Tesseract installer is extracted, never run.
The resulting `engine-dist/ocr` directory includes the executable, DLLs, language
data, license documentation and an `OCR_SOURCE.json` resource checksum manifest.
Build-only downloads remain under `build/ocr-downloads` and are not shipped.

Build OCR independently from the repository root:

```powershell
python scripts/package-ocr.py
```

The normal `scripts/package-engine.ps1` workflow builds it automatically and
runs the engine contract and OCR smoke tests in temporary directories. The OCR
smoke checks packaged resource hashes and recognition of a synthetic Spanish
sentence containing `ñ` and accents. It requires no provider connection.

For development, the engine can use `RINARI_TESSERACT_BIN` to locate an explicit
executable, the packaged copy, or a system installation on PATH. The language
files must be available to that installation; `TESSDATA_PREFIX` can identify
their directory. Distribution builds include their own language files.

## Updating

Update URLs, versions and checksums together, review upstream licenses and rerun
both packaging and clean-directory smoke tests. A checksum mismatch fails the
build. Do not resolve a mismatch by disabling verification.

Sources: [Tesseract installation documentation](https://tesseract-ocr.github.io/tessdoc/Installation.html),
[UB Mannheim Windows builds](https://github.com/UB-Mannheim/tesseract/releases),
[Tesseract language data](https://github.com/tesseract-ocr/tessdata_fast),
[7-Zip releases](https://github.com/ip7z/7zip/releases).
