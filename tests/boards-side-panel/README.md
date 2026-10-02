# Panel lateral cerrado al añadir conversaciones a Boards

Las sesiones sin layout propio se inicializan con el lateral cerrado. Una
preferencia existente, abierta o cerrada, sigue perteneciendo a la sesión y se
conserva entre Normal y Boards, al quitar/añadir el panel y al reiniciar. Se
mantienen la migración antigua y los anchos existentes.

Los textos visibles y accesibles usan «Panel lateral» / «Side panel», incluido
el tooltip y el nombre accesible de la X, el control de visibilidad y el ancho.

## Validación

- `npm test -- --maxWorkers=4`: **1.038 pruebas pasan en 140 archivos**.
- `npm run build`, `npm run desktop:build`, `npm run typecheck:electron`.
- `npm run protocol:check`, `npm run parity:check`, `npm run desktop:smoke`.
- `node scripts/boards-side-panel-e2e.mjs --keep`: app Electron de producción
  y Engine real, con perfil y home temporales. Cierra y reinicia ambos procesos;
  `--keep` deja la segunda ventana abierta para revisión manual.

El recorrido nativo comprueba creación desde el diálogo de Boards, añadir una
sesión existente sin layout, conservar el lateral abierto y la pestaña Tareas
de Normal, apertura desde encabezado y barra superior, cierre sin cerrar la
sesión, quitar/añadir de nuevo, panel estrecho sin drawer inicial, apertura
explícita del drawer con foco y cierre por Escape, textos ES/EN, persistencia
tras reinicio y creación de otra sesión cerrada después de reiniciar.

Configurar `RINARI_ENGINE_BIN`, `RINARI_ENGINE_ARGS_JSON` y `RINARI_ENGINE_CWD`
como en desarrollo. El proveedor de prueba apunta a localhost sin servidor:
permite crear sesiones sin credenciales, pero no genera respuestas de modelo.
Para el caso estrecho se prepara únicamente un ancho manual persistido de
480 px. Los estados de visibilidad se cambian mediante los controles de UI.
Las capturas y el informe se generan en `release/evidence/boards-side-panel/`.

Los tests de React cubren también archivos que revelan su propia superficie,
coordinación de navegador/procesos, etiquetas accesibles, sesiones con layout
cerrado, enfoque de un panel ya existente y migración de layouts abiertos.
Electron emite un aviso de listeners durante la navegación; las comprobaciones
funcionales pasan y este cambio no declara resuelto ese aviso.
