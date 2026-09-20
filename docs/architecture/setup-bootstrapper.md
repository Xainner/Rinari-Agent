# Rinari Setup bootstrapper

## Decision

Delivery G2 uses a dedicated Tauri 2 + React bootstrapper as the visible Windows setup and maintenance application. Rinari Agent remains Electron. Tauri is isolated under `installer/setup` and is not an application runtime or a second implementation of the Engine.

This product decision supersedes the sentence in document 04 §7.2 that considered a sophisticated bootstrapper unnecessary. The native-controls-only NSIS prototype established that the concept art could not be reproduced with acceptable keyboard, DPI, localization and accessibility behavior. The bootstrapper follows the separation proven by Hermes Setup: web UI for presentation, Rust for privileged filesystem and OS work.

`electron-builder` still creates the unpacked, ASAR-enabled Electron payload. `scripts/package-setup-payload.ps1` adds a versioned manifest and SHA-256 for every file, then produces the archive embedded into the release build of `Rinari-Setup.exe`.

## Screens

| Screen | Entry | Outcome |
| --- | --- | --- |
| 001 — Configure | No owned installation is present | Select per-user/per-machine scope, directory, owned shortcuts and optional CLI in PATH. Agent + Engine are mandatory. |
| 002 — Progress | Install, update, repair, modify or uninstall is running | Shows validation, staging, file copy, integrations, verification and atomic commit progress emitted by Rust. |
| 003 — Ready | Install or update completed | Opens the owned directory or log and can launch Rinari Agent. |
| 004 — Maintenance | An owned installation is detected | Offers Update only for a newer verified payload, Repair for the exact installed version, Modify, and Uninstall. |
| 005 — Uninstall confirmation | The user chooses Uninstall | Explains the exact removal boundary. User data and projects remain preserved; temporary caches are an independent opt-in. |
| 006 — Uninstall complete | Program files and owned integrations were removed | Confirms preserved data and offers Close or Reinstall. |

Windows locale selects Spanish for `es-*` and English otherwise. The ES/EN button allows correction without a separate language page. All text, controls and progress are live React elements; no localized copy or controls are baked into the artwork.

The setup frontend is fully offline. It uses the Windows Segoe UI family and a CSP limited to bundled resources; opening setup never contacts a font CDN or another external service. Failed operations remain on the progress screen with the exact error and explicit Back/Try again actions.

## Artwork

The common environment is `build/installer/source/studio-generated.png`, generated at 2048×1280 without a character, text, logo or watermark. The first three character sources are the user-approved 001, 002 and 003 PNGs. Maintenance, uninstall and goodbye use three new transparent Rinari illustrations generated from the canonical portrait and concepts 004, 005 and 006.

`scripts/compose-installer-art.ps1` deterministically creates the master background, verifies an alpha channel for all six characters and writes `art-manifest.json` with dimensions, byte sizes and SHA-256 values. Runtime composition and cropping live in CSS.

The image-generation prompts for the additional characters require an adult, fully covered Rinari, no background, no text, no logos and no watermark:

- Maintenance: waist-up welcome pose, cheek resting on one hand, plain dark mug in the other.
- Uninstall: turned slightly toward the viewer, calm and respectful expression without emotional pressure.
- Goodbye: warm, confident expression with a small open-hand wave.

## Install transaction

The Rust host performs the following transaction:

1. Validate that the destination is absolute, bounded and either empty or an owned Rinari installation.
2. Read the embedded `payload-manifest.json` and reject traversal paths or symbolic links.
3. Require enough free space for staging and rollback.
4. Extract into a sibling staging directory while checking each byte size and SHA-256.
5. Verify the complete staged tree.
6. Add the setup executable and ownership marker.
7. Rename an existing owned installation to a rollback directory and atomically promote staging.
8. Keep rollback until shortcuts, optional CLI/PATH and uninstall registration complete; restore the old files and integrations if any of those steps fail.
9. Delete rollback only after the full transaction succeeds.

Cancellation is honored before commit. It is not accepted once the atomic activation begins. Window close, Alt+F4 and the custom close button cannot terminate an active operation: before commit they request cancellation; after commit they remain deferred until the operation settles. Update, repair and uninstall refuse to proceed while `rinari-agent.exe` is running.

Per-machine operations serialize the validated plan to a temporary file and relaunch the same setup executable with Windows `runas`. The parent passes the SHA-256 of the exact plan bytes; the elevated worker hashes the file before deserializing it, then validates ownership and paths again. The worker writes bounded progress snapshots which the parent relays to the same UI. Close and Cancel remain disabled for the duration of the elevated handoff because cancellation cannot safely cross the UAC process boundary. Per-user operations never request elevation.

`--silent-install <absolute-path>` and `--silent-uninstall <absolute-path>` exercise the same Rust transaction with shortcuts and CLI disabled. They exist for the isolated Windows CI runner. `--verify-payload <empty-absolute-path>` extracts and checks every embedded file, removes the temporary tree and does not touch registry, shortcuts or user data.

## Ownership and cleanup

The marker `.rinari-install.json` contains `com.rinari.agent`, version, installation directory, scope and the integrations created by setup. Repair, modify and uninstall require this exact marker. A directory or shortcut is never claimed based only on its name.

