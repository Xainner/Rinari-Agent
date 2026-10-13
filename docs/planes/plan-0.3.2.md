# Plan 0.3.2

Estado: **en revisión, con las decisiones tomadas**. No se implementa nada hasta que el dueño diga «iniciamos».

- Ramas `0.3.2` en Rinari-Agent y Rinari-CLI, creadas desde `main` el 2026-10-10. En `main` están la 0.3.1 (tag `v0.3.1` en 5d4fab5) y el Engine 2a94168.
- Lo urgente no pasa por aquí: va en una rama `hotfix/…` creada desde `main`.
- Origen de los hallazgos: `Documents/Proyectos/rinari-motion/out/v030/hallazgos.md`, grabación del film 0.3.0/0.3.1. Los números de la tabla son los de ese archivo. El 1 y el 2 ya se corrigieron en 0.3.1 y el 9 es del proyecto demo, así que no aparecen aquí.

## Resumen

| # | Hallazgo | Repo | Estado |
|---|---|---|---|
| CI | `boards-side-panel` rojo en `main` tras #109 | Agent | Hecho en `0.3.2` (0c7f34f, local) |
| 3 | OpenRouter 402 con saldo bajo | CLI | Decidido |
| 4 | La nota no sale sola | CLI | Decidido |
| 5 | Subagentes bloqueados en REVIEW | CLI | Decidido |
| 6 | Plural en la lista de pasos | Agent | Decidido |
| 7 | Flows ignora la lista de pasos | CLI + Agent | Decidido |
| 8 | Dictado en un build desde fuente | Agent + CLI (docs) | Decidido |

## Orden de entrega

1. Un PR de CLI `0.3.2 → main` con los cambios del motor: 3, 4, 5, 7, 11, 13, 14, 19, 23, 24, 25, 27, 29, 31, 32, 35, 36, 38, 40, 44, 45 y 46 (migraciones `0050` goals, `0051` resumes y `0052` linaje de sesiones). Se fusiona primero.
2. Un PR de Agent `0.3.2 → main` con el arreglo del CI y los cambios de la app: 6, 7, 8, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 40, 41, 42, 43, 44, 45 y 46, y el Engine fijado al merge del CLI en `engine-manifest.json`. Por su tamaño, puede partirse en dos PR: los arreglos (6–22, 25–30, 37, 38, 41 y 45) y las funciones (23–24, 31–36, 40, 42–44 y 46).
3. Validación local antes de cada push:
   - CLI: pytest completo y ruff.
   - Agent: tsc, typecheck:electron, vitest, protocol/parity:check, los escenarios tocados varias veces (también con la CPU cargada y con `RINARI_UI_REDUCED_MOTION=1`) y `ui:e2e --all`.
4. Release 0.3.2 cuando el dueño lo pida: bump, `docs/releases/v0.3.2.md` y el tag (lo empuja el dueño).

---

## CI. `boards-side-panel` rojo en `main`

**Qué pasó.** El CI que corrió al fusionar #109 falló en un solo escenario: esperaba que el foco entrara al cajón del panel lateral de un panel estrecho y se agotó el tiempo.

**Causa.** Al pulsar el botón del panel lateral pasan dos cosas en el mismo gesto: el panel de Boards gana el foco y el cajón se abre y toma el foco. El autofoco del composer (`Composer.tsx`, efecto con `acceptsGlobalFocus`) podía ejecutarse después y devolver el foco al texto. Es un fallo real de la interfaz, no solo del test.

**Arreglo hecho.** El composer no se lleva el foco si este está dentro de un cajón abierto (`.pane-dock-drawer`).

**Validación.**
- 9 pasadas seguidas en verde con la CPU cargada y movimiento reducido.
- Antes del arreglo hubo 2 fallos en 4 pasadas. No pude capturar su error.
- Las pruebas del composer pasan (65).
- Pendiente: si vuelve a fallar, guardar el informe del fallo antes de reintentar.

---

## 3. OpenRouter 402 con saldo bajo

**Qué se vio.** Con `stepfun/step-5-preview`, OpenRouter respondió 402 con el mensaje «can only afford 14 814». El aviso de error y «Switch model» se ven bien.

**Causa.**
- Para los proveedores compatibles con OpenAI, Rinari no envía `max_tokens` si no hay uno configurado:
  - `models/router.py:433-448` (`generation_request`);
  - `default_max_tokens = None` en `providers/adapters/base.py:49`;
  - `openai_compatible.py:165-166`.
- Sin `max_tokens`, OpenRouter reserva el máximo del modelo (64 000) para comprobar el saldo. El 64 000 no lo envía Rinari.
- `providers/errors.py:239-249` clasifica el 402 como `QUOTA_EXHAUSTED` sin reintento. Nadie lee la cifra del mensaje.

**Propuesta.**
1. En `errors.py`, si el error es un 402 y el mensaje dice «can only afford N», guardar `details["affordable_output_tokens"] = N`. El código de error sigue siendo `QUOTA_EXHAUSTED`.
2. En `router.py`, añadir un reintento único, junto a `without_rejected_reasoning`, que use el mismo patrón:
   - solo si no ha salido nada todavía;
   - solo si N supera un mínimo (~1024) y es menor que el tope actual;
   - con `max_tokens = 0.9 × N`;
   - avisa con `provider.max_tokens.reduced`;
   - cubre `invoke` e `invoke_stream`.
3. Si el reintento también falla, el error de saldo se muestra como hoy.

**A decidir.** ¿También un tope por defecto para OpenRouter (por ejemplo, el máximo del modelo limitado a 16–32 k)?
- A favor: evita el 402 desde la primera llamada.
- En contra: el tope reduce el presupuesto de entrada (`context/settings.py:118-131`), así que la compactación se dispararía antes.
- Mi recomendación: solo el reintento, sin tope por defecto.

**Pruebas.**
- Unitarias: se lee la cifra del 402; el reintento usa el tope reducido una sola vez; no se reintenta si ya hubo salida; no se reintenta si N es demasiado pequeño.

---

## 4. La nota no sale sola

**Qué se vio.** Con `gpt-6.1-sol`, Rinari vio un `TODO` y dijo «I'll leave that unrelated issue untouched», pero no dejó la nota. Al pedírsela, la creó bien.

**Causa.**
- Ningún texto del prompt dice cuándo usar `followup.suggest`. La única guía es la descripción de la herramienta (`tools/native/followup.py:24-29`).
- La constitución, que siempre se inyecta, dice «Preserve unrelated user work.» (`:19`) y «Avoid speculative refactors and unrelated cleanup.» (`:30`). Las dos empujan a dejarlo pasar, y ninguna dice que se anote.
- La línea de `assets/soul.md:197` («mention it briefly») casi nunca se inyecta. El Soul activo es `souls/rinari-default/identity.md`, que no habla de esto.
- Precedente: `constitution.md:57` ya da un disparador explícito para `memory.propose`.

**Propuesta.**
1. Una línea en la constitución, junto a la `:30`: «Si ves algo que vale la pena fuera del pedido (un TODO, un bug cercano, un test que falta, documentación desactualizada) y lo dejas sin tocar, anótalo con `followup.suggest` en vez de solo mencionarlo: un prompt autocontenido, como máximo 1–2 por turno.»
2. Descripción de la herramienta con el disparador en primer lugar: «Llámala cuando decidas dejar sin tocar algo fuera del pedido…».
3. Alinear `soul.md:197`.

**Límites que no cambian.** Máximo 2 notas por turno, 3 pendientes por conversación y 5 por proyecto, con deduplicación. No las crean los subagentes ni los turnos iniciados por otro agente.

**Pruebas.**
- Unitarias: el texto está en el prompt ensamblado.
- Eval o prueba real con un modelo local: un repo con un `TODO` ajeno y una tarea distinta. Rinari debe dejar la nota sin tocar el `TODO`.

---

## 5. Subagentes bloqueados en REVIEW

**Qué se vio.** En REVIEW, el pedido «two subagents in parallel» devolvió `POLICY_DENIED` en los dos lanzamientos, aunque eran revisores de solo lectura. En BUILD funcionan.

**Causa.**
- REVIEW usa el perfil `READ_ONLY` (`application/session_service.py:73-84`).
- `agent.spawn`, `agent.message` y `agent.cancel` declaran `state.write` (`agents/tools.py:212-306`).
- `policy/engine.py:470-477` deniega `state.write` en solo lectura con el motivo «read-only profile does not record validation state». El motivo es engañoso.
- Era intencional: el docstring de `agents/tools.py:14-15` dice que una sesión de solo revisión no lanza subagentes.
- Los hijos ya heredan el perfil del padre y solo pueden estrecharlo (`agents/runtime.py:410-426`). Un padre en solo lectura da un hijo en solo lectura, sin carpetas de escritura.
- Hueco: `orchestrator.py:490-498` puede crear un worktree (eso es escribir) sin mirar el perfil del padre.

**Propuesta (aprobada por el dueño).**
1. Una capacidad propia para las herramientas de agentes, `agent.delegate`, que se permite en todos los perfiles. `state.write` no se toca: también protege los registros de validación.
2. En solo lectura, un lanzamiento nunca crea worktree.
3. Actualizar el docstring.
4. Los turnos iniciados por otro agente ya tienen `agent.spawn` denegado. Añadir también la capacidad nueva a esa lista.

**Pruebas.**
- En REVIEW se lanzan dos revisores en paralelo; los hijos son de solo lectura y un `fs.write` del hijo se deniega.
- En solo lectura no se crea worktree.
- BUILD sigue igual.

---

## 6. Plural en la lista de pasos

**Qué se vio.** La lista muestra «1 steps left». En español pasa igual: «Quedan 1 pasos».

**Causa.** Las claves `checklist.open` y `checklist.interrupted` tienen una sola forma (`en.ts:2203-2204`, `es.ts:2221-2222`), y la capa i18n no maneja plurales.

**Propuesta.** El patrón que ya usa la app, como `processes.needsAttention` / `needsAttentionPlural`:
- claves `checklist.openOne` («1 step left» / «Queda 1 paso») y `checklist.interruptedOne` («Interrupted: 1 step left» / «Interrumpida: queda 1 paso»);
- elegir con `left === 1` en `features/checklist/ChecklistDock.tsx:49-56`;
- primero en `es.ts`, que define el tipo de las claves; luego `parity:check`.

**Pruebas.** Vitest de `ChecklistDock` con 1 y con 2 pasos restantes, y una aserción en `checklist-dock`.

---

## 7. Flows ignora la lista de pasos

**Qué se vio.** Con una lista 3/3 completa, Flows mostraba «Tasks: no tasks recorded» y «Progress not computable».

**Causa.**
- Flows solo lee el grafo de tareas antiguo (`engine_protocol/flow.py:649-659`). En una conversación sin proyecto recibe `tasks=None`.
- El progreso de la etapa de implementación (`:357-382`) solo existe mientras la etapa está viva. Una etapa terminada da `None`, y el total también (`:515-522`).
- Flows no lee `checklist.updated` (`FLOW_EVENT_TYPES :53-70`, `turn_facts_from_events :114-187`).
- La app tampoco se refresca con ese evento (`useFlow.ts`, `FLOW_REFRESH_EVENTS`).
- La lista actual no sirve como historial, porque `begin_turn` la vacía en el turno siguiente. Pero cada cambio queda guardado como evento `checklist.updated` del turno, con sus cuentas.

**Propuesta.**
- **Motor:**
  - incluir `checklist.updated` en los eventos que lee Flows;
  - por turno, quedarse con la última lista que no esté vacía (`total`, `done`);
  - el progreso de la etapa de implementación usa esa lista cuando no hay grafo de tareas, también si la etapa terminó;
  - `summary.tasks` usa la lista más reciente cuando no hay tareas del grafo.
- **App:** `checklist.updated` en `FLOW_REFRESH_EVENTS`.

**A decidir.** ¿«Tasks» debe llamarse así cuando viene de la lista de pasos, o mejor «Steps»? Mi recomendación: mantener «Tasks» y no tocar el esquema. Si se quiere distinguir, haría falta un campo nuevo, `summary.checklist`, en `v1.json` y un texto nuevo.

**Pruebas.**
- Motor, unitarias: una lista 3/3 da 3/3 y progreso 100 %; sin lista sigue igual que hoy; una lista vaciada en el turno siguiente no borra el historial.
- App: una aserción en un escenario de Flows o en vitest.

---

## 8. Dictado en un build desde fuente

**Qué se vio.** En un build desde fuente, el dictado dice «whisper.cpp is missing». Funciona con `RINARI_WHISPER_BIN` apuntando al `whisper-cli.exe` instalado.

**Causa.**
- El binario solo lo empaqueta `scripts/package-speech.py` para el instalador (salida en `engine-dist/speech`).
- `speech/service.py:74-97` lo busca en este orden: `RINARI_WHISPER_BIN` (ruta absoluta), luego la carpeta `speech` junto a Python, luego el PATH.
- El aviso de la app dice «Reinstala o actualiza Rinari» (`dictation.noBinary`), que no le sirve a un desarrollador.

**Propuesta.**
1. **README del Agent, «Build from source»:** cómo activar el dictado.
   - `$env:RINARI_WHISPER_BIN = "…\whisper-cli.exe"`;
   - o `whisper-cli` en el PATH;
   - o `python scripts/package-speech.py` y apuntar a `engine-dist\speech\whisper-cli.exe`.
2. **`docs/commands.md` del CLI («Local dictation»):** documentar el respaldo por el PATH y el caso de un build desde fuente.
3. **Opcional (UX):** en un build sin empaquetar, el aviso dice cómo configurarlo en vez de «Reinstala».

**Nota del hallazgo.** Con el modelo `base`, «subagents» se transcribió mal, y con el vocabulario configurado salió perfecto. No es un bug. Se podría sugerir el modelo `small` o el vocabulario en Ajustes → Dictado; lo dejo como idea.

---

## Nuevos hallazgos

Del dueño, 2026-10-10. Numerados a continuación de los del video.

