# Triage de Planka para la 0.3.2

Fecha: 2026-10-11. Tablero **Agent** del proyecto **Rinari Agent**, listas **Bug** e **Idea**.

- Tarjetas leídas de nuevo con `planka_cards_list` y `planka_card_get`. Ninguna tiene descripción (salvo «Herramientas y demás en contexto»), comentarios ni adjuntos.
- La fecha de creación sale del id de Planka.
- Código revisado: la rama `0.3.2` de Agent (`worktrees/v032-agent`, 0c7f34f) y la del CLI (`worktrees/v032-cli`, igual que `main` en 2a94168).
- Es solo análisis: no se tocó Planka ni el código.
- Plan de referencia: [plan-0.3.2.md](plan-0.3.2.md), hallazgos 3–17. Ninguna tarjeta está cubierta tal cual por el plan; las relaciones parciales se indican en cada sección.

## Resumen

**Decisión del dueño (2026-10-11):** B2, B3 y B1 entran en el plan como los hallazgos **18**, **19** y **20** de [plan-0.3.2.md](plan-0.3.2.md). Las demás tarjetas quedan fuera hasta que él diga.

| # | Tarjeta | Lista | ¿Aplica? | Recomendación | Tamaño |
|---|---|---|---|---|---|
| B1 | Rebote del scroll al bajar con la rueda mientras Rinari trabaja | Bug | No se pudo determinar (hay una causa probable en el código actual) | **Entra en 0.3.2**: primero el escenario que lo reproduce, luego el arreglo | M |
| B2 | No deja poner más de una imagen en el composer | Bug | Sí | **Entra en 0.3.2** | S |
| B3 | No deja eliminar el proveedor activo si no hay otro | Bug | Sí | **Entra en 0.3.2** | S |
| B4 | Un subagente y su padre se quedan esperando hasta un mensaje de seguimiento (`ses_01M46E3SM7NE8R7SSGNERRFH2G`) | Bug | No se pudo determinar (sesión de otro usuario; dos arreglos relacionados llegaron después de la tarjeta) | Para después: pedir el diagnóstico de la sesión; mejora opcional de visibilidad junto al #5 | S (visibilidad) |
| I1 | Mensajes entre paneles de Boards como subagentes | Idea | Parcialmente (la mensajería entre paneles ya existe) | Para después: un plan propio de Boards | L |
| I2 | Herramientas y demás en contexto en cada mensaje | Idea | Parcialmente (todo se reenvía por diseño, pero ya hay caché de prefijo y una parte la rompe) | **Entra en 0.3.2** solo el orden estable de herramientas; el resto, para después | S (+ M después) |
| I3 | «¿Un framework de tests ahí sería ceremonia?» | Idea | Ya resuelto | Descartar o cerrar | — |

---

## B1. Rebote del scroll al bajar con la rueda mientras Rinari trabaja

**Qué describe.** Otro usuario bajaba con la rueda por un chat mientras Rinari ejecutaba comandos (plegados), y el chat «rebotaba». El dueño no lo vio. La tarjeta es del 2026-10-11, pero el uso fue en una versión anterior.

**¿Aplica todavía?** **No se pudo determinar.** No hay datos de esa sesión ni la versión exacta. Pero en el código actual hay un mecanismo que produce justo ese síntoma, y ninguna prueba lo cubre.