An existing historical `rinari-code` uninstall registration is a separate, bounded transition case. Setup accepts it only when the registered display name is known and the registered directory contains `rinari-code.exe` or `rinari-agent.exe`. The UI shows the transition, locks scope and directory, requires both executables to be closed and transactionally replaces that exact directory. It removes only `rinari-code.lnk`/`Rinari Code.lnk` shortcuts whose resolved target equals the historical `rinari-code.exe`; unrelated links and similarly named directories are left untouched.

The optional CLI entry is the dedicated `<install>/cli` directory. PATH edits compare complete entries case-insensitively. Removal deletes only that exact entry. Shortcut removal resolves the `.lnk` target and deletes it only when it points to this installation's `rinari-agent.exe`.

The historical `rinari-code.exe` compatibility alias is created in staging as a hard link to `rinari-agent.exe`; setup falls back to a copy only when the destination filesystem cannot create hard links. It is deliberately absent from the compressed payload, avoiding a second physical copy of the Electron executable, and disappears with the owned installation directory.

Uninstall removes the application, bundled Engine, registered uninstall entry, the PATH entry added by setup and owned shortcuts selected for removal. It preserves by default:

- Engine home;
- providers and credentials;
- sessions, drafts and Boards;
- UI profile and preferences;
- projects and workspaces.

The optional cache action is limited to Electron `Cache`, `Code Cache` and `GPUCache`. If setup is running from the installation directory, a hidden cleanup process waits for setup to exit before deleting the final executable and directory.

## Payload and release outputs

```text
release/electron/win-unpacked/                     electron-builder staging
installer/setup/src-tauri/resources/payload/
  Rinari-Agent-Payload.zip                         embedded payload
  payload.sha256.json                              review metadata
installer/setup/src-tauri/target/release/
  Rinari-Setup.exe                                 compiled bootstrapper
release/installer/
  Rinari-Agent-Setup-0.2.0-x64.exe                review artifact
  setup.sha256.json                                hash, size and signed=false
```

`npm run package:win` builds the art, pinned Engine, Electron app, payload, bootstrapper and Electron `latest.yml` in that order. It never publishes. PR artifacts are explicitly unsigned. The release workflow keeps Tauri `v0.1.*` on its signed `latest.json` channel and builds Electron `v0.2.*` as an explicitly unsigned draft with SHA-512 transport integrity. Windows therefore shows an unknown-publisher warning until an Authenticode identity exists.

## Test boundary

The Windows CI job builds the real pinned Engine and Electron payload, compiles setup, installs into a path containing spaces and Unicode, checks the bundled Engine, runs the installed Electron smoke with isolated Engine/profile homes, uninstalls and waits for exact owned-directory cleanup. Rust tests cover ownership binding, traversal, numeric versions, payload corruption and elevated-plan tampering. DPI and keyboard evidence covers all six screens at 100, 125, 150 and 200 percent; that physical-display matrix remains a manual Windows release gate because CI cannot change host DPI without changing system settings.

G3 adds `electron-updater`, full-installer updates through this same bootstrapper, active-work confirmation and the single Engine shutdown path. The setup receives `--updated /S --force-run`, preserves the exact owned scope and integrations, waits for the running app to exit, and reuses the staging, verification, atomic rename and rollback transaction. Differential downloads are disabled because this custom setup has no NSIS blockmap.

The installed-app test proves 0.2.0 → 0.2.1, relaunch and ownership marker update. It also proves that altered metadata and corrupted setup bytes are rejected by SHA-512. These hashes establish integrity only; they do not identify a publisher. Authenticode remains pending by product decision and is not presented as complete.

## Local review evidence

Evidence recorded on 2026-09-20 from the Windows x64 G2 worktree:

| Check | Result |
| --- | --- |
| Application tests | 95 files, 726 tests passed |
| Setup Rust tests | 10 passed |
| Rust quality | `cargo fmt --check` and Clippy with warnings denied passed |
| Frontend and host | Renderer build, Electron typecheck, protocol check and parity check passed |
| Artwork | Two consecutive compositions produced the same eight-entry manifest (`7538d0de2a0f794e5e52348d787dfa79a90b2db63f7e670eaf32f4e8baa3c97d`) |
| Embedded payload | 300,713,814 bytes; SHA-256 `0505ed3ce5cba6b3f2850a45d5e9b7463e16b9f559a893fec4c1d88b691510e6` |
| Unsigned setup | 324,324,864 bytes; SHA-256 `4450e0c2066023fb21cc86b5954e7883716c96fcb1a092fa777e4560b74c5ef3` |
| Payload verification | Passed from the release EXE into a temporary path containing spaces and Unicode; the verifier removed its temporary tree |

The interactive setup was opened against the real historical Rinari Code 0.1.1 registration to verify transition detection, locked scope/path, required-space reporting and the custom 001 screen. No installation, registry write or shortcut mutation was performed on that installation. A full clean silent install, installed-app smoke and silent uninstall remain delegated to the isolated Windows CI job. Per-machine UAC and the 100/125/150/200 percent physical DPI matrix remain manual release evidence.
