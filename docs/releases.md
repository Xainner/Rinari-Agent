# Releases y actualizaciones de Rinari Agent

Una versión de Rinari Agent es un **release publicado** en
`Xainner/Rinari-Agent`. De ese release se actualizan la app instalada y
`rinari update`. Publicar es una acción hacia fuera: el tag lo empuja solo el
dueño, o alguien con su autorización expresa.

## Paso a paso

1. **Subir la versión.** En una rama `release/<x.y.z>`:

   ```powershell
   npm run release:bump <x.y.z>
   ```

   `scripts/bump-version.mjs` cambia la versión en todos los sitios que la
   llevan: `package.json` y su lock, el `package.json` y el lock del
   bootstrapper (`installer/setup`), su `tauri.conf.json`, `Cargo.toml` y
   `Cargo.lock`, y los valores por defecto de `scripts/finalize-setup.ps1` y
   `scripts/package-setup-payload.ps1`. Sin argumento, lista la versión de
   cada sitio.

2. **Escribir las notas** en `docs/releases/v<x.y.z>.md`, en español y para
   el usuario: qué cambia y qué se arregla, sin jerga interna. Si la versión
   migra datos y no se puede volver atrás, se avisa arriba.

3. **Fijar el Engine.** Si la versión trae cambios del Engine, su PR de
   Rinari-CLI ya está fusionado y `engine-manifest.json` apunta a ese commit
   de `main` (ver «El Engine fijado» en [AGENTS.md](../AGENTS.md)).

4. **PR y fusión** con el CI en verde y la autorización del dueño.

5. **El tag.** El dueño empuja `v<x.y.z>` sobre el commit fusionado. Eso
   dispara `.github/workflows/release.yml`.

## Qué hace `release.yml`

Solo acepta tags `v0.2.*` y `v0.3.*` (no los de la línea Tauri 0.1.x; una
línea nueva, como `v0.4.*` o `v1.*`, exige añadir su patrón al workflow).
Corre en `windows-latest` y:

- falla si el tag no coincide con la versión de `package.json`;
- descarga Rinari-CLI en el commit de `engine-manifest.json` y lo empaqueta
  (`scripts/package-engine.ps1`);
- construye la app y el instalador con `npm run package:win:staged`;
- comprueba que `latest.yml` declara `rinariUnsigned: true` y que
  `rinari-release.json` lleva la versión y el Engine fijado;
- compone las notas: el contenido de `docs/releases/<tag>.md`, si existe,
  seguido del aviso de que el instalador no está firmado;
- **publica** el release (no un borrador) como el último, con
  `Rinari-Agent-Setup-<versión>-x64.exe`, `latest.yml`, `setup.sha256.json`
  y `rinari-release.json`.

## Cómo se actualiza

- **La app** usa `electron-updater` con `latest.yml`: descarga el instalador
  completo (no hay descargas diferenciales, porque el bootstrapper no produce
  blockmaps) y comprueba su tamaño y su SHA-512. La descarga puede seguir con
  trabajo activo; **Instalar y reiniciar** pide confirmación, cierra el Engine
  y después aplica. El bootstrapper recibe `--updated /S --force-run`, repite
  la misma transacción con staging y rollback de una instalación manual, y
  relanza la versión nueva.
- **`rinari update`** (Rinari-CLI) lee `rinari-release.json` del release:
  actualiza la app desde su instalador y reinstala un CLI suelto en el mismo
  commit del Engine que lleva la app, para que los dos sigan siendo
  compatibles. El CLI que va dentro de la app se mueve con ella.

## Firma

Los instaladores **no están firmados** con Authenticode. `latest.yml` da
integridad de transporte (SHA-512), no identidad del editor, y Windows
muestra «Editor desconocido». Firmar exige un certificado Authenticode o
Azure Trusted Signing, su configuración en el CI y una prueba que valide la
firma antes de publicar. Hasta entonces no se afirma identidad del editor.
Está en [debt.md](debt.md).

