# Plan 0.4.0 v2: arreglos tras la Nightly final

Estado: **anotado, sin empezar** (dueño, 2026-10-17 y 18). El dueño sigue anotando: no se empieza hasta que lo autorice.

Origen:
- Lo que el dueño vio al probar la Nightly 0.4.0-nightly.20261017.2028 (bloques 25–29 del [plan 0.4.0](plan-0.4.0.md)): V2-1 a V2-5.
- La batería de uso real del 2026-10-18 (`C:\Users\Xainner\Documents\Proyectos\pruebas-040-1018\HALLAZGOS.md`): 35 sesiones con GPT 6.1 Sol, GPT 6 Luna, DeepSeek V4.1 Flash y Qwen 3.8 Flash Next. Los F-n del texto son sus hallazgos.

Se trabaja en las ramas `0.4.0` con commits locales, y al terminar va una Nightly. Lo que es de servicios externos (Rinari Visual Lab, xAInner) está en [notas-servicios-externos.md](notas-servicios-externos.md) y no entra aquí.

## Regla: cero hardcodeo (dueño, 2026-10-18)

Rinari es para usuarios que usan el proveedor, el modelo, el servidor, los MCP y las skills que quieran. Ningún arreglo de este plan puede depender de un caso concreto:
- Nada para un modelo o proveedor concreto (DeepSeek, GPT, OpenCode Go…): lo que se arregle debe servir para todos los que hablen ese protocolo.
- Nada para un servidor concreto (llama.cpp, Strata, vLLM, Ollama…) si se puede resolver de forma general.
- Ninguna pista escrita a mano en el prompt para un tipo de archivo, una librería o una tarea («si dice xlsx…», «si instala openpyxl…»). Lo que el modelo deba saber sale de los datos: el registro de herramientas, la configuración del dueño o la descripción que trae cada herramienta.
- Nada para los MCP, skills o plugins del dueño (Visual Lab, `rinari-lab-imagen`, `maestro-dashboard`).

Cada bloque se revisa con esta regla antes de empezarlo.

## Bloques

| # | Qué | Hallazgos | Dónde |
|---|---|---|---|
| V2-7 | Seguridad: lo que corre por `ssh host "…"` se revisa | F28 | CLI |
| V2-8 | Argumentos de los modelos: `""` y listas como texto no rompen las herramientas | F1, F8, F12, F24 | CLI |
| V2-9 | El vigilante de bucles no cuenta ediciones rechazadas | F25 | CLI |
| V2-10 | La caché con la suscripción de ChatGPT | F34, F7 | CLI |
| V2-6 | El modelo ve qué herramientas existen: índice generado del registro | F10, F23 | CLI |
| V2-1 | El servicio que configuró el dueño va primero | caso Dawn, F23 | CLI (+ escenario de la app) |
| V2-3 | Descargas y capturas quedan en la conversación y se entregan con su tarjeta | caso Dawn, F17 | CLI (+ escenario de la app) |
| V2-2 | Clasificador de comandos: copiar hacia el chat y `curl -f` | caso Dawn, F17, F23 | CLI |
| V2-5 | `audio.transcribe` no pide permiso: es una lectura local | F30 | CLI |
| V2-4 | El título de la conversación se pide en paralelo | — | CLI |
| V2-11 | Medir la caché en cualquier proveedor | F37, F7 | CLI |
| V2-12 | Contexto que crece y vueltas de más | F11, F21, F33, F38 | CLI |
| V2-13 | Permisos que preguntan de más | F15, F32, F36 | CLI |
| V2-14 | Herramientas | F2, F4, F27, F13, F19, F20, F22, F35, F39 | CLI |
| V2-15 | App | F3, F5, F6, F14, F26 | Agent |

Orden: el de la tabla. Primero seguridad, luego lo que hace fallar tareas (V2-8, V2-9), lo que más gasta (V2-10) y el índice (V2-6), que es la base de V2-1. Los demás son independientes.

