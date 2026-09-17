# Deuda explícita — Rinari Agent

Ledger vivo de recortes deliberados. Estados: `OPEN`, `PARTIAL`, `DONE` y
`WONTFIX`. Los elementos `DONE` tienen evidencia automatizada o un smoke
documentado; lo demás no se presenta como terminado.

## Documentos 1–3 — DONE (2026-09-09)

### Núcleo estabilizado

- **Contrato único** — `DONE`. Rinari Engine publica JSON Schema v1; Code
  genera inventario y DTO TypeScript/Rust y CI ejecuta `protocol:check`.
- **Runtime autoritativo** — `DONE`. Historial, snapshot y eventos pasan por
  normalizadores/reducer deterministas. Cancelación y terminales provienen del
  Engine; Code solo representa `cancelling` mientras reconcilia.
- **Shell no bloqueante** — `DONE`. Git, catálogo y providers están fuera del
  hilo de ventana, con plazos y errores estructurados.
- **Provider Wizard** — `DONE`. Borrador reanudable sin credenciales,
  identidad persistida y operaciones idempotentes por ID.
- **Distribución** — `DONE` para estabilización. Engine fijado al SHA exacto
  de `engine-manifest.json`; empaquetado limpio, handshake/capacidad y turno
  real mediante `EngineSupervisor` verificados.

### Gobernador automático

- **Runtime** — `DONE`. `ProgressMonitor`, `TurnGovernor`, `BudgetMeter` y
  `EmergencyCircuitBreaker` separan progreso normal de cortes extraordinarios.
- **Compactación** — `DONE`. `GovernorAction.COMPACT`, evento
  `governor.compact`, deduplicación y reconstrucción desde snapshot.
- **Recuperación** — `DONE`. Consolidar → cambiar estrategia → finalizar o
  detener; loops persistentes terminan con razón estructurada.
- **Prueba larga** — `DONE`. Un turno determinista supera 100 llamadas reales
  al modelo falso sin activar límites artificiales.

### Proyectos y sesiones

- **Proyectos** — `DONE`. Registro con selector nativo, metadata editable,
  pin, archivado/restauración, búsqueda y Project Home. Registrar o retirar no
  inicializa Git ni crea `.rinari/`.
- **Sesiones** — `DONE`. CHAT y PROJECT separados, renombrar, cerrar,
  archivar, restaurar, eliminar y bifurcar; identidad de proyecto preservada y
  mutaciones destructivas protegidas por `TURN_RUNNING`.
- **Git vivo** — `DONE`. Rama, detached HEAD, dirty, cambios, ahead/behind,
  no-Git, carpeta ausente y `GIT_TIMEOUT` conservan su significado hasta UI.

## Deuda vigente

### Base integrada Boards + procesos (2026-09-16, plan 00/01)

- **Controles duplicados** — `DONE`. `PaneHeader` ya no edita modelo ni modo;
  Composer es el único propietario (`BoardView.controls.test.tsx`).
- **Respuesta final duplicada** — `DONE`. `TurnResult` + `TurnMeta`
  compartidos; `ResultSummaryCard` solo como resumen fuera del chat
  (`TurnResult.test.tsx`).
- **Anclas de scroll al colapsar** — `DONE`. `scrollAnchors.ts` guarda fila +
  offset o «seguir el final» y `ChatView` restaura sin timeouts
  (`ChatView.scroll.test.tsx`).
- **Lectura por centinela de 1 px** — `DONE`. `useResultVisibility` observa el
  cuerpo real (`useResultVisibility.test.tsx`).
- **Navegador flotante global** — `DONE` como presentación: vive en el dock de
  la sesión (`SessionWorkspace`). El transporte sigue siendo el poll JPEG de
  `browser.view.get`, rotulado como vista previa; el browser nativo con el
  target del Engine es el documento 03.
- **Capturas con el navegador oculto** — `DONE`. `browser.view.get` siempre
  ejecuta `Page.captureScreenshot` cuando hay browser conectado: no hay modo
  solo-metadata. Por eso solo se sondea a cadencia de capturas con la
  superficie a la vista y, fuera de ella, con una sonda puntual al montar y al
  terminar un turno (`useBrowserFrame.test.tsx`), nunca con un temporizador de
  fondo — documento 03 §10 y documento 04 §5 («browser oculto: sin poll de
  screenshots de UI»).
