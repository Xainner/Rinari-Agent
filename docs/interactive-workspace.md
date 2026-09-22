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
  son menús nativos de Electron; los menús contextuales conservan edición y portapapeles.

El motor requiere `desktop_workspace_v1` e `interactive_questions_v1`. El esquema
del motor genera los DTOs TypeScript/Rust. No hay una base de sesiones adicional.

## Validación

Frontend: `npm test`, `npm run build`, `npm run protocol:check`.
Host: `npm run typecheck:electron` y `npm run desktop:smoke`.
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

- Un board persistido (`rinari.board.v1`, schema interno 3) con N paneles en
  columnas con scroll horizontal. Cada panel referencia exactamente una sesión;
  una misma sesión no se añade dos veces (un segundo intento la enfoca). Se
  persisten orden, anchos de panel, foco, límite suave y preferencias deseadas;
  nunca busy, grants, mensajes ni resultados. El dock ya no es un campo del
  panel: es el layout **por sesión** de `sessionDock` (abajo); el schema 2 lo
  guardaba por panel y se migra al cargar sin reescribir layouts existentes.
  Un layout de una versión futura no se reescribe. Las escrituras se agrupan
  (250 ms) y se vuelcan al ocultar la ventana.
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
- **Un solo lugar editable por sesión.** Modelo, modo (PLAN/BUILD/REVIEW),
  razonamiento y permisos de la siguiente petición se editan únicamente en el
  `Composer` de esa sesión, en Normal y en Boards. El header del panel muestra
  identidad, rama, estado, no leídos, peer, colapsar, dock y menú; su acción
  «Configurar siguiente mensaje» enfoca el Composer existente (petición tipada
  `rinari:focus-composer` con `sessionId`) en vez de abrir otro editor. La barra
  superior no expone selectores de modelo ni de modo. El guard de sesión
  ocupada aplica igual en ambas vistas y un cambio nunca reescribe la
  atribución de un turno ya iniciado.
- Cada panel monta su propio `Composer` (clave de borrador = sesión, sin tocar
  el espejo de Normal) y el mismo `SessionWorkspace` que la vista Normal.
- Quitar un panel conserva sesión, turno, borrador y layout del dock; «Quitar y
  cerrar sesión» espera la confirmación del motor y no retira el panel ante un
  error. No hay overlays globales: navegador y archivos viven en el dock de su
  sesión; los procesos, en su conversación.

# Workspace único por sesión: `SessionWorkspace` y el dock

- `features/session/SessionWorkspace` compone conversación + dock y lo
  consumen `SingleSessionView` (Normal) y `SessionPane` (Boards) con distinta
  densidad: una sola implementación del visor de archivos, del navegador y del
  workspace. El dock (`SessionDock`) tiene tres superficies con una sola
  activa: **Archivos** (tablist y renderizadores actuales), **Navegador**
  (toolbar + slot de vista) y **Workspace** (cambios, tareas, verificaciones,
  checkpoints, artefactos, insight). Ocupa ancho real dentro de la sesión
  (`min-width: 0`, flex); si chat y dock no caben (480 px de chat), pasa a un
  drawer **dentro del mismo contenedor**, con foco en su pestaña activa, cierre
  visible y Escape. Cerrar el dock no cierra archivos, browser ni procesos.
- Layout persistido (`stores/sessionDock`, clave `rinari.sessionDock.v1`):
  `{ schemaVersion: 1, visible, activeSurface, widthPx, workspaceTab }` por
  `home_id::sessionId`, donde `home_id` es la identidad estable del Engine
  home que publica el hello (`EngineStatus.home_id`; nunca
  `engine_instance_id`). Nunca se persisten `webContentsId`, grants, `busy`,
  handles CDP ni generaciones. Las entradas de un schema futuro se conservan
  intactas. Un panel nuevo abre Workspace por defecto; una sesión con layout
  propio lo conserva al pasar de Normal a Boards y viceversa.
- Acciones con destinatario: el atajo/paleta «archivos» emite
  `rinari:dock-toggle` con `sessionId` (panel enfocado en Boards, sesión
  Normal en Normal) y opcionalmente `surface`; ningún atajo abre el dock de
  todos los providers montados. Los enlaces de archivo revelan Archivos en el
  dock de **su** sesión; «Revisar cambios» revela Workspace › Cambios.
