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
| F42 | Aprobado por el dueño (16be14d). Fase 1 hecha: CLI bb2b1ab y 5a045ba. Fase 2 hecha. Fase 2b hecha, con un A/B de la nota del turno: gana B, ver abajo (CLI 301392a, b161ffa). B es ya el comportamiento normal (CLI 2d83367). Pendiente: la validación corta que el dueño decida. |
| F46 | Fuera: nota externa. |

## F42: la lista de herramientas no cambia a mitad de la conversación

**Qué pasa.** Medido contra la suscripción de ChatGPT con el runtime real: basta con que la lista de herramientas cambie una vez a mitad de la conversación (por ejemplo, de 74 a 76 al activar algo) para que el backend deje de cachear hasta el final. Solo reutiliza las instrucciones, las herramientas y el primer mensaje (~12,5–14 mil tokens), aunque después la lista vuelva a ser estable. En la batería se congela justo después de `skills.activate`. Descartado con pruebas: el razonamiento devuelto, la nota de contexto, los `id`/`status` de los elementos y una clave de sesión por conjunto de herramientas. En chat completions con modelo local es el mismo daño por otra vía: las herramientas van al principio del prompt, así que cambiarlas obliga a releer todo.

**Por qué no basta con «todas desde el inicio».** Rinari registra 144 herramientas nativas (75 núcleo + 69 bajo demanda, ~18,8 mil tokens) y el tope de herramientas por petición depende del servidor, no del modelo: OpenAI Chat Completions pone 128 según su documentación (no lo hemos medido en vivo) y la API propia de DeepSeek también documenta 128, mientras que DeepSeek y GLM por opencode-go-2 y Qwen local por llama.cpp aceptaron 139 (medido 2026-10-19). Como no se puede saber el tope de cada servidor sin una tabla por proveedor (regla de cero hardcodeo), hay que quedar por debajo de 128 en todos. Además, mandarlas todas sube el coste fijo de cada llamada.

**Decisión (dueño, 2026-10-19).** Sustituye a la versión anterior de F42 (dos modos según el protocolo, con todas las herramientas desde el inicio donde no hay diferido nativo; ver daeef75), que no cabe en el tope de 128. Esa versión descartaba una herramienta despachadora porque los agentes grandes no la usan; el dueño la elige porque es la única forma que funciona igual en todos los protocolos.

**Acuerdo entre sesiones (2026-10-19).** La sesión que implementa la v3 y la de la batería de uso real revisaron esta versión y cerraron los huecos de abajo (MCP, cuándo se rehace la lista, skills, `capability.activate`, errores de la puerta y validación por fases). Falta el visto bueno del dueño; no hay código.

**Cambio.**
1. **Lista fija por conversación.** La lista de herramientas se decide al empezar la conversación y no cambia nunca: ni se añade, ni se quita, ni se reordena, en ningún turno. `capability.activate` deja de tocarla, y la cola de recientes de `tools/exposure.py` (que hoy mueve al final cada herramienta usada) no afecta ni al orden ni al contenido. El orden es el de registro, siempre el mismo, nunca por uso.
   - **Contenido:** solo el núcleo nativo más la puerta. Las herramientas de MCP y conectores van siempre por la puerta: un servidor grande nos pasaría del tope y conectarlo a mitad de la conversación cambiaría la lista. La lista de servidores conectados va en la nota de contexto del turno (al final, fuera del prefijo), no en las herramientas.
   - **Cuándo se rehace:** solo en puntos donde la caché se pierde igualmente: al cambiar de modelo o de proveedor y al compactar. Un cambio de modo o de permisos no la toca; solo cambia la política.
   - **Herramienta desactivada a mitad de conversación** (en Ajustes): no se quita de la lista; la política la rechaza con un mensaje claro y desaparece en el siguiente punto de rehacer.
   - **Subagentes:** cada uno tiene su propia lista fija, porque es su propia conversación, con el mismo núcleo para compartir prefijo donde el servidor lo permita.