- **Layout del dock guardado antes del hello** — `DONE`. `setHomeId` reindexa
  del namespace por defecto al `home_id` real sin pisar un layout existente
  (`sessionDock.test.ts`).
- **Aprobación antes de la comprobación de pares** — `DONE` (Engine).
  `ToolDefinition.precheck` rechaza destinos inválidos antes del
  consentimiento y `deliver` revalida después (`test_engine_peers.py`).
- **Layout del dock por Engine home** — `DONE`. `sessionDock` se indexa por
  `home_id` (nuevo en el hello) + sesión; el board migró a schema 3.
- **ResultSummaryCard** — `WONTFIX`. Se retiró: no tenía consumidor en la app
  y el doc 01 §4.2 solo admite una tarjeta con extracto fuera de la
  conversación y enlazando al turno original. Portarla a Electron sin uso era
  deuda pura; si alguna superficie de pendientes la necesita, se recupera del
  historial y se implementa con ese enlace.
- **Recibos de lectura por instalación** — `OPEN`. `boardAttention` sigue
  indexado por `rinari.profile.v1`; podría adoptar el mismo `home_id` que
  `sessionDock`.
- **`cargo fmt` bloqueado en la máquina de integración** — `NOT_RUN` local:
  Control de aplicaciones bloquea `cargo-fmt` (os error 4551); se verificó con
  `rustfmt --check` directo y CI ejecuta `cargo fmt --check`.

### Interfaz de plataforma (2026-09-17, plan 02, entrega C)

- **Inventario de paridad** — `DONE`. `scripts/desktop-parity.mjs` lo genera del
  código y `parity:check` corre en CI: 130 comandos, 3 eventos y las APIs de
  `@tauri-apps` usadas directamente. No puede divergir del host.
- **Imports de Tauri fuera del adaptador** — `DONE` para componentes y
  servicios: solo `src/platform/tauri.ts` importa `@tauri-apps`, y
  `parity:check` falla si reaparece uno. La suite quedó verde sin reescribir
  tests, que es la prueba de que el adaptador conserva el comportamiento.
- **Tests que montan el host directamente** — `OPEN`. Once archivos de test
  siguen haciendo `vi.mock('@tauri-apps/…')` en vez de `createTestBridge()`.
  Funciona porque la implementación Tauri pasa por esos módulos, pero dejará de
  hacerlo cuando el host por defecto sea Electron (entrega D): entonces hay que
  migrarlos o dejarán de probar el camino real.
- **`mcp_get` sin llamador** — `OPEN`. Registrado en `invoke_handler` y expuesto
  al WebView, pero ningún archivo de `src/` lo invoca. Decidir si se retira
  antes de portarlo al host nuevo: es superficie que nadie usa.
- **Validación en ejecución de la allowlist** — `DONE` (entrega D).
  `electron/shared/validation.ts` usa el mismo inventario generado como
  allowlist en ejecución, y `electron/main/ipc/register.ts` valida emisor,
  método, tipos y tamaño antes de tocar el Engine (`security.test.ts`).

### Host Electron (2026-09-17, plan 02, entrega D)

- **Transporte y supervisor** — `DONE`. Portados con sus plazos, códigos y
  estados; probados contra un Engine falso con eventos intercalados, Unicode
  partido, respuestas tardías, EOF, stderr voluminoso y cierre.
- **Frontera de privilegios** — `DONE`. Origen exacto, frame principal,
  allowlist en ejecución y preload sin `ipcRenderer`. El smoke comprueba que el
  renderer carga desde `app://rinari` sin `window.require` ni `window.process`.
- **Arranque real** — `DONE` como smoke: `npm run desktop:smoke` abre Electron
  y verifica renderer, puente y ausencia de fugas. **No** es paridad: los 130
  comandos del inventario no están ejercitados contra el host nuevo.
- **Traducción comando → método del protocolo** — `OPEN`, y es el grueso de lo
  que falta de D. El nombre del comando **no** es el método: `session_get`
  habla con `session.get`, y los argumentos se renombran (`reference` → `ref`
  en 21 comandos). El host Tauri hacía esa traducción en 130 handlers Rust;
  `services.engine.request` del host nuevo reenvía el nombre del comando tal
  cual, así que **hoy ninguna llamada de dominio funcionaría en Electron**. El
  inventario ya lleva método real y renombrados como especificación
  (`commandMap.test.ts` lo fija), y quedan 124 traducciones por escribir: 45
  de identidad, 21 con `reference` → `ref`, 4 casos especiales y 54 cuyo
  wrapper arma los parámetros de otra forma y hay que leer uno a uno.