## Instalador local

Construir en local no publica nada:

```powershell
npm ci
npm run package:win
```

Compone el arte, empaqueta el Engine fijado, construye la app y el
bootstrapper, y deja en `release/installer/` el instalador,
`setup.sha256.json`, `latest.yml` y `rinari-release.json`. Si el Engine ya
está empaquetado, `npm run package:win:staged` se lo salta; `npm run
package:update-metadata` regenera solo los metadatos.

Cuando el dueño pide un instalador local, la entrega va siempre a
`C:\Users\Xainner\Documents\DEV\Apps\Rinari-Agent\release\installer` (el
`release/installer/` del checkout principal, ignorado por git), con el nombre
`Rinari-Agent-Setup-<versión>-x64-<fecha>[letra].exe`, sin pisar los
anteriores y con su SHA-256.

`npm run updater:e2e` prueba el circuito instalado: construye dos versiones
de prueba (0.2.0 y 0.2.1), instala la primera en un prefijo temporal, rechaza
metadatos y payload alterados, aplica la segunda, comprueba la versión tras
el reinicio y desinstala.

## Empaquetado en el CI de los PR (`agent-ci.yml`)

`frontend` y `browser-integration` corren siempre; `frontend` incluye el smoke
de la app construida por `app://`. El empaquetado de Windows
(`windows-package`) tarda unos 27 minutos completo, y en un PR solo ejecuta
las partes que el cambio puede romper, según `scripts/ci-scope.mjs`:

| Parte | ~min | Corre si cambia |
|---|---|---|
| `cargo fmt/clippy/test` del bootstrapper | 4 | `installer/setup/**` |
| Paquete con el sidecar del Engine + instalar, arrancar y desinstalar | 8–10 | `electron/**`, `build/**`, `installer/**`, `engine-manifest.json`, `electron-builder.yml`, `package*.json`, los scripts de empaquetado, o cualquiera de las otras dos partes |
| E2E del updater (0.2.0 → 0.2.1) y `package:win:staged` | 13 | `electron/main/updates/**`, `build/app-update.yml`, `electron-builder.yml`, `package*.json`, sus scripts |

Un cambio solo de documentación o solo del renderer (`src/**`) omite el job.
En push a `main`, en `workflow_dispatch` y con la etiqueta **`ci:full`** en un
PR corre todo, así que un fallo que solo aparezca al empaquetar se detecta,
como tarde, al fusionar. Cambiar el propio workflow o `ci-scope.mjs` también
ejecuta todo. Un push nuevo a un PR cancela su ejecución anterior.

## Plataformas

Windows x64 es la única plataforma construida y probada. macOS y Linux no se
construyen: necesitarían empaquetado, firma y updater propios antes de
anunciar soporte.

## Historial

| Versión | Fecha | Commit | Engine | Notas |
|---|---|---|---|---|
| v0.3.1 | 2026-10-10 | 5d4fab5 | 2a94168 | [v0.3.1.md](releases/v0.3.1.md) |
| v0.3.0 | 2026-10-10 | 0dc9846 | cc19dc1 | [v0.3.0.md](releases/v0.3.0.md) |
| v0.2.5 | 2026-10-08 | eee0de6 | 5f5703a | sin notas |
| v0.2.4 | 2026-10-05 | 0562e3e | 515062b | sin notas |
| v0.2.3 | 2026-10-05 | 561ed42 | 515062b | sin notas |
| v0.2.2 | 2026-09-30 | bdc7754 | 515062b | sin notas |
| v0.2.1 | 2026-09-30 | 2b1e4ed | 515062b | sin notas |

Los releases 0.2.x se publicaron sin notas propias: en GitHub solo llevan el
aviso de instalador sin firmar. No hubo un release `v0.2.0` publicado. La
línea 0.1.x era la app Tauri, ya retirada; su historia está en
[historia/tauri-electron-transition.md](historia/tauri-electron-transition.md).