2. **Una puerta fija para lo bajo demanda.** Una herramienta más, siempre presente, del estilo `tool.call(name, arguments)`. `capability.search` (o `capability.activate`) devuelve en su resultado el esquema completo de la herramienta encontrada y la llamada exacta lista para copiar; el modelo la usa con `tool.call`, y el Engine valida `arguments` con el esquema real de esa herramienta (el mismo validador y normalizador de hoy) y la ejecuta. El esquema viaja en el historial, que solo crece por el final, así que no rompe la caché.
   - `arguments` va como texto JSON: el modo estricto de OpenAI no admite objetos libres, y el Engine ya acepta argumentos como texto desde V2-8.
   - Permisos, aprobaciones, timeline y registro usan el nombre real (`documents.create`), no `tool.call`: la puerta solo es el transporte.
   - Si el modelo llama directamente por su nombre a una herramienta registrada que no está en la lista, el Engine la enruta igual (la misma tolerancia que con nombres y parámetros alternativos). Con proveedores estrictos esa llamada directa puede no salir, por eso la puerta es el camino documentado.
   - `tool.call` sobre una herramienta que ya está en la lista se ejecuta igual, sin error.
   - `tool.call` con un nombre que no existe o con `arguments` que no es JSON válido devuelve un error recuperable con las 3 coincidencias más cercanas de la búsqueda y el esquema correcto, para no gastar una vuelta en buscar. La guarda de bucles no lo cuenta como repetición del mismo fallo si el modelo corrige.
   - `capability.search` encuentra también las herramientas MCP, con el servidor en el resultado.
   - `capability.activate` se queda como alias de buscar: devuelve el esquema y la llamada lista para copiar, sin cambiar la lista, para no romper instrucciones ni skills que la nombran.
   - **Skills:** el mensaje de la skill activada (F43, ya va en el historial) incluye la llamada `tool.call` exacta de cada herramienta suya que no está en la lista. Ese texto es determinista (sin ids ni horas), para que dos activaciones iguales den lo mismo.
3. **Núcleo más pequeño, elegido por categoría y comprobado con datos.** El núcleo se define por lo que necesita cualquier sesión del modo (código, chat…), nunca por los hábitos de una cuenta (regla de cero hardcodeo). Referencia con las 183 sesiones del dueño (12.884 llamadas): 20 herramientas cubren el 77 % de las llamadas, 40 el 90 % y 60 el 95 %. Un núcleo de ~40–60 más la puerta queda muy por debajo de 128 y manda menos tokens de esquemas que hoy.
4. **Diferido nativo, solo como optimización.** Donde el protocolo tenga un mecanismo propio que no rompa la caché (Anthropic `defer_loading`, Responses `tool_search`), se puede usar encima; la puerta funciona sin él y es el camino por defecto. Medido 2026-10-19 en Responses (suscripción ChatGPT): 139 herramientas con 64 diferidas y `{"type":"tool_search"}` se aceptaron, el modelo buscó y llamó una diferida, y la caché quedó en 97 %.
5. **Prefijo estable también entre vueltas.** Ya resuelto con F43 (el catálogo de skills no cambia y la skill activada entra como mensaje) y F45 (asentar por presión). F42 no lo vuelve a tocar.

**Guardas contra regresiones.**
- Una prueba por protocolo (Chat Completions, Responses, Anthropic) que arme dos peticiones seguidas de la misma conversación, con una activación de por medio y una vuelta nueva, y exija que la segunda empiece byte a byte igual que la primera salvo la nota volátil del final.
- En el diagnóstico, por llamada: tokens reutilizados de caché y un hash del bloque sistema + herramientas; si el hash cambia a mitad de conversación, se registra un aviso con lo que lo cambió.

**Riesgos.** Un modelo flojo puede liarse con la indirección: se mitiga con la llamada exacta en el resultado de la búsqueda y con un núcleo que cubra la mayoría de los casos sin pasar por la puerta. Lo poco común cuesta una vuelta extra (buscar y llamar), igual que hoy (buscar y activar). Los argumentos mal escapados se cubren con el normalizador actual y con errores que muestran el esquema.

**Fuera de F42.** El enum sin `type` que Kimi rechaza (`status` de `checklist.update`) ya existía y se arregla aparte, como corrección de esquema propio.

**Validación, por fases.** El dueño aprueba antes la lista exacta de destinos y el número de llamadas de cada fase con proveedores.
1. **Sin llamadas:** código, fixtures y la prueba byte a byte por protocolo. Coste cero.
2. **3–4 llamadas en vivo**, aprobadas una por una antes de lanzarlas.
3. **La batería** con su aprobación previa de destinos y volumen: la batería del Set 2 con GPT por la suscripción, DeepSeek y Qwen local: caché llamada a llamada en C1 (3 vueltas) y en tareas con activaciones. Se espera que luna crezca en cada llamada como DeepSeek (82 → 95 %) en vez de quedarse en 14.080, que entre vueltas se reutilice casi toda la conversación anterior, y que qwen deje de releer el prompt al activar herramientas. Referencia de hoy: luna C1 1,97 M de entrada con 40 % de caché.

