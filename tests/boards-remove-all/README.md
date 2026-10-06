# Quitar todos los paneles de Boards

El botón «Quitar todos» / «Remove all» vacía la composición visual en una sola
actualización, incluidos paneles colapsados y en modo foco. Conserva las
conversaciones, su ejecución, borradores, paneles laterales, recibos de lectura
y preferencias generales del board. Limpia el foco, su instantánea y errores
de los paneles retirados. Antes pide confirmación con el diálogo de la app,
porque la disposición del board no se puede deshacer.

## Validación

- `npm test -- --maxWorkers=4`: **1.037 pruebas pasan en 140 archivos**.
- `npm run build`, `npm run desktop:build`, `npm run typecheck:electron`.
- `npm run protocol:check`, `npm run parity:check`, `npm run desktop:smoke`.
- `node scripts/boards-remove-all-e2e.mjs --keep`: app Electron de producción,
  Engine real y proveedor local con respuestas guionizadas. El harness retiene
  una petición del modelo, quita todos los paneles y después libera la respuesta:
  la conexión sigue viva y el turno termina y queda en el historial de la sesión.
  No se usan proveedores externos ni credenciales.

Configurar `RINARI_ENGINE_BIN`, `RINARI_ENGINE_ARGS_JSON` y `RINARI_ENGINE_CWD`
como en desarrollo. Los datos de prueba y el perfil son temporales y aislados.
El layout inicial de cada escenario se prepara como fixture persistido; la
acción probada se ejecuta desde el botón de la app. Se verifican paneles
expandidos, todos colapsados y modo foco, borradores y laterales conservados,
control accesible en inglés a 780 px y persistencia del board vacío tras
reiniciar Electron y el Engine. Se vuelven a añadir las conversaciones por
la UI y `--keep` deja una ventana lista para revisión manual.

Las capturas y el informe se guardan en `release/evidence/boards-remove-all/`.
La consola de Electron muestra avisos de listeners y ResizeObserver durante
la navegación; las comprobaciones pasan y este cambio no los declara resueltos.
