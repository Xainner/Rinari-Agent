# Evidencia — vista Flujos tras la revisión M02 (2026-09-22)

Ejecución real del host **Electron** construido en esta rama
(`dist-electron/main.cjs` + `dist/`, esquema `app://rinari`) con el Engine de
`Rinari-CLI` en `40c0089` (cabeza de `feat/project-flow`, sin cambios
locales). Windows 11, ventana emulada a 1440×900 a escala 1.

Todo es temporal y local: perfil de Electron (`--user-data-dir`, comprobado
antes de sembrar: Chromium escribió allí `DevToolsActivePort` y el perfil por
defecto no cambió), `RINARI_HOME`, un proyecto `orders-api` recién creado con
`git init` y un proveedor **falso** compatible con OpenAI en `127.0.0.1`. No se
usaron proveedores reales ni credenciales.

La siembra va por el puente real del renderer (`window.rinariDesktop.command`
→ preload → IPC validado → Engine), y la navegación, con clics reales de CDP
(`Input.dispatchMouseEvent`) sobre la UI. El arnés vive fuera del repo.

## Qué se sembró

Seis turnos reales, todos `completed`, en este orden:

| Sesión | Modo | Mensaje |
|---|---|---|
| Backend | plan | haz un plan de la API de pedidos |
| Backend | build | implementa las rutas |
| Docs | build | documenta la API |
| Backend | review | revisa lo hecho |
| Backend | plan | haz un plan de la segunda fase |
| Charla suelta (sin proyecto) | build | hola |

Después se **archivó Docs** y se añadió Backend al board desde la propia UI (en
Boards, pulsar la sesión en el sidebar).

`flow.get` del proyecto: cuatro etapas, `planning/plan → implementation/build →
review/review → planning/plan`, la segunda con las dos sesiones y la cuarta en
el ciclo 2. `summary.progress = null` porque sólo dos de cuatro etapas tienen
progreso conocido (`progress_coverage.known_stages = 2`): la vista dice
«Progreso no calculable» en vez de promediar lo que sabe.

## Comprobaciones

| Requisito | Resultado en la app |
|---|---|
| F11-13: sesión activa de proyecto | Flujos abre `project:<orders-api>` |
| F11-13: conversación suelta activa | Flujos abre `session:<Charla suelta>`, no el primer proyecto registrado |
| F11-09: cada fila responde por su sesión | En la etapa BUILD, «Backend» → «Abrir en su panel del board»; «Docs» → «Abrir en Normal» |
| F11-08: sesión archivada | Pulsar «Docs» en el detalle **no** cambia de vista: aparece «“Docs” está archivada. Restáurala para abrir el turno.» con «Restaurar y abrir» / «Quedarme en Flujos» |
| F11-08: restaurar y abrir | Docs pasa a `active` y la app va a Normal sobre Docs |
| §5: reiniciar el Engine reconstruye el flujo | Host `restarting → handshaking → ready`; la proyección antes y después es **idéntica** (misma `revision`, mismas cuatro etapas). La caché de proyecciones vive en memoria y murió con el proceso: lo que vuelve sale de hechos persistidos |
| Errores de consola en todo el recorrido | 0 |

## Lo que no se pudo observar, y por qué

- **«Comprobando» (capability de tres estados).** En esta máquina el Engine
  llega a `ready` antes de que el renderer termine de cargar: al primer clic
  posible en «Flujos» ya estaba listo. El estado queda cubierto por
  `FlowView.test.tsx` («the capability has three states…»); no se forzó con un
  lanzador lento.
- **Tampoco aparece al reiniciar ni al morir el Engine**, y eso no es de
  Flujos: el renderer **no se suscribe** al push de estado del host
  (`PUSH.engineStatus`). El preload lo expone como `engine.onStatus`, pero
  `Platform` no lo ofrece y `useEngineConnection` sólo actualiza el estado con
  el resultado de sus propias llamadas. Medido aquí: con el proceso del Engine
  terminado a la fuerza, el host informa `degraded` y la barra superior sigue
  diciendo **«Motor listo»** (`07-engine-muerto.jpg`). Ya ocurre en `main`; se
  deja registrado para una tarea aparte porque toca `src/platform`.
- **Aviso de desactualizado (F11-12) y muestra parcial de archivos.** Provocar
  un fallo de `flow.get` con datos en pantalla, o más de ocho archivos en una
  etapa con un proveedor falso, habría medido el arnés y no el producto. Los
  cubren `useFlow.test.tsx` y `FlowView.test.tsx`.

## Capturas

| Archivo | Estado |
|---|---|
| `01-flujos-proyecto.jpg` | Proyecto con cuatro etapas y el separador «Ciclo 2»; la acción de las etapas de Backend lleva el icono del board. |
| `02-detalle-sesiones.jpg` | Detalle de la etapa BUILD: Backend con icono del board, Docs con el de abrir fuera. |
| `03-restaurar.jpg` | El aviso de restaurar Docs en la cabecera de Flujos, con el detalle aún abierto; el sidebar muestra «Sesiones archivadas · 1». |
| `04-restaurada-normal.jpg` | Tras «Restaurar y abrir»: Normal sobre Docs, de nuevo bajo el proyecto. |
| `05-conversacion-suelta.jpg` | Con «Charla suelta» activa, Flujos abre su propio flujo. |
| `07-engine-muerto.jpg` | Engine terminado a la fuerza: el host dice `degraded`, la UI «Motor listo». Hallazgo fuera de M02. |

`report.json` contiene cada paso con los valores leídos de la app (alcance
del selector, títulos de las filas, texto del aviso, estados del host durante
el reinicio y revisiones antes y después).

El aviso «Carpeta no disponible» de la cabecera en `04` no pertenece a Flujos
y no se investigó; el proyecto sembrado es un repositorio sin commits.
