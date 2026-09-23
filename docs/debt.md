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

- **Inventario de paridad** — `DONE`. `scripts/desktop-parity.mjs` compara las
  llamadas actuales con el contrato capturado de 0.1.3 y `parity:check` corre
  en CI: 130 comandos, 124 del Engine, 6 del host y cero sin resolver.
  Desde el 2026-09-23 ese fichero es el inventario vigente de comandos de
  Electron, no una captura; la regla para ampliarlo está en `AGENTS.md`,
  «Comandos e intenciones».
- **Imports de Tauri en el producto** — `DONE` (entrega H). El adaptador, las
  dependencias raíz y el runtime activo fueron retirados; `parity:check` falla
  si reaparece un import, paquete o ruta activa.
- **Tests que montaban el host directamente** — `DONE` (entrega H). Los tests
  heredados usan `createTestBridge()` y prueban el contrato de plataforma sin
  simular módulos `@tauri-apps`.
- **`mcp_get` sin llamador** — `OPEN`. Registrado en `invoke_handler` y expuesto
  al WebView, pero ningún archivo de `src/` lo invoca. Decidir si se retira
  antes de portarlo al host nuevo: es superficie que nadie usa.
- **Validación en ejecución de la allowlist** — `DONE` (entrega D).
  `electron/shared/validation.ts` usa el mismo inventario generado como
  allowlist en ejecución, y `electron/main/ipc/register.ts` valida emisor,
  método, tipos y tamaño antes de tocar el Engine (`security.test.ts`).

### Vista Flujos (2026-09-18, plan 06)

- **Derivación del flujo en el Engine** — `DONE`. `flow.get`
  (`project_flow_v1`) agrupa turnos en etapas y ciclos; React solo presenta
  (`FlowView.test.tsx`, `test_engine_flow.py`).
- **Progreso honesto** — `DONE`. `null` → «sin datos»; tareas vacías → «sin
  tareas registradas»; nunca un ratio de turnos.
- **Revelado del turno tras cambiar de sesión** — `DONE`. La petición se
  encola (`requestTurnReveal`) y `ChatView` la consume al montar la sesión
  (FLOW-10); antes se perdía si el evento llegaba antes del montaje.
- **Detalle por turno dentro de una etapa** — `OPEN` declarado (fase 2). El
  drawer muestra la etapa; abrir cada turno en el detalle exigiría
  `session.timeline` bajo demanda.
- **Títulos de etapa generados por IA** — fuera de alcance deliberado. El
  título es el encabezado del plan o el primer mensaje del usuario, sin
  llamadas al modelo.
- **`ResultSummaryCard` como resumen fuera del chat** — sin consumidor; la
  tarjeta de etapa no la reutiliza porque resume una racha, no un turno.
- **Cargo bloqueado localmente** — `NOT_RUN`. Control de aplicaciones impide
  `rustc`/`cargo-clippy` en la máquina de desarrollo; `rustfmt --check` sí
  corre y CI cubre `cargo test`/`clippy`.

### Cierre del ciclo de vida de salida (2026-09-18)

- **Salir podía detener el Engine antes de preguntar** — `DONE`. `Cmd+Q`, el
  menú y `app.quit()` entraban por `before-quit`, que cerraba el Engine antes
  del diálogo: cancelar dejaba la ventana abierta con el turno ya interrumpido.
  `QuitCoordinator` es ahora la única autoridad y pregunta **antes** de tocar
  nada (QUIT-01..07).
- **Las sondas salían con `app.exit()`** — `DONE`. Saltaba el ciclo de vida y
  el Engine hijo se quedaba vivo con el home temporal sujeto; ahora se cierra
  explícitamente antes de salir (LIFE-04).
- **PUSH sin comprobar el destino** — `DONE`. El envío al renderer exige que
  siga en el origen de confianza, no solo que la ventana exista
  (SEC-PUSH-01..03). Es defensa en capas: el IPC entrante ya validaba.
- **Confirmación de cierre conservadora** — `OPEN` declarado. Se pregunta
  siempre que el Engine esté en marcha; saber si hay turnos vivos exige una
  consulta al Engine que no existe todavía. Lo obligatorio —preguntar antes de
  cerrar— sí se cumple.

### Correcciones del PR #9 (2026-09-17)

- **Operaciones del host por `command()`** — `DONE`. `engine_start` y las otras
  cinco no son métodos del protocolo: el contrato las expone como intenciones
  (`engine.*`, `handoff.initial`, `files.openExternal`) y `command()` solo
  acepta comandos respaldados por el Engine. Bajo Electron, arrancar el Engine
  desde la UI real fallaba (`hostOnly.test.ts`, gate `desktop:parity`).
- **Traducción que adivinaba semántica** — `DONE`. El generador falla en
  cerrado: un handler que ramifica o con bindings sin rastrear se marca
  `manual` y exige adaptador escrito. `mcp_set_enabled(false)` habilitaba
  (`commandAdapters.test.ts`, TR-01..09). Auditoría: 114 automáticas, 10
  manuales, 2 passthrough, 6 solo host, **0 sin resolver**.