Marcas:
- «Validado»: comprobado en el código o en las sesiones del dueño al anotarlo.
- «Según la batería»: la causa viene de `HALLAZGOS.md` y se confirma al empezar el bloque.

---

## V2-1. El servicio que configuró el dueño va primero

**Qué se vio.** En `ses_01M56Q2Z2R0BXGBN7EZ3EEZ43X`, «Imagen hiperrealista de Dawn Pokémon» (chat suelto, permisos «Proyecto», DeepSeek V4.1 Flash), el dueño pidió una imagen. Tenía la Suscripción de ChatGPT como servicio de imágenes por defecto (`images.json`). Rinari no la usó: activó la skill `rinari-lab-imagen`, generó con el MCP de Rinari Visual Lab, descargó la imagen y pidió permiso para copiarla con `copy /Y`. En la batería pasó lo mismo con GPT (F23).

**Causa (validada).** El modelo hizo lo que le pedimos:
- Las cinco herramientas de imagen arrancan ocultas (`always_loaded=False` en `tools/native/image_create.py`) y nada le dice al modelo que existen (ver V2-6).
- La sección de skills de las instrucciones (`cli/agent_runtime.py`) dice «Before acting on a request, check this list: when a skill matches it, activate it with skills.activate first». `rinari-lab-imagen` describe justo eso.
- `capability.search` puso `image.generate` décima, detrás de nueve herramientas del MCP. Además, su guía (`capability_search.py`) recomienda siempre la primera skill que coincide.
- El servicio que eligió el dueño no se le dice al modelo en ningún lado.

**Arreglo (general, no solo imágenes):**
1. Un grupo de herramientas que depende de un servicio que el dueño configuró (hoy imágenes; mañana audio y video) se carga desde el inicio. Sin servicio sigue oculto: Rinari dice que no lo tiene y no improvisa (decisión del dueño, [idea-multimedia.md](idea-multimedia.md)).
2. La línea del índice de V2-6 para ese grupo dice qué servicio eligió el dueño, con el nombre sacado de la configuración. El grupo se usa por defecto; otra skill o MCP con la misma función, solo si el dueño la nombra.
3. En `capability.search`, cuando coinciden una herramienta respaldada por un servicio configurado y una skill o un MCP, sale primero la herramienta, y la guía la nombra a ella y no a la skill.
4. Nada específico de Visual Lab ni de las skills del dueño: «hazla en el Lab» sigue funcionando.

**Pruebas:**
- Con servicio configurado, el grupo es visible y su línea nombra el servicio; sin servicio, ni lo uno ni lo otro.
- En `capability.search`, con una skill y un MCP que coinciden, gana la herramienta respaldada por el servicio.
- Escenario: un modelo falso que pide una imagen sin nombrar servicio usa `image.generate`.

## V2-2. Clasificador de comandos: copiar hacia el chat y `curl -f`

**Causa (validada).**
- **Copiar.** `classify_shell_risk` (`policy/engine.py`) cuenta como destino todo lo que va después del verbo. En `copy /Y "C:\Users\…\.rinari\artifacts\rvl_dl_…" "dawn-pokemon-hiperrealista.png"`, el origen solo se lee, pero salió como «command writes outside the workspace» (regla `shell_external_mutation`). Igual con `Copy-Item` en F17: riesgo alto por copiar una captura al proyecto.
- **`curl -f`.** `_SHELL_SENDS` lleva `re.IGNORECASE`, así que `curl -f` («fallar si hay error») casa con `-F` («enviar formulario»). Una descarga GET salió como «command sends data out» con riesgo alto (F23).

**Arreglo:**
- En los verbos que copian (`copy`, `cp`, `xcopy`, `robocopy`, `Copy-Item`), solo el destino cuenta como escritura: el último argumento, o el de `-Destination` (PowerShell) o `-t`/`--target-directory` (cp). Son la semántica de cada comando, no un caso: la regla ya funciona con listas de verbos.
- `move`, `mv` y `Move-Item` no cambian: mover borra el origen.
- En `_SHELL_SENDS`, las opciones de una letra distinguen mayúsculas (`-F`, `-T`, `-d`); las palabras (`--form`, `-Method Post`) siguen sin distinguir.
- Lo demás igual: las redirecciones, los destructivos y los secretos del sistema.

