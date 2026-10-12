# Sesiones hijas y Boards reimaginado

Estado: **propuesta para revisar**, tercera versión (2026-10-12). Incorpora la dirección del dueño:
- **Se quita la mensajería entre paneles de Boards.** La comunicación entre agentes pasa a una función nueva, **Rinari Agency**, que tiene su documento propio: [idea-rinari-agency.md](idea-rinari-agency.md).
- **Se rescatan las sesiones madre → hija** en conversaciones normales y proyectos, anidadas, como en Claude Code. Las hijas heredan los permisos de la madre, sin volver a pasar por el ciclo de aprobaciones.
- **Boards se reimagina para lo que es:** varias sesiones en pantalla, trabajando en paralelo, de la forma más eficiente posible.
- **Todo lo pendiente de Boards en un solo lugar** (Parte C): lo que estaba en el plan 0.3.2, en Planka y en `docs/debt.md`, más el bug nuevo del «Preparando el turno…». Al final, un mapa del código para quien se suma a Boards o a la Agency.

---

## Parte A. Sesiones hijas

### A.1 Qué hay hoy
- **Las notas de Rinari ya hacen media función.** Al aceptar una, se crea una sesión nueva en el mismo proyecto y perfil, se envía la tarea y el turno arranca. Funciona bien.
- **Pero no queda ningún vínculo visible:**
  - la tabla `sessions` no tiene `parent_session_id`;
  - el origen solo queda en la nota (`followup_suggestions.accepted_session_id`) y en el `origin` del primer mensaje;
  - la barra lateral no anida sesiones.
- **Pasa lo mismo con los forks y las tareas programadas.** `forked_from` existe en la base de datos, pero la app no lo lee.
- **El modelo solo puede *sugerir* con una nota.** No tiene cómo abrir una sesión cuando el dueño se lo pide («ábreme una sesión para migrar pagos»).

### A.2 La propuesta (el modelo de Claude Code)

**Linaje.** Una migración en `sessions` añade:
- `parent_session_id`;
- `lineage_kind`, que es uno de `delegated` (la abrió Rinari), `note` (nota aceptada), `fork` o `schedule`;
- `brief_json`: el encargo (título, prompt y cómo se sabe que está hecho).

Las notas, los forks y las tareas programadas lo llenan desde ya.

**Herramientas del modelo** (en la madre):

| Herramienta | Cuándo | Qué pasa |
|---|---|---|
| `followup.suggest` (ya existe) | Ve trabajo que vale la pena fuera del pedido | Una nota. **Si el dueño la acepta, nace una hija** (como hoy, pero anidada). |
| `session.start({title, prompt, isolation?, context?})` **nueva** | **El dueño se lo pidió** («abre una sesión para…», «hazlo aparte») | La hija nace y empieza al instante. |
| `session.children()` **nueva** | Para saber cómo van sus hijas | Estado y resumen de cada una. |
| `session.message({child, text})` **nueva** | Seguimiento a **una hija suya** (más contexto, una corrección) | Le llega como guía si está trabajando, o empieza un turno si no. Solo hacia sus propias hijas: nada lateral (eso es de la Agency). |

- `context`:
  - `"brief"` (por defecto): la hija recibe solo el encargo autocontenido;
  - `"fork"`: la hija arranca con la conversación de la madre copiada, como «bifurcar» más el encargo.
- `isolation: "worktree"`: si la hija va a escribir en el mismo repo que la madre, trabaja en su propio worktree de git. Al terminar, deja su rama y el diff para integrarlos. Así se evita que se pisen archivos (un problema que sigue abierto en `docs/debt.md`).
- **Decide el dueño, no el modelo.** El prompt deja claro que `session.start` es solo para cuando el dueño lo pide. Si a Rinari se le ocurre, usa la nota (una propuesta que el dueño acepta).

**Cómo lo hace Claude Code (referencia):**
- La sesión nueva **hereda el modo de permisos de la madre**, o uno **más bajo** si se pide. Uno más alto se rechaza: subirlo es siempre decisión del usuario.
- Las reglas «permitir siempre» viven en la configuración (usuario o proyecto), así que valen para todas las sesiones.
- Las aprobaciones de una sola vez **no se heredan**.

Rinari no tiene archivo de reglas: las aprobaciones de sesión («siempre en esta sesión») viven en la sesión. Por eso, para que la hija no repita el ciclo, se copian a la hija las que la madre ya tenía **al crearla**. Las que la madre gane después no pasan a la hija.

