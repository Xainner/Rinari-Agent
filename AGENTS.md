# Rinari Agent — reglas del proyecto

Rinari Agent es el cliente de escritorio de Rinari. La inteligencia (sesiones,
proveedores, herramientas, permisos, memoria, contexto) vive en el Engine, que
es el repositorio `Xainner/Rinari-CLI`; esta app lo arranca, habla con él por
el protocolo v1 y lo presenta. Aquí están solo las reglas vigentes. El plan
maestro v1 del 2026-09-08, con el que empezó el proyecto, está en
[`docs/historia/plan-maestro-v1.md`](docs/historia/plan-maestro-v1.md) como
histórico y no autoriza nada.

## Arquitectura: solo Electron

- El runtime de producto es **exclusivamente Electron** desde la entrega H
  (2026-09-20). No se reintroducen `src-tauri`, `@tauri-apps/*` ni un segundo
  adaptador activo: `parity:check` falla si reaparece un import, un paquete o
  una ruta de Tauri.
- El renderer (`src/`) solo habla con el host por `platform()`
  (`src/platform/electron.ts` y el contrato de `src/platform/contract.ts`).
  Nunca importa el host ni Electron directamente.
- El bootstrapper de `installer/setup` (Tauri) es una herramienta de
  distribución aislada que instala, repara y desinstala; no es el host de
  Rinari Agent.
- Desarrollo, pruebas y empaquetado usan los scripts `desktop:*`, `package:*`
  y `release:*` de `package.json`.

## El Engine fijado

- La app usa el commit exacto del Engine que dice `engine-manifest.json`
  (`engine_git_sha` y las capacidades que exige).
- Un cambio que toca los dos repositorios se fusiona **primero en
  Rinari-CLI**; después se fija ese commit de `main` en `engine-manifest.json`
  y se regeneran los tipos con `npm run protocol:generate`
  (`src/types/protocol.generated.ts`). `protocol:check` falla si quedan
  desfasados.
- En la interfaz no se dice «Engine» ni «motor»: para el usuario es Rinari.

## Comandos e intenciones

El renderer habla con el host por dos vías, y cada capacidad nueva elige una:

- **Llamada al Engine** (sesiones, proveedores, flujos, tareas…): una fila en
  `docs/migration/desktop-command-contract.json`, el inventario vigente de
  comandos, y la llamada con `platform().command()`. `npm run
  parity:inventory` regenera la allowlist y la traducción; `parity:check`
  falla ante una llamada desconocida, un comando duplicado, una clave ajena al
  inventario o un adaptador manual ausente, y `commandMap.test.ts` exige que
  el método exista en el protocolo del Engine fijado. El inventario **ya no es
  la captura de Tauri 0.1.3**: sus filas iniciales vinieron de ahí, y la foto
  original está en el commit de `origin.introduced_in`.
- **El host hace algo propio** (ventanas, diálogos, navegador nativo,
  notificaciones, integración con el sistema): una intención estrecha en
  `src/platform`, con canal propio, validación en main y test bridge.

Una fila nueva lleva `command`, `module`, `args` (nombre y `optional` de cada
parámetro del renderer), `engine_method`, `engine_params` (`key` del Engine ←
`from` del renderer), `manual` (si es `true`, con adaptador en
`electron/main/engine/commandAdapters.ts`), `passthrough` y `host_effects`.
`args[].type` y `returns` son informativos, heredados de la captura. Todo va
en `commands`: no hay listas paralelas.

main valida el nombre del comando y la forma de sus parámetros; los campos los
valida el Engine. Validarlos campo a campo en main requiere que el schema del
Engine declare los parámetros de cada método, y es el paso siguiente.

## Cómo se entrega una versión

La entrega es un **release publicado** en `Xainner/Rinari-Agent`: `npm run
release:bump <x.y.z>` sube la versión en todos los sitios, se fusiona, y
empujar el tag `v<x.y.z>` hace que `release.yml` construya y publique el
instalador, `latest.yml` y `rinari-release.json`. De ahí se actualizan la app
y `rinari update`. Publicar es una acción hacia fuera: **el tag lo empuja
solo el dueño**, o alguien con su autorización expresa. El paso a paso está en
[`docs/releases.md`](docs/releases.md).

