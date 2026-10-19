# Plan 0.4.0 v3: caché y Set 2 de la batería

Estado: **en curso** (el dueño autorizó «iniciar la v3 con la Nightly instalada al terminar», 2026-10-19). Lo que toca UI lo implemento yo y la sesión de pulido lo pule; P9 lo hace la sesión de pulido.

Origen: el «Set 2 (caché)» de la batería de uso real (`C:\Users\Xainner\Documents\Proyectos\pruebas-040-1018\HALLAZGOS.md`), corrido con la Nightly que lleva el Engine 9231110 (la del [plan v2](plan-0.4.0-v2.md)). Los F-n son sus hallazgos.

La regla de cero hardcodeo del [plan v2](plan-0.4.0-v2.md#regla-cero-hardcodeo-dueño-2026-10-18) vale igual aquí. Lo que es de servicios externos va a [notas-servicios-externos.md](notas-servicios-externos.md). Allí ya está **F46** (subagentes en paralelo contra un servidor local de un solo slot): se arregla en el servidor, no en Rinari.

## Avance

| Bloque | Estado |
|---|---|
| F41, F44, F27 bis, P1b, P2 | Hecho: CLI ecdf600. |
| P1, P3, P4 | Hecho: CLI 8423ba9. La imagen ya no se entrega sola: el modelo la mira y la presenta; si no la presenta, sale al terminar el turno. |
| P5, P6 | Hecho: CLI 8ea9101, Agent bfd8259. |
| P7 | Hecho: CLI 0e397ca, Agent 50ce318. «Enviar ahora» corta el stream del proveedor (token propio por llamada) haga lo que haga el modelo. Una llamada MCP en curso termina con su plazo antes de leer el mensaje (el cliente MCP no cancela a mitad). |
| P8, P10 | Hecho: Agent 50ce318. Las sesiones nacidas de una nota ya informan a la madre por el mismo camino que las hijas (`children.create`, origen `note`): sin cambio en el Engine. |
| P9 | Hecho por la sesión de pulido: Agent 06fc235. |
| F45 | Hecho (commit con F43). |
| F43 | Hecho (commit con F45). |
| F42 | **Bloqueado, pendiente del dueño**: ver «Hallazgo al implementar» en F42. |
| F46 | Fuera: nota externa. |

## F42: la lista de herramientas no cambia a mitad de la conversación

**Qué pasa.** Medido contra la suscripción de ChatGPT con el runtime real: basta con que la lista de herramientas cambie una vez a mitad de la conversación (por ejemplo, de 74 a 76 al activar algo) para que el backend deje de cachear hasta el final. Solo reutiliza las instrucciones, las herramientas y el primer mensaje (~12,5–14 mil tokens), aunque después la lista vuelva a ser estable. En la batería se congela justo después de `skills.activate`. Descartado con pruebas: el razonamiento devuelto, la nota de contexto, los `id`/`status` de los elementos y una clave de sesión por conjunto de herramientas. En chat completions con modelo local es el mismo daño por otra vía: las herramientas van al principio del prompt, así que cambiarlas obliga a releer todo.

**Lo que hacen los grandes** (decidido con el dueño, 2026-10-19). Ninguno cambia la lista a mitad de la conversación:

| | Con diferido nativo | Sin diferido nativo |
|---|---|---|
| Claude Code | MCP diferidos (Anthropic `defer_loading`; la definición encontrada entra a la conversación como `tool_reference`) | Todo desde el inicio (Haiku y Vertex no lo soportan) |
| Codex | Búsqueda de herramientas MCP (Responses `tool_search` + `defer_loading`) | Todo desde el inicio |
| Copilot CLI | Búsqueda de herramientas | La documentación oficial dice que, en cualquier otro modelo, todas se cargan desde el inicio |
| Hermes / OpenCode | — | Todo desde el inicio, con filtros por servidor MCP |

Nadie grande usa una herramienta despachadora del tipo «llamar herramienta»; eso solo lo hacen pasarelas MCP de la comunidad. Queda descartado.

**Cambio.** Dos modos, según el protocolo y no según el modelo o el proveedor:
1. **Con diferido nativo** (Anthropic Messages, OpenAI Responses, suscripción de ChatGPT): las nativas van siempre desde el inicio. Los MCP grandes van con `defer_loading` y se descubren con el mecanismo del proveedor. En Responses, el modo en que la búsqueda la ejecuta el cliente encaja con `capability.search`. Si el modelo no soporta el diferido, se pasa al modo 2.
2. **Sin diferido nativo** (chat completions: DeepSeek, OpenCode, llama.cpp, Strata, Ollama…): todas las herramientas desde el inicio y fijas toda la conversación. Quien tenga MCP enormes los filtra por servidor.

Así, `capability.activate` deja de cambiar la lista a mitad de la conversación. Las nativas que hoy son bajo demanda suman unos 8,7 mil tokens: se pagan una vez y después salen de caché.

**Validación.** La batería del Set 2 en los dos modos, con GPT por la suscripción (diferido nativo), DeepSeek y Qwen local (todo desde el inicio). Se mide la caché llamada a llamada en conversaciones largas y con activaciones, y se compara con las cifras de hoy: luna congelada en 14.080, y entre vueltas 9.088.

**Hallazgo al implementar (2026-10-19).** Rinari registra 144 herramientas nativas (75 núcleo + 69 bajo demanda, ~18,8 mil tokens) y OpenAI Chat Completions rechaza más de 128 por petición (`'$.tools' is too long. Maximum length is 128`); DeepSeek y muchos compatibles copian ese tope. El modo 2 («todas desde el inicio») no cabe en esos proveedores. Los grandes no lo sufren porque tienen pocas herramientas anchas. Se consulta al dueño antes de seguir.

## Set 2: F41, F43, F44 y F27 bis

- **F41, `fs.patch` con las dos formas.** Hoy, si el modelo manda la forma simple y `files` llenas y coherentes, se rechaza; GPT lo repite hasta que el vigilante corta el turno. **Cambio:** si la forma simple coincide con una entrada de `files`, se acepta. Si no coincide, se usa `files` y el resultado avisa que la forma simple se ignoró.
- **F43, skills que cambian el prompt del sistema.** Activar una skill marca `[active]` en el catálogo y mete su contenido en el sistema, así que la caché se rompe a mitad del sistema (por eso entre vueltas queda en 9.088 < 14.080). **Cambio:** el catálogo no cambia nunca, y la skill activada entra como mensaje añadido a la conversación, como en Claude Code.
- **F44, trabajo reutilizado sin decirlo.** El modelo copió la solución de otra carpeta y dijo «Corregí los bugs». **Cambio:** una regla general en la constitución: si reutilizas trabajo que ya existía, dilo. La contaminación de la batería (varias tareas en el mismo proyecto) es del montaje de la prueba, no de Rinari.
- **F27 bis (a), salidas distintas de cero que son éxito.** robocopy sale con 1 cuando copió bien, y cuenta como fallo. **Cambio, genérico:** la descripción de `shell` explica que hay programas que usan códigos distintos de cero para el éxito y que para eso está `expect_exit`. No se nombra ningún programa.
- **F27 bis (b), `verify.evaluate` con ids del checklist.** Recibe ids del checklist donde espera ids de tareas y responde `INVALID_ARGUMENT`. **Cambio:** aceptar los ids del checklist, o como mínimo que el error explique la diferencia y diga qué ids usar.

## F45: asentar las salidas viejas por presión, no por rondas

**Qué pasa.** `context/settle.py` deja intactas las 8 rondas más recientes y asienta las anteriores de 8 en 8: cambia los resultados largos de herramientas por una nota corta. Lo hace por cuenta de rondas, quepa o no el contexto. Cada vez que el corte avanza, cambia un trozo del medio del historial, y todo lo que viene detrás se vuelve a leer. En la nube es una pérdida de caché pequeña. Con un modelo local son decenas de miles de tokens de relectura de golpe: en qwen2/c1 la caché cayó de 84.769 a 16.384 en una llamada (~85 mil tokens de prefill).

**Cambio.**
1. Mientras el contexto quepa holgado, no se asienta nada. El historial solo crece al final.
2. Cuando la petición pasa de un umbral alto de la ventana (al empezar, el 60 %), se asienta de una sola vez todo lo viejo, hasta bajar a un umbral bajo (al empezar, el 35 %). Siempre se dejan intactas las rondas recientes. La presión se mide igual que para compactar (`context/tokens.py`, que compacta al 80 %).
3. El corte se guarda con la conversación, no se recalcula en cada llamada. Solo avanza la próxima vez que se pase el umbral alto. Se mantiene entre turnos y se reinicia al compactar.
4. `tools/read_cache.py` pregunta por ese mismo corte guardado, para no decirle nunca al modelo «ya lo leíste» de algo que ya no ve.
5. Si no se conoce la ventana del modelo, se queda el comportamiento actual por bloques, como respaldo.

Es genérico: solo usa la ventana y el conteo de tokens, que Rinari tiene para cualquier modelo. No mira el proveedor ni si es local o nube. Los dos umbrales son el punto de partida y se ajustan con las mediciones.

**Lo que ya existe y no cambia.** El tope de cada salida al entrar, que es lo que hace Codex:
- cada resultado entra con 64 KB como máximo (`observation_bytes`), la salida de un proceso con 16 KB, y una ronda entera con 256 KB;
- el resto va a un `artifact://` que se puede leer con `artifact.read`.

Lo que entra así ya no cambia nunca después.

**Queda fuera, como idea.** Asentar tras una pausa larga, cuando la caché del proveedor probablemente ya expiró y no hay nada que romper (lo que hace el microcompact de Claude Code). Cuánto dura la caché depende del proveedor, y en un servidor local no expira por tiempo sino al desalojarse, así que no se puede hacer genérico sin adivinar.

**Referencias.**
- La API de Anthropic hace lo mismo con su *context editing* (`clear_tool_uses`): `trigger` como umbral, `keep` para lo reciente y `clear_at_least` para que cada limpieza valga la caché que rompe.
- Hermes resume el medio de la conversación al 50 % de la ventana.
- Codex compacta cerca del 90 % y no toca el medio antes.

**Validación.**
- Pruebas de `settle` por presión: no cambia por debajo del umbral, salta una vez hasta el umbral bajo, el corte es estable entre llamadas y turnos, y el respaldo funciona sin ventana conocida.
- Coherencia con `read_cache`.
- Una sesión larga con un modelo local, para medir que desaparecen las caídas de caché a mitad del turno.

## Cards de Planka (Rinari Agent → Agent: Bug e Ideas-2)

Revisadas el 2026-10-19: 7 de Bug y 3 de Ideas-2, sin comentarios. Los datos salen de las sesiones del dueño (`state.db` en solo lectura). Todas corrieron con la Nightly 1050 (Engine 9231110). Rutas relativas a `v032-cli/src/rinari` o a `v032-agent`.

| # | Card | Qué pasa | Causa | Propuesta |
|---|---|---|---|---|
| P1 | Duplicar imagen (`ses_01M58KRZ…`) | Dos tarjetas «Entregado» con el mismo PNG. | `image.generate` entrega la imagen solo (`tools/native/image_create.py:241`), y su nota le dice al modelo «mírala antes de entregarla» (`:50`). El modelo entiende que entregar le toca a él y llama a `file.present`. La app separa las tarjetas por `present_id`, así que no las junta. Es del bloque 28, no de v2. | **Decidido con el dueño (2026-10-19), como con MCP:** `image.generate` ya no entrega la imagen sola. El modelo la mira y después la presenta con `file.present`, así queda una sola tarjeta y siempre revisada. La nota de revisión lo dice así. Además, se juntan los `file.presented` con el mismo `uri`/sha256 dentro de un turno, quedándose con el último pie de foto, por si un modelo la presenta dos veces. |
| P1b | (misma card) «Sin evidencia de que funcione» | El aviso de verificación sale en turnos que solo generan imágenes o capturas. | `_turn_requested_mutation` (`cli/agent_runtime.py:2068`) manda al control de cierre cualquier herramienta con `side_effects != NONE`: `image.generate` es remota reversible y `browser.screenshot` es local reversible. Sin registros, el control dice «implementado sin verificar». El modelo sí miró la imagen, pero eso no cuenta como evidencia. | **Decidido con el dueño (2026-10-19):** el control de cierre solo corre si el turno cambió archivos del proyecto (su changeset tiene archivos). Generar una imagen, hacer una captura o cualquier efecto fuera del proyecto ya no dispara «Sin evidencia de que funcione». |
| P2 | Quitar permisos de herramientas de imagen (`ses_01M58KRZ…`) | `image.generate` pide permiso con la suscripción de ChatGPT, aunque diga «included in the subscription». | `policy/engine.py:690-706` (`media_generate`) solo deja pasar en acceso total. La política recibe el costo como texto de pantalla, no como dato. El costo estructurado ya existe (`CostEstimate.basis` en `images/connectors.py:85`: incluido, local, por imagen o desconocido). Una herramienta de imagen MCP no pregunta (`engine.py:671`), así que la nativa es más estricta que MCP. | Pasar `cost_basis` a la acción clasificada. Si no hay gasto extra (`included` o `local`), no preguntar. Preguntar solo con costo de pago o desconocido. El precheck `over_budget` sigue siendo la guarda del dinero. Es genérico: depende de lo que el servicio declara, no de cuál es. |
| P3 | No se ve la imagen (`ses_01M58KZP…`) | La tarjeta de una imagen bajada del Lab sale sin vista previa: «No hay permiso para hacer esto: Engine-private file». | **v2 lo causó (V2-3).** `web.download` guarda en `~/.rinari/artifacts/<ses>/downloads/` y devuelve `path` y `uri`. El modelo pasa el `path` absoluto a `file.present`, que solo pone `uri` cuando recibe un `artifact://` (`tools/native/present.py:143`). La app pide esa ruta y `engine_protocol/desktop.py:384` la rechaza por estar en `~/.rinari`. El Engine deja leer esa ruta al modelo y el escritorio no: las dos reglas no coinciden. Pasa igual con capturas y con `image.generate`. | `file.present` traduce cualquier ruta del almacén de artefactos a su `artifact://`. Las herramientas que crean artefactos dan el `uri` como identificador principal y no exponen la ruta interna. |
| P4 | No usó la presentación de archivos para la imagen (`ses_01M5AC0T…`) | 75 capturas y ningún `file.present`. A veces la imagen va como markdown en la respuesta, otras no se muestra. | El modelo siguió la descripción de `browser.screenshot`, que dice que la muestre incluyendo el `markdown` que devuelve (`tools/native/browse.py:1047`, desde d2c3ecc). `file.present` habla de «entregables que hiciste», no de capturas. | Una sola regla para toda herramienta que produce algo visual (captura, imagen, descarga): para mostrárselo al dueño, `file.present` con el `uri`. Quitar la instrucción del markdown y el campo `markdown`, o que el Engine convierta un `![](artifact://…)` en tarjeta. |
| P5 | Captura con `UnknownVizError` (`ses_01M5AC0T…`) | `browser.screenshot` falla con «UnknownVizError» marcado como no reintentable. El modelo reintentó solo y funcionó. | Error pasajero del compositor de Chromium al copiar la superficie. Electron lo devuelve tal cual desde `capturePage()` cuando el panel está oculto, porque la vista vive en un contenedor de 1×1 (`BrowserRegistry.ts:69`). El host lo envuelve como `BROWSER_PROTOCOL` (`NativeBrowserHost.ts:625`) y el Engine lo vuelve `UNKNOWN` no reintentable (`browse.py:54`). Además, `browser_screenshot` arma su propio error sin `browser_error` ni `outcome` (`browse.py:421`). | El host reintenta la copia 2 o 3 veces ante los errores de copia de Chromium (`invalidate()` y esperar un cuadro). Si sigue fallando, devuelve `CAPTURE_TRANSIENT` reintentable con un mensaje claro. `browser_screenshot`, `open` y `snapshot` pasan por `_run`, para que el error llegue completo. |
| P6 | `browser.navigate` sin pestaña viva (`ses_01M59333…`) | `navigate` falla con `TARGET_NOT_FOUND` («la página ya no existe») cuando no hay ninguna pestaña. `launch` no abre ninguna y el modelo da vueltas hasta usar `browser.open`. | Sin `target_id`, el host busca la pestaña activa, que no existe en un contexto vacío (`BrowserRegistry.ts:370`), y lanza un error engañoso (`NativeBrowserHost.ts:928`). | Sin `target_id` y sin pestañas, `navigate` abre una nueva y lo dice (`opened_new_tab`). Con un `target_id` explícito que ya no existe sigue fallando, pero dice «no hay pestaña con ese id; usa browser.tabs o browser.open». El caso vacío lleva su propio mensaje. |
| P7 | Enviar ahora (`ses_01M58NWE…`) | «18 minutos y no veo mi imagen» se quedó en «Lo leeré al terminar el paso actual» hasta que el dueño pulsó Detener. | El mensaje en espera hace lo mismo que el *steer* de Codex: no corta, y entra en la siguiente vuelta al modelo. Pero **el paso nunca terminó**: el modelo pasó 22 minutos escribiendo los argumentos de una sola llamada (61 mil caracteres para una herramienta MCP), así que no hubo vuelta donde meter el mensaje. Codex habría esperado igual. La burbuja en espera solo deja editar o borrar (`SteerBubble.tsx:110`). El botón del composer que dice «Enviar ahora, sin detenerla» llama a `handleSteer(false)` y también espera (`components/composer/Composer.tsx:1033`). El corte suave de #31 solo se mira cuando llega texto visible (`runtime/agent.py:420`), y su bandera solo se limpia al saltar. «Detener» sí corta siempre. | **Decidido con el dueño (2026-10-19), tres piezas:** 1) **Por defecto, como Codex:** termina lo que está haciendo y lee. Ya existe y no se toca. 2) **«Enviar ahora» debajo del mensaje en espera, como Claude Code:** corta igual que Detener (cierra el stream del proveedor, cancela la herramienta en curso, descarta la llamada a medias y deja la marca de interrumpido) y envía el mensaje enseguida, con toda la conversación. Un comando de consola en primer plano pasa a segundo plano en vez de morir, como ya hace Detener. Sustituye al corte suave por texto visible; el texto del botón del composer se alinea con lo que hace. 3) **Las esperas se cortan cuando el dueño escribe:** `agent.wait`, `wait.for` y similares terminan en cuanto llega un mensaje, porque esperar no es trabajo que se pierda. Opcional: resaltar la línea «Escribiendo X… N KB» cuando una llamada crece de forma anormal, para que el dueño sepa que conviene «Enviar ahora». |
| P8 | La hija «no arrancó» (`ses_01M591M6…`) | Parecía que la sesión sugerida no había arrancado, pero sí estaba trabajando. | Era una **nieta**: la hija sugirió una sesión con `followup.suggest`, el dueño la aceptó y nació `ses_01M59309…`, que trabajó de 03:24 a 04:30. La barra lateral dibuja un solo nivel (`AppSidebar.tsx:326`), y `nestSessions` (`workspaceModel.ts:125`) ya la había sacado de la lista principal, así que no aparecía en ningún lado. En el chat de la madre no queda fila: al aceptar solo hay un toast y la nota se va (`StickyNote.tsx:79`). El Engine no registró ningún fallo ni un segundo intento. | **Decidido con el dueño (2026-10-19), como Claude Code:** 1) **La nota aceptada se vuelve una fila fija** en el chat que la sugirió («↳ Sesión abierta: *título* · trabajando [Abrir]»), con el estado en vivo (trabajando, esperándote, terminó) y un clic para abrirla. No desaparece al terminar la sesión. El toast puede quedarse como aviso, pero ya no es la única señal. 2) **La sesión que la abrió se entera** cuando la otra termina un turno. Hay que comprobar que pase también con las sesiones nacidas de una sugerencia aceptada (`followup.suggest`), no solo con las hijas creadas por herramienta. 3) **En la barra lateral, la nieta bajo su madre:** `tree()` recursivo (`AppSidebar.tsx:326`), con la sangría limitada a la profundidad del Engine (`DEPTH_LIMIT = 2`). Si una fila madre no se dibuja, la sesión cuelga del ancestro visible más cercano, para que nunca quede fuera de la lista. |
| P9 | Árbol de archivos (Ideas-2) | El árbol va encima del visor y ocupa media altura. El dueño lo quiere a la derecha, como Claude Code, con su panel interno redimensionable. | `SessionDock.tsx:511` apila árbol, visor y artefactos en columna (`dock-stack`). El dock ya tiene divisores redimensionables en su mosaico (`stores/sessionDock.ts`, `splitters`). | Con ancho suficiente, el visor a la izquierda y el árbol en una columna a la derecha, con el mismo divisor del mosaico y el ancho guardado por sesión. El árbol se pliega con un botón en la cabecera. En pantallas angostas queda como hoy. Va por la sesión de pulido de UI, por la regla de diseño. |
| P10 | Quitar «Nuevo» dentro del chat (Ideas-2) | La pastilla «● Nuevo · terminó hace 55 segundos» sale dentro de la conversación que se está mirando. | `ReturnPill` (`ReturnMark.tsx:56`) va dentro de `TurnResult`, que comparten el chat suelto y los paneles de Boards. Un turno queda «de vuelta» si la ventana no tenía el foco cuando terminó. | Una marca por superficie en `ReadTrackingContext` (`returnMark: false` en el chat suelto). El aviso de no leído sigue en la barra lateral y en Boards. |

**Visto de paso (sin card):**
- `fs.read_image` sobre una descarga guarda una segunda copia en `media/`.
- En las dos sesiones de imagen, el aviso «Runtime: you called tools without telling the user» provocó un reintento que perdió una llamada.

Se revisan con el dueño antes de entrar al plan.