**Permisos: la hija hereda los de la madre.**
- **Hereda:**
  - el perfil de permisos de la madre (Solo lectura / Workspace / Acceso completo);
  - **las aprobaciones de sesión** que el dueño ya dio («siempre en esta sesión»), copiadas en el momento en que nace la hija. Valen para las carpetas de la madre: si la hija trabaja en un worktree, se trasladan a ese worktree;
  - las de proyecto, que ya son por proyecto.
- **Nunca más que la madre.** Una madre en REVIEW da una hija en REVIEW, salvo que el dueño cambie el modo de la hija a mano.
- **Lo que la madre todavía no tenía aprobado se pregunta en la hija,** como en cualquier sesión. La barra lateral marca la hija que espera.
- **Nada de techos especiales.** La cadena la empezó el dueño, así que no aplica el «techo» de los mensajes peer: la hija escribe y corre comandos como lo haría la madre.
- **Las guardias de siempre siguen.** Si la hija lee la web o un MCP, la guardia de contenido externo le pide al dueño antes de algo irreversible, igual que en cualquier sesión. Heredar los permisos no apaga eso.
- **Subir la hija** (por ejemplo, darle Acceso completo) lo hace solo el dueño, desde la hija.

**Cuando la hija termina:**
- **En la madre aparece una tarjeta de entrega:** «Terminó *Migrar pagos*», con el resumen (su último mensaje), los archivos cambiados, la rama si usó worktree, y «Abrir» / «Integrar rama».
- **El modelo de la madre la ve en su contexto** en el siguiente turno, como hoy ve el resultado de un subagente.
- **Si la abrió Rinari (`session.start`) y la madre está libre,** la madre retoma un turno corto para contarle al dueño qué pasó (como Claude Code cuando una sesión lateral termina). Si nació de una nota aceptada, solo se muestra la tarjeta y la notificación, sin turno.
- **Si falla o se detiene,** la tarjeta lo dice y ofrece abrirla.

### A.3 En la interfaz
- **Barra lateral, como en la captura del dueño:**
  - las hijas cuelgan de la madre, con sangría y el icono de rama;
  - funciona igual dentro de un proyecto y en los chats sueltos;
  - la madre lleva un chip `2/3` (hijas terminadas sobre total) y se puede plegar.
  - Cada hija lleva su estado: trabajando, espera aprobación, terminó o falló.
- **Cabecera de la hija:** una miga «← *Madre* · Encargo», con un clic para volver.
- **Primer mensaje de la hija:** el encargo, con su estilo propio («Encargo de *Madre*»), no una burbuja de usuario.
- **El dueño también puede crear una hija:**
  - **«Abrir en sesión hija»** en el menú de un mensaje, o `/hija <tarea>` en el composer;
  - **«Bifurcar»**, que ya existe, ahora queda anidado.
- **Movimiento:**
  - la hija nueva sale de la fila de la madre (`rinari-rise` desde su posición, 220 ms);
  - al terminar, el check se dibuja (`r-check`) y el punto de la madre late una vez;
  - con movimiento reducido, todo es instantáneo.

### A.4 Fases

| Fase | Qué | Tamaño |
|---|---|---|
| A1 | Linaje (migración, notas, forks y tareas programadas lo llenan) y barra lateral anidada con estados y miga | M |
| A2 | `session.start`, `session.children`, la herencia de permisos y aprobaciones, y la tarjeta de entrega | M |
| A3 | `session.message` a las hijas, `context: "fork"`, `isolation: "worktree"` con «Integrar rama», y `/hija` | M |

---

## Parte B. Boards reimaginado: varias sesiones en pantalla, trabajando en paralelo

### B.1 El problema real

Cuando hay 3–6 sesiones trabajando a la vez, lo difícil no es verlas: es **saber cuál te necesita, sin perder el hilo de las otras**. Hoy Boards:
- **Reparte el espacio por igual,** aunque 4 de 5 paneles solo estén esperando o trabajando solos.
- **Esconde las aprobaciones y preguntas:** cada una vive en su panel, y si ese panel está plegado o fuera de la vista no te enteras a tiempo.
- **Tiene un solo board global,** que no es por perfil ni por proyecto.
- **Se arma a mano** panel por panel, y cuesta rehacerlo.
- **No ayuda a comparar:** el mismo encargo a dos modelos, dos enfoques…
- **Tiene la mensajería entre paneles,** que confunde y no hace lo que uno espera. **Se quita.**

### B.2 Principio de diseño

> **La pantalla se reparte según la atención, no por igual.** Lo que te necesita crece y se pone delante. Lo que trabaja solo se encoge a una tira viva. Lo terminado se pliega.

### B.3 Las piezas