Si el dueño pide además un instalador local, termina en
`C:\Users\Xainner\Documents\DEV\Apps\Rinari-Agent\release\installer` (el
`release/installer/` del checkout principal, ignorado por git), con el nombre
`Rinari-Agent-Setup-<versión>-x64-<fecha>[letra].exe`, sin pisar los
anteriores y con su SHA-256. No se usan otras carpetas de entrega.

## Diseño de la interfaz

Toda pantalla sigue el sistema «Obsidiana neón»:
[`docs/design/obsidiana-neon.md`](docs/design/obsidiana-neon.md). En corto:

- Solo tokens semánticos de `src/styles/index.css` (nunca hex en
  componentes).
- Componentes canónicos (`.btn`, `.field-input`, `.seg-tabs`, overlays de
  `src/components/ui`, `RinariAvatar`) en vez de estilos sueltos.
- Movimiento con propósito: entra y sale; los bucles, solo mientras algo
  trabaja; «Reducir animaciones» siempre respetado; sin `transform` sobre el
  navegador nativo; sin rebote en lo que cambia de tamaño; se animan los
  cambios del usuario y no los montajes; el foco lo dibuja el anillo global.
- Lenguaje llano (en la interfaz no se dice «Engine» ni «motor»), y ninguna
  opción que no funciona se ofrece como si funcionara.

### La interfaz no exagera

La interfaz nunca hace parecer que Rinari logró más de lo que el Engine
informa. Herramienta pedida no es herramienta ejecutada; archivo editado no
es arreglo verificado; prueba iniciada no es prueba superada; un agente que
terminó no es la tarea entera terminada; y el tono de Rinari no es estado del
sistema. El estado real de la máquina gana siempre a la personalidad y a la
animación. El razonamiento privado del proveedor no se muestra como si fuera
actividad de Rinari.

### Accesibilidad

Navegación por teclado, foco visible, diálogos y menús accesibles, tooltip en
los botones que solo llevan icono, «Reducir animaciones», contraste
suficiente, etiquetas de estado para lectores de pantalla donde se pueda, y
ninguna información crítica comunicada solo con color. Los atajos no chocan
con la escritura en el composer o en un editor.

Si la guía de diseño choca con estas dos reglas, mandan estas.

### Diseño: arte de Rinari

Rinari aparece con la expresión del estado real y nunca sustituye al texto. El
arte se genera y revisa con el proceso `art-v2` que describe la guía de
diseño, en su sección de arte.

## Comprobaciones antes de un PR

- `npx vitest run`, `npm run build`, `npm run typecheck:electron`, `npm run
  protocol:check` y `npm run parity:check`.
- Los escenarios de `tests/ui` afectados: `npm run ui:e2e -- <nombre>`. Cada
  cambio visual pasa por `npm run ui:e2e -- ui-tour`, que deja capturas de
  todas las superficies en `release/evidence/ui/ui-tour/`.
- Si el cambio toca el navegador nativo, los toasts o los overlays, también
  `npm run browser:vertical` (es la prueba `browser-integration` del CI; su
  paso TOAST-REAL pulsa la acción del toast sobre la vista nativa).
- El movimiento no se comprueba con una captura: se muestrea cuadro a cuadro
  con `requestAnimationFrame` (como `dock-pill-resize` y `boards-fold` en
  `ui-tour`). Las pruebas que miden tamaños o geometría esperan antes a que
  acaben las animaciones finitas.
- Antes de subir: los escenarios tocados varias veces, también con la máquina
  cargada y con `RINARI_UI_REDUCED_MOTION=1` (el CI corre con movimiento
  reducido), y la batería completa `npm run ui:e2e -- --all`.
- Mientras el CI de un PR está en curso, los cambios nuevos se dejan en
  commits locales y se suben cuando termina, para no reiniciarlo.
- Los PR se fusionan con el CI en verde y solo con la autorización del dueño.

## Dónde está el resto

- [`docs/debt.md`](docs/debt.md): deuda abierta, con su estado.
- [`docs/migration/desktop-parity.md`](docs/migration/desktop-parity.md): el
  inventario de comandos, generado.
- [`tests/ui/README.md`](tests/ui/README.md): cómo funcionan las pruebas
  nativas de interfaz.
- [`docs/historia/`](docs/historia/README.md): planes y revisiones ya
  terminados.
