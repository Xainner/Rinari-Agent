# Rinari Code → Rinari Agent

> Documento histórico de la transición 0.1.1 → 0.1.2. No describe el runtime
> activo 0.2.x ni sus comandos de desarrollo; el cutover Electron se documenta
> en `docs/migration/tauri-electron-transition.md` y `docs/evidence/delivery-h.md`.

The desktop identity changes in 0.1.2. The engine protocol, engine home,
credentials, sessions and `RINARI_ENGINE_*` variables do not change.

## Identity

| Surface | New identity |
| --- | --- |
| Product / window / menus | Rinari Agent |
| Repository | Xainner/Rinari-Agent |
| npm / Cargo / executable | rinari-agent |
| Rust library | rinari_agent_lib |
| Tauri application ID | com.rinari.agent |
| CLI entry point | rinari desktop |
| CLI executable override | RINARI_AGENT_BIN |

`rinari agent` remains the autonomous task command. The CLI checkout adds
`rinari desktop` and retains `rinari code`, `RINARI_CODE_BIN` and the old PATH
binary as compatibility aliases. Ship those CLI changes separately; the desktop's
pinned engine SHA does not automatically include uncommitted CLI work.

## Profile migration

Before Tauri creates its WebView, the native host copies the old application
profile into a staging sibling, then renames it into the new application ID.
Windows checks both LOCALAPPDATA and APPDATA; macOS checks Application Support;
Linux checks XDG data/config bases. Only the explicit application subdirectory
is copied. The engine's home is never migrated or duplicated.

- Original profiles remain intact for recovery.
- Existing destination profiles are never merged or overwritten.
- Symlinks and Windows reparse points fail closed.
- A failed copy does not publish a partial destination. Its staging directory is
  retained for inspection; retry with a fresh process after resolving the error.
- Close the old application before the first launch. Windows checks for a running
  `rinari-code.exe`, excluding the current process when launched via its alias.
- A migration error stops startup instead of silently starting with empty data.
- Migration is not bidirectional: changes in Agent are not written to Code.

## Installer compatibility

The checked-in NSIS template is from Tauri CLI **2.11.4**, with a small deliberate
delta: retain the historical `rinari-code` registry installation identity, and
recognize the old MSI display names. The public product name and new application
ID are independent of these compatibility keys. Rebase this template when updating
Tauri CLI. Source: https://github.com/tauri-apps/tauri/tree/tauri-cli-v2.11.4

NSIS upgrades retain the recorded installation directory, replace the main binary,
migrate known shortcuts only when they target the old binary in that directory,
and install a `rinari-code.exe` compatibility copy. It is removed by the new
uninstaller. New installs display Rinari Agent and use the new default directory.

WiX keeps UpgradeCode `7276052a-b876-5a53-bd4c-affa5a291124`, observed in the local
0.1.1 WiX output whose ProductName was `rinari-code`. The later source configuration
named `Rinari Code` would derive a different code (`6d5b151b-8a01-5869-acf7-48e2f5ddd494`).
MSI upgrade continuity for that alternate family is not claimed: inspect the actual
installed MSI before release; installations from that family require a deliberate
uninstall/reinstall or an additional MSI migration. NSIS and MSI cross-upgrades also
require separate validation. Prefer NSIS for the release's compatibility launcher.

## Updates and release gate

The active checkout may retain its old physical folder name while development tools
are running. Close those tools and run `scripts/rename-workspace.ps1` from a separate
PowerShell (`-WhatIf` previews the operation). It only renames the named checkout to
a sibling, refuses an existing destination and does not stop other tasks. Reopen
the renamed folder in the IDE afterwards. The Git remote is already the new URL.

The updater points at Xainner/Rinari-Agent. Keep the existing updater signing key
and GitHub secret names; the historical local key filenames are not branding.
Do not reuse the old repository name, because existing clients depend on its
redirect. No release is published by this source change.

Before publishing:

- Verify a clean install and a 0.1.1 → 0.1.2 upgrade for NSIS and MSI.
- Verify no stale shortcuts or duplicate uninstall entries remain.
- Verify the new executable relaunches after an updater install.
- Verify preferences, composer drafts and window state migrate with the real WebView.
- Verify existing engine sessions/providers still open, including CLI handoff.
- Verify the old updater URL redirects to a valid signed latest.json.
- Test a signed update with the existing key; unsigned local builds do not prove it.
- Validate Linux/macOS on their hosts before advertising those migration paths.

Rollback: close Agent and use the untouched Code profile with the old build.
Do not delete either profile automatically. Reinstalling Code does not reverse
new engine-level changes; engine state is shared and is not rolled back here.