1. **Paneles que cambian de tamaño solos según su estado** (se puede apagar):

   | Estado | Cómo se ve | Tamaño |
   |---|---|---|
   | **Te necesita** (aprobación, pregunta, error) | Borde ámbar que late una vez; se expande | Grande |
   | **Enfocado** (donde escribes) | Completo | Grande |
   | **Trabajando solo** | **Tira viva**: título, anillo de la lista de pasos (`3/7`), la acción en curso («Corriendo pruebas…») y tokens/tiempo | Estrecho |
   | **Terminado** | Tira plegada con su resultado en una línea y un check | Mínimo |

   - Nunca se mueve un panel en el que estás escribiendo: los cambios de tamaño esperan a que lo sueltes.
   - Las transiciones son suaves (360 ms, `ease-out`), y con movimiento reducido el cambio es instantáneo.

2. **Bandeja «Te necesitan».** Una fila arriba del board junta **todas las aprobaciones y preguntas** de todos los paneles. Se resuelven ahí mismo (Permitir / Denegar / Responder) sin mover el foco. Atajo: **Ctrl+J**, ir a lo siguiente que te necesita.

3. **Composiciones rápidas en lugar de anchos a mano:**
   - **1 + pila:** uno grande y el resto en tiras, para trabajar uno y vigilar los demás.
   - **2 lado a lado:** para comparar o trabajar dos a la vez.
   - **Cuadrícula 2×2:** para vigilar 4.
   - **Columnas:** lo de hoy.

   Se cambian con un selector en la barra o con **Ctrl+Alt+1…4**. El ajuste fino (arrastrar el borde) sigue, pero ya no es la forma principal.

4. **Espacios guardados.** Un board deja de ser global: hay **varios espacios con nombre**, por perfil y opcionalmente por proyecto («Pagos», «Release 0.4»), con sus sesiones y su composición. Se abren desde la barra lateral o la paleta.

5. **Llenar un board en un gesto:**
   - **arrastrar** sesiones (o una madre con sus hijas, de la Parte A) desde la barra lateral;
   - **«Abrir con sus hijas»**: una madre y todas sus hijas en «1 + pila»;
   - **desde notas o tareas pendientes:** elegir varias, «Abrir en el board», y cada una nace como sesión en su panel.

6. **Comparar** (lo más diferencial):
   - **Envía el mismo encargo a 2–4 paneles a la vez,** cada uno con su modelo o modo, por ejemplo `gpt-6.1-sol` contra `qwen3.8` contra DeepSeek.
   - **Al terminar, una vista de comparación** pone lado a lado los resultados, el tiempo, los tokens, el coste, las pruebas que pasaron y el diff de archivos (cada uno en su worktree).
   - **«Quedarme con este»** integra la rama elegida y archiva las demás.
   - Es una arena con **tu propia tarea**, no con benchmarks.

7. **Conflictos de archivos a la vista.** Si dos paneles escriben en la misma carpeta, Boards lo marca con un chip «comparte carpeta con *X*» y ofrece abrir el siguiente en un worktree. Esto convierte el aviso de hoy en una acción.

8. **Teclado:**
   - **Ctrl+1…9:** ir al panel N;
   - **Ctrl+J:** lo siguiente que te necesita;
   - **Ctrl+Shift+Enter:** enviar el composer a todos los paneles seleccionados (el envío múltiple de «Comparar»);
   - **Ctrl+W / Ctrl+N** como hoy.

### B.4 Qué se va
- La mensajería entre paneles: el grupo de peers, `session.send`, `@Panel`, el «máx. 3 saltos», la opción en Ajustes y el chip de recibir/enviar de la cabecera del panel. El historial de mensajes peer se sigue viendo.
- El board único global: los paneles guardados pasan al primer espacio, «Mi board».
- **«Quitar y cerrar sesión»** en el menú del panel (`BoardView.tsx:231-238`, `board.pane.removeAndClose`). En la práctica archivaba la conversación: `session.close` la sacaba del listado y detenía sus vistas previas, el navegador y los procesos. Además, el nombre se confundía con salir de la cuenta. **Queda solo «Quitar del board»**, que saca el panel sin tocar la conversación. Archivar se hace desde la barra lateral, como con cualquier conversación. Se retiran el diálogo de confirmación y las claves `board.pane.removeAndClose*`.

### B.5 Lo que se queda
Paneles por sesión, tiras plegadas, el panel lateral por sesión, ajustar a la vista, foco y los avisos de atención. Esto ya funciona y se reaprovecha.

### B.6 Fases