- **E2E que saltaba el adaptador** — `DONE`. La sonda vive en el renderer y usa
  `engineApi`/`desktopApi`, así que recorre `src/services` y `src/platform`.
- **`desktop:dev` sin IPC** — `DONE`. El origen de confianza es el que se
  carga de verdad; la CSP tiene modo y la de producción no hereda nada del dev
  (DEV-01..03).
- **Handshake fallido dejaba el hijo vivo** — `DONE` (LIFE-01..03, por PID).
- **Límite de línea NDJSON** — `DONE`. No se aplicaba a una línea ya completa
  dentro del chunk (NDJSON-01..03).
- **`npm ci` roto en CI** — `DONE`. Lock regenerado con npm 10 y baseline
  documentada en `engines` y AGENTS.md.

### Host Electron (2026-09-17, plan 02, entrega D)

- **Transporte y supervisor** — `DONE`. Portados con sus plazos, códigos y
  estados; probados contra un Engine falso con eventos intercalados, Unicode
  partido, respuestas tardías, EOF, stderr voluminoso y cierre.
- **Frontera de privilegios** — `DONE`. Origen exacto, frame principal,
  allowlist en ejecución y preload sin `ipcRenderer`. El smoke comprueba que el
  renderer carga desde `app://rinari` sin `window.require` ni `window.process`.
- **Arranque real** — `DONE` como smoke: `npm run desktop:smoke` abre Electron
  y verifica renderer, puente y ausencia de fugas. **No** es paridad: de los
  130 comandos del inventario (124 del Engine y 6 del host), solo los 12
  representativos de `desktop:parity` se ejercitan contra el host nuevo.
- **Traducción comando → método del protocolo** — `DONE`. El nombre del comando **no** es el método: `session_get`
  habla con `session.get`, y los argumentos se renombran (`reference` → `ref`
  en 21 comandos, `provider_type` → `type`). El host Tauri hacía esa traducción
  en 130 handlers Rust y el nuevo la necesitaba igual. El
  inventario lleva método real y renombrados, y `commandMap.generated.ts`
  produce las 125 traducciones desde el mismo código Rust, así que no pueden
  divergir de él. `peer_group_get` se escribe a mano porque su host anterior
  usa precedencia (`else if`) y manda **una** clave, no la unión; está
  documentado como excepción y probado.
- **Paridad contra el Engine real** — `DONE` como corte transversal:
  `npm run desktop:parity` arranca el Engine desde Electron en un home
  temporal y ejercita un comando por cada uno de los doce módulos más un turno
  con proveedor falso, que recorre `turn.started → model.failed → turn.failed`.
  Prueba el camino completo —renderer, preload, IPC validado, traducción,
  NDJSON y eventos de vuelta—. **No** es la matriz completa: son **12
  comandos representativos** —uno por módulo— más un turno real, de los 124
  respaldados por el Engine. Los otros 112 tienen cobertura de traducción por
  unidad e invariantes (método válido, renombrados, tabla completa), no
  ejercicio individual contra un Engine vivo.
- **Updater de Electron** — `DONE` para el canal unsigned acordado. Electron
  0.2.x consume `latest.yml`, descarga solo por acción explícita, valida el
  SHA-512 y aplica por la autoridad única de lifecycle después de confirmar y
  cerrar el Engine. Tauri 0.1.x conserva su `latest.json` firmado. La identidad
  Authenticode sigue pendiente y la UI identifica el canal como unsigned.
- **Trabajo activo al cerrar** — `PARTIAL`. Se pregunta siempre que el Engine
  esté en marcha, que peca de prudente; saber si hay turnos vivos exige
  preguntárselo al Engine y está pendiente.
- **Menú de aplicación** — `DONE`. Portado de `menu.rs` con sus entradas,
  etiquetas y aceleradores; salir y el zoom los resuelve el host y el resto
  viaja por `PUSH.menuAction`. Normal y Boards siguen sin acelerador nativo a
  propósito: el atajo lo gestiona el frontend y duplicarlo dispararía la
  acción dos veces (§5.2).
- **Notificaciones del sistema** — `DONE` bajo Electron, y cierra la deuda que
  venía de Boards. `Notification.isSupported()` decide la disponibilidad real,
  hay deduplicación de 10 s y el clic **solo** enfoca y resuelve el destino:
  no envía, no reanuda, no aprueba.
- **Empaquetado** — `DONE` para Windows x64 unsigned. `electron-builder`
  produce la aplicación ASAR con el Engine en `extraResources`; el bootstrapper
  personalizado instala, repara, modifica, actualiza y desinstala mediante una
  transacción con staging y rollback. Firma Authenticode y matrices macOS/Linux
  permanecen fuera de esta entrega.

### Boards y mensajería entre paneles (2026-09-15)

- **Notificaciones del sistema** — `DONE`. Resueltas en Electron; el runtime
  anterior ya no forma parte del producto activo.
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
