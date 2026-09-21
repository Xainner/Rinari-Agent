# Procesos en la conversación

Los procesos viven en la zona de trabajo de la conversación, encima del
composer: una franja contextual con filas compactas y un inspector
expandible que crece hacia arriba sin tapar el input. No hay botón
flotante ni panel global superpuesto.

Su insignia cuenta los recursos activos de esa sesión. Seleccionar una
fila inspecciona comando, carpeta de trabajo, PID cuando existe, estado
y stdout/stderr. **Detener** pide confirmación identificando el recurso
y solicita al engine terminarlo; cerrar u ocultar el inspector sólo
oculta la superficie.

La vista incluye `shell.exec` con `background=true`, `process.start`,
PTYs del engine y previews HTML/de desarrollo. Las URLs de preview
externa se etiquetan como no gestionadas por Rinari y no ofrecen
detener un servidor.

Los registros de procesos sobreviven a los turnos dentro de la misma
sesión del engine. Cambiar de chat o recargar Code no los pierde.
Cerrar la sesión o apagar el engine detiene sus procesos gestionados.
Esto no es recuperación tras un crash del engine ni un administrador
de tareas del SO: PIDs arbitrarios y procesos desacoplados a mano no
se adoptan.

Para servidores, el agente debe usar una herramienta gestionada en
segundo plano en lugar de desacoplar el shell (`Start-Process`,
`nohup`, `&`). Las herramientas nativas de procesos siguen siendo la
autoridad del engine; ni React ni Rust inician o terminan un proceso
directamente.

La franja muestra como máximo dos filas más un contador; el resto vive
en el inspector con filtros (activos, requieren atención, terminados,
externos, todos). Los éxitos recientes se retiran a los 5 segundos de
tiempo visible; los fallos se conservan hasta marcarlos como vistos.
La lista del engine está limitada a 100 recursos y se etiqueta como
parcial cuando se trunca.

El inspector lee snapshots acotados (no un stream incremental) y no
consume los cursores de salida del modelo. Pausar la vista congela el
texto sin pausar el proceso. La búsqueda es literal y local a la
salida cargada. Copiar captura el snapshot del clic e indica si estaba
recortado. «Preparar consulta» inserta contexto editable en el
borrador de la misma sesión; nunca envía un turno por sí sola.

Detener un proceso no cancela el turno del assistant; el Stop del
composer conserva su handler. No existe «Detener todos» en la franja
ni reinicio/«forzar» por señales: reiniciar sería otra ejecución.

Cuando el inspector de procesos está abierto, el navegador no se
autoabre encima; abrir el navegador manualmente contrae los logs
conservando el resumen.

Preparación (`readiness`) no se deduce: `En ejecución` no significa
servidor listo y una URL asociada no implica disponibilidad. Cuando el
engine ofrece `process_identity_v1`, las filas traen generación,
`ended_at`, motivo de fin y sondas locales de puerto (`listening` es
sólo TCP aceptado, no app lista); sin esa capability, la duración
exacta y la disponibilidad no se afirman. La salida es parcial por
diseño y el historial es lo que el engine aún conserva, sin
durabilidad garantizada tras reinicios. Con identidad fuerte, un
`engine_instance_id` distinto invalida el ámbito sin reproducir
acciones pendientes; sin ella, ante continuidad incierta se exige
nueva observación y confirmación; nunca se reutiliza un ID para
actuar sobre un recurso nuevo.

Protocolo: `workspace.process.list`, `workspace.process.read`,
`workspace.process.stop`; capability `desktop_processes_v1`. Los IDs
se resuelven contra la sesión solicitada antes de leer o detener, y el
frontend los trata como opacos. Las definiciones TypeScript y Rust se
generan desde el esquema del engine.

Reinicia `npm run desktop:dev` tras actualizar el Engine incluido y
el puente Electron. Los servidores desacoplados previamente deben
reiniciarse con una herramienta gestionada para aparecer.