| Fase | Qué | Tamaño |
|---|---|---|
| B1 | Quitar la mensajería entre paneles y «Quitar y cerrar sesión»; espacios guardados por perfil; composiciones rápidas | M |
| B2 | Paneles que cambian de tamaño por estado, tira viva y bandeja «Te necesitan» con Ctrl+J | L |
| B3 | Llenar en un gesto (arrastrar, «con sus hijas», desde notas) | S |
| B4 | Comparar: envío múltiple, vista de comparación y «Quedarme con este» (necesita worktrees de A3) | L |
| B5 | Conflictos de archivos con la acción de worktree, y pulido de movimiento | S |

---

## Parte C. Lo pendiente de Boards hoy

Todo lo que ya está anotado sobre Boards en otros lados (el plan 0.3.2, Planka, `docs/debt.md` y lo visto en pruebas), junto en un solo lugar.

| # | Qué | De dónde | Estado |
|---|---|---|---|
| C1 | «Preparando el turno…» aparece un instante en el panel al enviar y luego desaparece (ver C.1) | Planka, Bug (2026-10-12) | Causa verificada. En 0.3.2 como #39 |
| C2 | El composer le quitaba el foco al cajón del panel lateral (el rojo de `boards-side-panel` en `main`) | Plan 0.3.2, «CI» | Hecho en la rama `0.3.2` (0c7f34f, sin subir) |
| C3 | La flecha de la lista de pasos apunta al revés; revisar que en los paneles (`density="pane"`) también esté anclada abajo | Plan 0.3.2, #22 | Decidido |
| C4 | Los avisos de turno terminado solo existen para paneles del board. Se extienden a todas las conversaciones reutilizando `useBoardNotifications`, y sus preferencias pasan a Ajustes → Notificaciones | Plan 0.3.2, #33 | Decidido. Toca código de Boards: coordinar |
| C5 | Pendientes de otros perfiles: agregar paneles filtra por el perfil activo y lo de otros perfiles no se ve | Plan 0.3.2, #34 | Decidido (depende de C4) |
| C6 | Quitar «Quitar y cerrar sesión» y dejar solo «Quitar del board» | Planka, Needs Review | Decidido (B.4, fase B1) |
| C7 | Mensajes entre paneles «como subagentes» | Planka, Idea; triage I1 | Resuelto por decisión: la mensajería se quita (B.4) y la comunicación entre agentes pasa a [Rinari Agency](idea-rinari-agency.md) |
| C8 | Animación en la píldora al cambiar entre Normal y Boards | Planka, Para luego | Sin decidir. Encaja con el pulido de movimiento (B5) |
| C9 | Panel en blanco (0 filas) al pasar de Normal a Boards | Visto 3 veces en uso real; intermitente en el escenario `chat-interaction-fixes` | Abierto, sin causa confirmada. Hipótesis: Virtua con un ancla de scroll restaurada fuera de rango |
| C10 | Dos paneles escribiendo en la misma carpeta: el Engine no los serializa y el board solo avisa | `docs/debt.md` | Abierto. Lo resuelve B.3.7 (chip y worktree) |
| C11 | `busy` en `session.list`: tras un arranque en frío no se sabe si una sesión no abierta está trabajando hasta que llega un evento | `docs/debt.md` | Abierto. La tira viva (B.3.1) lo necesita |
| C12 | Los recibos de lectura se indexan por instalación, no por home del Engine | `docs/debt.md` | Abierto |
| C13 | Regla que se mantiene: que aparezca un contador en la barra de Boards nunca cambia su altura | 52530f7, comprobado en `boards-fit` | Vigente |

### C.1 «Preparando el turno…» parpadea en el panel

**Qué se vio** (Planka, Bug, con captura). En un panel de Boards, al enviar un mensaje aparece un instante el bloque «En proceso desde hace 0 s · Preparando el turno…» y luego desaparece. Que no esté es lo correcto en un panel; lo que sobra es que aparezca.

**Causa (verificada).**
- En 0.3.0 se quitó el «Pensando» de los paneles: en un panel, la cabecera viva del turno se oculta mientras Rinari solo piensa, porque eso ya lo dice la cara de Rinari en la cabecera del panel (`TurnTimelineView.tsx:619-623`, `paneThinking`).
- Pero esa regla solo cubre el estado `thinking`. Antes de pensar, el Engine emite `turn.preparing`, y la línea de tiempo pasa por el estado `preparing` (`activityPresentation.ts:129`).
- En `preparing` la cabecera sí se muestra: ya hay un elemento en la línea de tiempo, así que `showHeader` es verdadero al instante. Cuando llega la primera respuesta del modelo el estado pasa a `thinking` y la cabecera se esconde. De ahí el parpadeo.