**Fase 1, cómo quedó (CLI bb2b1ab, sin llamadas a proveedores).**
- **Dónde vive la lista.** `tools/exposure.py` la decide en la primera petición y la guarda con la sesión en `~/.rinari/sessions/<id>.state.json`, con una clave (modelo, revisión de la compactación y versión del Engine). El escritorio arma un runtime por turno; cada turno manda la lista guardada tal cual. Si la clave cambia, la lista se decide otra vez en esa misma petición, así que solo hay un corte de caché. Se borra con la sesión.
- **Núcleo: de 74 a 53 herramientas, puerta incluida.** Salen las especializadas: búsqueda de código (`search.files`, `.hybrid`, `.references`, `.symbols`), lectura web fina (`web.extract_*`, `.links`, `.cite`, `.find`, `.sources`), `http.sse`, historial de git (`git.log`, `.show`, `.branch`), mantenimiento de memoria (`memory.forget`, `.update`), `project.instructions.propose`, `fs.diff` y `capability.deactivate`. En las sesiones del dueño son el 0,47 % de las llamadas (62 en 27 sesiones). `audio.transcribe` y `fs.read_pdf_pages` se quedan, porque los adjuntos las nombran.
- **Herramientas que un turno necesita y no están en la lista.** Son las de `/init`, las de una skill fijada desde la app y las que se vuelven disponibles después (un objetivo puesto más tarde). Van en una nota justo después del mensaje del dueño, con su `tool.call` exacta. El texto es siempre igual y se dice una vez por conversación.
- **El índice de lo conectado** (MCP, OpenAPI y plugins) pasó del prompt del sistema a la nota del turno. El de los paquetes nativos bajo demanda sigue en el sistema.
- **Guardas.**
  - `tests/unit/test_cache_prefix.py` pasa una conversación con activación, puerta y vuelta nueva por los adaptadores de Chat Completions, Responses y Anthropic. Exige las mismas herramientas y el mismo prefijo en cada petición.
  - Cada petición lleva el hash de sistema y herramientas en `BeforeModel`. Si cambia, `rinari.cache` lo registra: aviso si nadie lo esperaba, info si fue por otro modelo o una compactación.
- **De paso, F45.** El corte de `settle` se guardaba solo en memoria, así que en el escritorio se decidía de nuevo en cada turno. Ahora se guarda con la sesión, con el id del mensaje como ancla.

**Fase 2, resultado (2026-10-19, aprobada por el dueño).** Una conversación de 2 turnos por destino, cada turno con su propio runtime como en el escritorio, y un tope de 6 llamadas por destino. La consigna fue «Usa la herramienta fs.diff para comparar a.txt con b.txt», y `fs.diff` está fuera de la lista.

| Destino | Llamadas | Caché por llamada (después de la primera) | Puerta |
|---|---|---|---|
| ChatGPT (suscripción), `gpt-6-luna`, medio | 5 | 90 %, 89 %, 87 %, 87 %: se queda en 11.264 | search → activate → `tool.call` fs.diff |
| opencode-go-2, `deepseek-v4.1-flash` | 4 | 96 %, 97 %, 97 % | activate → `tool.call` |
| opencode-go-2, `glm-5.3-flash` | 4 | 83 %, 96 %, 93 % | activate → `tool.call` |
| Anthropic API, `claude-sonnet-5-5`, bajo | 4 | 98 %, 98 %, 99 % | activate → `tool.call` |
| xAInner, `qwen3.8-flash-next-ud-q4_k_xl` | 4 | 97 %, 95 %, 94 %: se queda en 14.774 | activate → `tool.call` |

- **Lista y sistema estables.** El hash de las herramientas fue el mismo en las 21 llamadas de los 5 destinos. El del sistema no cambió dentro de ninguna conversación, y no hubo ningún aviso de `rinari.cache`.
- **La puerta funciona en los 5.** Cada modelo pidió la llamada exacta con `capability.activate` o `capability.search`, llamó `tool.call` y `fs.diff` se ejecutó bien a la primera. No hubo errores de la puerta.
- **Para mirar en la fase 3.**
  - En luna, la caché no crece de 11.264 aunque la petición sí crezca. No se sabe si es la granularidad del backend de Codex o otra cosa.
  - En Qwen local se queda en 14.774: relee unos 400–900 tokens por llamada. Probablemente el servidor no reutiliza el turno del asistente tal como lo vuelve a dibujar la plantilla.
