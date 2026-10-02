# Desplegar proyectos al crear conversaciones

La barra comparte una preferencia reactiva por ID, conservando la clave
`rinari.projectsExpanded`. Una creación confirmada abre solo su proyecto y
limpia la búsqueda. Seleccionar, refrescar o renombrar no deshace un colapso
manual. La barra completa conserva su estado.

Normal registra la carpeta con `project.add` antes de `project.open`: el
primer `created` identifica un alta y el segundo una nueva sesión recomendada.
Un alta confirmada queda visible incluso si después no se puede crear la
sesión. Boards usa la misma regla sin cambiar la selección de Normal.

## Pruebas

- `npm test -- --maxWorkers=4`: 142 archivos, 1.051 pruebas aprobadas.
- `npm run build`, `npm run desktop:build`, `npm run typecheck:electron`.
- `npm run protocol:check`, `npm run parity:check`, `npm run desktop:smoke`.
- `node scripts/project-reveal-e2e.mjs --keep`: Electron de producción y
  Engine real, con proyectos, perfil y `RINARI_HOME` temporales. Se cierran y
  reinician ambos procesos para verificar la persistencia. `--keep` deja la
  segunda ventana abierta para revisión manual.

Configurar `RINARI_ENGINE_BIN`, `RINARI_ENGINE_ARGS_JSON` y `RINARI_ENGINE_CWD`
como en desarrollo antes de ejecutar la prueba nativa. El proveedor de prueba
apunta a localhost sin servidor: permite crear sesiones sin credenciales ni
consumo, pero no genera respuestas de modelo. El selector de carpetas devuelve
rutas temporales durante la automatización; se restaura antes de la revisión.

El recorrido nativo verifica barra, ProjectHome, Boards, filtro anterior,
selección de Normal, alta y nombre inicial, cambio de conversación, cancelación
del selector y de una conversación duplicada, y reinicio completo. Las capturas
y el informe se guardan en `release/evidence/project-reveal/` (ignorado por Git).

La transición CHAT → PROJECT y los fallos de creación, catálogo o almacenamiento
se verifican en tests de integración de React. La promoción no se provocó con
un turno de modelo real en esta prueba nativa.

La primera ejecución de la suite sin limitar trabajadores agotó los 5 segundos
de un test de versión ajeno al cambio; la suite completa con cuatro trabajadores
pasó sin modificar límites ni tests de versión. Electron emitió un aviso
`MaxListenersExceededWarning` durante la navegación; no impidió los recorridos
ni se modifica su gestión en esta mejora.