- Navegador: `useBrowserFrame` consulta `browser.view.get` por sesión a 1,5 s
  solo con la superficie a la vista y a 5 s en segundo plano para el indicador
  de la pestaña; sin `browser_view_v1` no consulta. Un browser nuevo del
  Engine se revela en el dock solo si está cerrado y la sesión es la enfocada;
  nunca roba foco a otro panel, cambia Normal/Boards ni reemplaza un archivo
  que el usuario lee (queda el indicador). El slot muestra hoy el fallback de
  capturas JPEG rotulado como vista previa; no es un browser controlado
  (documento 03). El inspector de procesos ya no esconde el navegador ni el
  navegador contrae los logs: no compiten por una zona flotante.

Validación: `stores/sessionDock.test.ts`, `features/session/SessionWorkspace.test.tsx`
(UX-07/08/09, mismo layout Normal↔Boards), `features/processes/SurfaceCoordination.test.tsx`
(revelado del browser, sin overlay), `stores/board.test.ts` (migración schema 2→3).
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
- **`@Panel mensaje` desde el compositor**: al escribir `@` al inicio del
  mensaje aparece la lista de paneles del board (filtrada por lo tecleado;
  ↑/↓, Enter/Tab para elegir, Esc para descartar). Con `@Docs revisá el
  README` el texto va **directo al panel «Docs»** como reenvío manual
  (`origin.kind = "user"`, cita del panel origen, sin aprobación ni techo) y
  no inicia un turno en el panel actual. Solo cuenta la mención al inicio y
  solo si coincide con la etiqueta de un panel (la más larga gana); cualquier
  otra `@` sigue siendo una referencia de archivo del workspace. Un `@Panel` a
  secas no se envía; los adjuntos se quedan en el borrador.
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

# Respuesta final canónica, metadatos, lectura y anclas

- **Una respuesta, una vez.** `TurnTimelineView` es idéntico en Normal y
  Boards y pinta el cuerpo terminado con `features/activity/TurnResult`: el
  Markdown completo (código, enlaces, imágenes, copiar) o el plan original del
  turno con su única acción de implementación, el changeset confirmado
  (`ChangeSetRow`) y, si falló, el error y su diagnóstico. `completed`,
  `failed`, `stopped` y `cancelled` conservan su identidad. Cambiar el modo de
  la sesión no cambia cómo se ve un turno histórico (`timeline.mode`).
- Debajo, una sola **fila compacta** `TurnMeta` que no repite el cuerpo:
  estado, duración solo con ambos tiempos válidos, acciones, archivos del
  changeset **de ese turno**, modelo ejecutor si la llamada lo registró, motivo
  de Stop, «Nuevo» + «Marcar como leído», «Revisar cambios» y «Preparar
  reintento» (recupera la entrada correlacionada con ese turno, la deja en el
  compositor y nunca envía; un borrador existente pide conservar/reemplazar;
  un turno de origen peer exige intención explícita). La fila sustituye al
  resumen anterior de duración/acciones y aparece para turnos largos o
  excepcionales, no leídos o con changeset. Lo que falta se omite; nunca se
  rellena desde el modelo actual ni desde `git status`.
- La tarjeta resumen bajo cada turno expandido desaparece: `ChatView` expone
  `onReviewChanges`, no un `renderResult`. El doc 01 §4.2 permite una tarjeta
  con extracto para superficies fuera de la conversación (pendientes, panel
  colapsado) siempre que enlace al turno original; no se implementa aquí
  porque ninguna superficie la consume todavía.
- **Lectura**: `useResultVisibility` observa el bloque real de `TurnResult`,
  no un centinela. Cuenta como visible al menos la mitad del bloque o
  `RESULT_READ_MIN_VISIBLE_PX` (120 px) de uno más alto, con la superficie
  visible, la ventana atendida y sin modal, durante 500 ms. Enfocar la sesión,
  cambiar de vista o mostrar una tarjeta resumida no limpia el badge; la
  recencia de sesiones no cambia por leer.
- **Anclas de scroll** (`features/engine/scrollAnchors.ts`, en memoria): al
  desmontar un transcript (colapsar un panel, cambiar de vista o de sesión) se
  guarda la fila superior visible con su desplazamiento, o «seguir el final».
  Al volver, `ChatView` arranca ya en ese modo y restaura con
  `scrollToIndex(fila, { align: 'start', offset })` cuando la fila existe
  (virtua reintenta hasta medirla; sin timeouts). Si el usuario estaba al
  final, sigue el final; si leía arriba, no se le lleva abajo; si la fila ya no
  existe en un transcript cargado, se vuelve al final.