- **Un primer intento falló por el script de prueba, no por el Engine.** `sessions.start` reutilizó la misma conversación para los 5 destinos, así que las 12 llamadas fueron a la suscripción de ChatGPT y los otros 4 no recibieron ninguna. Ese intento movió además el `cwd` en el sistema, que es lo que avisó la guarda. Por eso el aviso ahora nombra el segmento que cambió (CLI 5a045ba).

**Investigación sin llamadas (CLI 301392a).**
- **Rinari reenvía bien la conversación.** Se probó una conversación con la forma del escritorio: runtime nuevo por turno, guardar y recargar, y continuaciones de Responses y de Chat con razonamiento. Cada petición repite tal cual los mensajes anteriores, razonamiento incluido. La guarda ahora lleva también un hash por mensaje y avisa en el primero que se reenvíe distinto.
- **La plantilla de Qwen no es la causa.** La plantilla pública de Qwen3-Next, renderizada con jinja2, da peticiones que empiezan igual que la anterior hasta donde estaba su nota.
- **La diferencia con codex-rs es la nota.** Los campos del payload son los mismos que los nuestros. Pero Codex guarda sus recordatorios en el historial (`record_conversation_items`), así que cada petición es una extensión pura de la anterior. Rinari ponía la nota del turno al final y la quitaba en la siguiente petición.

**Fase 2b: A/B de la nota del turno (2026-10-19, aprobada por el dueño).**
- **A:** la nota va al final de cada petición, como hasta ahora.
- **B:** la nota entra en el historial cuando cambia y se queda allí (`RINARI_EXPERIMENT_TURN_STATE=history`, CLI b161ffa).

Cada brazo fue una conversación nueva: un turno leyendo 6 archivos de uno en uno y otro con una pregunta. En total, 81 llamadas, porque DeepSeek A usó 9.

La tabla da cache(k) − entrada(k−1) de las llamadas 2 a 8. Un valor cerca de 0 significa que reutiliza toda la petición anterior.

| Modelo | A (nota al final) | B (nota en el historial) |
|---|---|---|
| `gpt-6-luna` (suscripción) | −199 a −801, por escalones (11.136 → 11.904) | −86 a −202, crece en cada llamada |
| `qwen3.8-flash-next` (local) | −160 a −1.464, plano en 14.773 | +42 a +139, crece en cada llamada |
| `deepseek-v4.1-flash` | −110 a −210 | −17 a −124 |
| `glm-5.3-flash` | −356 a −722 (y −6.216 en la 2ª) | −1 a −56 |
| `claude-sonnet-5-5` | −135 a −137 | −2 |

- **B mejora los 5 modelos.** En luna y en Qwen arregla la meseta. En los demás reutiliza también los ~130 tokens de la nota.
- **En Qwen se confirma la causa.** Es un modelo híbrido con capas recurrentes: llama.cpp no puede recortar el final del caché y vuelve a un checkpoint. Con B nunca hay nada que recortar.
- **Sin efectos secundarios.** Las 6 lecturas salieron bien en los 10 brazos, y no hubo ningún aviso de `rinari.cache`.

**B como comportamiento normal (dueño, 2026-10-19; CLI 2d83367, sin llamadas).**
- **Cómo funciona.** El estado del turno es una nota del harness guardada en el historial. Se escribe solo cuando su contenido cambia respecto a la última nota guardada, y nunca se reescribe ni se quita. La primera vez va justo después del mensaje del dueño; si cambia a mitad de turno, va como mensaje nuevo. `RINARI_TURN_STATE=trailing` vuelve a la nota final durante una versión; luego se borra.
- **No se lee como palabras del dueño.** No la leen:
  - la captura de memoria;
  - el objetivo y las restricciones del estado compactado;
  - el resumen de la compactación (después de compactar se escribe una fresca);
  - la timeline de la app, que ya omitía los mensajes del harness.

  La exportación de diagnóstico lleva el `origin` de cada mensaje.
- **Pruebas.**
  - Extensión pura en Responses, Chat y Anthropic, con guardar y recargar por turno.
  - Una nota a mitad de turno en Anthropic, que mantiene la alternancia de roles.
  - La memoria no captura la nota.
  - Las pruebas que asumían la nota final se adaptaron.

  Suite completa: 3.688 + 88.
- **Posible mejora, sin hacer.** Codex escribe su contexto antes del mensaje del usuario; aquí va después, que es como se midió en la 2b. Ponerlo antes obliga a guardar la nota antes que el mensaje del dueño, que hoy se guarda primero por la memoria.

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
