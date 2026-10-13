# Sesiones hijas

Estado: **decidido**, sacado del plan de Boards el 2026-10-12 (no es de Boards: vive en la barra lateral y en el chat).

**Versiones** (decisión del dueño, 2026-10-12):
- **A1 entra en 0.3.2** ([plan-0.3.2.md](plan-0.3.2.md), #40): el vínculo madre → hija y la barra lateral anidada. Ya da valor con lo que existe, porque las notas aceptadas, los forks y las tareas programadas crean sesiones.
- **A2 y A3, en la versión siguiente:** `session.start`, la herencia de permisos y la tarjeta de entrega; luego los mensajes a las hijas, los worktrees e «Integrar rama».

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

## Decisiones

| # | Decisión | Estado |
|---|---|---|
| A-1 | `session.start` solo cuando el dueño lo pide; si a Rinari se le ocurre, usa una nota | Decidido |
| A-2 | La hija hereda el perfil y **las aprobaciones de sesión** de la madre, nunca más | Decidido |
| A-3 | La madre retoma un turno corto cuando termina una hija que abrió Rinari (y no cuando nace de una nota) | Decidido |
| A-4 | `session.message` solo de la madre a sus hijas, nada lateral | Decidido |
| A-5 | Una hija que escribe en el mismo repo usa worktree por defecto | Decidido, preguntando la primera vez por proyecto |
| V | A1 en 0.3.2; A2 y A3 en la versión siguiente | Decidido (2026-10-12) |
