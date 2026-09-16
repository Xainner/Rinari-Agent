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

### Boards y mensajería entre paneles (2026-09-15)

- **Anclas de scroll al colapsar** — `OPEN`. Al expandir una tira el chat
  vuelve al final (auto-follow); no se conserva el punto de lectura previo.
  Falta guardar `rowId/turnId + offset` en `sessionUi.ts` antes de desmontar.
- **Notificaciones del sistema** — `OPEN`. Requiere `tauri-plugin-notification`
  (dependencia nueva con autorización). El adaptador `services/notifications.ts`
  declara `canSend=false`; el ajuste aparece como no disponible. La activación
  por clic en desktop no está verificada y no debe anunciarse.
- **Conflictos de escritura entre paneles del mismo proyecto** — `OPEN`. El
  Engine no serializa dos sesiones sobre el mismo root; el board solo avisa.
- **`busy` en `session.list`** — `OPEN`. La barra superior deriva "trabajando"
  del runtime; tras un arranque en frío el sidebar no sabe si una sesión no
  abierta está ocupada hasta que llega un evento.
- **Aprobación antes de la comprobación de pares** — `OPEN` (Engine). Un
  `session.send` a un panel que no recibe pide consentimiento y luego falla
  con `PEER_RECEIVE_DISABLED`. Sería mejor validar la membresía antes de
  preguntar.
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