- Avisos (`useBoardNotifications`, en `BoardActivityController`): detección
  por ids con dedupe at-most-once (la clave se reclama en el recibo antes de
  avisar), agrupación de ráfagas en 500 ms («N paneles finalizaron»),
  supresión cuando el usuario ya atiende esa sesión, e intervenciones por id
  de aprobación/pregunta. Historial, remount y reconexión no producen avisos.
  «Ir al panel» usa `revealBoardAttention`: comprueba pertenencia, va a
  Boards, expande/enfoca y muestra el turno; la lectura solo se aplica cuando
  el bloque queda visible. Política pura en `services/notificationPolicy.ts`.
- Canales: header/tira siempre; barra superior con contador de **sesiones**
  (unión, no suma) y lista de pendientes (`BoardAttentionMenu`) visible en
  Normal/Ajustes; sidebar con señal por sesión (intervención › fallo ›
  resultado sin leer); título nativo `(<N>) Rinari Agent` con un único
  escritor (`useWindowTitle`, permiso `core:window:allow-set-title`).
- Notificaciones del sistema: el adaptador declara `canSend=false` porque este
  build no incluye `tauri-plugin-notification` (dependencia nueva, PR aparte
  con autorización). El ajuste aparece como «no disponible»; la política
  nunca elige ese canal. No se declara activación por clic sin backend
  validado.
- Ajustes › General › Avisos del board: emergentes, intervención,
  notificaciones del sistema (y detalles), persistidos en `rinari.board.v1`.

Validación: `features/activity/TurnResult.test.tsx` (UX-03/04/05),
`features/board/useResultVisibility.test.tsx` (UX-10, centinela de 1 px),
`components/ChatView.scroll.test.tsx` (UX-06), `services/notificationPolicy.test.ts`,
`features/board/useBoardNotifications.test.tsx`,
`hooks/useWindowTitle.test.ts`.

# Flujos: avance del proyecto y cómo intervino la IA (`project_flow_v1`)

- Tercera vista de trabajo, **Normal | Boards | Flujos** (`view='flows'`,
  atajo `Ctrl+Shift+L`, menú nativo Ver › Flujos, paleta «Abrir Flujos» y
  «Ver flujo» en el menú de cada proyecto y sesión del sidebar). Cambiar a
  Flujos no inicia, cancela ni modifica turnos, modelos, modos ni borradores.
- **Todo lo derivado viene del Engine.** `engineApi.flowGet({ project_id } |
  { session_id })` llama a `flow.get` (una sola petición por alcance; nunca
  `session.timeline` por sesión desde React). Una etapa es una racha contigua
  de turnos con el mismo modo a través de todas las sesiones del proyecto;
  cada PLAN abre un ciclo. La vista no estima nada: progreso `null` se rotula
  «sin datos», un grafo de tareas vacío o ausente «sin tareas registradas»,
  duración sin ambos tiempos «Duración no disponible». Nunca un porcentaje
  inventado a partir del número de turnos.
- Alcance (`flowScope` en `stores/ui`, persistido en `rinari.flowScope`
  **por Engine home**: un id de proyecto sólo significa algo dentro del home
  que lo emitió, y lo guardado antes del hello se reindexa al home real).
  Ofrece proyectos registrados no archivados, la sesión de proyecto abierta
  desde el sidebar (grupo «Sesiones del proyecto») y las conversaciones
  sueltas. El orden al abrir la vista es: elección explícita de esta ejecución
  («Ver flujo» o el selector) → proyecto de la sesión activa → sesión activa
  suelta → alcance persistido que siga existiendo → primer proyecto. Lo
  persistido va **por debajo** de lo que se está trabajando: abrir Flujos
  desde una conversación suelta abre esa conversación, no el primer proyecto
  registrado. Un alcance que dejó de existir se sustituye, nunca se inventa.
- Canvas horizontal con columnas en píxeles (como Boards): tarjetas de 300 px
  con paso, tipo, estado (`pane-header-status[data-kind]`, misma paleta que
  los paneles), título (encabezado del plan o primer mensaje), extracto,
  progreso, duración, turnos, ejecutores (`ProviderLogo` por modelo) y
  agentes, hasta 4 archivos + «+n», sesiones implicadas y turnos de origen
  peer rotulados como procedencia. Separador «Ciclo n» entre ciclos. El
  detalle (`FlowStageDetail`) es un drawer **dentro de la vista**
  (`role="complementary"`, foco al abrir, Escape cierra), no un overlay.