**Propuesta.** En un panel, `preparing` se trata igual que `thinking`: la cabecera viva espera a que haya algo que contar (una acción, la respuesta, un reintento, la cancelación). Es un cambio de una línea en `TurnTimelineView.tsx`. El chat normal no cambia.

**Pruebas.**
- Vitest de `TurnTimelineView` con `surface="pane"`: con solo `turn.preparing` no hay `[data-live-activity]`; con una acción, sí. Con `surface="chat"` sigue igual que hoy.
- Escenario de Boards (`boards-fit` o uno nuevo): se envía en un panel y se muestrea con `requestAnimationFrame` desde el envío hasta la primera acción. `[data-live-activity]` no aparece en ningún cuadro.

---

## Mapa del código (para quien se suma)

**App (`Rinari-Agent`):**
- `src/features/board/`:
  - `BoardView.tsx` (el board), `SessionPane.tsx` y `PaneHeader.tsx` (cada panel), `CollapsedPaneStrip.tsx` (la tira plegada), `BoardToolbar.tsx`, `AddPaneDialog.tsx`, `DraftPane.tsx` (panel nuevo sin sesión aún);
  - atención y avisos: `BoardAttentionSection.tsx`, `BoardActivityController.tsx`, `useBoardNotifications.ts`, `useResultVisibility.ts`;
  - la mensajería que se va (B.4): `usePeerGroup.ts`, `usePeerNotifications.ts`, `PeerForwardDialog.tsx`, `PeerNavigationContext.tsx`, `peerLimits.ts`, y en el composer `src/components/composer/paneMention.ts`.
- Estado: `src/stores/board.ts`, `boardAttention.ts` y `boardStatus.ts`.
- La línea de tiempo de un panel es la misma del chat, con `surface="pane"` (`src/features/activity/TurnTimelineView.tsx`).
- Escenarios: `tests/ui/boards-fit`, `boards-remove-all` y `boards-side-panel`; `chat-interaction-fixes` y `activity-disclosure` también pasan por Boards.

**Engine (`RInari-CLI`):** `src/rinari/engine_protocol/peers.py` (`PeerBroker`, el buzón durable de los mensajes entre paneles). Al quitar la mensajería hay que decidir si el buzón se retira o se guarda como transporte de la Agency, que lo cita en su sección 2.

**Antes de tocar:**
- reglas del proyecto en `AGENTS.md` (el renderer solo habla con el host por `platform()`, el contrato de comandos y cómo se entrega);
- diseño en `docs/design/obsidiana-neon.md` (tokens, componentes canónicos, movimiento);
- comprobaciones en `CLAUDE.md`: vitest, build, typecheck, `protocol:check`, `parity:check` y los escenarios de `tests/ui` tocados, varias veces, con la CPU cargada y con `RINARI_UI_REDUCED_MOTION=1`, más `ui:e2e --all`. Para el movimiento no basta una captura: se muestrea cuadro a cuadro.

---

## Decisiones para el dueño

| # | Decisión | Recomendado |
|---|---|---|
| A-1 | `session.start` solo cuando el dueño lo pide; si a Rinari se le ocurre, usa una nota | Sí |
| A-2 | La hija hereda el perfil y **las aprobaciones de sesión** de la madre, nunca más | Sí |
| A-3 | La madre retoma un turno corto cuando termina una hija que abrió Rinari (y no cuando nace de una nota) | Sí |
| A-4 | `session.message` solo de la madre a sus hijas, nada lateral | Sí |
| A-5 | Una hija que escribe en el mismo repo usa worktree por defecto | Sí, preguntando la primera vez por proyecto |
| B-1 | Paneles que cambian de tamaño solos según su estado | Sí, con un interruptor para apagarlo |
| B-2 | Varios espacios guardados por perfil, en lugar de un board global | Sí |
| B-3 | «Comparar» como función estrella de Boards | Sí, en una fase propia |
| V | Versiones: Parte A1–A2 en 0.3.x o 0.4; Parte B en 0.4; la Agency aparte | A1 primero: ya da valor con las notas que existen |
| C-1 | Los arreglos chicos de Boards ya analizados (C1–C5) van con 0.3.2; las Partes A y B y la Agency, con quien se sume | Sí: son cambios acotados y C4 toca también lo que no es Boards |
| C-2 | El buzón de los peers (`PeerBroker`): retirarlo con la mensajería o guardarlo como transporte de la Agency | Guardarlo hasta que la Agency tenga su arquitectura (v2 de su documento) |
