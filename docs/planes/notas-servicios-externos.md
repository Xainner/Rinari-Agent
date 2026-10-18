# Notas para servicios externos (no son de Rinari)

Lo que salió al probar Rinari y no se arregla en Rinari, sino en el servicio externo. Fuente: la batería del 2026-10-18 (`C:\Users\Xainner\Documents\Proyectos\pruebas-040-1018\HALLAZGOS.md`) y el [plan 0.4.0 v2](plan-0.4.0-v2.md).

## Rinari Visual Lab (MCP)

- **F29:** `check_prompt` rechaza `body.aspect_ratio` («Extra inputs are not permitted») aunque `generate_image` lo acepta. Los esquemas de las herramientas del Lab están desalineados.
- **F31:** el estimador de bpm de `analyze_audio` es inconsistente (180 o 85 para ~124). YuE2 tarda unos 10 s en empezar a cantar: la guía del Lab debería avisar cuántas líneas caben según la duración.
- **F28 (parte del Lab):** la skill `rinari-lab-imagen` (`references/rvl_mcp.py`) lleva al modelo a usar `ssh saturno "python3 rvl_mcp.py …"` y `scp` en vez del MCP cuando el dueño no lo nombra, y le da detalles de la infraestructura (equipo, GPU) que el modelo repite. La skill debería apuntar al MCP. La parte de seguridad de Rinari (revisar lo que corre por ssh) es V2-7 del plan v2.
- **F23:** el modelo sondeó `get_job` 5 veces en vez de usar `wait_for_job`. Conviene que la descripción de `get_job` remita a `wait_for_job`.

## xAInner (endpoint del dueño)

- Con Qwen 3.8 Flash Next por xAInner, `usage.prompt_tokens_details.cached_tokens` no llega a Rinari (`cached_input_tokens: None`), aunque `completion_tokens_details.reasoning_tokens` sí. Strata sí informa ese campo (`serve/server.py`), así que xAInner lo quita en el camino. Sin él no se puede medir si la caché funciona (F37). Ver V2-11 del plan v2.
- Strata atiende por defecto una petición a la vez (`docs/BATCHING.md`, `"parallel": N` para más). Con un solo slot, el título en paralelo (V2-4), los subagentes y dos conversaciones a la vez se encolan. Un modelo auxiliar en otro proveedor evita la cola de los títulos.
