# Preguntas y workspace de escritorio

- «Nueva conversación» crea un chat general con carpeta independiente. El `+`
  de cada proyecto crea una sesión vinculada a ese proyecto.
- «Mover a proyecto…», disponible también con clic derecho, cambia el directorio
  de ejecución futuro y conserva conversación y referencias históricas. El motor
  rechaza el traslado mientras haya actividad o procesos pendientes.
- Las preguntas del motor aparecen sobre el compositor. Se puede elegir una
  opción, escribir otra respuesta, navegar entre preguntas, minimizar y omitir.
  Solo «Enviar respuesta» envía las respuestas. El historial conserva el resultado.
- Los enlaces de archivos y las salidas de `fs.write`/`fs.patch` abren un visor
  lateral con pestañas, Markdown/fuente, resaltado, ruta y apertura externa.
  La lectura es del motor, limitada a 512 KiB y al workspace del turno original.
- El pie del sidebar contiene el menú Rinari Agent. Archivo, Editar, Ver y Ayuda
  son menús nativos de Tauri; los menús contextuales conservan edición y portapapeles.

El motor requiere `desktop_workspace_v1` e `interactive_questions_v1`. El esquema
del motor genera los DTOs TypeScript/Rust. No hay una base de sesiones adicional.

## Validación

Frontend: `npm test`, `npm run build`, `npm run protocol:check`.
Rust: `cargo test --manifest-path src-tauri/Cargo.toml`.
Motor: `uv run pytest tests/unit/test_desktop_interactions.py` y suites de
protocolo, historial, modos, sesiones y bloqueo de turnos.

Las pruebas nuevas cubren preguntas reales a través de AgentLoop, respuesta libre,
omisión, cancelación, duplicados, snapshots, traslado, bloqueo compartido con CLI,
procedencia de archivos, rutas Windows, límites y separación de sesiones.
# Desktop follow-up fixes

External read approvals now extend only the approved tool call's readable roots. Write approvals remain separate. Git timeouts return structured tool errors. The transport enforces UTF-8 and the engine repairs the known legacy default conversation title.

Project headers collapse their sessions. Composer selectors close upon selection and models are grouped by provider. Completed PLAN turns retain their original mode in live events and history and show a plan card; explicit implementation switches the engine to BUILD before sending the continuation. Content resizing also follows the conversation while the user remains at the bottom.

# Barra superior y vistas Normal / Boards

- Una barra de estado persistente (48 px, bajo la decoración nativa) muestra el
  contexto de la conversación, el selector **Normal | Boards** y el estado real
  del motor con un resumen de sesiones en ejecución y pendientes de intervención.
  Se pinta también en el home vacío y en las vistas auxiliares; no depende de que
  haya mensajes.
- `Normal` (`view='chat'`) y `Boards` (`view='board'`) son dos presentaciones del
  mismo motor. Cambiar de vista no inicia, cancela ni modifica turnos, permisos,
  modelos ni borradores. Al entrar en Ajustes o Motor se recuerda la última vista
  de trabajo y el atajo alterna hacia su alternativa.
- Los botones del selector y las entradas del menú nativo **Ver › Normal / Boards**
  seleccionan de forma idempotente. Solo el atajo configurable (`Ctrl+Shift+B` por
  defecto) alterna; el menú no registra el mismo acelerador para no disparar dos
  veces. Un único listener de atajos ignora `repeat`, composición IME y, salvo la
  paleta, los atajos con un diálogo modal abierto.
- `Ctrl+N` y `Ctrl+W` son contextuales: en Boards abren «Añadir panel» y quitan el
  panel enfocado sin cerrar su sesión; en Normal conservan su comportamiento.
- Estado por sesión: el runtime del motor vive en un store con selectores por
  sesión (`sessionSelectors`), cada Composer trabaja sobre su propia clave de
  borrador y el razonamiento de la siguiente petición se guarda por sesión
  (`rinari.sessionUi.v1`). La vista Normal (`SingleSessionView`) y los paneles
  del board consumen las mismas primitivas (`sendTo`, `useModelFor`, `setModeFor`…).

# Boards: paneles, restauración y dock