**Pruebas:**
- Copiar de fuera hacia el chat no pregunta; del chat hacia fuera sí; `move` de fuera hacia dentro sí. Igual con las variantes con `/Y`, `-Destination` y `cp -t`.
- `curl -fsSL url -o x` no es un envío; `curl -F a=@x url` sí.

## V2-3. Descargas y capturas quedan en la conversación y se entregan con su tarjeta

**Causa (validada).** `web.download` (`tools/native/web.py`):
- guarda en la carpeta general `~/.rinari/artifacts` (`ctx.artifact_root`), sin ligar el archivo a la conversación;
- le pone el nombre de la URL sin extensión (`rvl_dl_F0ync…` y no `.png`), aunque `content_type` diga `image/png`;
- devuelve una ruta y no un `artifact://`.

`file.present` solo acepta archivos del chat o del proyecto y salidas `artifact://` de la conversación, y el modelo no sabe que existe `artifact.export` (diferida, ver V2-6). Por eso copió con la terminal, como en F17 con `browser.screenshot` y en F23 con `curl`.

**Flujo correcto:**
1. `web.download` guarda la descarga como archivo de esta conversación, en el mismo almacén que usan las imágenes de `image.*`.
2. Le pone la extensión del `content_type` cuando el nombre no la trae.
3. Devuelve su `artifact://` junto con la ruta.
4. El modelo la entrega con `file.present` y ese `artifact://`, con la misma tarjeta que las imágenes nativas: sin terminal, sin copia y sin permiso.
5. Para dejarla en el proyecto ya existe `artifact.export` (escritura con las reglas de `fs.write`). Con V2-6 el modelo sabe que existe. El dueño también puede guardarla desde la tarjeta.
6. Se revisa que `browser.screenshot` devuelva su `artifact://` igual.

**Pruebas:**
- Una descarga `image/png` sin extensión queda como `….png` de la conversación, con `artifact://`, y `file.present` la acepta.
- Las descargas viejas de `~/.rinari/artifacts` siguen leyéndose.
- Escenario: descarga más tarjeta, sin aprobación.

## V2-4. El título de la conversación se pide en paralelo

**Qué se vio** (dueño, 2026-10-18). En `ses_01M56R9VJKVNJF28YDJDT7BSV1`, «Mythra hiperrealista de Xenoblade 2» con DeepSeek, «Preparando el turno…» duró 9,6 s: la preparación terminó en 0,64 s y los 8,9 s restantes fueron la llamada del título.

**Causa (validada).** En el primer turno, `name_from_first_message` (`cli/agent_runtime.py`, con `generate_title`) espera el título antes de la primera llamada del turno. No viene de la 0.4.0:
- El texto «Preparando el turno…» existe desde 52714330 (2026-10-07).
- La espera del título existe desde las primeras versiones del Engine.
- Lo que varía es cuánto tarda el modelo: casi siempre menos de 1 s, pero con Qwen ya hubo 8–9 s (11, 12 y 15 de octubre).