**Lo que ya se arregló sobre scroll** (no cubre este caso):
- `4b437fa` (PR #87, 2026-10-08): seguir el final con un solo `ResizeObserver`, y `handleScroll` tras restaurar el ancla.
- `b9ffb00` (2026-10-06): tras enviar, solo un gesto deja de seguir el final.
- `974a967` (2026-10-05): ir al final al enviar.
- `f3ff3cc` y `5271433` (2026-10-07): actividad plegada en vivo y `ActivityTransition`.
- Las pruebas existentes (`ChatView.scroll.test.tsx`, `chat-interaction-fixes`, `activity-disclosure`, `chat-send-jump`) prueban anclas, saltos al enviar y plegados. Ninguna mueve la rueda mientras crece un turno en curso.

**Causa probable** (hipótesis, sin reproducir):

1. **El ancla es el turno entero y su posición se recorta a la vista.**
   - `ActivityTransition` (`src/features/activity/ActivityTransition.tsx:9-16`) llama a `layout.begin(root, false)` cada vez que cambia su `identity`. La identidad es `` `${active}:${final}:${segments.length}` `` (`TurnTimelineView.tsx:626`), así que cambia en cada segmento nuevo mientras Rinari trabaja.
   - En `ChatView.tsx:226-247`, si la persona no sigue el final (está a más de 80 px del fondo) y el turno se ve aunque sea en parte:
     - se guarda `offset = max(viewport.top, min(top, viewport.bottom - 40))` (`:237`);
     - al terminar, `scrollTop += anchor.top - offset` (`:241`).
   - En un turno largo, la cabecera del turno queda **por encima** de la vista: `top < viewport.top`. Entonces `offset = viewport.top` y la restauración **sube el chat hasta el inicio del turno**, en vez de dejar al lector donde estaba.
   - La persona vuelve a bajar con la rueda, llega otro segmento y el chat vuelve a subir. Eso se ve como un rebote.
2. **La restauración pisa la rueda.** `restore()` se ejecuta en el commit y otra vez en el siguiente `requestAnimationFrame` (`ChatView.tsx:244-245`), con el `offset` del principio. Si entre medias llega un `wheel` (en Chromium el desplazamiento de la rueda es suave y dura varios cuadros), el segundo `restore` deshace ese movimiento. Además, asignar `scrollTop` corta la animación suave de la rueda.
3. **Factor menor.** Al entrar en la franja de 80 px del fondo (`:218`), `followRef` vuelve a `true` y el efecto de `:369-375` hace `scrollToIndex(last, 'end')`. Es un tirón hacia abajo que se suma a lo anterior.

**Cómo reproducirlo** (escenario nuevo `tests/ui/chat-scroll-live`, con el modelo falso de loopback del arnés):
- El modelo falso hace un turno largo: unos 6 comandos `shell.exec` lentos, con texto entre ellos para crear segmentos nuevos (cambia `segments.length`), lo bastante largo para superar dos alturas de vista.
- Con el turno en curso:
  - subir hasta que la cabecera del turno quede por encima de la vista y el fondo a más de 80 px;
  - enviar rueda **real** hacia abajo con CDP (`Input.dispatchMouseEvent` con `type: 'mouseWheel'`, `deltaY: 60` cada ~120 ms; no vale con `el.scrollTop =`).
- Muestrear `scrollTop` en cada `requestAnimationFrame` durante todo el turno.
- **Aserción:** con solo rueda hacia abajo, `scrollTop` nunca baja más de 2 px entre dos cuadros, salvo el salto final pedido por la persona.
- Repetir con la CPU cargada y con `RINARI_UI_REDUCED_MOTION=1`.
- Un vitest de `activityLayout.begin` puede cubrir el cálculo: anclar con `top < viewport.top` no debe mover `scrollTop`.

**Recomendación: entra en 0.3.2.** Es de la misma familia que el #16 del plan (misma función, `activityLayout.begin`), así que conviene tocarlas juntas.
- Primero el escenario. Si no reproduce, se cierra la tarjeta con esa evidencia.
- Si reproduce, el arreglo:
  - para `manual=false`, anclar al **primer elemento visible** dentro del turno (como hace el navegador con `overflow-anchor`), no a la cabecera del turno recortada a la vista;
  - o bien, si `top < viewport.top`, conservar el `top` real sin recortarlo;
  - cancelar la segunda restauración (la del `rAF`) si hubo `wheel`, `pointerdown`, `touchstart` o una tecla de desplazamiento entre medias (un contador de gestos en `userScrolls`).
- **Tamaño:** M.

---

## B2. No deja poner más de una imagen en el composer

**Qué describe.** Al añadir una segunda imagen en el composer, no entra.

**¿Aplica todavía?** **Sí.** El límite real es de 8 adjuntos, tanto en la app (`MAX_ATTACHMENTS = 8`, `src/stores/composer.ts:51`) como en el Engine (`artifacts/attachments.py:32`). El problema es la deduplicación.

**Causa** (`src/components/composer/Composer.tsx`):
- `addAttachment` descarta en silencio un adjunto con el mismo `path` y `name` que otro (`:577`).
- Los archivos que llegan del navegador (pegar, o arrastrar al chat con `useChatFileReceiver`) usan `path: file.name` y `name: file.name` (`:643-645`).
- Chromium nombra **siempre `image.png`** a una imagen pegada desde el portapapeles (por ejemplo, una captura de Win+Shift+S). La segunda captura pegada tiene el mismo `path` y `name` que la primera, así que se descarta sin ningún aviso.
- Pasa igual con dos archivos que se llaman igual pero vienen de carpetas distintas.
- Riesgo menor: el `id` es `att_${Date.now()}_${name}` (`:643`, `:668`). Dos imágenes pegadas en el mismo milisegundo con el mismo nombre comparten `id`, y `updateAttachmentById` o `removeAttachmentsById` actuarían sobre las dos.
- «Adjuntar archivos» (`chooseFiles`, `:664-676`) usa la ruta real, así que por ahí sí entran varias. Eso explica que el fallo se vea al pegar.
- Ningún commit ha cambiado la deduplicación. El último que tocó ese bloque es `3d12f8b` (2026-10-01, resaltar la zona de arrastre), y no cambió esa regla.

**Recomendación: entra en 0.3.2.**
- Para archivos del navegador (con `data_url`), deduplicar por contenido (tamaño + hash del `data_url`, o `lastModified` + tamaño), no por nombre. Para rutas reales, seguir deduplicando por ruta.
- `id` con `crypto.randomUUID()`.
- Si se descarta un duplicado de verdad, mostrar un aviso breve en `attachmentNotice` en vez de callar.
- Pruebas:
  - vitest: pegar dos `File` llamados `image.png` con contenido distinto da 2 adjuntos, y pegar dos veces el mismo da 1 y un aviso;
  - aserción en `composer-file-drag` con dos imágenes.
- **Tamaño:** S.

---

## B3. No deja eliminar el proveedor activo si no hay otro

**Qué describe.** Si solo hay un proveedor (y es el activo), no se puede eliminar. Debería poderse.

**¿Aplica todavía?** **Sí.**

**Causa:**
- **Engine** (`application/provider_service.py:453-463`): si el proveedor es el activo y no llega `switch_to`, lanza `InvalidUsageError("Provider … is active. Select another provider first.")`.
  - La rama que ya deja el sistema sin proveedor activo (`:482-484`, borra `KEY_ACTIVE_PROVIDER` y `KEY_ACTIVE_MODEL`) **nunca se ejecuta**, porque el `raise` anterior la tapa.
  - El test `test_remove_active_provider_requires_switch` (`tests/unit/test_provider_service.py:154-157`) fija ese comportamiento con un solo proveedor.
- **App** (`src/features/providers/ProvidersView.tsx:209-222`, `:398-418`): con un solo proveedor no hay selector «Mover sesiones activas a» y se llama sin `switch_to`. El usuario confirma, sale el toast de error y el proveedor sigue ahí.
- **Quedarse sin proveedores ya está resuelto en la app:** con 0 proveedores se abre el asistente (`src/App.tsx:364-374`) y Modelos muestra «Añadir proveedor» (`ModelsView.tsx:19-29`).

**Recomendación: entra en 0.3.2.**
- **Engine:** si es el activo, no llega `switch_to` y **no queda ningún otro proveedor**, borrar y limpiar el activo (la rama que ya existe). Si quedan otros, seguir pidiendo `switch_to`, para no dejar sesiones sin modelo por accidente.
- **App:** con un solo proveedor, el diálogo dice que Rinari quedará sin proveedor y que se abrirá el asistente. Texto nuevo en `es.ts` y `en.ts`.
- Revisar que una sesión abierta con un modelo de ese proveedor muestre el aviso de «sin modelo» y no se rompa.
- Pruebas:
  - unitarias del Engine: invertir `test_remove_active_provider_requires_switch` para el caso de uno solo, mantener el error con dos;
  - vitest del diálogo.
- Encaja con el #12 del plan (el `<select>` de ese mismo diálogo pasa al selector nuevo), así que van en el mismo cambio.
- **Tamaño:** S.

---

## B4. Subagente y padre se quedan esperando (`ses_01M46E3SM7NE8R7SSGNERRFH2G`)

**Qué describe.** En una sesión de otro usuario, Rinari lanzó un subagente y no pasó nada hasta que el usuario escribió un mensaje de seguimiento. Parecía que el padre y el hijo se habían quedado esperando. La tarjeta es del **2026-10-05**.

**¿Aplica todavía?** **No se pudo determinar.**
- La sesión no está en `~/.rinari/state.db` del dueño (búsqueda de solo lectura en todas las tablas por `session_id`/`id`), así que no hay eventos que mirar.
- No sabemos si fue en la app o en el CLI, ni con qué versión.

**Cómo funciona hoy** (Engine `0.3.2`):
- `agent.spawn` no bloquea: el hijo corre en un hilo y la herramienta devuelve `running` (`agents/orchestrator.py:267-272`).
- Cuando el padre da una respuesta sin herramientas, `collect_for_final` **bloquea el turno hasta que terminan todos los hijos** (`runtime/agent.py:432-433`, `agents/orchestrator.py:282-308`), con un tope de 600 s por hijo antes de cancelarlo.
- Nada despierta al padre fuera de un turno.
  - Las notas de fin solo se inyectan tras una ronda de herramientas del padre (`runtime/agent.py:903-908`).
  - En la app, al terminar el turno del padre, los hijos vivos se cancelan con «Parent turn ended before the agent returned a result.» (`engine_protocol/turns.py:1050-1076`).
- Un mensaje del usuario durante la espera es un guiado (`steer`). Solo se aplica cuando vuelven los hijos (`runtime/agent.py:436`). Por eso parece que el mensaje «despertó» al padre, aunque solo coincidió con el final del hijo.

**Causas candidatas, de más a menos probable:**
1. **Una aprobación del hijo que nadie vio.**
   - El hijo pide permiso a través del padre (`agents/runtime.py:489-508`) y espera hasta 600 s (`APPROVAL_TIMEOUT_S`, `engine_protocol/turns.py:48`). Mientras tanto el padre sigue bloqueado.
   - **En la app**, desde `5271433` (2026-10-07, dos días después de la tarjeta), las aprobaciones pendientes de un hijo salen fuera de su tarjeta plegada (`activityPresentation.ts:56-66`, `TurnTimelineView.tsx:650-653`). Si el usuario tenía una versión anterior, la aprobación podía quedar dentro de la tarjeta del agente, que empieza cerrada (`TurnTimelineView.tsx:358`).
   - **En el CLI**, la pregunta usa `typer.prompt` desde el hilo del hijo (`cli/agent_runtime.py:1162-1170`), y el spinner puede taparla. La línea que el usuario escriba después se toma como respuesta. Esto viene de la exploración y no está reproducido.
2. **El hijo trabaja, pero no se ve.**
   - La tarjeta del agente empieza plegada.
   - El turno del padre no muestra un estado «esperando a N subagentes» mientras `collect_for_final` bloquea.
   - Visto desde fuera, nada se mueve.
3. **Mensajes al hijo que nadie leía.** Antes de `0c4448c` (2026-10-08), `agent.message` dejaba los mensajes en una cola sin lector. Ese commit añadió la lectura, la reanudación de hijos terminados y las notas de fin.

**Relación con el plan.** El #5 (subagentes en REVIEW) toca la misma zona, pero no este síntoma.

**Recomendación: para después**, pendiente de datos.
- Pedir al usuario el **«Exportar diagnóstico»** de esa sesión. Buscar en él:
  - `SubagentStart` / `SubagentStop` y sus horas;
  - `approval.requested` con la descripción `[agente · agt_…]`, seguido de `approval.expired` o de una denegación;
  - `steer.applied` comparado con `SubagentStop`;
  - `agent.failed` con «Parent turn ended…».
- **Mejora opcional** (S, puede ir con el #5 si el dueño quiere):
  - mientras `collect_for_final` espera, emitir un evento (por ejemplo `agent.waiting` con los ids);
  - la cabecera del turno muestra «Esperando a 2 subagentes…», con la tarjeta del agente activa resaltada.
  - Resuelve la percepción de bloqueo sea cual sea la causa.
- **Tamaño:** S para la visibilidad. La causa queda sin tamaño hasta ver el diagnóstico.

---

## I1. Mensajes entre paneles de Boards como subagentes

**Qué describe.** Una idea: que los paneles de Boards se hablen entre sí como subagentes, para sacarle más partido a Boards.

**¿Aplica todavía?** **Parcialmente.** La base ya existe:
- **Motor:** herramientas `session.peers` y `session.send` (`tools/native/peers.py`, `engine_protocol/peers.py`; `f8cb8a0`, 2026-09-15).
  - Un panel puede escribir a otro del mismo board.
  - El mensaje llega como contenido de otro agente, no como orden del dueño (`PEER_WRAPPER_HEADER`).
  - El receptor responde en su propio turno, con sus permisos.
  - Límites: 5 envíos por turno, 3 saltos y 20 entregas por cadena (`peers.py:25-27`).
- **App:** `@Panel texto` desde el composer (`src/components/composer/paneMention.ts`, `c2224de`).

**Lo que falta para que funcione «como subagentes»:**
- **Ida y vuelta.** Hoy el envío es de ida: el emisor no recibe la respuesta como resultado ni se despierta cuando el otro termina. Un subagente sí devuelve su resultado al padre.
- **Coordinación visible.** No hay un panel coordinador, ni una vista de quién habla con quién, ni un estado «esperando a Docs».
- **Encargos con resultado.** Algo como «encárgale a Tests que corra la batería y avísame», con la respuesta enlazada al mensaje original.

**Recomendación: para después.** Es una línea de producto, no un arreglo.
- Propuesta: un plan propio de Boards (por ejemplo `docs/plan-boards-orquestacion.md`) con tres piezas:
  1. `session.send` con `expect_reply`: la respuesta del receptor vuelve al emisor como entrega y le abre un turno, reutilizando la cadena y los saltos actuales;
  2. hilos entre paneles visibles en el board (una línea o chip «→ Docs», «esperando respuesta»);
  3. un rol «coordinador» opcional por board.
- **Tamaño:** L. Necesita diseño de interfaz antes de código.

---

## I2. Herramientas y demás en contexto

**Qué describe.** ¿Cada mensaje vuelve a enviar las herramientas y el resto (sistema, constitución, skills)? ¿Se podría enviar solo en el primer mensaje y otra vez tras compactar?

**¿Aplica todavía?** **Parcialmente.**

**Sí, cada llamada lo envía todo.** Es inevitable: las APIs no guardan estado entre llamadas.
- Rinari no usa `previous_response_id`, y Codex va con `store=False`.
- `runtime/agent.py:1001-1044` (`_build_request`) arma en cada vuelta el sistema, el historial, la nota `<turn-context>` y las herramientas.
- Por eso «solo en el primer mensaje» no es posible: un modelo sin las definiciones no puede llamar a las herramientas.
- Coste fijo estimado: unos 14–17 k tokens por llamada.
  - Constitución ~5,2 KB y soul ~12,7 KB.
  - 54 herramientas de núcleo de 113 nativas, unos 6,6 k tokens.

**Lo que ahorra de verdad es la caché de prefijo, y ya existe:**
- **Anthropic:** `cache_control` en la última herramienta, el sistema y el último mensaje (`providers/adapters/anthropic.py:403-432`, `8181631`).
- **OpenAI y Codex:** `prompt_cache_key` por sesión (`adapters/http.py:244-255`, `701e386`).
- **Claude Subscription:** prefijo estable.
- **Lo dinámico va al final:** la memoria y la lista de pasos van en la nota final (`prompts/assembler.py:245-335`) y la fecha cambia solo una vez al día (`701e386`), así que no rompen la caché.
- **Herramientas perezosas:** `capability.search` y activaciones en `tools/exposure.py`.
- **Medición:** la app muestra los tokens cacheados (`TokenUsageIndicator.tsx:24`).

**Lo que todavía rompe la caché** (las herramientas van primero en el prefijo, así que cambiarlas invalida sistema e historial):
- `note_used` mueve la herramienta usada al final de `recent` (`tools/exposure.py:122-127`), y `exposed_names` respeta ese orden (`:156-184`). Usar una herramienta no-núcleo **reordena la lista** a mitad del turno.
- Las activaciones de un turno caducan a las 4 rondas (`_DEFAULT_TTL_ROUNDS = 4`, `:39`; `prune`, `:129-139`). La lista **encoge** a mitad del turno.
- El escritorio crea un runtime por turno (`cli/agent_runtime.py:308-318`). `recent` se pierde y la lista cambia en el turno siguiente.
- Con Claude vía OpenRouter no se envía `cache_control`, así que no cachea.
- No se registra `cache_creation_input_tokens`, así que no se ve cuánto se reescribe.

**Recomendación:**
- **Entra en 0.3.2 solo el orden estable (S).**
  - El núcleo va primero, como hoy. Las demás herramientas expuestas van en orden fijo (alfabético), en lugar del orden de uso.
  - Dentro del turno, una herramienta activada no desaparece hasta que el turno termina (solo puede crecer).
  - Pruebas unitarias: usar una herramienta no-núcleo no cambia el orden de `exposed_names`, y la lista no encoge dentro del turno.
- **Para después (M):**
  - persistir `recent` y las activaciones entre turnos en la sesión;
  - `cache_control` para modelos Claude vía OpenRouter;
  - registrar `cache_creation_input_tokens` y mostrar el porcentaje de caché por llamada;
  - TTL de 1 h en Anthropic para sesiones con pausas;
  - adelgazar el núcleo (pasar a perezosas `http.request`, `wait.for`…; ahorro de ~1–2 k tokens).
- Respuesta para la tarjeta: «no se puede mandar solo una vez, pero con caché el modelo no la reprocesa al mismo precio; lo que hay que cuidar es que el prefijo no cambie».

---

## I3. «¿Un framework de tests ahí sería ceremonia?»

**Qué describe.** Una pregunta sobre si Rinari hizo bien en no montar un framework de tests.

**Origen** (encontrado en `state.db`, solo lectura). Sesión `ses_01M3N9RND4323HD600QD43AJMM` («sitio web demo para reparación celular», 2026-09-29). A las 01:18 UTC Rinari escribió: «No hay framework de tests en un sitio estático: la verificación correcta es build con exit 0, integridad de assets referenciados, ffprobe del video y prueba manual en browser». La tarjeta se creó a las 02:11 UTC.

**¿Aplica todavía?** **Ya resuelto.** La decisión de Rinari fue correcta: en una demo estática, montar Vitest o Playwright sería justo la ceremonia que el Soul pide evitar (`assets/soul.md:59`, «doing the work instead of creating unnecessary ceremony»).
- La constitución ya lo acota:
  - «Add or update tests when behavior changes and tests are appropriate» (`assets/constitution.md:31`);
  - desde `701e386` (2026-10-08, después de la tarjeta), «Say "verified" only about what a check actually exercised… for visual, audio or design results, say what you checked and ask the user to look» (`:74`).
- El único riesgo de aquella respuesta era decir «verificado» por una prueba visual sin mirarla. Eso ya lo cubre `:74`.

**Recomendación: descartar o cerrar.** Si se quiere dejar rastro, un comentario en la tarjeta con la referencia a `constitution.md:31,74`.