- Un board persistido (`rinari.board.v1`, schema interno 2) con N paneles en
  columnas con scroll horizontal. Cada panel referencia exactamente una sesión;
  una misma sesión no se añade dos veces (un segundo intento la enfoca). Se
  persisten orden, anchos, dock, foco, límite suave y preferencias deseadas;
  nunca busy, grants, mensajes ni resultados. Un layout de una versión futura no
  se reescribe. Las escrituras se agrupan (250 ms) y se vuelcan al ocultar la
  ventana.
- «Añadir panel» ofrece chat general, proyecto registrado, carpeta nueva y
  sesiones existentes. Siempre crea con `session.create {project_id}` sin
  activar la sesión Normal; una carpeta nueva se registra con `project.add`.
  Nunca se usa `project.open`, que reutiliza la sesión activa del root. Repetir
  una raíz ya presente pide confirmación y marca ambos paneles como «Proyecto
  compartido»: el aviso no aísla las escrituras.
- Al entrar en Boards las sesiones se resuelven de forma autoritativa por id
  (`session.get` solo para las que no están en el listado reciente) y de una en
  una contra el motor. Se retiran únicamente las confirmadas cerradas,
  archivadas o eliminadas, con aviso; un error temporal conserva el panel con
  «Reintentar». Cerrar una sesión desde el sidebar se refleja por el mismo
  reconcile.
- Cada panel monta su propio `Composer` (clave de borrador = sesión, sin tocar
  el espejo de Normal), `FileWorkspaceProvider` y dock derecho compartido con
  superficies **Workspace** (tabs desplazables con etiqueta de alcance Proyecto /
  Sesión) y **Archivo**; los enlaces de archivo activan Archivo en ese dock. Si
  el chat no conserva 480 px, el dock pasa a drawer dentro del panel.
- Quitar un panel conserva sesión, turno y borrador; «Quitar y cerrar sesión»
  espera la confirmación del motor y no retira el panel ante un error. Los
  overlays de navegador y procesos se montan solo para el panel enfocado.
- Las preguntas pendientes tienen un controlador compartido por sesión
  (`usePendingQuestions`): una carga y una suscripción también cuando el header
  del panel muestra el badge.

# Boards: mensajería entre paneles (`session_peer_messaging_v1`)

- Los paneles de un board forman un **grupo de pares** que el Agent registra en
  el motor (`session.peer_group.set`, idempotente por `boardId`, con
  `expected_revision`). Cada cambio de paneles o de los toggles «Recibir» /
  «Enviar» del menú del panel re-registra el grupo; un `CONFLICT` relee la
  revisión y reintenta una vez. Si el motor no anuncia la capability, no hay
  controles ni llamadas.
- El agente de un panel puede usar `session.peers` y `session.send`. El envío
  pide **aprobación por destino** (`session.message`, `binding_mode = "exact"`)
  y el diálogo de aprobación muestra la etiqueta del panel destino.
- El mensaje llega al otro panel como un turno con `origin.kind = "peer"`. La
  burbuja se pinta a la izquierda con «De «X»», el número de salto y el aviso
  de **dato no confiable**; «Ir al panel» enfoca el origen. El motor impide en
  ese turno escribir archivos, ejecutar comandos, mutar el navegador, red con
  efectos, MCP, git y subagentes; el usuario convierte el mensaje en tarea
  propia con «Enviar al panel…» (reenvío manual, `origin.kind = "user"` con
  `quoted_source`, sin techo ni aprobación).
- La cola del panel (`QueueBar`) lista las entradas tipadas: origen, estado
  (`queued`/`paused`/`uncertain`), cancelar una entrega y **Reanudar** tras un
  Stop (`session.queue.resume`). Un mensaje para un panel no enfocado muestra
  un toast con «Ir al panel»; una entrega en pausa avisa también.
- Ajustes › General › «Mensajería entre paneles» desactiva el grupo completo
  (`enabled = false`) sin borrarlo; se persiste en `rinari.board.v1`.
- Límites del motor: 32 000 caracteres, 5 envíos por turno, 3 saltos y 20
  entregas por cadena. No es un canal de coordinación autónoma sostenida.