| # | Hallazgo | Repo | Estado |
|---|---|---|---|
| 10 | La línea del timeline no está centrada ni va de la primera bolita a la última | Agent | Decidido |
| 11 | Captura de página seguida de cargar la misma imagen | CLI | Decidido |
| 12 | El selector de proveedor en Proveedores tiene el estilo viejo | Agent | Decidido |
| 13 | OpenCode Go: mostrar los modelos gratis, marcados «(gratis)» / «(free)» | CLI + Agent | Decidido (comprobado en vivo) |
| 14 | Un 400 aislado deja un modelo con visión marcado «sin visión» para siempre | CLI + Agent | Decidido (causa verificada) |
| 15 | «Cargó una imagen» se dibuja con el estilo viejo en el timeline | Agent | Decidido (causa verificada) |
| 16 | Al abrir una tarjeta de herramienta, su contenido queda fuera de la vista | Agent | Decidido (causa verificada) |
| 17 | La memoria guardada en automático sale como una línea simple, no como tarjeta | Agent | Decidido |
| 18 | No deja poner más de una imagen en el composer | Agent | Decidido (causa verificada) |
| 19 | No deja eliminar el proveedor activo si es el único | CLI + Agent | Decidido (causa verificada) |
| 20 | Rebote del scroll al bajar con la rueda mientras Rinari trabaja | Agent | Decidido (causa probable, falta reproducir) |
| 21 | La línea de pasos del subagente en el panel lateral tampoco está centrada ni va de bolita a bolita | Agent | Decidido (causa verificada, va con #10) |
| 22 | La flecha de la lista de pasos apunta al revés para un panel que crece hacia arriba | Agent | Decidido (causa verificada) |
| 23 | `/goal`: un objetivo que Rinari persigue, turno tras turno, hasta lograrlo | CLI + Agent | Decidido |
| 24 | Continuar automáticamente al recuperar límites o créditos | CLI + Agent | Decidido (con condiciones) |
| 25 | Las instrucciones del agente principal no se ven en el panel del subagente | CLI + Agent | Decidido (causa verificada) |
| 26 | Cerrar la lista de pasos no es tan suave como abrirla (Planka) | Agent | Decidido (causa verificada, va con #22) |
| 27 | El anillo de límites no se actualiza cuando la ventana ya se reinició (Planka) | CLI + Agent | Decidido (causa verificada) |
| 28 | Compactar el contexto con la tarjeta del estilo nuevo: barra que se encoge y check (Planka) | Agent | Decidido |
| 29 | El aviso de cambio de modelo, antes del primer mensaje y con estilo nuevo | CLI + Agent | Decidido (causa verificada) |
| 30 | No mostrar en el timeline las llamadas a la lista de pasos (Planka) | Agent | Decidido |
| 31 | «Enviar ahora»: interrumpir el paso en curso (no el turno) para leer el mensaje (Planka, Ideas-2) | CLI + Agent | Decidido |
| 32 | Mover un comando de primer plano a segundo plano (y al vencer el tope, en vez de matarlo) | CLI + Agent | Decidido |
| 33 | Avisar cuando termina un turno (y un plan) en cualquier conversación, no solo en el board (Planka, Ideas-2) | Agent | Decidido (causa verificada) |
| 34 | Indicador de pendientes en los otros perfiles (Planka, Ideas-2) | Agent | Decidido (depende del #33) |
| 35 | Entregar archivos: herramienta `file.present` y rutas que se vuelven enlace (Planka, Bug) | CLI + Agent | Decidido (causa verificada) |
| 36 | «Oídos»: `audio.transcribe` con el whisper del dictado (Planka, Bug) | CLI + Agent | Decidido |
| 37 | Preguntas: un solo botón «Continuar» / «Enviar respuestas» (Planka, Bug) | Agent | Decidido (causa verificada) |
| 38 | Confianza después de `git init`: automática y en el momento (Planka, Bug) | CLI + Agent | Decidido (causa verificada) |
| 40 | Sesiones hijas, fase A1: el vínculo madre → hija y la barra lateral anidada | CLI + Agent | Decidido |
| 41 | La tarjeta de cambios del turno tiene el estilo viejo, y «Revisar» muestra el diff sin colores | Agent | Decidido (causa verificada) |
| 42 | Elegir el proyecto de una conversación desde el composer, como en Claude Code o Codex | Agent | Decidido (solo conversaciones nuevas) |
| 43 | Flujos pasa a vivir en el panel lateral, en Normal y en Boards | Agent | Decidido |
| 44 | El panel lateral se puede extender mucho más, y el navegador del agente prueba en tamaños anchos (Planka, Idea) | CLI + Agent | Decidido (causa verificada) |
| 45 | Cloudflare Turnstile rechaza el navegador de Rinari: decirlo claro y pasar al navegador del dueño (Planka, Bug) | CLI + Agent | Propuesto |
| 46 | Navegador como uno de verdad: página de inicio, fluido mientras el agente trabaja, cursor del agente visible y control sin botones (Planka, Ideas-2) | CLI + Agent | Propuesto (falta 1 decisión) |

Los hallazgos 18–20 vienen de las tarjetas del tablero Agent en Planka (lista Bug), revisadas el 2026-10-11. El análisis completo está en [planka-triage-0.3.2.md](planka-triage-0.3.2.md) (B2, B3 y B1). El resto de tarjetas queda fuera hasta que el dueño diga.

---

## 10. Línea del timeline descentrada y que no empieza ni termina en las bolitas

**Qué se vio.** En el timeline de actividad del chat:
- la línea y su brillo animado no están centrados con las bolitas;
- la línea no sale de la primera bolita;
- tampoco termina en la última: en la segunda captura se corta antes, junto a la tarjeta con el check.

**Causa** (`src/styles/index.css:1388-1396`, `TurnTimelineView.tsx:678-684`, keyframes `rinari-travel` en `:411`).
- **Horizontal.** El centro de la línea está en x = 14 px y el de todas las bolitas en x = 15 px, así que la línea queda 1 px a la izquierda. El brillo también está en 14.
- **Vertical.** La línea va de `top: 4px` a `bottom: 4px` de la caja del rail, no de las bolitas:
  - la primera bolita tiene el centro a 14 px (fila de texto) o a 20 px (fila de herramienta), así que la línea empieza 10–16 px por encima;
  - por abajo llega al final de la última fila. Si esa fila es un bloque de texto largo o una herramienta abierta, sobra línea por debajo de la última bolita.
- **El degradado** termina en `transparent`. En un rail largo la línea se vuelve invisible antes de la última bolita (la segunda captura).
- **El brillo** recorre la caja entera (de `top: 0` a `100% - 40px`) y anima `top`, lo que obliga a recalcular el layout en cada cuadro.
- Cada tipo de fila pone su bolita a una altura distinta: texto 14 px, herramienta 20 px, grupo 19–20 px. Por eso ningún margen fijo encaja con todas.

**Propuesta.**
1. **Un solo eje.** Una variable `--rail-x`; la línea, el brillo y las bolitas se centran en ella con `translate(-50%, -50%)`. Todos los tamaños son pares, así que los centros coinciden sin medios píxeles. El estilo inline de la bolita de texto pasa al CSS.
2. **Pista medida.** En `ActivityDetails`, `useLayoutEffect` y un `ResizeObserver` miden el centro de la primera bolita y el de la última. Las filas crecen mientras Rinari escribe y al abrir o cerrar.
   - Con eso se fijan `--rail-start` y `--rail-len`, y una sola pista (`.turn-rail-track`) va exactamente de bolita a bolita.
   - Si hay una sola bolita, no hay pista.
3. **Brillo dentro de la pista.** Pasa a ser el `::after` de la pista, con `overflow: hidden`, y se anima con `transform: translateY(...)` en lugar de `top`.
   - Con movimiento reducido no hay brillo.
4. **Color.** Sólido, o un degradado que no llegue a transparente, para que la línea se vea hasta la última bolita.

**Pruebas.**
- No hay ninguna hoy.
- Aserciones de geometría en `activity-disclosure` / `activity-text-shimmer`, con tolerancia de 0.5 px:
  - el centro x de cada bolita coincide con el de la pista;
  - el inicio y el fin de la pista coinciden con el centro de la primera y la última bolita.
- Muestreo con `requestAnimationFrame` de que el brillo no sale de la pista.
- jsdom no hace layout, así que esto va en `tests/ui`.

---

## 11. Captura de página seguida de cargar la misma imagen

**Qué se vio.** En la sesión `ses_01M4EYG3QTY76Z8R78JSN2MD35` (versión anterior, `qwen3.8-27b`), el timeline muestra «Miró una página» (captura) y enseguida «Cargó una imagen» con la misma captura. Pasa en cada captura de la sesión (pasos 62–65 y 70–73, entre otros).

**Causa** (verificada en la base de datos del dueño, solo lectura).
- `browser.screenshot` (`tools/native/browse.py:412-460`) guarda el PNG como artefacto y devuelve solo la referencia: **no adjunta la imagen al modelo**.
- Para verla, el modelo tiene que llamar a `fs.read_image` con la misma ruta, y esa sí la adjunta (`images=(ref,)` en `tools/native/image.py`).
- Resultado: dos llamadas, dos filas en el timeline, una ronda más de modelo y la captura repetida en el historial.
- La descripción de la herramienta solo dice cómo mostrarla en el chat (`markdown`), no que el modelo no la ve.

**Propuesta.**
1. `browser.screenshot` adjunta la imagen en su propio resultado (`images=(ImageReference,)`, como hace `fs.read_image`), así el modelo la ve en el mismo paso.
2. La descripción dice que la captura ya llega como imagen y que no hay que volver a leerla con `fs.read_image`.
3. Comprobar qué pasa con un modelo sin visión.
   - Hoy, una imagen en un mensaje de usuario con un modelo sin visión da error (`visual_status`), pero en un resultado de herramienta lo resuelve `prepare_visual_payload`.
   - Hay que confirmar que una captura con un modelo sin visión no rompe el turno: que la imagen se retire o pase por el modelo de visión configurado.
4. La política de retirar imágenes viejas del contexto (`retire_images`) también se aplica a las capturas, para que una sesión con muchas no infle el contexto.

**Pruebas.**
- Unitarias:
  - el resultado de `browser.screenshot` trae `images`;
  - con un modelo de visión, la petición siguiente incluye la imagen;
  - con un modelo sin visión, el turno sigue.
- Prueba real con un modelo local de visión: una captura, sin `fs.read_image` después.

---

## 12. Selector de proveedor con el estilo viejo

**Qué se vio.** En Ajustes → Proveedores, el desplegable para elegir el proveedor no tiene el estilo nuevo.

**Causa.**
- Es un `<select>` nativo (`ProviderForm.tsx:64-87`): la lista abierta es el menú del sistema operativo, sin logos ni estilo.
- El logo va aparte, en un recuadro de 44 px (`:61-63`).
- Aparece en el diálogo «Añadir» (`ProvidersView.tsx:366`) y en el paso de campos del asistente (`ProviderWizard.tsx:389`).
- En el diálogo de borrar hay otro `<select>` nativo con clases viejas (`ProvidersView.tsx:405-416`).
- No existe un `Select` canónico. Lo más cercano en el estilo nuevo es el `ModelPicker` (Popover con logos y un check en el elegido).

**Propuesta.**
1. **Componente nuevo `src/components/ui/select.tsx`**, sobre el `dropdown-menu` de Radix que ya tenemos, sin dependencia nueva.
   - **Disparador:** `button.field-input` con el logo, el nombre y un chevron. Conserva el `id` para que el `<label>` siga funcionando.
   - **Lista:** `.r-pop` del ancho del disparador, con los logos (`ProviderLogo`), un check en el elegido y una insignia «Experimental» a la derecha.
2. Sale el recuadro de 44 px, porque el logo pasa al disparador.
3. El mismo componente en el `<select>` del diálogo de borrar.
4. Va en `docs/design/obsidiana-neon.md` como el selector canónico.

**Pruebas.**
- Actualizar `ProvidersView.create.test.tsx`, que hoy lee el control como `HTMLSelectElement`.
- Actualizar `tests/ui/provider-logos` (cerrar el menú antes de contar logos).
- Una captura en `ui-tour` con la lista abierta.

---

## 13. OpenCode Go: modelos gratis marcados «(gratis)» / «(free)»

**Qué se pidió.** Que OpenCode Go muestre también sus modelos gratis, y que en el selector de modelos aparezcan como «OpenCode Go (gratis)» en español y «OpenCode Go (free)» en inglés.

**Situación actual.**
- **Proveedores en el Engine** (`providers/catalog.py:86-98`):
  - Go es `https://opencode.ai/zen/go/v1` con `OPENCODE_GO_API_KEY`;
  - Zen es `https://opencode.ai/zen/v1` con `OPENCODE_API_KEY`.
- **La lista de modelos** viene en vivo de `GET {endpoint}/models` con la clave de Go (`adapters/openai_compatible.py:88-111`). Nadie la filtra, así que **los gratis de Go que devuelva su `/models` ya deberían salir hoy**, solo que sin marca.
- **El precio se descarta.** Los metadatos de models.dev tienen el costo (`cost.input = 0` en los gratis), pero `PUBLIC_FIELDS` lo quita (`providers/metadata.py:41`). Hay un test que lo exige (`test_model_catalog_refresh.py:55`).
- **Lo que dice la documentación de OpenCode** (consultada hoy):
  - Go tiene 2 gratis por tiempo limitado: LongCat 2.5 Preview Free y Step 5 Preview Free. Siguen disponibles aunque se agote el límite de uso.
  - Zen tiene unos 12 gratis (`big-pickle`, `*-free`):
    - uno va por `/responses`;
    - otro (`jev`) va por `/systemone`, que no soportamos;
    - Zen pide su propia clave, y **no dice si la clave de Go sirve en `zen/v1`**.
- **El endpoint es del proveedor, no del modelo** (`router.py:471,586,645`). Los gratis de Zen no se pueden servir desde el proveedor de Go sin otro registro.
- **El selector** (`ModelPicker.tsx:93,149-155`) agrupa por el alias del proveedor y muestra el alias tal cual en el encabezado. Si no lo resuelve, cae en un «Otros» escrito en el código.

**Propuesta.**
1. **Marcar los gratis (Engine).**
   - Conservar `cost` y `name` de models.dev y regenerar el catálogo incluido.
   - Un modelo es `pricing: "free"` si su costo de entrada y de salida es 0.
   - Para OpenCode, si falta el costo, un id que termine en `-free` o sea `big-pickle` cuenta como gratis.
2. **Los gratis de Zen bajo la cuenta de Go.** Solo si la comprobación en vivo confirma que la clave de Go funciona en `zen/v1`:
   - un proveedor vinculado, con la misma credencial que Go, que solo lista los gratis y excluye los que no soportamos (`/systemone`).
   - Si la clave de Go no sirve, se ofrece «OpenCode Zen (solo gratis)» con su propia clave.
3. **Selector (app).**
   - Los gratis forman su propio grupo, con el encabezado «OpenCode Go (gratis)» o «(free)» según el idioma, y conservan el logo de OpenCode.
   - Los encabezados muestran el nombre del proveedor, no el alias crudo.
   - Claves nuevas: `composer.providerFree` («{name} (gratis)» / «{name} (free)») y `composer.otherProvider`, que reemplaza el «Otros» escrito en el código.

**Comprobación en vivo (2026-10-11, con el proveedor `test-go` del dueño y su permiso; la clave nunca se imprimió).**
- **Go, `GET zen/go/v1/models`:** devuelve 200 con 38 modelos, entre ellos los 2 gratis, `longcat-2.5-preview-free` y `step-5-preview-free`. **Rinari ya los lista hoy, solo que sin marca.**
- **Go, chat con los 2 gratis:**
  - sin la cabecera `x-opencode-session` responde 400 `MissingSessionID`;
  - con ella responde 200. Rinari ya envía esa cabecera (`adapters/http.py:28,56`), así que **funcionan tal cual**.
- **Zen, `GET zen/v1/models` con la clave de Go:** devuelve 200 con 42 modelos (10 gratis). Pero el chat con `big-pickle` responde **403 `FreeTierError`**: «OpenCode's free tier can only be used from within OpenCode».
- **Conclusión.**
  - Los gratis de Zen no se pueden usar desde Rinari, y no vamos a hacernos pasar por OpenCode. **Se descarta el punto 2** de la propuesta (el proveedor vinculado a Zen).
  - Queda solo marcar y agrupar los gratis de Go: el punto 1 y el punto 3.

**Pruebas.**
- Motor, unitarias: la marca de gratis desde el costo y desde el id; el filtro de solo gratis.
- App: vitest del agrupado y del encabezado en los dos idiomas.
- Prueba real con la cuenta de Go.

---

## 14. Un modelo con visión queda marcado «sin visión» por un 400 aislado

**Qué se vio.** En `ses_01M4MEE991TJBSV0QBZJ030YSY`, con xAInner y `qwen3.8-27b-fp8`, la app dice «Este modelo no puede ver imágenes; siguió sin ellas». Rinari releyó las imágenes («la primera pasada solo me devolvió metadatos») y al final dijo que no podía verlas. Pero el modelo sí tiene visión: el 2026-10-09 describió capturas sin problema.

**Causa (verificada en los datos del dueño, solo lectura).**
- `~/.rinari/vision.json` tiene `"model_overrides": {"mdl_01M21YRJE93N78H6ZR9EWZZPFW": false}`, escrito el **2026-10-11 01:17:41 UTC**.
- Lo escribió Rinari solo, en `ses_01M4M7F5N4Q5R12NTVE25HT70X` (el tic-tac-toe). Rinari leyó 3 imágenes con `fs.read_image` y xAInner respondió **HTTP 400 sin detalle** («Request failed»). El evento es `vision.failed`, con `reason: vision_unsupported`.
- `application/vision.py` (`_rejects_pixels`): si no se sabe si el modelo ve, un 400 sin detalle con imágenes en la petición **cuenta como «no ve»**, y `remember_no_vision` lo guarda **para siempre** como si el dueño lo hubiera declarado.
  - El descubrimiento de xAInner (llama.cpp) no informa de la visión (`capabilities_json` es `null`), así que el modelo siempre está en «no se sabe».
  - Un solo 400 transitorio basta para cegarlo.
- **Prueba en vivo (2026-10-11, servidor del dueño):** con las mismas 3 imágenes (1672×941, 1672×941 y 1254×1254), `qwen3.8-27b-fp8` responde 200 y las describe bien, con 1 imagen y con las 3. El 400 de aquella vez no fue por falta de visión.
- **Daño secundario 1.** La nota que queda en lugar de la imagen dice «Original images available via fs.read_image: …» (`models/visual_context.py:8-23`). Eso invita a releerla, que es lo que hizo en esta sesión, y no le dice al modelo que **no la vio**.
- **Daño secundario 2.** En la sesión del tic-tac-toe, después de que se retiraran las imágenes, Rinari opinó sobre ellas como si las hubiera visto: «El fondo a q75 salió con banding y bloques», «el emblema swap quedó perfecto». Es una afirmación visual sin píxeles.

**Propuesta.**
1. **No guardar «sin visión» por un 400 sin detalle.** Para ese turno, el reintento sin imágenes se queda como está. Solo se recuerda para siempre si el proveedor rechaza las imágenes de forma explícita (`VISION_UNSUPPORTED`, un mensaje de modalidad o imagen).
2. **Aprender también lo positivo.** Cuando un modelo en «no se sabe» responde 200 con píxeles entregados, Rinari lo recuerda como «con visión». A partir de ahí, un 400 vuelve a ser un error real y no apaga la visión (la regla actual para modelos declarados con visión).
3. **Que el modelo sepa que no vio la imagen.** Si se retiran por falta de visión, la nota dice «No se te mostró esta imagen: el modelo actual está configurado sin visión. No describas su contenido ni la vuelvas a leer». Así no hay relecturas ni descripciones inventadas.
4. **Mensaje en la app.** Si la marca la puso Rinari tras un error, el aviso lo dice («Rinari marcó este modelo como sin visión tras un error del proveedor») con un botón **«Volver a activar la visión»**. El aviso actual manda a «usar un modelo con visión», y eso confunde.
5. **Migración ligera.** No hay forma de distinguir una marca automática vieja de una del dueño. Desde ahora, las automáticas se guardan con su origen (`auto` + fecha + error) en vez de solo `false`. Las existentes se dejan, y el aviso con el botón resuelve el caso.
6. **«Actualizar modelos» trae la visión** (lo pidió el dueño, tanto en Ajustes → Modelos como en el composer, que usan la misma ruta del Engine).
   - **Hoy no la trae.** El `/v1/models` de xAInner **sí la anuncia**, comprobado en vivo el 2026-10-11:
     ```
     "supports_vision": true,
     "input_modalities": ["text", "image"],
     "max_images_per_request": 20,
     "vision_limits": {"max_images": 20}
     ```
     (`qwen3.8-27b-fp8-ultra` anuncia 1 imagen.)
   - Pero `context/windows.py:35-61` (`normalize`) solo guarda los campos de contexto (`max_context_tokens`, etc.) y descarta el resto. Por eso el modelo quedó en «no se sabe», y un 400 bastó para marcarlo.
   - **Además, aunque la trajera, la marca ganaría.** La marca de `vision.json` va por encima de lo que se descubre (`overrides.get(id, caps.vision)`), así que el «sin visión» queda fijo aunque se actualicen los modelos.
   - **Propuesta:**
     - `normalize` lee también la visión de los formatos comunes:
       - `supports_vision`;
       - `input_modalities` o `modalities.input` / `architecture.input_modalities` (OpenRouter) que incluyan `image`;
       - en llama.cpp, `capabilities` con `multimodal`.
     - Guarda también el límite de imágenes (`max_images_per_request` / `vision_limits.max_images`).
     - Rinari respeta ese límite al enviar: si hay más imágenes, retira las más viejas del contexto (y lo avisa) en lugar de mandar todas.
     - Orden de prioridad:
       1. lo que declare el dueño;
       2. lo que diga el proveedor al actualizar;
       3. lo aprendido por Rinari.
     - Si al actualizar el proveedor dice que el modelo ve, se borra la marca automática de «sin visión».
   - En la app, la lista de modelos muestra el ojo de visión con lo descubierto (ya existe el indicador; hay que comprobar de dónde lo lee).

**Pruebas.**
- Unitarias:
  - un 400 sin detalle no escribe `model_overrides`;
  - un rechazo explícito sí;
  - un 200 con píxeles marca el modelo «con visión»;
  - la nota de imagen retirada dice que no se mostró.
- Escenario o vitest: el aviso con el botón para reactivar.
- Real: xAInner con `qwen3.8` y varias imágenes.
- Unitarias de `normalize`:
  - con las formas de xAInner, OpenRouter y llama.cpp;
  - actualizar un modelo que anuncia visión borra la marca automática, pero no la del dueño;
  - con más imágenes que el límite, se retiran las viejas.

**Inmediato para el dueño (hecho el 2026-10-11).** El dueño corrió `rinari vision capability qwen3.8-27b-fp8 supported`.

---

## 15. «Cargó una imagen» con el estilo viejo

**Qué se vio.** En `ses_01M4MFXWP9VX962RHHTR36MBPD`, cerca del final, aparece «Cargó una imagen · 0.3 s» como una línea suelta: icono pequeño, texto gris y sin tarjeta. Justo encima, «Ejecutó un comando» sale con la tarjeta del rediseño (recuadro, icono en baldosa y chevron). Es el `fs.read_image` de la imagen corregida (mensaje 44).

**Causa** (`src/features/activity/TurnTimelineView.tsx:143-147`).
- Una herramienta terminada con `presentation.kind === 'image'` sale por una rama propia, anterior al rediseño:
  - un `InspectionDetails` con `py-1 text-[13px]`, un `ImageIcon` de 13 px y el texto;
  - sin `act-row`, sin `ToolTile` y sin `act-meta` / chevron.
- Todas las demás herramientas usan la tarjeta `act-row` (`:160-180`). Por eso solo las imágenes desentonan: `fs.read_image`, las capturas que traen imagen, etc.
- **Mismo problema, misma zona:**
  - **La miniatura** (`ImageActivity.tsx`, el botón) usa clases viejas (`rounded-xl border bg-[var(--bg-subtle)]`, icono de 24 px con `m-5` cuando no hay miniatura).
  - **El análisis visual** (`item.type === 'vision'`, `:131-138`) es un `InspectionDetails` con `rounded-xl border p-3`, con textos en español e inglés escritos en el componente en lugar de i18n.
  - **El aviso «sin imágenes»** (`:127-129`) es una línea suelta en ámbar. Puede quedarse como aviso, pero con el estilo de aviso del rediseño.

**Propuesta.**
1. La imagen terminada usa la misma tarjeta `act-row`:
   - `ToolTile` con el icono de imagen y su tono;
   - el texto, la duración y el chevron en `act-meta`.
   - Al abrirla, el cuerpo muestra la miniatura.
   - Cuando no está abierta, a la derecha de la etiqueta va una **miniatura pequeña** (unos 28 px, como la baldosa), para reconocer la imagen sin abrir. Al pulsarla se abre el visor, como hoy.
2. `ImageActivity` con tokens del rediseño:
   - mientras carga, una miniatura con brillo (`skeleton`) en lugar del icono suelto;
   - el error en el estilo de aviso.
3. El análisis visual pasa a `act-row` con sus textos en `es.ts` / `en.ts`, y el aviso «sin imágenes» al estilo de aviso.
4. Revisar que dentro de un grupo («Comandos · Imágenes · 2») la imagen se vea igual que suelta.

**Pruebas.**
- Vitest de `ImageActivity` / `TurnTimelineView`: la imagen terminada tiene `act-row` y `ToolTile`.
- `ui-tour`: una captura con una imagen suelta y otra dentro de un grupo.
- Escenario `chat-image-overlay`: el visor sigue abriendo.

---

## 16. Al abrir una tarjeta, su contenido queda fuera de la vista

**Qué se vio.** Al abrir una tarjeta de herramienta (por ejemplo, «Leyó tal archivo») cerca del final del chat, el contenido se despliega hacia abajo, fuera de la vista, y el chat no baja para mostrarlo. Hay que hacer scroll a mano.

**Causa** (`src/components/ChatView.tsx:226-248`, `activityLayout.begin`; la llama `InspectionDetails` en `ActivityDisclosure.tsx:92-98`).
- Al pulsar una tarjeta, el chat deja quieta su cabecera a propósito: guarda su posición, deja de seguir el final y, tras abrirse, la devuelve al mismo sitio (`restore`).
- Eso evita saltos al abrir o cerrar algo en medio del historial. Pero si la tarjeta está abajo, el cuerpo nuevo crece por debajo del borde y nada lo trae a la vista.

**Propuesta.**
- Tras abrir de forma manual, si el cuerpo de la tarjeta se sale por abajo, el chat baja lo justo para mostrarlo entero. Nunca sube la cabecera más allá de un margen superior (~16 px): si el contenido es más alto que la vista, la cabecera queda arriba y el resto se lee bajando.
- El desplazamiento es suave (≈ 200 ms) y, con movimiento reducido, inmediato.
- Al cerrar no cambia nada (se mantiene el ancla).
- Las aperturas que no son manuales (las que hace Rinari mientras trabaja) siguen como hoy.
- Si la tarjeta es la última y el chat estaba siguiendo el final, sigue siguiéndolo.

**Pruebas.**
- Escenario `activity-disclosure`: abrir la última tarjeta con el chat al fondo; el final del cuerpo queda dentro de la vista y la cabecera sigue visible.
- Con una tarjeta más alta que la vista, la cabecera queda arriba.
- Una tarjeta abierta en medio del historial sigue sin saltar.
- Muestreo con `requestAnimationFrame` de que no hay rebote.

---

## 17. Memoria guardada en automático: mini-tarjeta en vez de línea

**Qué se pidió.** En modo «Preguntar», la propuesta de memoria sale como una tarjeta (`MemoryCandidateCard`), y al dueño le gustó. En modo «Automático», lo que Rinari guarda sale como una línea gris de 12 px: «🧠 Recordado: … · Deshacer · Ver en Ajustes» (`RememberedNotice`, `src/features/memory/MemoryActivityCard.tsx:42-79`). Tiene el estilo de antes del rediseño y se pierde entre la actividad.

**Propuesta.**
- `RememberedNotice` pasa a ser una **mini-tarjeta de la misma familia** que la de propuesta, más compacta:
  - el cerebro y el título «Recordé esto», con el tema y el tipo como chip;
  - el texto (hasta 2 líneas, y el resto con «ver más»);
  - un **estado verde de «Guardado»** con check en lugar de los botones Aprobar/Rechazar;
  - las acciones **«Deshacer»** y **«Ver en Ajustes»** como botones pequeños (`.btn` ghost), no como enlaces subrayados.
- Al deshacer, la tarjeta pasa a «Olvidado» en gris (tachado suave), con una transición de estado y sin desaparecer, para que se entienda qué pasó.
- **Movimiento.** Entra con el mismo `rinari-rise` que la propuesta y el check se dibuja con `r-check`. Con movimiento reducido no hay animación. Al reabrir la conversación no se repite.
- Los textos van en `es.ts` / `en.ts` (`memory.remembered.title`, `memory.remembered.saved`, etc.). Lo de hoy (`memory.remembered`, `memory.undone`) se reutiliza donde sirva.
- Las tres excepciones que siguen pidiendo aprobación en automático no cambian, y siguen usando la tarjeta de propuesta: turno no iniciado por el dueño, contenido externo leído y dato sensible.

**Pruebas.**
- Vitest de `MemoryActivityCard`: el estado guardado, deshacer pasa a «Olvidado» y los textos en los dos idiomas.
- Escenario `memory-proposal` (o uno nuevo, `memory-auto`): en automático aparece la mini-tarjeta, «Deshacer» la marca olvidada y reabrir no anima.
- `ui-tour`: una captura de la mini-tarjeta.

---

## 18. Solo entra una imagen en el composer

**Qué se vio.** Al añadir una segunda imagen en el composer, no entra y no sale ningún aviso (tarjeta de Planka).

**Causa** (`src/components/composer/Composer.tsx`).
- El límite real es de 8 adjuntos, en la app (`MAX_ATTACHMENTS`, `src/stores/composer.ts:51`) y en el Engine (`artifacts/attachments.py:32`). El límite no es el problema.
- `addAttachment` descarta en silencio un adjunto con el mismo `path` y `name` que otro (`:577`).
- Los archivos que llegan del navegador (pegar, o arrastrar al chat) usan `path: file.name` y `name: file.name` (`:643-645`).
- Chromium nombra siempre `image.png` a una imagen pegada desde el portapapeles. La segunda captura pegada se descarta. Pasa igual con dos archivos que se llaman igual y vienen de carpetas distintas.
- El `id` es `att_${Date.now()}_${name}` (`:643`, `:668`). Dos imágenes pegadas en el mismo milisegundo comparten `id`, y `updateAttachmentById` o `removeAttachmentsById` actuarían sobre las dos.
- «Adjuntar archivos» (`chooseFiles`, `:664-676`) usa la ruta real, así que por ahí sí entran varias.

**Propuesta.**
1. Para los archivos del navegador (con `data_url`), deduplicar por contenido (tamaño + hash del `data_url`), no por nombre. Para las rutas reales, seguir deduplicando por ruta.
2. El `id` sale de `crypto.randomUUID()`.
3. Si se descarta un duplicado de verdad, `attachmentNotice` lo dice en lugar de callar. El texto nuevo va en `es.ts` y `en.ts`.

**Pruebas.**
- Vitest del composer:
  - pegar dos `File` llamados `image.png` con contenido distinto da 2 adjuntos con `id` distintos;
  - pegar dos veces el mismo da 1 adjunto y el aviso.
- Una aserción en `composer-file-drag` con dos imágenes.

---

## 19. No deja eliminar el proveedor activo si es el único

**Qué se vio.** Con un solo proveedor, «Eliminar» pide confirmación, sale un toast de error y el proveedor sigue ahí (tarjeta de Planka).

**Causa.**
- **Engine** (`application/provider_service.py:453-463`): si el proveedor es el activo y no llega `switch_to`, lanza `InvalidUsageError` («… is active. Select another provider first.»).
  - La rama que deja Rinari sin proveedor activo (`:482-484`, borra `KEY_ACTIVE_PROVIDER` y `KEY_ACTIVE_MODEL`) nunca se ejecuta: el `raise` de antes la tapa.
  - El test `test_remove_active_provider_requires_switch` (`tests/unit/test_provider_service.py:154-157`) fija el comportamiento con un solo proveedor.
- **App** (`ProvidersView.tsx:209-222`, `:398-418`): con un solo proveedor no hay selector «Mover sesiones activas a» y se llama sin `switch_to`.
- **Quedarse sin proveedores ya funciona:** con 0 proveedores se abre el asistente (`src/App.tsx:364-374`), y Modelos ofrece «Añadir proveedor» (`ModelsView.tsx:19-29`).

**Propuesta.**
1. **Engine.** Si el proveedor es el activo, no llega `switch_to` y no queda ningún otro, se borra y se limpia el activo con la rama que ya existe. Si quedan otros, se sigue pidiendo `switch_to`, para no dejar sesiones sin modelo por accidente.
2. **App.** Con un solo proveedor, el diálogo dice que Rinari quedará sin proveedor y que se abrirá el asistente para añadir otro. El texto nuevo va primero en `es.ts`, luego en `en.ts`, y se pasa `parity:check`.
3. **Sesión abierta.** Una sesión abierta con un modelo de ese proveedor muestra el aviso de «sin modelo» y no se rompe.
4. Va en el mismo cambio que el #12: el `<select>` del diálogo de borrar pasa al selector nuevo.

**Pruebas.**
- Engine, unitarias:
  - con un solo proveedor activo, `remove` sin `switch_to` lo borra y deja vacíos el proveedor y el modelo activos (se invierte `test_remove_active_provider_requires_switch`);
  - con dos, sigue el error;
  - lo mismo por protocolo, en `test_engine_providers.py`.
- App: vitest del diálogo con uno y con dos proveedores.

---

## 20. Rebote del scroll al bajar con la rueda mientras Rinari trabaja

**Qué se vio.** Lo vio otro usuario en una versión anterior: bajaba con la rueda por un chat mientras Rinari ejecutaba comandos plegados, y el chat «rebotaba» (tarjeta de Planka). El dueño no lo ha visto.

**Lo que ya se arregló sobre scroll** (no cubre este caso): `4b437fa` (#87), `b9ffb00`, `974a967`, `5271433` y `f3ff3cc`. Ninguna prueba mueve la rueda mientras crece un turno en curso.

**Causa probable** (sin reproducir; `src/components/ChatView.tsx:226-247`, la misma función que el #16).
1. **El ancla es el turno entero y su posición se recorta a la vista.**
   - `ActivityTransition` (`ActivityTransition.tsx:9-16`) llama a `layout.begin(root, false)` cada vez que cambia su identidad, `` `${active}:${final}:${segments.length}` `` (`TurnTimelineView.tsx:626`). Eso pasa en cada segmento nuevo mientras Rinari trabaja.
   - Si la persona no sigue el final (está a más de 80 px del fondo), se guarda `offset = max(viewport.top, min(top, viewport.bottom - 40))` (`:237`). Al terminar, `scrollTop += anchor.top - offset` (`:241`).
   - En un turno largo, la cabecera del turno queda por encima de la vista: `top < viewport.top`, así que `offset = viewport.top`. La restauración **sube el chat hasta el inicio del turno**.
   - La persona vuelve a bajar, llega otro segmento y el chat vuelve a subir.
2. **La restauración pisa la rueda.** `restore()` se ejecuta en el commit y otra vez en el siguiente `requestAnimationFrame` (`:244-245`), con el `offset` del principio. Una rueda que llegue entre medias se deshace. Además, asignar `scrollTop` corta el desplazamiento suave de Chromium.
3. **Factor menor.** Al entrar en la franja de 80 px del fondo (`:218`), vuelve «seguir el final» y `scrollToIndex(last, 'end')` (`:369-375`) da un tirón hacia abajo.

**Propuesta.**
1. **Primero, reproducir** con un escenario nuevo, `tests/ui/chat-scroll-live`, usando el modelo falso de loopback del arnés.
   - El turno es largo (unos 6 `shell.exec` lentos, con texto entre ellos para crear segmentos nuevos) y supera dos alturas de vista.
   - Con el turno en curso:
     - se sube hasta que la cabecera del turno queda por encima de la vista y el fondo a más de 80 px;
     - se envía rueda real hacia abajo por CDP (`Input.dispatchMouseEvent`, `mouseWheel`, `deltaY: 60` cada ~120 ms);
     - se muestrea `scrollTop` en cada `requestAnimationFrame`.
   - **Aserción:** con solo rueda hacia abajo, `scrollTop` nunca baja más de 2 px entre dos cuadros.
   - Si no reproduce (también con la CPU cargada y con movimiento reducido), se cierra la tarjeta con esa evidencia y no se toca el código.
2. **Si reproduce, el arreglo:**
   - Para `manual=false`, el ancla es el **primer elemento visible** dentro del turno, como `overflow-anchor` del navegador, y no la cabecera recortada a la vista. Como mínimo, si `top < viewport.top`, se conserva el `top` real sin recortarlo.
   - La segunda restauración (la del `rAF`) se cancela si entre medias hubo `wheel`, `pointerdown`, `touchstart` o una tecla de desplazamiento. Para eso, un contador de gestos en `userScrolls` (`:210`).
   - El plegado al terminar el turno sigue igual: lo cubren `activity-disclosure` y `chat-interaction-fixes`.
3. Se hace junto al #16, que cambia la misma función para las aperturas manuales.

**Pruebas.**
- El escenario `chat-scroll-live`: en rojo antes del arreglo y en verde después, varias pasadas, con la CPU cargada y con `RINARI_UI_REDUCED_MOTION=1`.
- Vitest de `activityLayout.begin`: con `top < viewport.top`, un cambio de altura por debajo no mueve `scrollTop`.
- Sin regresiones en `activity-disclosure`, `chat-interaction-fixes`, `chat-send-jump` y `subagent-follow`.

---

## 21. Línea de pasos del subagente en el panel lateral

**Qué se vio.** En el panel lateral → Agentes, al abrir un subagente, la línea vertical de sus pasos tiene el mismo defecto que el timeline del chat (#10):
- no está centrada con las bolitas verdes;
- empieza por encima de la primera;
- sigue por debajo de la última, a lo largo del texto final (el resumen), y se desvanece.

**Causa** (`src/styles/index.css:1679-1686`, `AgentsPanel.tsx`: `<ol class="agent-steps">`).
- **Horizontal.**
  - La línea va en `left: 4px` con `width: 2px`, así que su centro está en x = 5.
  - Las bolitas de herramienta van en `left: -18px`, desde un `padding-left` de 18, con 8 px de ancho. Su centro está en x = 4.
  - La bolita de texto (6 px en `left: -17px`) también queda centrada en 4.
  - **La línea queda 1 px a la derecha.** En el chat (#10) es al revés: 1 px a la izquierda.
- **Vertical.**
  - La línea va de `top: 8px` a `bottom: 8px` de la lista, no de las bolitas.
  - La primera bolita tiene el centro a 14 px (`padding 4` + `top 10` + 4), así que la línea empieza 6 px antes.
  - Por abajo llega al final del último elemento. Suele ser el resumen en Markdown, largo, así que sobra línea por debajo de la última bolita.
- **El degradado** (`cyan-300` → 8 % de opacidad) hace que parezca cortarse antes.

**Propuesta.** El mismo arreglo que el #10, **compartido**:
- un solo componente o utilidad de «rail» (eje `--rail-x`, bolitas centradas con `translate(-50%, -50%)`, y una pista medida de la primera a la última bolita con un `ResizeObserver`);
- lo usan el timeline del chat (`.turn-rail`) y los pasos del subagente (`.agent-steps`), así no vuelven a separarse.
- Los estados de las bolitas siguen igual: hecho (verde), en curso (`--agent` con pulso) y fallido (rojo).

**Pruebas.**
- La aserción de geometría del #10 aplicada también al panel de Agentes (escenario `subagent-follow`):
  - centro x de las bolitas igual al de la pista, con tolerancia de 0.5 px;
  - inicio y fin de la pista en la primera y la última bolita.

---

## 22. Flecha de la lista de pasos al revés

**Qué se vio.** Con la lista de pasos abierta, la flecha apunta hacia arriba; cerrada, hacia abajo. El dueño esperaba lo contrario.

**Causa** (`src/styles/index.css:747-748`, `ChecklistDock.tsx:85`).
- Se usó la convención de un desplegable que se abre **hacia abajo**: cerrado ↓, abierto ↑.
  - El icono es `ChevronUp`, girado 180° cuando está cerrado.
- Pero la lista vive **pegada encima del composer**: al abrirse, **crece hacia arriba** (la cabecera sube y los pasos aparecen entre ella y el composer).
- En un panel anclado abajo (una hoja inferior), la flecha indica hacia dónde va a moverse: cerrado ↑ («se abre hacia arriba») y abierto ↓ («se recoge hacia el composer»).

**Propuesta.**
- Invertir el giro: **cerrado ↑, abierto ↓**. Es un cambio de CSS: el giro de 180° pasa al estado `aria-expanded='true'`, y la transición se mantiene.
- Revisar que en Boards (`density="pane"`) la lista también esté anclada abajo. Si en algún lugar se despliega hacia abajo, ahí la flecha va como hoy, según hacia dónde crezca.
- El `aria-label` del botón no cambia (Mostrar / Ocultar pasos).

**Pruebas.**
- Escenario `checklist-dock`: con el panel cerrado la flecha no tiene giro (apunta arriba) y abierto tiene 180°, comprobado con el `transform` calculado. La transición se muestrea, sin saltos.

---

## 23. `/goal`: un objetivo que Rinari persigue hasta lograrlo

**Qué se pidió.** Como en Codex: se asigna un objetivo y Rinari sigue trabajando sola, turno tras turno, hasta lograrlo.
- En Codex (CLI 0.128, estable desde mayo de 2026) hay estados pursuing / paused / achieved / unmet / budget-limited, los comandos `/goal <objetivo>`, `pause`, `unpause` y `clear`, y al final de cada turno una plantilla de «continúa» o de «cierra limpio».

**Lo que ya existe y se reutiliza.**
- **Comandos:** `commands/catalog.py` (tipo `ui`), `cli/slash.py`, y en la app `slashUi.ts` / `Composer.tsx`.
- **`ScheduleRunner`** (`engine_protocol/schedule.py`) es la plantilla del ejecutor: tiene hilo propio, arranca turnos con `start_turn(..., origin=...)` y trata `approval.requested` como «te necesita».
- **Punto de enganche:** el `finally` de `_run_turn` (`turns.py:1052-1081`), después de `turn.done.set()`. Los observadores de `turn.completed` corren antes, así que ahí `start_turn` fallaría con `TURN_RUNNING`.
- **Señales de fin:** la compuerta de verificación (`verify/gate.py`, que llega como `verification.completed`) y el `settle` de la lista de pasos.
- **El segmento `task_state`** se reconstruye en cada turno, y `compact_state.goal` ya sobrevive a la compactación.
- **Plantillas:** `session_checklists` (0046) con `ChecklistService` en el motor, y `ChecklistDock` + `checklistStore` en la app.
- **Topes que ya existen:** `TurnGovernor` y `LoopDetector` dentro de cada turno. `agent.max_turns` se lee del config pero no se usa.

**Propuesta: motor.**
- **Migración `0050_session_goals.sql`:** el objetivo, `state` (`pursuing | paused | waiting_limits | achieved | blocked | stalled | budget_limited | cleared`), `budget_json` opcional, los contadores (turnos, tokens, tiempo activo), la última evaluación y `revision`. La lógica va en `goals/service.py` (`GoalService`).
- **Herramienta `goal.update({status: progress|achieved|blocked, summary, evidence?, remaining?})`.**
  - **«Logrado» exige que la verificación lo confirme:** en una sesión de proyecto, la compuerta del turno tiene que dar `DONE`. Si da otra cosa, el goal sigue, y la siguiente iteración recibe los motivos.
  - En un chat sin proyecto o sin cambios, basta con la evidencia que declare Rinari.
- **`GoalRunner`**, enganchado al final del `finally`:
  - **la cola del dueño va primero;**
  - si el turno terminó normal o con una parada recuperable, arranca el siguiente con `origin {kind:"user", source:"goal", goal_id, iteration}` (mismos permisos del dueño) y una plantilla de harness: objetivo, iteración, última evaluación y lo que falta;
  - **Stop** → `paused`; **error de proveedor** → `paused` con el motivo, o `waiting_limits` si es por límites (lo toma el #24);
  - una aprobación o una pregunta pendiente hacen esperar al goal, y ese tiempo no cuenta.
- **Sin tope por defecto** (decisión del dueño), pero nunca infinito por accidente:
  - con **3 iteraciones seguidas sin progreso** (sin cambios en archivos ni en la lista de pasos, sin evidencia nueva y con el mismo resumen) pasa a `stalled` y avisa;
  - si el dueño le pone un tope, la última iteración usa la plantilla «cierra limpio».
- **Protocolo:** `session.goal.set|get|pause|resume|clear`, el evento `goal.updated` y la capacidad `session_goal_v1`. En la CLI, `/goal` y `rinari goal …`.

**Propuesta: app.**
- **Comandos:**
  - `/goal <objetivo>` lo crea o lo reemplaza (pide confirmar si ya hay uno);
  - `/goal pause | resume | clear`;
  - `/goal` solo muestra el estado.
- **`GoalDock` encima del composer**, junto a la lista de pasos y con su mismo estilo:
  - el objetivo, el estado, la iteración, el tiempo y los tokens;
  - Pausar / Reanudar / Terminar y «Ponerle tope».
  - Al lograrse: un check que se dibuja y la evidencia.
  - En `blocked` o `stalled`: el motivo, con «Seguir» o «Darle una pista».
- **Los turnos del goal** se ven como un separador «Continuando el objetivo · 7», no como una burbuja del dueño.
- Contrato de comandos y archivos generados.

**Pruebas.**
- **CLI:**
  - `test_goals.py`: «logrado» con `DONE` termina, y con `PARTIAL` sigue; `stalled` tras 3 iteraciones; Stop pausa; la cola va primero; un error de límites lo deja en `waiting_limits`;
  - `test_slash_catalog`;
  - `test_migrations` (49 → 50).
- **App:**
  - vitest del `GoalDock`;
  - escenario `goal-loop` con el modelo falso: 3 iteraciones y luego `achieved`; pausar a mitad y reanudar.

---

## 24. Continuar automáticamente al recuperar límites o créditos

**Qué se pidió.** Cuando un turno se corta porque se acabaron los límites, la cuota o los créditos: una tarjeta para continuar sola cuando vuelvan a estar disponibles. **Es posible, con condiciones.**

**Condiciones (verificadas en el código).**
- **La app tiene que estar abierta,** aunque sea en la bandeja (el modo por defecto). El motor vive mientras vive Electron, así que si se cierra del todo no hay nada que reanude. Al volver a abrir, lo pendiente se retoma.
- **Hoy ningún error guarda la hora de reinicio:**
  - `QUOTA_EXHAUSTED` nunca se reintenta;
  - `Retry-After` solo se lee en los 429;
  - nadie lee `x-ratelimit-reset-*`, `anthropic-ratelimit-*-reset`, el `resets_at` de Codex/ChatGPT ni el «resets 5pm» de la CLI de Claude.
  - **Las únicas horas de reinicio** están en el panel de uso (`providers/usage.py`): las ventanas de OpenCode Go y ChatGPT.
  - OpenRouter y DeepSeek solo dan el saldo, y Claude Subscription no da nada.
- **Se continúa, no se reenvía.** El historial queda guardado aunque el turno falle, así que lo correcto es «Continúa donde te quedaste», como hace hoy `TurnMeta.continueWork`.
- **Hoy la cola se dispara aunque el turno haya fallado** (`_start_next_queued` en el `finally`). Habría que pausarla mientras se espera.

**Propuesta: motor.**
- **`details.resets_at` en el error,** sacado de la primera fuente que lo tenga:
  1. el cuerpo del error (Codex/ChatGPT, OpenCode Go);
  2. las cabeceras (`Retry-After`, `x-ratelimit-reset-*`, `anthropic-ratelimit-*-reset`);
  3. el texto de la CLI de Claude;
  4. como respaldo, la ventana de uso agotada más próxima.

  Va en `providers/errors.py` y `providers/claude_cli.py`.
- **Proveedores de solo crédito** (OpenRouter, DeepSeek): se consulta el saldo cada 10 min, con backoff hasta 30 min. **Depende del #3:** si el reintento con menos tokens no basta, entra esta espera por saldo.
- **Migración `0051`** (`session_resumes`, o en `engine-operations.sqlite` junto al buzón): `session_id`, `provider_id`, `mode` (`at` / `poll`), `resume_at`, `state`, `attempts` y `goal_id`.
- **`ResumeRunner`** con un tick de 20 s:
  - a la hora indicada (o cuando hay saldo) vuelve a consultar el uso y arranca un turno con «Continúa donde te quedaste» y `origin {kind:"user", source:"auto_resume"}`;
  - si vuelve a fallar por límites, se rearma, con un máximo de 5 intentos y luego avisa;
  - **al arrancar el motor** retoma lo pendiente: si la hora ya pasó, continúa siempre que no hayan pasado más de 12 h; si pasaron más, solo avisa.
- **Mientras espera,** la cola de la sesión queda pausada y el goal en `waiting_limits`.
- **Protocolo:** `session.resume.arm|cancel|now|get` y el evento `session.resume.updated`. Ajuste `auto_resume_on_limits`: `ask` (por defecto), `always` o `never`.

**Propuesta: app.**
- **En la tarjeta de error de cuota o límite** (`TurnResult.tsx`, `FailureCause`): **«Continuar automáticamente cuando se restablezca (≈ 17:40)»**, o «cuando vuelva a haber saldo».
- **Una vez armada:**
  - la tarjeta muestra la cuenta regresiva con «Reanudar ahora» y «Cancelar»;
  - un chip «Reanuda 17:40» en la cabecera y en la barra lateral;
  - una notificación al reanudar.
- **Ajustes → Proveedores:** «Al quedarte sin límites: Preguntar / Continuar siempre solo / No». Con «siempre», un goal desatendido sigue solo.
- **La copia avisa:** «Rinari debe seguir abierta (puede estar en la bandeja)».

**Pruebas.**
- **CLI:**
  - extracción de `resets_at` de cada fuente;
  - `ResumeRunner`: arma, espera, continúa, se rearma y respeta el máximo;
  - la cola queda pausada;
  - se retoma al reiniciar, dentro y fuera de las 12 h;
  - el modo por saldo.
- **App:**
  - vitest de la tarjeta;
  - escenario `auto-resume` con un 429 y `Retry-After: 5`: continúa solo y la cola no se dispara.

---

## 25. Las instrucciones del agente principal no se ven en el panel del subagente

**Qué se vio.** En `ses_01M4PTW064R2WYP9M1SVFFNQR1` Rinari le mandó varias instrucciones a sus subagentes con `agent.message`:
- a `agt_001`: «admite postId como canónico…», «Reviewer medium upload crash…»;
- a `agt_002`: «Primer typecheck falló…», «Logo Qwen Turbo…»;
- a `agt_003`: «Backend src/lib/api.ts…».

En el panel lateral → Agentes, **ningún subagente muestra esos mensajes**.

**Causa (verificada en los datos del dueño y en el código).**
- **El motor sí los registra.** Cuando el subagente lee la instrucción, emite `agent.activity` con `child_event: "steer.applied"` y el texto en `content`. Los tres de `agt_002` están en `session_events`. El mensaje se arma en `agents/runtime.py:580-597` (`_coordinator_messages`) con `origin {kind:"coordinator"}`, **sin `steer_id`**.
- **La app los aplasta.** `turnTimelineReducer.ts:93` usa como id `steer:${payload.steer_id}`, así que todas las instrucciones de un subagente comparten el id `steer:undefined` y **cada una pisa a la anterior**. A lo sumo sobrevive la última.
- **Y el panel no las dibuja.** `AgentsPanel.tsx` solo pinta los hijos `model` (texto) y `tool`. Los de tipo `steer` se ignoran.
- **Lo mismo pasa con las instrucciones a un subagente que ya había terminado** (`deliver` → `resumed`, `orchestrator.py:370-420`): el seguimiento entra como un objetivo nuevo, y el panel solo muestra el objetivo original.

**Propuesta.**
1. **Motor.** Cada instrucción lleva un id y su origen:
   - `steer_id` = el `request_id` del `agent.message`, o uno generado si no lo trae;
   - `source: "coordinator"` en el `steer.applied`.

   El seguimiento de un subagente reanudado emite el mismo evento antes de arrancar.
2. **App, reductor.** Si falta `steer_id`, el id sale del `activity_seq` más un hash corto del texto. Así **las sesiones viejas también muestran todas sus instrucciones** al reabrirse, porque los eventos ya están guardados.
3. **App, panel de Agentes.** Las instrucciones se ven **en su orden**, entre los pasos del subagente:
   - con el estilo de cita que ya usa el timeline para `agent.message` (`agent-instruction`): «Instrucción de Rinari» y el texto plegable si es largo;
   - si la instrucción reanudó a un subagente terminado, con un separador «Seguimiento».
4. **Opcional:** en la lista de subagentes, un contador «2 instrucciones» junto a los pasos.

**Pruebas.**
- **Vitest del reductor:** tres `steer.applied` sin `steer_id` dan tres elementos, no uno.
- **Vitest de `AgentsPanel`:** las instrucciones salen en su orden, entre los pasos.
- **CLI:** `steer.applied` del coordinador lleva `steer_id` y `source`, también al reanudar.
- **Escenario `subagent-follow`:** el modelo falso manda dos `agent.message` y las dos se ven en el panel.

---

## 26. Cerrar la lista de pasos no es tan suave como abrirla

**Qué se vio** (Planka, Bug). Al minimizar la lista de pasos hay un efecto raro: el cierre no es tan suave como la apertura.

**Causa** (`src/styles/index.css:767-770`).
- La lista se abre y se cierra animando `grid-template-rows` (0fr ↔ 1fr), lo cual está bien.
- Pero el límite de altura (`max-height: min(280px, 34dvh)`) y el scroll interno solo existen mientras está abierta (`[data-open] .checklist-body-inner`).
- Al cerrar, `data-open` se quita de golpe: con una lista larga, el contenido **salta primero a su altura completa** (más de 280 px), desaparece la barra de scroll y recién después se anima hacia 0. Ese salto inicial es el «efecto raro».

**Propuesta.**
- El límite de altura queda **siempre** en `.checklist-body-inner`.
- Solo cambia el `overflow`: `auto` mientras está abierta, y `hidden` desde que empieza a cerrarse. El scroll vuelve al terminar la transición de apertura (`transitionend`), para que la barra no aparezca a mitad de la animación.
- Se hace junto con el #22 (la flecha).

**Pruebas.** En `checklist-dock`, con 10 pasos, muestrear con `requestAnimationFrame` la altura del panel al cerrar: tiene que bajar siempre, sin subir en el primer cuadro.

---

## 27. El anillo de límites no se actualiza cuando la ventana ya se reinició

**Qué se vio** (Planka, Bug, con capturas).
- Con GPT, el anillo de contexto seguía diciendo «default · primary_window 100 % usado · se reinicia dom 23:03» cuando ya eran las 23:03 del domingo, y el límite estaba restablecido (confirmado en la app de Codex).
- Solo al entrar en Ajustes → Proveedores → Límites y créditos se actualizó a «98 % restante». Después el anillo también se corrigió.

**Causa.**
- El anillo muestra la última foto de `provider.usage.get` (60 s de caché en el motor, con un backoff que puede llegar a 15 min tras errores).
- Nadie vuelve a pedirla cuando pasa la hora de reinicio de una ventana.
- El sondeo de 60 s solo corre con el panel de uso de Ajustes abierto (`ProviderUsagePanel.tsx`), no con el anillo.

**Propuesta.**
- **App:**
  - una ventana cuyo `resets_at` ya pasó se muestra como **«Restablecido · actualizando…»**, no con el 100 % viejo;
  - se programa un refresco para el momento del reinicio (más unos segundos), y otro al abrir el popover del anillo si la foto tiene más de 60 s.
- **Motor:** al leer el uso, si `now ≥ resets_at` de alguna ventana, se ignora la caché y se pide de nuevo.
- Se apoya en el #24, que ya trabaja con esas horas de reinicio.

**Pruebas.**
- Vitest del anillo: una ventana vencida muestra «restablecido» y dispara el refresco.
- CLI: una caché con `resets_at` vencido no se usa.

---

## 28. Compactar el contexto con la tarjeta del estilo nuevo

**Qué se vio** (Planka, Bug, con capturas).
- **Terminada:** «Contexto compactado» se ve con un `▼ Detalles` nativo y texto plano: «116.083 → 19.182 tokens · 176,1 s», «Ventana efectiva…», «Estructura: aprobada»…
- **En curso:** «Compactando contexto…» con un `▶ Detalles` suelto.
- No combina con el rediseño.

**Propuesta** (con lo que pidió el dueño).
- **Una tarjeta `act-row`** con la baldosa de compactar, como las demás herramientas.
- **Mientras compacta:**
  - una **barrita de tokens que se va encogiendo** (con un brillo que la recorre) y el texto «Compactando · 116 k tokens…»;
  - sin el «Detalles» suelto.
- **Al terminar:**
  - la barra **se encoge animada** desde el tamaño anterior hasta el nuevo (116 k → 19 k), con las cifras contando;
  - al llegar, **un check que se dibuja** (`r-check`) con un pulso suave;
  - queda: «Contexto compactado · −83 % · 2 min 56 s».
- **Al abrirla:** la ventana efectiva y las comprobaciones (Estructura, Coherencia, Reducción) como **chips verdes con check**, más la nota «no miden la fidelidad del resumen» en texto sutil.
- **Con movimiento reducido:** la barra queda ya en su tamaño final y el check aparece sin dibujarse.
- Si la compactación falla o se omite: la misma tarjeta en ámbar o rojo, con el motivo.
- Textos en `es.ts` / `en.ts`.

**Pruebas.**
- Vitest de la tarjeta en cada estado: en curso, terminada, fallida y omitida.
- Escenario con `/compact`: se muestrea con `requestAnimationFrame` que la barra baja sin saltos y que el check aparece al final.
- Captura en `ui-tour`.

---

## 29. El aviso de cambio de modelo, antes del primer mensaje y con estilo nuevo

**Qué se vio.** «Se cambió de modelo de qwen3.8-flash-next-ud-q4_k_xl a deepseek-v4.1-flash.» aparece **debajo** del primer mensaje de Rinari, como una línea gris pequeña que no se aprecia. El texto está bien; el dueño lo quiere **antes** del primer mensaje y con el estilo nuevo.

**Causa.**
- **Motor** (`engine_protocol/turns.py:1631-1644`): el aviso `model.changed` se emite cuando llega el **primer `model.content.completed` con texto**, es decir, después de que Rinari ya escribió su primera frase.
- **App** (`turnTimelineReducer.ts:291`, `TurnResult.tsx:55-61`): lo cuelga de ese mensaje y lo pinta debajo de la burbuja.

**Propuesta.**
- **Motor:** emitir `model.changed` **al empezar la primera llamada al modelo del turno**, con el modelo que se va a usar. La regla de comparar con el último modelo que escribió se mantiene, solo cambia el momento.
- **App:** el aviso va **arriba del turno**, antes del primer mensaje, como un chip del estilo nuevo:
  - **logo y nombre del modelo anterior → logo y nombre del nuevo**, con nombres bonitos (`modelDisplayName`) y el id técnico en el tooltip;
  - una flecha que se desliza una vez al aparecer;
  - con movimiento reducido, sin animación.
- En las sesiones viejas, que tienen el evento después del texto, la app lo sube igualmente al inicio del turno.

**Pruebas.**
- CLI: `model.changed` sale antes del primer `model.content.delta`.
- Vitest: el chip se pinta antes de la primera burbuja, también con un historial viejo.
- Un escenario o `ui-tour` con un cambio de modelo entre turnos.

---

## 30. No mostrar en el timeline las llamadas a la lista de pasos

**Qué se pidió** (Planka, Bug). ¿Hace falta mostrar en pantalla cada uso de la herramienta de la lista de pasos? El dueño cree que es algo del sistema y que basta con que quede en los registros.

**Propuesta** (aceptada por el dueño).
- Las filas de `checklist.update` **no se muestran en el timeline** por defecto. El panel de pasos ya enseña el progreso.
- Se siguen viendo con **«Mostrar nombres técnicos»**, y quedan en los eventos y en «Exportar diagnóstico».
- Sin estas filas, un grupo de actividad no cuenta la lista en su resumen («Comandos · Lista de pasos · 3» pasa a «Comandos · 2»).

**Pruebas.**
- Vitest del timeline: con nombres técnicos apagados no hay fila de `checklist.update`, y con ellos encendidos sí.
- El escenario `checklist-dock` sigue igual.

---

## 31. «Enviar ahora»: que Rinari lea el mensaje de una vez

**Qué se pidió** (Planka, Ideas-2). Hoy un mensaje a mitad de turno dice «Lo leerá al terminar el paso actual». El dueño quiere un **«Enviar ahora»** que lo haga leer de inmediato, con los escenarios bien pensados (por ejemplo, qué pasa si hay un proceso corriendo).

**Cómo funciona hoy.**
- El guiado (`TurnManager.steer`, `turns.py:1194`) deja el mensaje en cola.
- El ciclo del modelo lo recoge al empezar el siguiente paso (`runtime/agent.py`, `_take_steering`).
- Si el paso en curso es largo (un comando de minutos, una respuesta larga), el mensaje espera.
- La cancelación que existe (`CancellationToken`) es **de todo el turno**: no hay forma de cortar solo el paso.

**Propuesta.**
- **Motor.** Un **token de paso**: un hijo del token del turno, que se renueva en cada llamada al modelo y en cada herramienta. Con él, el método nuevo `session.turn.steer_now` cancela el paso en curso, no el turno, y deja el mensaje para el siguiente paso.

  | Rinari está… | Con «Enviar ahora» |
  |---|---|
  | Escribiendo o pensando | Se corta la generación; lo escrito queda como parcial y el siguiente paso lee el mensaje. |
  | En un comando de primer plano (`shell.exec`) | **Se mueve a segundo plano (#32)** y se lee el mensaje. «Detener el comando» queda como opción secundaria. |
  | Con un proceso en segundo plano | No se toca: solo se corta el paso. |
  | Escribiendo un archivo | Termina (son milisegundos y es atómico), y luego lee. |
  | Esperando una aprobación del dueño | Cuenta como denegar esa acción y se entrega el mensaje. |
  | Con subagentes trabajando | Siguen; la madre lee el mensaje y decide si les escribe. |
  | En una llamada MCP o de red | Se cancela si se puede; si no, se espera a que termine. |

  Al modelo le llega una nota de harness: «El dueño interrumpió el paso para decirte esto: …».
- **App.**
  - En el composer, mientras hay un turno: el botón de enviar ofrece **«Enviar ahora»** (con Ctrl+Enter) además del envío normal, que se lee al terminar el paso.
  - Si el paso en curso es un comando de primer plano, aparece un aviso corto: «Pasará *npm install* a segundo plano».
  - La burbuja del mensaje lleva un chip «Interrumpió el paso».

**Pruebas.**
- CLI: «enviar ahora» durante la generación, durante un `shell.exec` (pasa a segundo plano), con una aprobación pendiente (deniega y entrega), con un proceso en segundo plano (no se toca) y con subagentes.
- Escenario `steer-now` con el modelo falso.

---

## 32. Mover un comando de primer plano a segundo plano

**Qué se pidió.** Que un comando que corre en primer plano se pueda pasar a segundo plano en lugar de detenerlo, como el Ctrl+B de Claude Code.

**Lo que ya existe.**
- `shell.exec` con `background=true` usa el registro de procesos (`process.start`), que da un identificador (`proc_00N`), guarda la salida en un búfer y se consulta con `process.output`, `wait` y `signal`. Se ve en el panel Terminal.
- En primer plano, `shell.exec` (`tools/native/shell.py:337`) lanza el mismo tipo de proceso con la salida en búferes, pero espera a que termine, con un tope de 60 s por defecto y 600 como máximo.

**Propuesta.**
- **Motor:**
  - `ProcessRegistry.adopt(process, command, cwd, stdout, stderr)` toma el proceso **que ya corre**: sin reiniciarlo y con la salida acumulada;
  - se desactiva el tope de tiempo del primer plano y `shell.exec` termina con «Movido a segundo plano por el dueño: `proc_004`. Salida hasta ahora: … Usa `process.output` / `process.wait`»;
  - el método nuevo es `session.tool.background(tool_call_id)`.
- **Tope de tiempo:** cuando un comando de primer plano lo pasa, **se mueve a segundo plano en vez de matarse**, y se le avisa al modelo.
  - **Excepciones,** que se siguen matando: comandos interactivos o que esperan entrada (`ssh` sin comando, editores) y lo que el modelo pidió explícitamente con un tope corto.
  - El comportamiento queda configurable.
- **App:**
  - un botón **«Mover a segundo plano»** en la tarjeta de un comando que corre;
  - la tarjeta pasa a «En segundo plano · proc_004», con un enlace al panel Terminal;
  - «Enviar ahora» (#31) lo usa por defecto.

**Pruebas.**
- CLI:
  - adoptar un proceso conserva el PID y la salida previa;
  - `process.output` continúa la salida sin cortes;
  - un tope vencido pasa a segundo plano;
  - un comando interactivo se sigue matando.
- App: vitest de la tarjeta, y un escenario con un comando largo del modelo falso → «Mover a segundo plano» → el turno sigue.

---

## 33. Avisar cuando termina un turno (y un plan) en cualquier conversación

**Qué se pidió** (Planka, Ideas-2). Cuando termina un plan, que salga una notificación.

**Causa** (encontrada al revisarlo: el problema es más amplio que el plan).
- Los avisos de turno terminado (toast y notificación del sistema) solo existen para **sesiones que están en el board**: `features/board/useBoardNotifications.ts` filtra por `members` (los paneles), y `labelFor` devuelve `null` fuera del board.
- La campana (`NotificationCenter`) solo junta la atención del board y las tareas programadas (`ScheduleNotifier`).
- En la vista normal, al terminar un turno solo suena un sonido (`SoundCoordinator`), y solo si la ventana está en primer plano.
- **Resultado:** si el dueño manda a planear y se va a otra conversación o a otra ventana, no se entera.

**Propuesta.**
- **Fin de turno de cualquier conversación que el dueño no está mirando:**
  - si está en otra conversación de la app: un toast con «Ir»;
  - si la ventana no está al frente: una notificación del sistema;
  - en ambos casos, una entrada en la campana (módulo nuevo «Conversaciones»).
- **El plan con su texto propio** (turno en modo PLAN): «El plan de *X* está listo para revisar», con **«Revisar plan»**, que abre la conversación en la tarjeta del plan.
- **Otros desenlaces:** «Terminó», «Falló» o «Necesita tu aprobación / responder una pregunta». Las aprobaciones y preguntas pendientes fuera del board también avisan.
- **Sin duplicados:** se reutilizan la lógica de canales (`decideChannels`, que tiene en cuenta la ventana atendida y si la sesión está a la vista), el agrupado de avisos y los recibos de lectura del board, extendidos a todas las sesiones.
- **Preferencias:** las de notificación del board (toasts, sistema y detalle) pasan a **Ajustes → Notificaciones** y valen para todo, con un interruptor «Avisar cuando termina un plan».

**Pruebas.**
- Vitest del notificador:
  - una conversación normal sin mirar avisa;
  - la conversación a la vista no avisa;
  - un plan usa su texto y su botón;
  - varios turnos a la vez se agrupan.
- Escenario `turn-notify`: el modelo falso termina un plan en otra conversación, aparecen el toast y la entrada en la campana, y «Revisar plan» lleva a la tarjeta.

---

## 34. Indicador de pendientes en los otros perfiles

**Qué se pidió** (Planka, Ideas-2). Si hay una notificación y el dueño está en otro perfil, que el perfil muestre un indicador.

**Causa.** La barra lateral, el board al agregar paneles y la paleta filtran por el perfil activo. Lo que pasa en otro perfil (un turno terminado, una aprobación, una pregunta, un fallo) **no se ve en ninguna parte**: el selector de perfil (`SidebarIdentity`) no indica nada.

**Propuesta** (depende del #33, que crea los avisos fuera del board).
- **Pendientes por perfil.** Se cuentan los pendientes de cada perfil (turnos terminados sin leer, aprobaciones, preguntas y fallos) usando el `rinari_profile_id` de cada sesión. El motor ya lo informa en `session.list` y `session.get`; para una sesión desconocida, se consulta una vez y se guarda.
- **Selector de perfil:** un punto con número en el avatar cuando **otros** perfiles tienen algo pendiente. Del perfil activo ya se encargan la barra lateral y la campana.
- **Menú de perfiles:** cada perfil con su número, y en ámbar si algo espera al dueño (aprobación o pregunta).
- **Al tocar un aviso de otro perfil** (en la campana, un toast o una notificación del sistema), Rinari cambia a ese perfil, con la transición que ya existe, y abre la conversación.
- **Movimiento:** el punto aparece con un pulso suave una sola vez; con movimiento reducido, sin animación.

**Pruebas.**
- Vitest:
  - un pendiente en otro perfil muestra el punto con el número correcto;
  - en el perfil activo no se suma al punto;
  - el menú muestra el número de cada perfil.
- Escenario `profiles-switch`, ampliado: un turno termina en otro perfil, aparece el indicador, al tocar el aviso se cambia de perfil y se abre la conversación.

---

## 35. Entregar archivos: una herramienta y enlaces automáticos

**Qué se vio** (Planka, Bug; `ses_01M4S23DTE521DBBKB0GF76V8K`). Rinari entregó un MP3 como ruta en código (`` `C:\…\donde-esta-omar-powerrangers.mp3` ``). No se podía pulsar y no salió el reproductor.

**Causa.**
- El chat solo convierte en enlace, y muestra el reproductor (`InlineMedia`), lo que viene como **enlace Markdown** `[nombre](ruta)` (`src/components/Markdown.tsx:83-90`). El código en línea queda como texto plano (`:70-80`).
- Algunos modelos (por ejemplo `gpt-6.1-sol`) ya entregan los archivos como enlace; otros no.
- La tarjeta vieja de To Do «Cuando deja un link o un archivo, no deja la ruta» es el mismo problema.

**Propuesta** (sin reglas fijas en el prompt; decisión del dueño):
1. **Una herramienta `file.present({path, caption?})`**, para que Rinari muestre un archivo al dueño:
   - la app pinta una **tarjeta de archivo** con su nombre, tamaño y acciones (abrir, mostrar en la carpeta);
   - si es audio o video, con el **reproductor**; si es imagen o PDF, con la vista previa.
   - Solo acepta archivos dentro de las carpetas del proyecto o del workspace, o artefactos de la sesión.
   - Que funcione depende del **modelo** (lo usa cuando entrega algo), no de una regla en el prompt. La descripción de la herramienta lo dice: «para entregar un archivo al dueño».
2. **Red de seguridad en la app:** una ruta absoluta local **que exista**, en código en línea o en texto, se vuelve un enlace al archivo, y si es multimedia, con su reproductor. Comprobar que existe se hace con una llamada barata al host, con caché.

**Pruebas.**
- Vitest de `Markdown`: una ruta en código en línea se vuelve un enlace, y una ruta inexistente no.
- CLI: `file.present` valida el alcance y devuelve la presentación.
- Escenario: el modelo falso entrega un MP3 con `file.present` y con una ruta en código, y en los dos casos sale el reproductor.

---

## 36. «Oídos» para Rinari: transcribir audio con el whisper del dictado

**Qué se vio** (Planka, Bug). Rinari dijo que `analyze_audio` «no tiene oídos» y no pudo comprobar la canción que generó. **Tenía razón:** `analyze_audio` del Visual Lab solo da la duración, los BPM y las secciones de energía, y su descripción aclara que no escucha.

**Propuesta.**
- **Herramienta `audio.transcribe({path, language?, timestamps?})`**, con el **whisper.cpp local que ya se instala para el dictado** (`speech/service.py`): el mismo binario y el mismo modelo, sin descargas nuevas.
  - Con eso Rinari puede comparar la letra cantada con la que escribió (idioma, si se entiende, coros que faltan) o revisar un audio de voz.
  - Si la música tapa la voz, la precisión baja. Más adelante, el Visual Lab podría separar la voz antes de transcribir.
- **Si whisper no está instalado** (por ejemplo, en un build desde fuente, o sin el modelo descargado), la herramienta devuelve `NOT_INSTALLED` y **la app le muestra al dueño una tarjeta**: «Para que Rinari pueda escuchar audio, instala el dictado», con un botón a Ajustes → Dictado (o cómo configurarlo, como en el #8).
- **Ajustes → Dictado:** una nota que explica que el mismo motor le sirve a Rinari para **escuchar** archivos de audio, y qué modelo usa.

**Pruebas.**
- CLI: transcribir un WAV corto de prueba; `NOT_INSTALLED` sin binario.
- App: la tarjeta de «no instalado» y el botón a Ajustes.

---

## 37. Preguntas: un solo botón «Continuar» / «Enviar respuestas»

**Qué se vio** (Planka, Bug, con captura). Al elegir «Otra» y escribir, aparece un botón «Continuar» debajo del texto, y el botón principal «Enviar respuestas» queda desactivado hasta la última pregunta.

**Causa** (`src/features/questions/Questions.tsx:107` y `:114`). «Otra» añade su propio «Continuar», y el botón principal solo envía.

**Propuesta.** Un único botón principal: dice **«Continuar»** mientras falten preguntas (avanza a la siguiente) y **«Enviar respuestas»** en la última. Se quita el «Continuar» de abajo. «Omitir» y las flechas siguen como están.

**Pruebas.** Vitest de `Questions`: con 2 preguntas, el botón dice «Continuar» y avanza; en la última dice «Enviar respuestas» y envía; con «Otra» y texto vacío está desactivado.

---

## 38. Confianza después de `git init`: automática y en el momento

**Qué se vio** (Planka, Bug). El proyecto no era git. Rinari lo convirtió en repo, y **solo al salir y volver a entrar** la app pidió volver a confiar en él.

**Causa (verificada).**
- **Por qué pide confiar otra vez:** la confianza guarda una huella de identidad del proyecto (`trust/store.py:38-53`). En una carpeta normal es el marcador; en un repo es el directorio `.git` más sus remotos. Con `git init` la huella cambia y queda en `revalidation-required`.
  - La regla es buena: evita que alguien cambie la carpeta por otro repo.
  - Pero un `git init` dentro de una carpeta que ya era de confianza no cambia nada importante.
- **Por qué solo al volver a entrar:** la app consulta la confianza **al abrir** la conversación o el proyecto (`App.tsx`, `offerTrust` a partir de `instructions.trust_state`). Nada la vuelve a revisar después de un comando de git.

**Propuesta.**
- **Motor, actualización automática segura:** si la confianza existía con una huella de carpeta normal o marcador, y ahora es un repo **nuevo** (el `.git` dentro de la carpeta, no un archivo `.git` que apunta a otro lado, y **sin remotos**), la huella se actualiza sola y queda un evento «la carpeta ahora es un repo git». Si el repo trae remotos, se sigue preguntando.
- **En el momento:** al terminar un turno, si cambió la identidad de una carpeta del proyecto (y no entró en el caso anterior), el motor emite `project.trust.changed` y la app pregunta **en ese momento**, sin esperar a que se vuelva a abrir.

**Pruebas.**
- CLI: `git init` sin remotos actualiza la confianza sola; con un remoto añadido pasa a revalidar; un `.git` que apunta afuera pasa a revalidar.
- App: el aviso aparece al terminar el turno.

---

## 40. Sesiones hijas, fase A1: el vínculo madre → hija y la barra lateral anidada

**De dónde viene.** El análisis de Boards (2026-10-11). Las sesiones hijas se sacaron del plan de Boards a su propio plan, [plan-sesiones-hijas.md](plan-sesiones-hijas.md): la fase A1 entra en 0.3.2, y A2 y A3 van en la versión siguiente (decisión del dueño, 2026-10-12).

**Qué hay hoy.** Las notas aceptadas, los forks y las tareas programadas ya crean sesiones, pero no queda ningún vínculo visible:
- la tabla `sessions` no tiene `parent_session_id`; solo existe `forked_from` (migración `0013`), y la app no lo lee;
- el origen de una nota aceptada queda en `followup_suggestions.accepted_session_id` y en el `origin` del primer mensaje;
- la barra lateral (`AppSidebar.tsx`) no anida sesiones.

**Propuesta (solo A1).**
- **Motor, migración `0052_session_lineage.sql`:** columnas `parent_session_id`, `lineage_kind` (`note | fork | schedule`; `delegated` queda reservado para A2) y `brief_json` (título y encargo).
  - Al aceptar una nota, al bifurcar y al correr una tarea programada se llenan.
  - Las sesiones viejas se completan desde `forked_from` y `accepted_session_id`.
  - `session.list` y `session.get` devuelven el linaje.
- **App, barra lateral anidada** (en un proyecto y en los chats sueltos):
  - las hijas cuelgan de la madre, con sangría y el icono de rama;
  - la madre lleva el chip `2/3` (hijas terminadas sobre el total) y se puede plegar;
  - cada hija lleva su estado: trabajando, espera aprobación, terminó o falló.
- **Cabecera de la hija:** una miga «← *Madre* · Encargo» que vuelve a la madre con un clic.
- **Movimiento:** la hija nueva sale de la fila de la madre (`rinari-rise`, 220 ms); al terminar, el check se dibuja y el punto de la madre late una vez. Con movimiento reducido, todo es instantáneo.
- **Fuera de A1:** `session.start` y la herencia de permisos (A2), los mensajes a las hijas y los worktrees (A3).

**Pruebas.**
- CLI: la migración 51 → 52 completa el linaje de forks y notas existentes; aceptar una nota, bifurcar y una tarea programada dejan `parent_session_id` y `lineage_kind`; `session.list` lo devuelve.
- App: vitest del árbol de la barra lateral (anidado, chip `2/3`, plegar, estados) y de la miga.
- Escenario nuevo `session-lineage`: se acepta una nota, la hija aparece bajo la madre con su estado, la miga vuelve a la madre; la aparición se muestrea con `requestAnimationFrame`.

---

## 41. Cambios del turno: tarjeta con el estilo nuevo y revisión con colores en el panel lateral

*(El #39 salió de 0.3.2 al plan de Boards; por eso este es el #41.)*

**Qué se vio** (dueño, con capturas; sesión con `deepseek-v4.1-flash` en una carpeta que no es repo git).
- La tarjeta «3 archivo(s) de este turno · +248 −0», con su aviso «Se observaron estos cambios, pero la cobertura fue parcial…» y los botones «Revisar» y «Deshacer», tiene el estilo viejo.
- «Revisar» despliega cada archivo dentro de la tarjeta con el diff en texto plano: sin colores, sin números de línea y con las rutas absolutas de las cabeceras `---`/`+++`.

**Causa (verificada).**
- `src/features/activity/ChangeSetRow.tsx` es anterior al rediseño:
  - clases sueltas en lugar de los componentes canónicos;
  - textos fijos en el código («archivo(s) de este turno», «Revisar», «Deshacer», «sensible», el diálogo de deshacer) en lugar de i18n, con el plural «archivo(s)»;
  - el diff va en un `<pre>` sin formato (`:95`).
- **Ya existe un visor de diff con colores:** `src/features/workspace/DiffView.tsx` (líneas añadidas y quitadas con color, números de línea, el tramo que cambió dentro de la línea, sin las cabeceras), que usa el panel Cambios del lateral (`ChangesPanel.tsx`).
- **«Revisar cambios» de la fila de abajo** (`TurnMeta`) abre el panel lateral en Workspace → Cambios (`SingleSessionView.tsx:48`). Ese panel muestra el **estado git de todo el repo**, no los cambios de este turno, y en una carpeta sin git solo dice «no es un repositorio» (`ChangesPanel.tsx:79`). En esta sesión, ese botón no mostraba nada útil.
- Resultado: hay dos botones de «revisar» que hacen cosas distintas, y ninguno muestra bien los cambios del turno.

**Propuesta.**
1. **La tarjeta, con el estilo nuevo** (la familia de tarjetas del timeline, como la de memoria o la de entrega):
   - cabecera con el icono, «3 archivos cambiados» (plural bien hecho) y `+248 −0`;
   - debajo, la **lista de archivos**, cada uno con su tipo (creado, modificado, borrado, renombrado) como chip, su ruta relativa y su `+/−`;
   - el aviso de cobertura parcial pasa a una nota discreta con un icono de información: «Puede haber otros cambios que no se registraron». El ámbar queda para cuando de verdad hay conflicto o algo sensible;
   - todos los textos, a i18n.
2. **«Revisar» abre los cambios de este turno en el panel lateral,** con los colores del `DiffView`:
   - una vista **«Cambios del turno»** en el lateral, con la lista de archivos a un lado y el diff del elegido; funciona **sin git**, porque usa el registro de cambios del turno (`reviewTurnChanges`), no `git diff`;
   - al pulsar un archivo de la lista de la tarjeta, el lateral se abre en ese archivo;
   - desde el diff, «Abrir archivo» lo lleva a la pestaña Archivos.
3. **Un solo «Revisar».** «Revisar cambios» de la fila de abajo abre la misma vista del turno. La pestaña Cambios de git (todo el repo) se queda como está, con un selector «Este turno · Todo el repo» cuando el proyecto es git.
4. **Deshacer** sigue igual en el fondo (vista previa y conflictos), con el diálogo en i18n y el estilo nuevo.

**Pruebas.**
- Vitest de la tarjeta: el plural, la lista con chips y `+/−`, la nota de cobertura y los textos en ES/EN.
- Vitest de la vista «Cambios del turno»: sin git muestra los archivos y el diff con colores; con git, el selector cambia a todo el repo.
- Escenario `turn-changes`: el modelo falso crea y modifica archivos en una carpeta sin git; «Revisar» abre el lateral con el diff con colores; «Revisar cambios» de la fila de abajo lleva al mismo lugar.

---

## 42. Elegir el proyecto de la conversación desde el composer

**Qué se pidió** (dueño, con capturas de Claude Code y Codex). Al empezar una conversación nueva, ya sea con «Nueva conversación» arriba, con el «+» de un proyecto o en un panel de Boards, poder elegir a qué proyecto pertenece desde el mismo composer.
- **Claude Code:** debajo del composer hay chips «Local · *carpeta* · rama · worktree». El de la carpeta abre una lista con «Sin carpeta», «Reciente» y «Abrir carpeta…».
- **Codex:** un chip con el proyecto (con ✕ para quitarlo) y «Este ordenador», más el atajo «Cambiar el proyecto de este chat» (Ctrl+Alt+Shift+O).

**Qué hay hoy (verificado).**
- **El borrador ya tiene un proyecto, pero fijo.** Una conversación nueva es un borrador (`stores/conversationDraft.ts`) con `projectId` y la sesión se crea al primer envío. Ese `projectId` lo decide **por dónde entraste** («Nueva conversación» → chat general; el «+» de un proyecto → ese proyecto; «Añadir panel» → lo que elegiste en el diálogo). En el composer no se puede cambiar.
- **Hay un borrador por destino** (`draftKeyFor`: `draft` o `draft:project:<id>`), con su texto y adjuntos. Cambiar de proyecto, hoy, sería cambiar de borrador: lo escrito no viaja.
- **Mover una conversación existente ya funciona en el Engine** (`session.move`, `application/session_service.py:458`). Cambia la carpeta de trabajo para lo que siga; los archivos que ya creó se quedan donde estaban. Además reinicia el estado compactado, las skills activas, los anclajes y la rama, y si el proyecto es de otro perfil pasa la conversación a ese perfil. Toma el candado del turno, así que no se puede con un turno en curso.
- **En la app solo está en el menú de la barra lateral** («Mover a proyecto…», `AppSidebar.tsx`, `App.tsx:660`), no en el composer.

**Propuesta** (decisiones del dueño, 2026-10-12).
1. **Solo para conversaciones nuevas.** Una conversación que ya existe se cambia de proyecto o de perfil como hoy, desde la barra lateral («Mover a proyecto…», «Mover a perfil»). El composer no lo ofrece.
2. **Un chip de proyecto en el composer** de toda conversación nueva (vista Normal, «+» de un proyecto, panel de Boards):
   - muestra el proyecto con su nombre y su rama, o «Sin proyecto» (chat general);
   - al abrirlo: «Sin proyecto», los **proyectos del perfil activo ordenados por uso reciente** (el último en que trabajaste, arriba), un buscador y «Abrir carpeta…» (el flujo que ya existe en «Añadir panel»);
   - «Nueva conversación» empieza en **«Sin proyecto»**; el «+» de un proyecto lo trae ya elegido;
   - **lo escrito viaja con el cambio:** el texto, los adjuntos, el modo y el modelo del borrador pasan al nuevo destino;
   - al primer envío el chip desaparece del composer (la conversación ya existe y se gestiona desde la barra lateral).
3. **Atajo** para abrir el chip desde el teclado, como el de Codex. Se elige uno que no choque con los atajos de hoy.
4. **En Boards,** el chip vive en el composer de cada panel nuevo, y elegir un proyecto que ya está en otro panel muestra el aviso de carpeta compartida que existe hoy.
5. **El worktree** (la casilla de Claude Code) **no entra ahora:** llega con la fase A3 de las [sesiones hijas](plan-sesiones-hijas.md).

**Pruebas.**
- Vitest del chip: la lista (Sin proyecto, Recientes, buscador, Abrir carpeta), el cambio de proyecto en un borrador conserva texto, adjuntos, modo y modelo, el primer envío crea la sesión en el proyecto elegido y el chip ya no aparece.
- Escenario `composer-project`: «Nueva conversación», se elige un proyecto en el chip, se envía y la conversación aparece bajo ese proyecto en la barra lateral; en Boards, lo mismo en un panel nuevo.

---

## 43. Flujos pasa a vivir en el panel lateral

**Decisión del dueño (2026-10-12).** Flujos deja de ser un modo de arriba (Normal · Boards · Flujos) y pasa a ser **una pestaña del panel lateral**, junto a Agentes, Archivos, Navegador, Workspace y Terminal, en la vista Normal y en cada panel de Boards. Salió al revisar la maqueta de Boards.

**Por qué.** El Flujo trata de una conversación o de su proyecto: tiene sentido junto a ella, como el navegador o la terminal, y en el mismo sitio en Normal y en Boards. El selector de arriba queda en **Normal · Boards**.

**Qué hay hoy.** `src/features/flow/FlowView.tsx` es una vista a pantalla completa (tarjetas de etapas a lo ancho), con alcance de sesión o de proyecto (`FlowScope`) y su atajo propio (`ShortcutAction` `flows`).

**Propuesta.**
- **Pestaña «Flujo»** en `SessionDock`, con el Flujo de la conversación abierta.
- **Versión compacta en vertical** para el ancho del panel: una etapa debajo de otra, con su estado y lo que falta; al tocar una etapa se abre su detalle (`FlowStageDetail`) dentro del panel.
- **Selector «Esta conversación · Proyecto»** dentro de la pestaña, para no perder la vista de todo el proyecto.
- **Para verlo amplio:** extender el panel lateral (#44).
- **Se retiran** el modo «Flujos» del selector de arriba y su pantalla; el atajo de Flujos abre la pestaña. Los textos y la ayuda de atajos se actualizan.

**Pruebas.** Vitest de la pestaña (alcance conversación y proyecto, la versión compacta, el detalle de una etapa). Escenario: el Flujo se abre en el panel lateral en Normal y en un panel de Boards; el selector de arriba ya no tiene «Flujos».

---

## 44. El panel lateral se extiende, y el navegador del agente prueba en tamaños anchos

**Qué se pidió** (dueño, y la tarjeta de Planka «Sidepanel que se pueda abrir más, por todo y todo, hasta para que el agente cuando usa el navegador pueda probar en dimensiones altas»). Que el panel lateral se pueda abrir mucho más, hasta casi todo, para ver cualquier pestaña en grande y para que el agente pruebe páginas en tamaños de escritorio.

**Causa (verificada).**
- **El panel lateral tiene un tope de 800 px**, y el chat no baja de 480 px (`stores/sessionDock.ts:27-31`: `DOCK_MIN_WIDTH`, `DOCK_MAX_WIDTH`, `CHAT_MIN_DOCKED_WIDTH`).
- **El navegador del agente toma su tamaño del panel.** La vista nativa del navegador usa como viewport sus propios límites en pantalla (`electron/main/browser/BrowserRegistry.ts`, `ViewLayoutCoordinator.ts`). Con el panel a 800 px como mucho, la página que prueba el agente nunca pasa de ~800 px de ancho: **no puede probar una vista de escritorio** (1280 px o más).
- El agente **no tiene cómo pedir otro tamaño**: las herramientas del navegador (`tools/native/browse.py`) no cambian el viewport.

**Propuesta.**
1. **Extender el panel lateral, en Normal y en Boards** (en Boards, dentro de su panel, que se abre con el botón como hoy):
   - **sin el tope de 800 px:** se arrastra hasta dejar al chat en un mínimo angosto;
   - **botón «Ampliar»** en la barra del panel lateral (y doble clic en el borde): el panel lateral ocupa toda el área de la conversación, o del panel en Boards, y el chat queda como una columna estrecha con la cara de Rinari y el composer. El mismo botón, o Esc, lo devuelve al ancho de antes;
   - el ancho se recuerda por pestaña.
2. **El tamaño de la página, separado del tamaño del panel**, en la pestaña Navegador (con cuidado del riesgo, que preocupa al dueño):
   - un selector de tamaño: **Ajustar al panel** (como hoy), **Móvil 390**, **Tablet 768**, **Escritorio 1280** y **Ancho 1920**;
   - **sin reducir la página.** Si la página es más ancha que el panel, se ve a su tamaño real y el panel se **desplaza en horizontal** para recorrerla, con el tamaño a la vista («1280 × 800»). La base ya existe: el navegador nativo distingue dónde estaría la página entera (`logicalBounds`) de lo que se ve (`visibleBounds`) y coloca la página desplazada sin cambiar su viewport (`ViewLayoutCoordinator.ts`). Es lo que ya usa Boards cuando su scroll recorta un panel;
   - así **el agente no se entera:** trabaja sobre una página de 1280 px, y sus clics y capturas van en coordenadas de la página, igual que hoy. Lo único nuevo es que el panel muestra una parte;
   - **el agente puede pedirlo él:** una herramienta (o un parámetro de las del navegador) para fijar el tamaño y probar un diseño en varios anchos. El selector muestra el tamaño que eligió el agente.
3. **El riesgo, acotado por fases:**
   - **44a. Panel lateral extensible y «Ampliar».** Es solo disposición; no toca el navegador. Riesgo bajo.
   - **44b. Tamaño de página con desplazamiento horizontal.** Reutiliza el recorte que ya funciona en Boards. Riesgo bajo o medio; se valida con `npm run browser:vertical` (la prueba `browser-integration` del CI) y con el escenario de abajo.
   - **Fuera de 0.3.2: ver la página reducida** para que quepa entera (zoom o emulación de tamaño de CDP). Es lo que más puede romper clics y capturas, así que no entra. Si con 44b no basta, se estudia aparte con una sonda propia.

**Pruebas.**
- Vitest del panel lateral: arrastrar más allá de 800 px, «Ampliar» y volver (también con Esc), el ancho por pestaña, y lo mismo dentro de un panel de Boards.
- CLI: la herramienta de tamaño valida los límites y queda en el estado del navegador.
- `browser:vertical` y un escenario: con «Escritorio 1280» en un panel de 600 px, la página mide 1280 de ancho, el panel se desplaza en horizontal, un clic del agente cae en el elemento correcto (también con el panel desplazado) y la captura sale a 1280.

---

## 45. Cloudflare Turnstile rechaza el navegador de Rinari

**Qué se vio** (Planka, Bug; `ses_01M4SE7BVANNW7JAS2N690H2W0`). El login de un sitio protegido con Cloudflare Turnstile (`ultimowow.com/es/log-in`) falla en el navegador integrado: el widget da el error 600010 («bot behavior detected»), nunca emite el token (`cf-turnstile-response` vacío) y el login rebota.

**Causa.** Turnstile está hecho para detectar navegadores automatizados, y el de Rinari lo es: se anuncia como `rinari-agent/0.3.1 … Electron/44.4.1 Chrome/152` y lo maneja el agente por CDP. Que lo rechace es Turnstile haciendo su trabajo.

**Lo que no se hace.** Disfrazar el navegador (cambiar el user-agent, ocultar CDP u otras huellas) para pasar el control, o que el agente intente resolver captchas. Sería evadir una protección anti-bots: ni se hace ni se ofrece.

**Propuesta.**
- **Detectarlo y decirlo claro.** Cuando la página muestra un desafío de verificación humana (Turnstile, hCaptcha, reCAPTCHA, la pantalla «Checking your browser»), la herramienta del navegador lo informa con un código propio (`HUMAN_CHECK`) en lugar de que el agente reintente o se quede dando vueltas.
- **El agente se detiene y pregunta.** Pide al dueño que haga ese paso él mismo, sin intentar resolverlo.
- **Tarjeta con salida directa:** «Este sitio verifica que seas una persona y no acepta el navegador de Rinari. Ábrelo en tu navegador», con el botón «Abrir en mi navegador» (el «Abrir fuera» que ya existe) y la URL.
- **En el manual (`rinari-handbook`) y la ayuda del navegador:** los sitios con verificación humana se usan desde el navegador del dueño.

**Pruebas.** CLI: una página de prueba con el iframe de Turnstile da `HUMAN_CHECK`. App: la tarjeta con «Abrir en mi navegador». Escenario: el modelo falso abre esa página y el turno termina en la pregunta al dueño, sin reintentos.

---

## 46. El navegador, como uno de verdad

**Qué se pidió** (Planka, Ideas-2).
- Una **página de inicio** propia, como la de un navegador de verdad.
- Que el navegador sea **siempre fluido**: hoy, cuando el agente lo usa, «se pega todo por las capturas».
- Ver el **cursor del agente**, como en Codex o Claude Code.
- **Quitar «Preparando el navegador…»** y los botones de control: «el cursor mío toma el control, el agente lo retoma cuando lo ocupa».

**Qué hay hoy (verificado).**
- **Las capturas pasan por el proceso principal de Electron** (`NativeBrowserHost.ts`, `page.screenshot` y `preview`): `capturePage()`, luego `toPNG()` y a veces `resize()`, que codifican la imagen en el mismo proceso que pinta toda la app. Una captura grande frena la ventana entera mientras se codifica, y el propio código avisa de que en ciertos casos `capturePage` bloquea el proceso principal. **Causa probable** del tirón; se mide antes de tocar.
- **El control es explícito:** «Tomar control» / «Devolver al agente», con «Rinari controla esta página» / «Tienes el control» (`browser.takeControl`, `browser.returnControl`). El Engine confirma cada transición (`browser.control.set`), y si el dueño toca la página sin tomar el control, el agente recibe `BROWSER_INTERVENED`.
- Al abrirse, el navegador muestra «Preparando el navegador…» o «Esta sesión todavía no tiene navegador».

**Propuesta.**
1. **Fluido mientras el agente trabaja:**
   - medir primero con un perfil de una sesión real (cuánto bloquea cada captura al proceso principal);
   - sacar la codificación del proceso principal: cuando la vista está en pantalla, capturar con CDP (`Page.captureScreenshot`, que codifica fuera del proceso principal) y dejar `capturePage` solo de respaldo; JPEG o WebP para las vistas previas en lugar de PNG, y no redimensionar en el proceso principal;
   - no hace falta una librería: es dónde y cómo se codifica la captura.
2. **Página de inicio de Rinari** (en lugar de «Preparando…» y de la página en blanco):
   - una página local con el estilo de Rinari: barra de búsqueda o dirección, los sitios abiertos hace poco en esta conversación o proyecto, y los servidores locales en marcha (los `localhost` del registro de procesos) como accesos directos;
   - aparece al instante; el navegador se prepara detrás sin mostrarlo.
3. **Cursor del agente visible:**
   - un cursor con el estilo de Rinari que **viaja** hasta donde el agente hace clic (con una onda al hacer clic) y muestra un indicador al escribir;
   - se dibuja en una capa transparente encima de la página, **sin tocar el DOM de la página** (no aparece en las capturas del agente ni cambia lo que lee);
   - con movimiento reducido, el cursor salta sin animación.
4. **Control sin botones:**
   - **el dueño toma el control con solo usar el navegador:** mover el ratón dentro, hacer clic o escribir. Desaparecen «Tomar control», «Devolver al agente» y sus avisos;
   - **el agente lo retoma cuando lo necesita**, pero **solo si el dueño dejó de usarlo hace un rato** (por ejemplo 3 s sin tocarlo). Si el dueño sigue activo, el agente espera y se ve un chip pequeño «Rinari espera a que termines»;
   - **nunca a mitad de un campo de contraseña** ni con un formulario a medio escribir por el dueño: ahí el agente espera hasta que el dueño suelte;
   - el Engine sigue confirmando cada cambio de dueño (no hay doble autoridad), y `BROWSER_INTERVENED` deja de ser un error y pasa a ser «el dueño estaba usando el navegador; espera y reintenta».

**Decisión pendiente.**
1. El tiempo de espera antes de que el agente retome el navegador: **3 segundos** sin que el dueño lo toque (recomendado), o más.

**Pruebas.**
- Medición antes y después: durante una ráfaga de capturas del agente, la app sigue a 60 cuadros (muestreo con `requestAnimationFrame` en la ventana principal).
- `browser:vertical` (la prueba `browser-integration` del CI) con la captura por CDP y su respaldo.
- Escenario `browser-handoff`: el dueño hace clic en la página y el agente espera (chip visible); a los 3 s sin tocarla, el agente retoma; con el foco en un campo de contraseña, el agente no retoma.
- La página de inicio aparece sin «Preparando…» y lista los `localhost` en marcha; el cursor viaja al punto del clic y no aparece en la captura del agente.

---

## Decisiones

Tomadas el 2026-10-11: el dueño aceptó todas las recomendaciones.

| # | Decisión |
|---|---|
| CI | El arreglo del foco del cajón entra con 0.3.2, no como hotfix. |
| 3 | OpenRouter 402: solo el reintento con el tope que da el proveedor, sin tope por defecto. |
| 5 | Subagentes en REVIEW permitidos, y los hijos heredan la solo lectura. |
| 7 | En Flows, la lista de pasos se muestra como «Tasks», sin tocar el esquema. |
| 8 | Dictado en un build desde fuente: documentación y aviso en la app. En un build sin empaquetar, el aviso dice cómo configurarlo en vez de «Reinstala». |
| 10 | La pista de la línea se mide con JS (y acota el brillo). La línea es sólida y tenue, o con un degradado que no llega a transparente. |
| 11 | La captura se adjunta solo si el modelo tiene visión. Si no, va la referencia como hoy, sin error. |
| 12 | El selector se construye con `@radix-ui/react-select` (dependencia nueva). |
| 13 | Los gratis de OpenCode Go van en un grupo aparte, «OpenCode Go (gratis)» / «(free)». Los gratis de Zen quedan fuera, porque OpenCode los bloquea fuera de su app. |
| 14 | Visión: un 400 sin detalle ya no marca un modelo como «sin visión»; solo un rechazo explícito. Rinari aprende también que un modelo ve. La nota de imagen retirada le dice al modelo que no la vio. El aviso indica el origen de la marca y trae el botón «Volver a activar la visión». «Actualizar modelos» lee la visión y el límite de imágenes. Prioridad: el dueño, luego el proveedor, luego lo aprendido. |
| 15 | Las herramientas de imagen usan la tarjeta `act-row`, con una miniatura chica. La miniatura, el análisis visual y el aviso pasan al estilo nuevo, con i18n. |
| 16 | Al abrir una tarjeta a mano, el chat baja lo justo para mostrar el contenido, sin perder la cabecera. Suave, o inmediato con movimiento reducido. En medio del historial sigue sin saltar. |
| 17 | La memoria guardada en automático usa una mini-tarjeta de la familia de la propuesta, con estado «Guardado» y las acciones «Deshacer» y «Ver en Ajustes». |
| 18 | Los archivos del navegador se deduplican por contenido, no por nombre. El `id` es único, y un duplicado descartado lo avisa. (2026-10-11, triage de Planka.) |
| 19 | El proveedor activo se puede eliminar cuando es el único: Rinari queda sin proveedor y se abre el asistente. Con otros, sigue pidiendo a cuál cambiar. (2026-10-11, triage de Planka.) |
| 20 | Primero el escenario `chat-scroll-live`. Solo si reproduce el rebote, se cambia el ancla al primer elemento visible y se cancela la restauración tras un gesto. Va junto al #16. (2026-10-11, triage de Planka.) |
| 21 | Los pasos del subagente usan el mismo «rail» compartido que el timeline (#10): centrado y de bolita a bolita. |
| 22 | La flecha de la lista de pasos sigue la dirección en que crece: cerrada ↑, abierta ↓. |
| 23 | `/goal`: «logrado» = Rinari lo declara con evidencia y la verificación lo confirma. Sin tope por defecto (se puede poner uno), con «estancado» tras 3 iteraciones sin progreso. |
| 24 | Entra en 0.3.2. Funciona con la app abierta o en la bandeja; continúa (no reenvía); por defecto pregunta. |
| 25 | Cada instrucción del coordinador lleva su propio id. El panel de Agentes las muestra en orden, entre los pasos, también en sesiones viejas. |
| 26 | El límite de altura de la lista queda siempre puesto; solo cambia el scroll, para que cerrar no salte. |
| 27 | Una ventana con la hora de reinicio vencida se ve «restablecida · actualizando…» y se refresca sola, también al llegar la hora. |
| 28 | La compactación usa una tarjeta `act-row`: barra de tokens que se encoge (116 k → 19 k) y check dibujado al terminar; comprobaciones como chips. |
| 29 | `model.changed` sale al empezar la primera llamada al modelo; el chip «anterior → nuevo», con logos, va arriba del turno. |
| 30 | `checklist.update` se oculta del timeline, salvo con «Mostrar nombres técnicos». |
| 31 | «Enviar ahora» corta solo el paso. Ante un comando de primer plano lo mueve a segundo plano (detenerlo queda como opción); una aprobación pendiente cuenta como denegada; lo que está en segundo plano y los subagentes no se tocan. |
| 32 | El proceso en curso pasa al registro de procesos sin reiniciarse. Al vencer el tope también pasa a segundo plano, salvo los interactivos. |
| 33 | Fin de turno de cualquier conversación sin mirar: toast, sistema (si la ventana no está al frente) y campana. El plan tiene su texto y «Revisar plan». Las preferencias pasan a Ajustes → Notificaciones. |
| 34 | Un punto con número en el avatar del selector cuando otros perfiles tienen pendientes, el número de cada uno en el menú, y tocar un aviso cambia de perfil y abre la conversación. |
| 35 | Sin reglas fijas en el prompt: herramienta `file.present` (tarjeta con reproductor o vista previa), y en la app las rutas locales existentes se vuelven enlace como respaldo. |
| 36 | `audio.transcribe` usa el whisper.cpp del dictado. Si no está instalado, una tarjeta al dueño con el botón a Ajustes → Dictado, donde también se explica el uso. |
| 37 | Un único botón principal: «Continuar» hasta la última pregunta y «Enviar respuestas» en ella. |
| 38 | `git init` sin remotos dentro de una carpeta de confianza actualiza la huella sola. Los demás cambios de identidad se preguntan al terminar el turno, no al volver a abrir. |
| 40 | Entra solo la fase A1 de las sesiones hijas (vínculo y barra lateral anidada). A2 (`session.start`, permisos heredados, tarjeta de entrega) y A3 (mensajes a las hijas, worktrees) van en la versión siguiente. |
| 41 | La tarjeta de cambios pasa al estilo nuevo con lista de archivos. «Revisar» (la tarjeta y la fila de abajo) abre «Cambios del turno» en el panel lateral con los colores del `DiffView`; funciona sin git. |
| 42 | Chip de proyecto solo en conversaciones nuevas (lo escrito viaja al cambiar). Empieza en «Sin proyecto». Lista: proyectos del perfil activo por uso reciente, buscador y «Abrir carpeta…». Las existentes se mueven desde la barra lateral. |
| 43 | Flujos es una pestaña del panel lateral (Normal y Boards), con versión compacta y selector «Esta conversación · Proyecto». Sale el modo «Flujos» de arriba. |
| 44 | El panel lateral se extiende sin el tope de 800 px y tiene «Ampliar» (44a). En el Navegador, el tamaño de la página va separado del panel (Ajustar, 390, 768, 1280, 1920) y se recorre con desplazamiento horizontal, sin reducirla (44b); el agente puede pedir el tamaño. La vista reducida queda fuera de 0.3.2 por riesgo. |
| 45 | Ante una verificación humana (Turnstile, captchas) el agente se detiene y pide al dueño usar su navegador. No se disfraza el navegador ni se intentan resolver captchas. |
| 46 | Capturas fuera del proceso principal (medir primero), página de inicio de Rinari, cursor del agente en una capa aparte y control implícito: el dueño lo toma al usarlo y el agente lo retoma tras unos segundos sin uso, nunca en un campo de contraseña. |
| Boards | Lo que es solo de Boards no va en 0.3.2: está en [plan-boards.md](plan-boards.md) (el «Preparando el turno…» del panel, la limpieza y el panel colapsado con estado). |
| Pregunta | ¿Qué comparten los perfiles? Cada perfil tiene su Soul (con la intensidad), su modo, sus modelos por agente, sus proyectos y sus conversaciones. Se comparten los proveedores, la memoria, las skills (también las aprendidas), MCP y plugins, las tareas programadas y el resto de Ajustes. El dueño lo deja así. |
| Después | Herramientas de Docker y conectores de servicios profesionales (Planka, Ideas-2): fuera de 0.3.2. |

Estado: **esperando más hallazgos**. No se implementa hasta que el dueño diga «iniciamos».
