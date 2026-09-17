# Releases y auto-update de Rinari Agent

Rinari Agent se auto-actualiza desde GitHub Releases (el
instalador trae Agent + engine empaquetado; un update trae ambos).

## Cómo publicar una versión

1. Subir versión en 4 lugares (deben coincidir):
   - `package.json` → `version`
   - `src-tauri/tauri.conf.json` → `version`
   - `src-tauri/Cargo.toml` → `version`
   - `src/App.tsx` → `APP_VERSION`
2. Engine pineado: el release empaqueta el SHA de `engine-manifest.json`
   (repo `Xainner/Rinari-CLI`). Para adoptar un engine nuevo, actualizar
   `engine_git_sha` (+ `engine_version` si cambió) en ese archivo; el
   workflow y `scripts/package-engine.ps1` fallan si no coinciden.
3. Commit + push a `main`.
4. Tag y push del tag: `git tag v0.1.2 && git push origin v0.1.2`
   (el workflow valida que el tag coincida con `package.json`).
5. GitHub Actions construye el instalador Windows + `latest.json`
   firmado y deja el release en **draft**.
6. Revisar el draft, publicar. A partir de ahí las apps instaladas
   avisan solas (toast al abrir + botón en Ajustes → Acerca de).

## Claves de firma (updater)

- Privada: `C:/Users/Xainner/.tauri/rinari-code.key` (SOLO en esta
  máquina, jamás al repo).
- Password: `C:/Users/Xainner/.tauri/rinari-code.key.pw`.
- Pública: en `tauri.conf.json` → `plugins.updater.pubkey`.
- Secretos del repo (ya configurados con `gh secret set`):
  `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- Si se pierde la privada, las apps ya instaladas NO aceptarán más
  updates: hay que reinstalar a mano. Hacer backup.

## Notas

- Migración de identidad y gates: [identity-migration.md](identity-migration.md).
- Las rutas históricas de la clave privada se conservan deliberadamente; no generar
  otra clave por el cambio de marca. Los secretos de GitHub conservan sus nombres.

- Endpoint del updater:
  `https://github.com/Xainner/Rinari-Agent/releases/latest/download/latest.json`
  (requiere repo público).
- Sin releases publicados, `check()` falla en silencio: la app sigue
  normal, sin toasts.
- Firmar en local solo funciona en terminal en primer plano: el runner en
  fondo no propaga `export` al build (los bundles salen igual, pero sin
  `.sig`). Para releases, firmar siempre en CI.
- Matriz actual: solo Windows. Ampliar a macOS/Linux cuando se necesite
  (el sidecar Python empaquetado es por plataforma).
- Boards (rama `feature/multiboard`): el pin del Engine apunta al commit de
  `feature/session-peer-messaging` de Rinari-CLI. `npm run protocol:check`
  en CI necesita ese SHA publicado en GitHub; en local se regenera con
  `RINARI_ENGINE_SCHEMA=<ruta al schema del CLI>`. La capability
  `session_peer_messaging_v1` es opcional: sin ella el board funciona sin
  mensajería. Las notificaciones del sistema no van en este build (ver
  `docs/debt.md`); el título de ventana usa `core:window:allow-set-title`.
- `v0.1.1`: primera versión con updater. Incluye guards de sesión vacía
  con versión en el mensaje + fail-fast en el frontend para separar bugs
  de UI de bugs del puente (nota: se probó aceptar snake+camel en Rust y
  se revirtió: dos params casi idénticos confunden al parser de Tauri).