Validación: `src/features/board/usePeerGroup.test.tsx`,
`src/features/board/BoardView.peers.test.tsx`, `src/components/MessageBubble.test.tsx`
y los casos de procedencia en `turnTimelineReducer.test.ts`. Regeneración del
protocolo: `RINARI_ENGINE_SCHEMA=<ruta a Rinari-CLI/src/rinari/engine_protocol/schema/v1.json> npm run protocol:generate`.

# Boards: estado por panel y resultados sin leer

- Cada panel deriva un estado (`selectors: derivePaneStatus`) con precedencia
  fija: `loading`/`unavailable` › `cancelling` › `needs_you` (aprobaciones o
  preguntas pendientes) › `working` › `failed` / `stopped` / `done` /
  `cancelled` › `idle`. El header lo muestra como píldora con texto e icono; el
  color no afirma calidad del código, solo el estado del turno.
- "No leído" es una dimensión independiente: `working + NEW` coexisten. Vive en
  `src/stores/boardAttention.ts` (`rinari.board.attention.v1`, por perfil local
  y sesión) como recibos por turno (`baseline` / `unread` / `seen`) sin
  contenido. Reglas: el historial que ya terminó al añadir la sesión es
  baseline; un terminal en vivo (completed/failed/stopped) queda `unread`;
  cancelar a mano no genera resultado; un turno activo rastreado que termina
  mientras el cliente no miraba queda `unread` al reconectar.
- `BoardActivityController` (montado una vez en `App`, fuera de `BoardView`)
  sigue a las sesiones del board en Normal, Boards y Ajustes y traduce las
  transiciones del runtime a recibos. No abre otro stream de eventos.
- Lectura automática (`useResultVisibility`): solo con la superficie visible
  (panel expandido o Normal con esa sesión), ventana con foco, sin modal encima
  y el bloque final en viewport durante 500 ms. Leer en Normal actualiza el
  mismo recibo que Boards. "Marcar resultados como leídos" (menú del panel)
  afecta a los ids conocidos al pulsar, nunca a turnos futuros ni a
  aprobaciones/preguntas.
- Si el almacenamiento no está disponible, los recibos siguen en memoria y el
  board avisa «lectura no persistida».

Validación: `src/stores/boardAttention.test.ts`, `sessionSelectors.test.ts`
(§ pane status), `BoardActivityController.test.tsx`, `BoardView.status.test.tsx`.

# Boards: colapso de paneles, tiras y modo foco

- Colapsar (`Ctrl+Alt+[`, botón del header o menú) convierte el panel en una
  **tira de 48 px** (`CollapsedPaneStrip`) que conserva estado confirmado,
  título, logo del proveedor y badges independientes (intervención, resultados
  sin leer, mensajes de pares). No se montan chat, composer ni workspace; el
  runtime sigue vivo y el borrador se conserva en su clave. El resizer exterior
  solo actúa sobre paneles expandidos.
- Colapsar es presentación: nunca cancela turnos, cierra sesiones, revoca el
  grupo de pares ni marca leído. El foco pasa al vecino expandido más cercano
  (derecha, luego izquierda); sin vecinos, el foco queda vacío y es válido.
- `Ctrl+Alt+]` expande el enfocado; sin foco, el último expandido o la primera
  tira. Los atajos son configurables (Ajustes › Atajos) y no tienen acelerador
  nativo duplicado.
- Toolbar del board: conteos por **sesión** (trabajando / te necesitan / con
  resultados sin leer), «Colapsar todo», «Expandir todo», «Colapsar terminados»
  (solo `done`/`idle`/`cancelled`, sin pendientes, con disponibilidad
  confirmada y nunca el enfocado; deshabilitado en modo foco), «Modo foco»
  (snapshot de la composición, un único panel expandido; el alta durante el
  modo enfoca el nuevo; colapsar el foco a mano sale del modo sin restaurar)
  y «Marcar todos los resultados como leídos». Las mismas acciones existen en
  la paleta de comandos (`Boards: …`).
- Los estados que usa la toolbar y `collapseFinished` salen de la caché
  efímera `boardStatus` publicada por `BoardActivityController`, nunca de un
  mapa inventado por el componente.

Validación: `src/stores/board.test.ts` (§7.6), `BoardView.collapse.test.tsx`.
