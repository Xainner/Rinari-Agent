# Attachments, OCR and vision

Rinari Agent prepares every attachment in Rinari Engine before starting a turn.
The engine imports an immutable copy into the artifact store, validates its
type and size, extracts document text, and returns stable source and derived
artifact references. Preparation can be cancelled or retried, and its state is
kept with the session draft across navigation and app restart.

Supported inputs are text and source files, PDF, DOCX, XLSX, PNG, JPEG and
WebP. A turn accepts at most eight files and 50 MiB total; each document is
limited to 25 MiB and images use the engine image limit. PDF preparation reads
at most 20 selected pages, and any of them can also be rendered for vision.
OCR work across one preparation request is limited to 20 pages and 120 seconds.

Every prepared PDF carries its reading coverage: total and prepared pages, and
per page whether it had its own text, was read with OCR, had no text
recognized, ran out of OCR budget or failed. The composer and the history show
it as "20/80 págs." with the breakdown, so a partial read never looks complete.
During the turn the agent can look at any page as an image with
`fs.read_pdf_pages` (up to four per call), including pages beyond the first 20.

Images are read in one of three ways, chosen in the composer: **Imagen** (the
model sees the pixels), **Texto (OCR)** (the recognized text replaces the
pixels) or **Texto e imagen** (both; more context). The history keeps the OCR
label, and the preview switches between the original and the recognized text.
Images are sent visually when the selected model or route has vision. If the
model declares that it lacks vision, use OCR or select another model.

The model also receives a short manifest of every attachment, images included:
name, type, size, `artifact://` URI and sha256. With it, `fs.read_image`
re-opens an image and `artifact.export` copies the original bytes to a file for
programs or uploads, so the agent does not have to ask where the file is.

The CLI equivalents are:

```text
rinari --attach path/to/document.pdf
/attach path/to/image.png
/attach --ocr path/to/image.png
/attach --vision path/to/image.png
```

`--ocr` extracts text. `--vision` explicitly permits a visual send when model
vision capability is unknown; it does not override a model that declares vision
unsupported. Warnings and truncation remain attached to the persisted message,
while previews read bounded data through the engine protocol.

The desktop package includes a checksum-pinned local Tesseract runtime. See
[OCR packaging](ocr-packaging.md) for reproducible build and smoke-test details.

## Validation and follow-up — 2026-09-11

The user confirmed in Code that the selected model receives image content.
Screenshots also confirmed the native file picker and composer thumbnail.

Remaining polish:

- Filter the native file picker to supported attachment formats and localize
  its "All Files" label.
- Allow an explicit vision capability override scoped to provider and model
  through the engine, so verified configurations do not repeatedly require
  confirmation. A successful upload alone must not infer vision support.

Automated validation: engine 1270 passed / 7 skipped, frontend 62 passed,
Rust 36 passed; protocol generation, build and packaged OCR smoke checks passed.
The Windows installer was not rebuilt as part of this validation.