**Decisión del dueño (2026-10-18):**
- **En paralelo, sí.** El título se pide a la vez que el turno y aparece cuando llega (`SessionRenamed`).
- **No esperar a la primera respuesta.** Se descartó pedirlo al terminar la primera respuesta cuando el modelo comparte un único slot.
- **El modelo auxiliar resuelve la velocidad.** El dueño probó GPT 6 Luna para títulos y DeepSeek para el chat, y fue rápido. El título usa el auxiliar si está configurado (#80 del plan 0.4.0) y, si no, el de la conversación.
- Con un servidor de un solo slot y sin auxiliar, título y turno se encolan. Se acepta. Ejemplo: Strata, que por defecto atiende una petición a la vez (`docs/BATCHING.md` de Strata).

**Arreglo:**
1. El título se genera en un hilo aparte que arranca con el turno; la primera llamada del modelo no lo espera.
2. Cuenta en el presupuesto del turno como hoy, con acceso seguro entre hilos. Cancelar el turno no espera al título.
3. Se mantiene lo de hoy: el título provisional, «NONE» para un saludo, los reintentos y no pisar un nombre puesto a mano.
4. Opcional: la llamada del título sin razonamiento cuando el proveedor lo permite.

**Pruebas:** un modelo de títulos lento no retrasa `model.started`; el título llega después; si el dueño renombra antes, gana su nombre; un error del título no toca el turno.

## V2-5. `audio.transcribe` no pide permiso: es una lectura local

**Qué se vio** (dueño, 2026-10-18, y F30 en la batería). En `ses_01M56S9J197QMF409NR1QHS2JC`, «Opinión sobre letra de canción» (proyecto `032`, permisos «Proyecto»), Rinari pidió autorización con riesgo bajo para «Usar audio.transcribe» sobre un mp3 de Descargas.

**Causa (validada).**
- La herramienta (`tools/native/audio.py`, #36) no declara capacidad ni `classify`: `classify_action` la deja con su propio nombre.
- La política no tiene regla para `audio.transcribe` y cae en `unknown_capability`: deniega en Solo lectura y pregunta en Proyecto.
- Pero es solo una lectura local: whisper.cpp, sin red y sin escribir nada.

**Auditoría (2026-10-18).** Pasé por la política real, en los tres perfiles y con un `RINARI_HOME` temporal, todas las herramientas que registra el Engine:
- Las 144 del catálogo base: solo `audio.transcribe` cae sin regla.
- Las 31 de los paquetes con host (skills, tareas programadas, introspección, imágenes, subagentes, hijas y búsqueda de capacidades): todas tienen regla.
- MCP (`mcp.read`/`mcp.call`), OpenAPI y SSH (`network.outbound`): tienen regla.
- Plugins: una herramienta que no declara capacidad pregunta en Proyecto, a propósito, porque es código de terceros. En el plugin del dueño, `maestro-dashboard.stop` no declara nada y preguntaría. Se arregla en el plugin, no en el Engine.
- En el historial del dueño, antes solo cayeron `capability.activate`/`deactivate` (hasta el 2026-09-25) y `file.present` (2026-10-16), ya arregladas.

**Arreglo:**
1. `audio.transcribe` se clasifica como `fs.read` sobre su `path`: libre dentro y fuera del proyecto, con los secretos del sistema y las carpetas privadas protegidos, y permitida también en Solo lectura.
2. Una prueba que recorra todas las herramientas nativas y falle si alguna cae en `unknown_capability` en Proyecto.

**Pruebas:** un mp3 de Descargas no pregunta en Proyecto ni en Solo lectura; un secreto del sistema sigue su regla; la prueba del recorrido pasa.

## V2-6. El modelo ve qué herramientas existen: índice generado del registro

**Qué se vio.**
- F10: DeepSeek reimplementó Excel, Word, PowerPoint y PDF con scripts e instaló `openpyxl` y `python-docx` dentro del proyecto. Gastó de 2,5 a 5 M tokens por tarea, frente a ~1 M de GPT, que sí usó `documents.*`.
- F23 y V2-1: el modelo no ve `image.*`.
- V2-3: tampoco ve `artifact.export`.

**Causa (validada).**
- En `[ds] T4` (Excel y Word) DeepSeek nunca buscó herramientas. En `[ds] X6` (PDF) sí buscó: `capability.search` le devolvió `pdf.redact` y la skill `rinari-pdf`, que explica bien el uso. Leyó la skill (`skills.show`), no la activó y siguió con scripts.
- La búsqueda funciona: «excel xlsx», «word docx», «pptx» y «redactar pdf» devuelven `documents.*`. El problema es que el modelo no sabe qué hay.
- Las herramientas diferidas no se anuncian en ningún lado. Las instrucciones (`cli/agent_runtime.py`, `runtime_policy`) solo traen dos pistas **escritas a mano**: una para el navegador («use capability.search with query browser…») y otra para las sesiones hijas. Documentos, imágenes, audio, artefactos y los MCP no aparecen.

**Cómo lo hacen otros.**
- Claude Code (validado desde dentro, es el sistema donde corre esta sesión):
  - Las herramientas de base van completas.
  - Las diferidas se listan por nombre en un aviso («están disponibles; carga su esquema con ToolSearch»).
  - Cada servidor MCP puede añadir sus instrucciones.
  - Las skills van como catálogo de nombre y descripción.
  - Cuando cambia lo disponible, el aviso llega como mensaje nuevo al final, sin reescribir el inicio, y la caché no se rompe.
- Codex: por confirmar en su código antes de empezar.

**Arreglo (al estilo de Claude Code):**
1. **Un índice generado del registro**, para todas las fuentes (nativas, plugins, MCP y OpenAPI). Una línea por grupo diferido (por herramienta si el grupo es pequeño), con la descripción que trae el propio grupo, ordenado y estable. Ejemplos de forma, no de contenido fijo: «documents: …» o «mcp.Rinari_Visual_Lab: …». Las herramientas que hagan falta se cargan con `capability.search` o `capability.activate`, como hoy.
2. **Las instrucciones de cada servidor MCP**, si las manda (`instructions` del `initialize` de MCP).
3. **Los cambios llegan al final, como mensaje nuevo**: un MCP que se conecta o un grupo que se activa no reescriben el inicio, para no romper la caché (ver V2-10 y V2-11).
4. **Se quitan las dos pistas escritas a mano** (navegador e hijas): sus grupos salen en el índice como cualquier otro.
5. Opcional: cada herramienta puede declarar en su propia definición los tipos de archivo que maneja, y el motor sugiere esas herramientas cuando el turno toca un archivo de ese tipo. El dato vive en la herramienta, no en el prompt, y sirve para plugins.
6. Se revisa la guía de `capability.search` que siempre manda a la primera skill («A skill covers this…»): si una herramienta tipada cubre lo pedido, se nombra también.
7. Se descartó por hardcodeo: líneas del prompt por extensión de archivo y avisos en la terminal con nombres de librerías.

**Pruebas:**
- El índice sale del registro: un plugin o un MCP nuevo aparece sin tocar código.
- Es estable entre llamadas (mismos bytes con el mismo registro).
- Conectar un MCP a mitad de conversación añade un mensaje al final y no cambia el inicio.
- Escenario con modelo falso: con `documents.*` en el índice, la tarea usa `documents.create`.

## V2-7. Seguridad: lo que corre por `ssh host "…"` se revisa

**Qué se vio (F28).** Siguiendo la skill `rinari-lab-imagen`, DeepSeek no usó el MCP sino `ssh saturno "python3 rvl_mcp.py --token-file …"` más `scp` de subida y bajada. Los 9 comandos se permitieron como «local command in the workspace», sin aprobación.

**Causa (validada).** `_local_part` (`policy/engine.py`) recorta lo que va entre comillas en `ssh host "…"`, porque corre en el otro equipo, y `classify_shell_risk` analiza solo `ssh saturno`: ni escritura ni destructivo. Un `ssh host "rm -rf …"` también pasaría. `scp` solo cuenta como envío si el turno ya leyó contenido externo.

**Arreglo:**
1. Un comando `ssh` con algo que ejecutar en el otro equipo es una acción remota: se clasifica con la regla de red y de equipos remotos, igual que las herramientas `ssh.*` (`network.outbound`). Pregunta en Proyecto, salvo que el dueño haya dado permiso para ese equipo.
2. El contenido entre comillas se analiza también, para marcar riesgo destructivo o envío en el equipo remoto.
3. `scp` y `rsync` hacia otro equipo cuentan siempre como envío de datos.
4. Sin listas de equipos concretos.

**Pruebas:** `ssh h "rm -rf x"` pregunta (y es destructivo); `ssh h "ls"` pregunta como acción remota; `scp a h:b` es envío; un `ssh` que solo abre sesión sigue la regla remota.

## V2-8. Argumentos de los modelos: `""` y listas como texto no rompen las herramientas

**Qué se vio.**
- F1, el fallo nº 1 con GPT (8 de 10 tareas con GPT 6.1 Sol y GPT 6 Luna): `fs.patch` recibe a la vez `path`/`old_string`/`new_string` vacíos y `files`. Responde «provide exactly one of …» y el modelo acaba reescribiendo el archivo con un script, sin deshacer.
- F8: `fs.write` de un archivo nuevo con `expected_hash: ""` da «File changed since it was read».
- F12: DeepSeek manda `edits` como texto JSON y el error dice que `fs.patch` no acepta `edits`, lo cual engaña.
- Luna manda `files` como repr de Python.
- F24: al corregir tras un `INVALID_ARGUMENT`, reutiliza el `request_id` y choca con «request_id was already used with different arguments».

**Causa.** F8 validada: `tools/native/fs.py` pasa `input.get("expected_hash")` tal cual, y `""` no es `None`. F1, F12 y F24 según la batería: `normalize.fs_patch` no limpia los campos vacíos cuando viene `files`, exige una lista y no texto, y una llamada rechazada en validación consume el `request_id`.

**Arreglo (para todos los modelos y herramientas, no solo `fs.*`):**
1. Una normalización común antes de validar:
   - un opcional con `""`, `[]` o `null` cuenta como ausente (el esquema estricto de OpenAI obliga a mandar todos los campos);
   - un campo que el esquema declara lista u objeto y llega como texto JSON válido se interpreta.
   Se aplica por esquema, no por herramienta. No se aceptan repr de Python: el error lo explica.
2. Los mensajes de error dicen la forma válida que más se parece a lo que llegó.
3. Una llamada rechazada en validación no consume su `request_id`.

**Pruebas:** las formas de F1, F8 y F12 pasan; un texto que no es JSON da un error claro; reintentar con el mismo `request_id` tras un rechazo funciona.

## V2-9. El vigilante de bucles no cuenta ediciones rechazadas

**Qué se vio (F25, crítico).** En luna/t2, GPT 6 Luna no hizo la tarea. Ninguna edición se aplicó: todas se rechazaron en validación (V2-8). Aun así, el gobernador emitió «repeated-rewrites: facturas.py returned to an earlier state by fs.patch 5 times», después consolidar, otro aviso y cerrar. El turno terminó «completado» con 5 pruebas en rojo. Pasó también en gpt/t2 y luna/t4.

**Causa (validada).** `runtime/agent.py` llama a `loop.record_tool(...)` también cuando `result.ok` es falso, y el detector registra el estado del archivo de una edición que no se aplicó.

**Arreglo:**
- Solo cuentan como reescrituras las ediciones que se aplicaron.
- Los rechazos siguen contando como «mismo error repetido», que sí es una señal útil.

**Pruebas:** cinco `fs.patch` rechazados no disparan `repeated-rewrites`; cinco aplicados que vuelven al mismo estado sí.

## V2-10. La caché con la suscripción de ChatGPT

**Qué se vio.** El límite de ChatGPT se acaba pronto. Por llamada, GPT por la suscripción casi nunca aprovecha la caché, y DeepSeek sí.

**Medido (validado, por llamada, en las sesiones de la batería):**
- DeepSeek V4.1 Flash por OpenCode Go 2: ~90 % de cada llamada sale de caché en casi todas (`[ds] T4`: 92, 68, 90, 90, 86… %).
- GPT 6.1 Sol por la suscripción: 0 % en casi todas, con algún acierto suelto (`[gpt] T2`: 0 % en 10 de las primeras 10; `[gpt] T4`: 89 % y 85 % en las dos primeras y después 0 % en 22 seguidas).
- Son los mismos prompts de Rinari, así que el prefijo de Rinari es estable (el volátil va al final desde el lote 3 de uso real, `turn-context`). El problema está en cómo se arma la petición para el backend de Codex, y afecta a **cualquier modelo** usado con la suscripción.

**Sospecha principal (por confirmar).** `CodexResponsesAdapter` (`providers/adapters/subscriptions.py`) pide `include: ["reasoning.encrypted_content"]` y `store: false`, pero nunca devuelve esos razonamientos en la siguiente llamada, como sí hace Codex CLI. `prompt_cache_key` sí se envía.

**Arreglo:**
1. Antes de tocar nada, una prueba controlada de unas pocas llamadas contra la suscripción del dueño, sin refrescar ni usar el refresh token de `~/.codex/auth.json`. Se compara la caché con y sin devolver los razonamientos, y con las herramientas fijas o cambiando.
2. Se arregla lo que salga, en el adaptador del protocolo, no por modelo.
3. Se mide igual con la API de OpenAI (Responses) por si comparte la causa.

**Pruebas:** la prueba de caché en un escenario con un servidor falso que exige los razonamientos devueltos; una nueva medición real tras el arreglo.

## V2-11. Medir la caché en cualquier proveedor

**Qué se vio (F37, F7).** Con Qwen 3.8 Flash Next por el endpoint del dueño (xAInner sobre Strata), `cached_input_tokens` llega como `None` y no se sabe si la caché funciona. Algunas llamadas tardaron hasta 224 s con poca salida.

**Validado:**
- llama.cpp y Strata reutilizan la caché solos y mandan cada conversación al slot que ya tiene su inicio (en Strata, `pick_slot` de `serve/server.py`). vLLM, SGLang, Ollama y LM Studio también cachean por prefijo sin campos del cliente. **Rinari no necesita mandar nada especial a ningún servidor**: se descartó detectar el servidor o fijar slots, por hardcodeo.
- Strata informa los tokens reutilizados en el campo estándar `usage.prompt_tokens_details.cached_tokens`, que Rinari ya lee (`openai_compatible.py`). Con xAInner llega `None` aunque `reasoning_tokens` sí llega: el endpoint quita ese campo (nota en [notas-servicios-externos.md](notas-servicios-externos.md)).

**Arreglo (por protocolo, para todos los proveedores):**
1. El adaptador compatible con OpenAI lee también las otras formas conocidas de informar la caché cuando falta la estándar: `prompt_cache_hit_tokens` y `timings.cache_n`. Sirve para cualquier proveedor o servidor que las use.
2. «Sin dato» se distingue de «0 %» en Uso y límites.
3. La lentitud de F37 se vuelve a medir con el dato visible antes de decidir nada más.

**Pruebas:** cada forma de informar la caché da su número; sin ninguna, queda «sin dato».

## V2-12. Contexto que crece y vueltas de más

**Qué se vio (según la batería).**
- F11: la investigación web costó 750–825 k tokens de entrada porque las páginas enteras de `web.fetch` se quedan en el contexto.
- F21: ds/t1 gastó 1,43 M tokens en 34 llamadas para un CLI pequeño.
- F38: x4 llegó a 11,6 M tokens. El coordinador preguntó por sus subagentes con `agent.wait` 25 veces y con `agent.status` 10.
- F33: `capability.activate` dio «Schema budget exceeded» al pedir 3 herramientas de un MCP grande.

**Arreglo (a confirmar con mediciones al empezar):**
1. Los resultados grandes de la web se asientan antes, como ya se hace con los de herramientas viejas (`settle_old_observations`), sin romper la caché: por bloques, como hoy.
2. `agent.wait` bloquea hasta que termina el primer subagente pendiente, en vez de devolver enseguida. El coste de los subagentes se ve en la app.
3. El presupuesto de esquemas cuenta lo que realmente se envía. Se revisa si el tope es razonable para servidores MCP grandes, para cualquier MCP y no para uno concreto.

## V2-13. Permisos que preguntan de más

**Qué se vio (según la batería).**
- F15: `browser.evaluate` para leer titulares pidió permiso con riesgo alto («Interactuar con una página web») y sin mostrar ni el script ni la URL.
- F32: rellenar campos en `http://127.0.0.1:…` de una app que la propia sesión arrancó con `process.start` pidió permiso en cada clic, unas 16 veces en un E2E.
- F36: un `fs.patch` sobre una ruta inexistente fuera del proyecto pidió permiso antes de comprobar que existía.

**Arreglo:**
1. La tarjeta de `browser.evaluate` muestra el script y la URL. Un script que solo lee se clasifica como lectura, si se puede decidir de forma general.
2. Las páginas de loopback servidas por un proceso que arrancó esta misma sesión se tratan como parte del espacio de trabajo. Es una regla por origen y proceso, no por puerto.
3. Las comprobaciones que no dependen del permiso (existencia, argumentos) van en el `precheck`, antes de preguntar. El patrón ya existe en las herramientas de imagen.

## V2-14. Herramientas

Según la batería; se confirma cada uno al empezar.
- **F2:** `git.status` y `git.diff` en una carpeta sin repositorio devuelven error `NOT_FOUND`. Deben responder bien, con `is_repo: false`.
- **F4 y F27:** `shell.exec` permite declarar el código de salida esperado (`expect_exit`). Un rojo a propósito, como pytest antes de arreglar o una prueba negativa, no cuenta como fallo ni ensucia la app y las métricas.
- **F19:** en Windows, `process.stop` y `process.signal` intentan primero una parada ordenada (CTRL_BREAK al grupo de procesos) antes de matar. Una parada pedida cuenta como «detenido», no como fallo.
- **F13:** `documents.create` acepta rutas del espacio de trabajo en `spec_uri`, o el error dice cómo obtener el `artifact://`.
- **F39:** los límites del esquema (como `maxLength`) se ven en la descripción que recibe el modelo, para todas las herramientas.
- **F20:** `memory.propose` no propone como memoria del proyecto lo que solo venía en el pedido de una tarea. Los `kind` válidos se ven en el esquema.
- **F22:** los archivos de trabajo (especificaciones, PDF de revisión, scripts de verificación) van al espacio temporal de la sesión, no a la carpeta de entrega.
- **F35:** `browser.screenshot` con el panel del navegador oculto da `UnknownVizError` o devuelve el fotograma anterior. Igual que en `ui-e2e-oclusion`: capturar por CDP aunque la vista no esté visible, o decir que no se pudo.

## V2-15. App

- **F3 (validado):** `FlowSignals` (`src/features/session/SessionWorkspace.tsx`) pide `flow.get` con `session_id: ''` en un borrador, y sale «BAD_REQUEST: session_id must not be empty» en los registros (también en los de `ui:e2e`). Sin conversación, no se consulta.
- **F5 (según la batería):** un proyecto creado fuera de la app no aparece en Proyectos y sus conversaciones salen en Conversaciones. `useProjects` solo refresca al arrancar o tras cambios hechos en la app. Debe refrescar al ver una conversación con un proyecto que no conoce, o con un evento de proyecto.
- **F6 (según la batería):** cuando el modelo da el informe en un mensaje intermedio y cierra con «sin repetirte el informe», la respuesta visible es el cierre corto y lo pedido queda plegado. Hay que decidir el arreglo general: mostrar el último mensaje con contenido sustancial, o que la respuesta final no remita a uno anterior.
- **F14 (validado):** «1 pendientes de ti» (`topbar.attention` y `board.pane.pending`): plural con un solo elemento.
- **F26 (según la batería):** durante minutos, mientras el modelo genera argumentos largos (escribir archivos grandes), no hay ninguna señal. Mostrar «Escribiendo calc/parser.py… N KB» a partir del flujo de argumentos, para cualquier herramienta.

## Al terminar

- CLI completo, vitest, los escenarios tocados (también con carga y con movimiento reducido) y `ui:e2e --all`.
- Nightly nueva, instalada con el vigilante.
- Repetir las tareas de la batería que fallaron (gpt/t2, luna/t2, ds/t4, ds/x6, ds/t9) para comparar fallos, tokens y caché.
- Pendientes ajenos que siguen abiertos: activity-text-shimmer y chat-follow-live, que ya fallaban antes del bloque 25 (ver el cierre del 25–29 en [plan-0.4.0.md](plan-0.4.0.md)).
