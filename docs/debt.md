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
- **Aprobación antes de la comprobación de pares** — `DONE` (Engine).
  `ToolDefinition.precheck` rechaza destinos inválidos antes del
  consentimiento y `deliver` revalida después (`test_engine_peers.py`).
- **Layout del dock por Engine home** — `DONE`. `sessionDock` se indexa por
  `home_id` (nuevo en el hello) + sesión; el board migró a schema 3.
- **ResultSummaryCard sin consumidor en la app** — `OPEN`. Queda como
  componente de resumen (pendientes / panel colapsado) con test propio, sin
  montarse todavía en la lista de pendientes; decidir si se integra en
  `BoardAttentionMenu` o se retira.
- **Recibos de lectura por instalación** — `OPEN`. `boardAttention` sigue
  indexado por `rinari.profile.v1`; podría adoptar el mismo `home_id` que
  `sessionDock`.
- **`cargo fmt` bloqueado en la máquina de integración** — `NOT_RUN` local:
  Control de aplicaciones bloquea `cargo-fmt` (os error 4551); se verificó con
  `rustfmt --check` directo y CI ejecuta `cargo fmt --check`.

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
