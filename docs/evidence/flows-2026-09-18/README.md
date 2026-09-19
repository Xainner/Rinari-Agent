# Evidencia — vista Flujos (2026-09-18)

Smoke real del host **Electron** en desarrollo (`dist-electron/main.cjs` +
Vite en `:1420`) con el Engine integrado (`Rinari-CLI` rama
`feat/project-flow`, `27d29c2`), en Windows 11 con un `RINARI_HOME` temporal y
un proveedor **falso** sin credenciales (`http://127.0.0.1:9/v1`, mock local
que responde con un plan cuando el mensaje contiene «plan»). El proyecto
«Orders API» se sembró con cinco turnos reales a través del protocolo
(`session.turn.start`) en dos sesiones de proyecto («Backend», «Docs»):
PLAN → BUILD (dos sesiones) → REVIEW → PLAN (segundo ciclo). Las capturas se
tomaron por CDP (`Page.captureScreenshot`) a 1280×860 y 2560×1392 (ventana
maximizada por el usuario), reducidas a 1600 px de ancho.

## Comprobaciones ejecutadas contra el Engine real

| Comprobación | Resultado |
|---|---|
| Capability | `project_flow_v1` anunciada por `engine_status` |
| `flow.get {project_id}` | 4 etapas en 2 ciclos, `summary.progress = 1.0`, `turns_total = 5`, `files_changed = 0` |
| `flow.get {session_id}` (sesión de proyecto «Backend») | 3 etapas, mismo `root`; el selector la ofrece bajo «Sesiones del proyecto» |
| `flow.get {session_id}` (conversación sin turnos) | `stages = []` → «Esta conversación aún no tiene turnos.» y «Progreso no calculable» |
| Progreso honesto | REVIEW sin `verification.completed` → «sin datos» aunque el turno terminó; grafo de tareas vacío → «sin tareas registradas» (nunca `0/0` ni un %) |
| «Ir al turno» con la sesión en el board | Va a Boards, expande y enfoca el panel «Backend» |
| «Ir al turno» sin la sesión en el board | Selecciona la sesión, va a Normal y el transcript recibe la petición en cola (`requestTurnReveal`) aunque llegue antes de montar la sesión |
| Persistencia | `view = flows` y `flowScope` sobreviven a recargar la página (`localStorage`) |
| `console.error` tras recargar en Flujos | 0 |

## Capturas

| Archivo | Estado |
|---|---|
| `08-flows-project.jpg` | Proyecto «Orders API» (2560 px): cabecera con progreso global y hechos, cuatro etapas con conectores, separador «Ciclo 2» y el detalle de la etapa 4 abierto dentro de la vista. |
| `09-flows-cycle2.jpg` | Canvas desplazado (1280 px): separador de ciclo entre REVIEW y el nuevo PLAN. |
| `10-flows-detail.jpg` | Detalle de la etapa 2 (BUILD en dos sesiones): fechas, duración, progreso, verificación «sin registros», sesiones con «Ir a la sesión», ejecutores con llamadas al modelo. |
| `11-flows-session.jpg` | Alcance = sesión de proyecto «Backend» abierta desde el sidebar: 3 etapas, selector con grupo «Sesiones del proyecto». |
| `11-flows-chat.jpg` | Alcance = conversación sin turnos: estado vacío honesto. |
| `12-flows-goto-turn.jpg` | Resultado de «Ir al turno» (etapa REVIEW) con la sesión fuera del board: vista Normal sobre «Backend». |

No se probaron proveedores reales ni se usaron credenciales del usuario. El
mock, el script de siembra y el lanzador de Electron viven fuera del repo.
