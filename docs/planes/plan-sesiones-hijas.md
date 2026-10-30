# Sesiones hijas

Estado: **A1 hecho (bloque 13); A2 + A3 + ofertas con la lógica hecha (H1–H3: CLI 0c6eeec y b2eac4f, Agent 84368b8), falta el pulido de interfaz (H4)**. Sacado del plan de Boards el 2026-10-12 (no es de Boards: vive en la barra lateral y en el chat).

**Versiones** (decisión del dueño, 2026-10-12):
- **A1 entra en 0.4.0** ([plan-0.4.0.md](plan-0.4.0.md), #40): el vínculo madre → hija y la barra lateral anidada. Ya da valor con lo que existe, porque las notas aceptadas, los forks y las tareas programadas crean sesiones.
- ~~A2 y A3, en la versión siguiente~~ → **cambio (dueño, 2026-10-16): A2 y A3 entran en 0.4.0 como tanda propia, antes de la 17**, junto con las ofertas al estilo Claude Code. El diseño que se implementa es el de la [sección 5](#5-diseño-que-se-implementa-decidido-2026-10-16); las secciones 2–4 quedan como historia de cómo se llegó.

Boards no depende de las hijas por ahora ([plan-boards.md](plan-boards.md) quedó en limpieza y panel colapsado con estado). Si más adelante vuelven ideas aparcadas como «Abrir con sus hijas» o Comparar, usarían el linaje de A1 y los worktrees de A3. La comunicación entre agentes que no son madre e hija es de [Rinari Agency](idea-rinari-agency.md).

---

## 1. Qué hay hoy
- **Las notas de Rinari ya hacen media función.** Al aceptar una, se crea una sesión nueva en el mismo proyecto y perfil, se envía la tarea y el turno arranca. Funciona bien.
- **Pero no queda ningún vínculo visible:**
  - la tabla `sessions` no tiene `parent_session_id`;
  - el origen solo queda en la nota (`followup_suggestions.accepted_session_id`) y en el `origin` del primer mensaje;
  - la barra lateral no anida sesiones.
- **Pasa lo mismo con los forks y las tareas programadas.** `forked_from` existe en la base de datos, pero la app no lo lee.
- **El modelo solo puede *sugerir* con una nota.** No tiene cómo abrir una sesión cuando el dueño se lo pide («ábreme una sesión para migrar pagos»).

## 2. La propuesta (el modelo de Claude Code)

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

## 3. En la interfaz
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

## 4. Fases

| Fase | Qué | Tamaño |
|---|---|---|
| A1 | Linaje (migración, notas, forks y tareas programadas lo llenan) y barra lateral anidada con estados y miga | M |
| A2 | `session.start`, `session.children`, la herencia de permisos y aprobaciones, y la tarjeta de entrega | M |
| A3 | `session.message` a las hijas, `context: "fork"`, `isolation: "worktree"` con «Integrar rama», y `/hija` | M |

---

## 5. Diseño que se implementa (decidido 2026-10-16)

**Qué cambia respecto a A2/A3.** Además de que Rinari abra una hija cuando el dueño lo pide, Rinari puede **ofrecer** abrirla, como Claude Code: para un pedido del dueño que conviene hacer aparte, y para trabajo que se le ocurre a ella. Todo nace en el mismo proyecto (o en el mismo chat suelto) que la madre.

### 5.1 Las tres formas de nacer (quién la quiere)

| Cuándo | Herramienta | Qué ve el dueño |
|---|---|---|
| **El dueño lo pide** en palabras («ábrelo en otra sesión», «hazlo aparte») | `session.start` — empieza ya | La hija aparece bajo la madre y en el chat «Abrí *X*» con enlace |
| **Un pedido del dueño** que conviene aparte (grande, de otro tema, en paralelo) | `session.offer` — **espera la respuesta** | Tarjeta «¿Nueva sesión o aquí?» con «Nueva sesión» / «Hazlo aquí»; si elige aquí, Rinari sigue en la madre |
| **Idea de Rinari** (arreglo visto de paso, seguimiento, trabajo que su respuesta recomienda) | `followup.suggest` (la nota de hoy, mejorada) | Tarjeta que **inicia el dueño**; caduca (hoy 14 días) |
| **Plan aprobado** con 2 o más pasos independientes | notas de tipo `plan_step` | Una tarjeta por paso (hasta 4), y Rinari empieza el suyo aquí; si el dueño inicia una, Rinari no hace ese paso |

- `session.start` **solo** cuando el dueño lo pidió (A-1); `session.offer` solo para un pedido del dueño de este mensaje; lo que se le ocurre a Rinari va siempre como nota.
- La oferta reutiliza el mediador de preguntas (`questions.py`): es una pregunta con `offer`, que la app pinta como tarjeta propia. Sin respuesta en el turno, caduca como una pregunta.

### 5.2 Qué lleva cada hija
- **Encargo** (`brief`): título, la tarea autocontenida (qué, dónde, cómo se sabe que está hecho). Va siempre, también con `context: "fork"`.
- **Contexto**, lo elige Rinari y se ve en la tarjeta:
  - `brief` (por defecto): solo el encargo;
  - `fork`: la conversación de la madre copiada (como «Bifurcar») más el encargo. Para una subtarea del mismo tema mientras la conversación es corta.
- **Carpeta** (decisión del dueño: **worktree por defecto**):
  - si la hija va a escribir en el mismo repositorio git, trabaja en **su worktree** (`.rinari-worktrees/<rama>`, rama `rinari/<slug>`), reutilizando el `worktree_manager` de los subagentes;
  - sin git, o si solo lee, en la misma carpeta;
  - la **primera vez por proyecto**, la tarjeta de la hija lo dice y ofrece «Usar la misma carpeta en este proyecto» (queda como ajuste del proyecto);
  - en la misma carpeta, nunca dos hijas escritoras a la vez sobre los mismos archivos: si hay otra escribiendo, la nueva va a worktree.
- **Permisos** (A-2): el perfil de la madre y sus aprobaciones «en esta sesión» del momento en que nace (copiadas de `session_approval_grants`, #56; las de carpetas de la madre se trasladan al worktree). Nunca más que la madre; subirlo es del dueño, desde la hija. Las guardias (contenido externo, lista dura) siguen igual.
- **Topes:** 4 hijas trabajando a la vez por madre y 2 niveles (una hija puede tener hijas; una nieta no). Al pasarse, un error claro que sugiere esperar o usar una nota.

### 5.3 De vuelta a la madre
- Cuando una hija **termina un turno que no lanzó el dueño** (el encargo, o un mensaje de la madre), la madre recibe un **informe**: el inicio de su último mensaje (≈400 caracteres; el texto completo, hasta 4000, queda en el informe), los archivos cambiados, la rama si usó worktree y su estado (terminó, falló, se detuvo, espera aprobación). Los turnos que el dueño lleva a mano dentro de la hija no avisan.
- **En la madre:** tarjeta de entrega «Terminó *X*» con el resumen, los archivos, «Abrir», y si hay rama «Integrar rama» / «Descartar». El modelo de la madre ve los informes en su contexto del turno siguiente (segmento `task_state`).
- **La madre continúa sola** (decisión del dueño, A-3) **si la hija la abrió Rinari** (`start`, `offer` o paso de plan) **y la madre está libre**: cuando ya no queda ninguna de esas hijas trabajando, la madre hace un turno corto con todos los informes nuevos: revisa el resultado (un informe no es prueba), sigue con lo que eso desbloquee de lo que el dueño pidió, o se lo cuenta en una o dos líneas. Las que nacen de una nota solo dejan la tarjeta. Nunca se encadena: un informe dispara a lo sumo un turno.
- **Integrar rama** lo hace **solo el dueño** (botón), nunca el modelo: fusiona con el `worktree_manager`; si hay conflictos, la tarjeta los nombra y ofrece «Resolver en la hija» (un mensaje a la hija). «Descartar» borra el worktree y la rama, con confirmación.

### 5.4 Después de nacer
- `session.message({child, text})`: la madre le escribe a **una hija suya** (A-4). Si la hija trabaja, le llega como guía; si no, empieza un turno marcado «de *Madre*». Nada hacia otras conversaciones (eso es de la Agency).
- `session.children()`: estado, rama y último informe de cada hija.
- El dueño puede crear hijas a mano: «Hacer en sesión hija» al pasar sobre un mensaje suyo y `/child <tarea>` (los comandos van en inglés, como `/goal`), ambos con `session.child.start`; «Bifurcar» sigue igual, anidado.

### 5.5 En la interfaz
- Tarjeta de **oferta** («¿Nueva sesión o aquí?»), tarjeta de **hija iniciada** en el chat de la madre, tarjeta de **entrega**, y la **nota** con su contexto y carpeta visibles (se pueden cambiar antes de iniciarla).
- Primer mensaje de la hija: «Encargo de *Madre*», con estilo propio, no burbuja del dueño.
- Barra lateral: el estado de cada hija (trabajando, espera aprobación, terminó, falló) y el icono de rama si usa worktree.
- Lo visual pasa por la sesión de pulido de UI.

### 5.6 Motor (CLI)
- Migración `0056_session_children`: tabla `session_children` (hija, madre, origen `start|offer|note|plan_step`, contexto, carpeta, ruta y rama del worktree, estado, último informe, si ya se informó, integrada/descartada) y `lineage_kind` acepta `delegated`, `offer` y `plan_step`.
- `ChildSessions` (servicio): crear (sesión nueva o fork, worktree, permisos copiados, linaje, turno del encargo), informe al terminar (enganchado al final de `_run_turn`, como el `GoalRunner`), turno de la madre, integrar y descartar.
- Herramientas `session.start`, `session.offer`, `session.children`, `session.message` y `followup.suggest` con `kind`, `context` y `isolation`. Se activan con el resto de herramientas de sesión para no cargar el contexto de cada turno.
- Protocolo: `session.children.list`, `session.child.integrate`, `session.child.discard`, evento `session.child.updated`, y la capacidad `child_sessions_v1`.
- Pruebas: los tres orígenes; worktree y misma carpeta; permisos heredados y nunca más; informe solo de turnos no llevados por el dueño; la madre continúa una sola vez y solo si está libre; topes; integrar con y sin conflicto; mensajes solo a hijas propias.

### 5.7 Fases de la tanda
| Fase | Qué |
|---|---|
| H1 | Motor: migración, `ChildSessions`, `session.start`, permisos, worktree, informe y turno de la madre, `session.children`, `session.message` |
| H2 | Ofertas: `session.offer` (pregunta con `offer`), notas con contexto y carpeta, pasos de plan |
| H3 | App: tarjetas (oferta, iniciada, entrega con integrar/descartar), nota mejorada, encargo, estados en la barra lateral, «Abrir en sesión hija» y `/hija`; escenarios |
| H4 | Pulido de UI (sesión de pulido) y Nightly |

---

## Decisiones

| # | Decisión | Estado |
|---|---|---|
| A-1 | `session.start` solo cuando el dueño lo pide; si a Rinari se le ocurre, usa una nota | Decidido |
| A-2 | La hija hereda el perfil y **las aprobaciones de sesión** de la madre, nunca más | Decidido |
| A-3 | La madre retoma un turno corto cuando termina una hija que abrió Rinari (y no cuando nace de una nota) | Decidido |
| A-4 | `session.message` solo de la madre a sus hijas, nada lateral | Decidido |
| A-5 | Una hija que escribe en el mismo repo usa worktree por defecto | Decidido; la primera vez por proyecto la tarjeta ofrece usar la misma carpeta (2026-10-16) |
| V | ~~A1 en 0.4.0; A2 y A3 en la versión siguiente~~ → todo en 0.4.0, como tanda propia antes de la 17 | Decidido (2026-10-12; cambiado 2026-10-16) |
| A-6 | Rinari también **ofrece** hijas como Claude Code: `session.offer` para un pedido del dueño que conviene aparte (espera «Nueva sesión» / «Hazlo aquí»), y notas para sus propias ideas | Decidido (2026-10-16) |
| A-7 | Al aprobar un plan con 2 o más pasos independientes, una tarjeta por paso (hasta 4) y Rinari empieza el suyo | Decidido (2026-10-16) |
| A-8 | La madre continúa sola, una vez, cuando terminan las hijas que abrió Rinari y ella está libre | Decidido (2026-10-16) |