- **Updater de Electron** — `OPEN` declarado. `createUpdates()` lanza
  `UPDATES_UNAVAILABLE`: el canal firmado tiene otro contrato de metadata que
  el `latest.json` de Tauri y es trabajo del documento 04 §8 (entrega G). Un
  permiso ausente se muestra ausente, no como éxito simulado.
- **Trabajo activo al cerrar** — `PARTIAL`. Se pregunta siempre que el Engine
  esté en marcha, que peca de prudente; saber si hay turnos vivos exige
  preguntárselo al Engine y está pendiente.
- **Menú de aplicación y notificaciones** — `OPEN`. El menú nativo de
  aplicación (`menu.rs`) y el adaptador de notificaciones del §7 no están
  portados; el canal `PUSH.menuAction` existe pero nadie lo emite todavía.
- **Empaquetado** — `OPEN`. `electron-builder`, el sidecar del Engine en
  recursos y el instalador NSIS son del documento 04 (entrega G).

### Boards y mensajería entre paneles (2026-09-15)

- **Notificaciones del sistema** — `OPEN`. Requiere `tauri-plugin-notification`
  (dependencia nueva con autorización). El adaptador `services/notifications.ts`
  declara `canSend=false`; el ajuste aparece como no disponible. La activación
  por clic en desktop no está verificada y no debe anunciarse.
- **Conflictos de escritura entre paneles del mismo proyecto** — `OPEN`. El
  Engine no serializa dos sesiones sobre el mismo root; el board solo avisa.
- **`busy` en `session.list`** — `OPEN`. La barra superior deriva "trabajando"
  del runtime; tras un arranque en frío el sidebar no sabe si una sesión no
  abierta está ocupada hasta que llega un evento.
- **Perfil de lectura por instalación** — `OPEN`. Los recibos se indexan por
  `rinari.profile.v1` (id local aleatorio); si el Agent apunta a otro home de
  Engine con la misma instalación, los recibos se comparten.
- **Compilación Rust en Windows con Smart App Control** — `OPEN`. `cargo
  clippy/test` no ejecutan en esa máquina (os error 4551); solo `cargo fmt`.
  CI cubre clippy y test.

- **Timeline narrativa (archivo 4)** — `OPEN`. La actividad cronológica
  persistida, correlación completa de llamadas y presentación narrativa se
  implementarán en el siguiente ciclo; no se adelantaron dentro de 1–3.
- **Permisos + TurnChangeSet (archivo 5)** — `OPEN`. Sigue su documento
  normativo y comienza después del timeline.
- **Bundle JavaScript grande** — `OPEN`. El chunk principal ronda 916 kB sin
  comprimir. Aplicar code splitting al incorporar paneles pesados.
- **Firma de release** — `OPEN`. MSI y NSIS se construyen localmente, pero la
  firma final requiere `TAURI_SIGNING_PRIVATE_KEY` del pipeline de release.
- **Fonts remotas** — `OPEN`. Autoalojar WOFF2 permitirá retirar la excepción
  de Google Fonts del CSP y mejorar el modo offline.
- **P2 pospuestos** — `OPEN`. Terminal completo, Soul avanzado, Agent Studio
  enriquecido y grafo visual de tareas quedan fuera del cierre 1–3 acordado.

## Evidencia del cierre

- Rinari-CLI: 1,111 pruebas completas antes del test largo adicional; 25
  pruebas focalizadas del presupuesto después, Ruff y formato limpios.
- Rinari Agent: 37 pruebas React, 30 pruebas Rust, TypeScript/Vite, Clippy y
  formato limpios.
- Sidecar: build limpio desde el SHA fijado, handshake v1 y
  `desktop_turn_runtime_v3`.
- Provider real: turno aceptado y `turn.completed` a través del
  `EngineSupervisor`, sin registrar endpoint, modelo ni credenciales.
- Tauri release: binario, MSI y NSIS construidos; la fase posterior de firma
  se detuvo correctamente por ausencia de la clave privada de release.
