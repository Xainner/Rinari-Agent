# Evidencia de entrega G3 — updater Electron

Fecha: 2026-09-20

Plataforma: Windows x64

Canal: Electron `latest.yml`, explícitamente unsigned

## Resultado instalado

El harness instaló Rinari Agent 0.2.0 en una ruta temporal con espacios y
Unicode, sirvió un feed HTTP local, ejercitó el updater desde la aplicación
instalada y limpió la instalación al terminar.

| Caso | Resultado | Evidencia observada |
| --- | --- | --- |
| Metadata SHA-512 alterada | PASS — rechazada | `sha512 checksum mismatch`; la aplicación permaneció en 0.2.0 |
| Instalador alterado después de publicar metadata | PASS — rechazado | `sha512 checksum mismatch`; no se activó la descarga |
| 0.2.0 → 0.2.1 | PASS | descarga, confirmación de lifecycle, cierre del Engine, instalación y relaunch |
| Versión relanzada | PASS | `app.getVersion()` devolvió 0.2.1 |
| Ownership marker | PASS | `.rinari-install.json` quedó en 0.2.1 |
| Instalador 0.2.0 normal | PASS | instalación Unicode, renderer/Engine smoke y desinstalación exacta |
| Integraciones existentes | PASS por contrato y unidad | update reutiliza el registro exacto de scope, Start Menu, escritorio y CLI PATH |
| Rollback transaccional | PASS por pruebas de setup | staging y activación atómica restauran la instalación previa ante fallo |
| Authenticode | PENDING | omitido por decisión del propietario; el canal anuncia `unsigned: true` |
| Release público | NOT_RUN | no se creó tag ni se publicó release |
| macOS/Linux | NOT_RUN | fuera de la matriz Windows x64 |

El E2E validó los errores contra el instalador real de 324,308,992 bytes. Los
hashes concretos pertenecen al artefacto local de prueba y no se reutilizan
como identidad de release.

## Contratos verificados

- `electron-updater` está configurado con descarga manual, actualización hacia
  delante, sin auto instalación al cerrar y sin differential download.
- “Sin actualización” vuelve a `idle` aunque el proveedor devuelva metadata de
  la versión actual.
- Descargar no cierra el Engine.
- Aplicar requiere una descarga ya verificada y usa `QuitCoordinator` con razón
  `update`.
- Cancelar la confirmación mantiene el estado `downloaded`.
- `quitAndInstall(true, true)` solo se invoca después del shutdown coordinado.
- Tauri 0.1.x permanece en `latest.json`; Electron 0.2.x usa `latest.yml`.

## Automatización

`scripts/updater-e2e.ps1` reproduce la matriz y escribe JSON temporales para
CI. El job Windows sube esos JSON como evidencia del run junto con el
instalador unsigned y su metadata. Los artefactos pesados y resultados
temporales permanecen fuera de Git.

El feed genérico y el runner headless se habilitan con una constante de
compilación solo en los fixtures generados por `package-test-version.ps1`.
Una build normal no consulta `RINARI_UPDATE_FEED_URL` ni ejecuta el harness
aunque esas variables existan en el entorno; usa exclusivamente GitHub.

La validación final también pasó 129 archivos / 866 pruebas de aplicación,
typecheck del host Electron, build del renderer, protocolo, paridad, Rustfmt,
Clippy con warnings denegados y 11 pruebas del bootstrapper.
