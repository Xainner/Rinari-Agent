# Plan 0.4.0 v2: arreglos tras la Nightly final

Estado: **anotado, sin empezar** (dueño, 2026-10-17). Sale de probar la Nightly 0.4.0-nightly.20261017.2028, que trae los bloques 25–29 del [plan 0.4.0](plan-0.4.0.md). Se trabaja en las ramas `0.4.0` con commits locales, y al terminar va una Nightly.

Caso de origen: la conversación `ses_01M56Q2Z2R0BXGBN7EZ3EEZ43X`, «Imagen hiperrealista de Dawn Pokémon»: un chat suelto con permisos «Proyecto» y DeepSeek V4.1 Flash. El dueño pidió «hazme una imagen de Dawn pokemon hiper realista» con la Suscripción de ChatGPT como servicio de imágenes por defecto (`images.json`). Rinari no la usó: activó la skill `rinari-lab-imagen`, generó con el MCP de Rinari Visual Lab, descargó la imagen y pidió permiso para copiarla a la carpeta del chat con `copy /Y`.

## Bloques

| # | Qué | Dónde |
|---|---|---|
| V2-1 | El servicio de imágenes configurado va primero | CLI (+ escenario de la app) |
| V2-2 | Copiar de fuera hacia el chat no es «escribir fuera» | CLI |
| V2-3 | Lo que se descarga queda en la conversación y se entrega con su tarjeta | CLI (+ escenario de la app) |

Orden: V2-1, V2-3 y V2-2. Son independientes; el 3 quita la necesidad de copiar y el 2 corrige el clasificador para los demás casos.

## V2-1. El servicio de imágenes configurado va primero

**Causa (validada en el código).** El modelo hizo lo que le pedimos:
- Las cinco herramientas de imagen (`image.generate`, `image.edit`, `image.variations`, `image.upscale` e `image.remove_background`) arrancan ocultas: `always_loaded=False` en `tools/native/image_create.py`, así que el modelo no las ve hasta buscarlas.
- La sección de skills de las instrucciones del turno (`cli/agent_runtime.py`) dice: «Before acting on a request, check this list: when a skill matches it, activate it with skills.activate first and follow its procedure instead of improvising». `rinari-lab-imagen` describe justo eso: generar imágenes.
- `capability.search` puso `image.generate` décima, detrás de nueve herramientas `mcp.Rinari_Visual_Lab.*`. Además, su guía (`capability_search.py`) recomienda siempre la primera skill que coincide («A skill covers this: activate…»).
- Que el dueño eligiera «Suscripción de ChatGPT» como servicio por defecto no se le dice al modelo en ningún lado.

**Arreglo:**
1. Con un servicio por defecto configurado, las herramientas de imagen se cargan desde el inicio. Sin servicio siguen ocultas, como ahora: sin servicio, Rinari lo dice y no improvisa (decisión del dueño, [idea-multimedia.md](idea-multimedia.md)).
2. Con servicio configurado, una línea en las instrucciones del turno: «Para crear o editar imágenes usa `image.*`: usan el servicio que eligió el dueño (<nombre>). Usa otra skill o MCP de imágenes solo si el dueño lo nombra».
3. En `capability.search`, cuando una herramienta `image.*` coincide y hay servicio configurado, sale primero, y la guía apunta a ella y no a la skill.
4. Nada hardcodeado a Visual Lab ni a las skills del dueño: la regla es general. El servicio configurado manda salvo que el dueño pida otro, y «hazla en el Lab» sigue funcionando.

**Pruebas:**
- Unidad: con servicio configurado, las herramientas son visibles y la línea aparece en las instrucciones; sin servicio, ni lo uno ni lo otro.
- Unidad: en `capability.search`, con una skill de imágenes y un MCP que coinciden, gana `image.generate` y la guía la nombra.
- Escenario: un modelo falso que pide una imagen sin nombrar servicio usa `image.generate`.

## V2-2. Copiar de fuera hacia el chat no es «escribir fuera»

**Causa.** `classify_shell_risk` (`policy/engine.py`) cuenta como destino todo lo que va después del verbo. En `copy /Y "C:\Users\…\.rinari\artifacts\rvl_dl_…" "dawn-pokemon-hiperrealista.png"`, el origen solo se lee, pero salió como «command writes outside the workspace» (regla `shell_external_mutation`) y pidió permiso.

**Arreglo:**
- En los verbos que copian (`copy`, `cp`, `xcopy`, `robocopy`, `Copy-Item`), solo el destino cuenta como escritura: el último argumento, o el de `-Destination` (PowerShell) o `-t`/`--target-directory` (cp).
- `move`, `mv` y `Move-Item` no cambian: mover borra el origen, así que tocan las dos rutas.
- Lo demás sigue igual: las redirecciones, los destructivos (`delete_outside_root`) y los secretos del sistema.

**Pruebas:**
- Copiar de fuera hacia el chat no pregunta.
- Copiar del chat hacia fuera pregunta.
- `move` de fuera hacia dentro pregunta.
- Lo mismo con las variantes con `/Y`, `-Destination` y `cp -t`.

## V2-3. Lo que se descarga queda en la conversación y se entrega con su tarjeta

**Causa.** `web.download` (`tools/native/web.py`) tiene tres problemas:
- Guarda en la carpeta general `~/.rinari/artifacts` (`ctx.artifact_root`), sin ligar el archivo a la conversación.
- Le pone el nombre de la URL sin extensión (`rvl_dl_F0ync…` y no `.png`), aunque `content_type` diga `image/png`.
- Devuelve una ruta y no un `artifact://`.

`file.present` solo acepta archivos del chat o del proyecto y salidas `artifact://` de la conversación. Por eso el modelo tuvo que copiarlo con la terminal: así llegaron el `copy` y su permiso.

**Flujo correcto:**
1. `web.download` guarda la descarga como archivo de esta conversación, en el mismo almacén que usan las imágenes de `image.*`.
2. Le pone la extensión que corresponde al `content_type` cuando el nombre no la trae.
3. Devuelve su `artifact://` junto con la ruta.
4. El modelo la entrega con `file.present` usando ese `artifact://`, con la misma tarjeta que las imágenes nativas: sin terminal, sin copia y sin permiso.
5. Si el dueño quiere el archivo en el proyecto, lo guarda desde la tarjeta.
6. Opcional: `save_as` para guardarla directo en el chat o el proyecto, con las mismas reglas que `fs.write`.

**Pruebas:**
- Unidad: una descarga `image/png` sin extensión queda como `….png` de la conversación, con `artifact://`, y `file.present` la acepta.
- Las descargas viejas de `~/.rinari/artifacts` siguen leyéndose.
- Escenario: descarga más tarjeta, sin aprobación.

## Al terminar

- CLI completo, vitest, los escenarios tocados (también con carga y con movimiento reducido) y `ui:e2e --all`.
- Nightly nueva, instalada con el vigilante.
- Pendientes ajenos que siguen abiertos: activity-text-shimmer y chat-follow-live, que ya fallaban antes del bloque 25 (ver el cierre del 25–29 en [plan-0.4.0.md](plan-0.4.0.md)).
