# Tool validation — 2026-09-13

## Scope

This validation covers the 106 built-in Rinari Engine tools. It does not claim
that every external endpoint is available or that arbitrary third-party plugins
can never fail. A missing dependency, denied permission, cancellation or network
failure must remain an explicit error rather than a successful empty result.

## Corrections

- Native Git tools now share the bounded Git process executor used by project
  status. Output and diagnostics use temporary files instead of inherited pipes;
  stdin is closed, prompts and optional index locks are disabled, and fsmonitor
  helpers are disabled for these probes. User cancellation terminates the process
  tree. Timeouts remain bounded and preserve their structured error code.
- Missing Git working directories return `NOT_FOUND` rather than being reported
  as a missing Git installation.
- Every built-in has an output contract, including `fs.read_image`.
- Non-object tool arguments return `INVALID_ARGUMENT` before dispatch.
- Packaged-engine validation compares the public tool inventory with the engine's
  catalog, checks uniqueness and schemas, and no longer assumes 105 tools.
- Tests isolate credential storage from Windows Credential Manager by default.
  Integration-specific credential tests can explicitly override that default.

## Evidence

- The final complete Engine suite passed 1,536 tests, with 10 skipped (188.84 s).
  The additional 106 empty-input checks were added after that run's collection;
  their separate run with the 106 malformed-input checks passed all 212.
- On the actual Rinari-Agent checkout, the five Git tools succeeded through
  ToolRuntime: status 47 ms, diff 109 ms, log 47 ms, show 47 ms, branch 78 ms.
- Real subprocess regressions cover timeout, cancellation, and a descendant
  retaining output handles after the parent exits.
- 212 catalog tests passed: malformed input and empty input in an unconfigured
  temporary workspace for every built-in. The latter must succeed or return a
  structured prerequisite error, never `UNKNOWN` or an invalid output contract.
- The focused Git/runtime/contract battery passed 160 tests, with one skipped.
- The installed development engine passed the 106-tool contract smoke plus OCR
  resource hashes, Spanish recognition and scanned-PDF extraction.

The optional Engine pytest plugin `tests.tool_audit_plugin` records tool names
and result codes only. It measures ToolRuntime calls, not every direct handler
test, and some integration tests use controlled fake services. A missing success
entry is a coverage gap at that boundary, not proof that the tool fails.

Run from Rinari-CLI:

```powershell
uv run python -m pytest -q -p tests.tool_audit_plugin --tool-audit=tool-validation-report.json
```

Run the packaged smoke from Rinari-Agent:

```powershell
& ./engine-dist/python.exe scripts/check-engine-tools.py
```