- «Ir al turno» / «Atender» reutilizan las primitivas de avisos: si la sesión
  está en el board, `revealBoardAttention` (Boards, expandir, enfocar,
  revelar). Si no, la sesión se **resuelve antes de cambiar de vista** con
  `prepareSession`, y sólo cuando abre se activa, se va a Normal y se pide
  `requestTurnReveal`, que deja la petición **en cola** para que `ChatView` la
  consuma al montar esa sesión y la conserve hasta que la fila exista. El
  Engine incluye a propósito sesiones cerradas y archivadas: ésas ofrecen
  restaurar de forma explícita (`flow-restore`) y sólo después se abren; si no
  se puede abrir, la vista se queda en Flujos y lo dice (`flow-nav-error`).
  Nunca queda una petición de reveal sin consumidor. Revelar no marca leído.
- Cada fila de sesión del detalle responde por **su** sesión (`isOnBoard`); la
  acción principal de la etapa es la del anchor.
- Refresco: `useFlow` escucha los dieciséis eventos que el Engine proyecta
  (`FLOW_EVENT_TYPES`: `turn.*`, `model.started`, `model.content.completed`,
  `agent.started`, `turn.changes.completed`, `verification.completed`,
  `approval.*`, `question.*`), más `flow.invalidated` —restaurar un checkpoint
  reescribe hechos sin producir ningún turno— y `session.moved`, que cambia la
  pertenencia de dos alcances. Vuelve a pedir `flow.get` con 500 ms de
  debounce y descarta respuestas de un alcance o una petición anteriores; una
  respuesta con la misma `revision` no reemplaza el objeto mostrado.
- **La pertenencia la decide el Engine**, no las etapas cargadas: `useFlow`
  pregunta `session_list` del proyecto (cerradas y archivadas incluidas), así
  que una sesión sin turnos también es miembro. Derivarla de las etapas tenía
  dos caras del mismo fallo: un proyecto vacío no tenía miembros y aceptaba
  eventos de cualquier sesión del Engine, y una sesión nueva del proyecto no
  entraba hasta un refresco manual. Un id desconocido no se descarta ni se
  acepta: se re-resuelve una vez y se recuerda la respuesta.
- Un refresco fallido **no borra ni disfraza** lo leído: con datos en pantalla
  el estado es «desactualizado» (`flow-stale`, con la hora de la última
  lectura buena y reintento); el error sustituye a los datos sólo cuando no
  hay datos.
- La capability tiene tres estados. Mientras el Engine no está `ready` no se
  sabe si ofrece flujos y se dice «comprobando» (`flow-checking`) sin llamar a
  `flow.get`; `project_flow_v1` ausente da `flow-unsupported`. El botón y el
  atajo siguen existiendo para que el aviso sea visible.
- La lista de archivos por etapa está acotada por el Engine y no hay consulta
  paginada del resto: el detalle declara «muestra parcial» con el total
  exacto. Los ejecutores se resuelven por identidad canónica (`model_id`) y,
  ante un alias ambiguo, se muestra la cadena cruda antes que atribuir las
  llamadas a un modelo que quizá no corrió. Los extractos son texto inerte.
- Movimiento reducido: cuenta la preferencia de la app **y** la del sistema
  (`useFlowReducedMotion`), como en el resto del producto.

Validación: `src/features/flow/FlowView.test.tsx` (FLOW-01…09, FLOW-11,
F11-08/09/12/13), `src/features/flow/useFlow.test.tsx` (membresía,
invalidación, revisión y desactualizado, separadas de las visuales),
`src/features/flow/flowModel.test.ts` (identidad canónica y agrupación),
`src/stores/ui.test.ts` (alcance por home),
`src/components/ChatView.scroll.test.tsx` (FLOW-10, revelado en cola),
`electron/main/ipc/security.test.ts` (`assertFlowScope`: exactamente un id,
cadena vacía rechazada, claves ajenas rechazadas, cotas), y en el Engine
`tests/unit/test_engine_flow.py`. Evidencia real en
`docs/evidence/flows-2026-09-22/` (la de `flows-2026-09-18/` es anterior a la
revisión M02 y queda como registro histórico).
