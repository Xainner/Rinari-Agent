> **Archivado el 2026-10-12.** Documento histórico: lo que describe ya se entregó o se retiró, y no es una regla ni una tarea pendiente. Lo que sigue abierto está en [debt.md](../debt.md). Índice: [historia/README.md](README.md).

# Auditoría de herramientas de Rinari

Fecha: 2026-09-10. Alcance: checkout local de Rinari-CLI y cliente Rinari Agent.

## Resultado y límites

Se inventariaron **105 definiciones propias**: 90 del paquete nativo y 15 añadidas por el montaje de sesión (SSH, skills, agentes y descubrimiento). Hay una propuesta y un caso de aceptación para cada una. Se revisaron contratos, metadatos y rutas comunes; se inspeccionaron handlers y adaptadores para los hallazgos señalados. Es una auditoría estática con comprobaciones locales de decisión, no una certificación funcional ni un benchmark de las 105 operaciones.

El checkout contiene cambios sin commit, incluido SSH. Por ello este documento describe el estado local, no garantiza que todo esté publicado o empaquetado. No se conectó a casa3090, no se ejecutaron acciones de navegador ni solicitudes HTTP para probar efectos. No se modificó el runtime.

No conviene minimizar llamadas a cualquier precio: importa completar correctamente la tarea con menos rondas innecesarias, latencia y tokens, manteniendo permisos y trazabilidad.

## Referencia pública y qué significa «como Codex»

- **Descubrimiento:** OpenAI documenta herramientas diferidas y namespaces con descripciones claras; aplicar esa separación permite cargar el contrato relevante en vez de todo el catálogo. Es una referencia de diseño de la API, no prueba de cómo está implementado cada cliente Codex. [Tool search](https://developers.openai.com/api/docs/guides/tools-tool-search).
- **Shell:** el contrato público distingue stdout, stderr, salida normal y timeout, y limita la salida devuelta. Rinari puede adoptar esa claridad sin cambiar de proveedor ni copiar un runtime. [Shell](https://developers.openai.com/api/docs/guides/tools-shell).
- **Edición:** Apply Patch describe operaciones de crear, actualizar y borrar, con resultado por operación y decisiones explícitas sobre atomicidad. Proponemos precondiciones y diffs en el harness existente. [Apply Patch](https://developers.openai.com/api/docs/guides/tools-apply-patch).
- **Skills:** la documentación indica carga progresiva: nombre/descripción primero, instrucciones completas cuando se necesitan. Una skill sirve para procedimientos; la resolución de destinos y el control de ejecución pertenecen a las herramientas. [Build skills](https://learn.chatgpt.com/docs/build-skills).

Las propuestas de ranking, caché, concurrencia y objetivos numéricos que siguen son recomendaciones para Rinari, no afirmaciones sobre algoritmos privados de Codex.

## Hallazgos comprobados

| Prioridad | Evidencia local | Implicación y corrección |
|---|---|---|
| P0 | tools/runtime.py: _retryable_result usa idempotent estático. Un error NETWORK_ERROR simulado resulta reintentable para http.request, browser.click, browser.type y browser.evaluate. | Resolver seguridad del retry según operación y fase de fallo. No repetir una mutación con resultado incierto. Esto demuestra la decisión del runtime, no que un envío se haya duplicado realmente. |
| P0 | tools/runtime.py: _deadline_ctx asigna now + tool.timeout_ms, sin min con deadline existente. | Nunca ampliar el tiempo restante del padre/turno; usar reloj monotónico para duración y propagar deadline a adaptadores. |
| P0 | capability_search.py: búsqueda léxica por conteo; sin coincidencias devuelve browser.open. Probado incluso con registro vacío. | Un resultado debe corresponder a una herramienta registrada y una ruta aplicable; devolver unavailable/needs_setup con motivo y siguiente acción concreta. |
| P1 | tools/scheduler.py y runtime/agent.py: se trazan grupos, pero se ejecuta for call de forma serial. | Hay infraestructura aprovechable; habilitar concurrencia después de definir recursos, presupuestos y persistencia seguros. Clasificar con argumentos reales, no {}. |
| P1 | Inventario instanciado: 80/105 con always_loaded=True; 0/105 con output_schema. | Hay envelope común, pero falta validación específica de data en estas herramientas propias. Diseñar schemas compactos y reducir núcleo visible midiendo selección y tokens. No aplica a todos los MCP: su adaptador sí importa output_schema. |
| P1 | cli/commands/tools.py usa all_native_tools; agent_runtime agrega más fuentes. | Un único servicio de catálogo debe alimentar CLI, búsqueda del modelo y Code, incluyendo disponibilidad sin ejecutar acciones. |
| P1 | native/fs.py: read_lines corta a 1 MB antes de seleccionar rango y reporta len(lines). fs.diff compara lecturas acotadas. | Distinguir total conocido de parcial y no describir una comparación truncada como exhaustiva. |
| P1 | native/process.py: process.output devuelve stdout.text() y stderr.text() acumulados. | Introducir cursor y chunks para evitar retransmitir lo mismo en cada poll. |
| P1 | native/ptytools.py: pty.write agrega newline; PTY POSIX, error explícito en Windows. | Separar escritura literal y submit; anunciar soporte de plataforma antes de seleccionar la herramienta. |
| P1 | native/web.py: las operaciones derivadas llaman _fetch_guarded por URL. | Introducir snapshots/source_id compartidos para open/find/extract/cite, con política explícita de frescura. |
| P1 | native/ssh.py: un target_id registrado y una section; configuración SSH aislada con clave fijada. | Resolver el alias solicitado y agrupar secciones preservando la verificación del host y los controles actuales. |
| P1 | lsp/manager.py: rename devuelve WorkspaceEdit sin aplicarlo. | Es correcto que sea lectura. Aclararlo en nombre/descripción y conectar aplicación posterior a fs; no reclasificarlo erróneamente como escritura ejecutada. |

Referencias de implementación: los módulos se encuentran bajo [src/rinari](https://github.com/Xainner/Rinari-CLI/tree/main/src/rinari). El apéndice da el archivo de cada handler.

## Contrato común propuesto

1. **Catálogo autoritativo:** name, namespace, descripción, cuándo usar/no usar, ejemplos, source, version, available, unavailable_reason, required_setup y contexto de sesión. Separar instalado, conectado, descubierto, activado y autorizado.
2. **Entrada precisa:** schemas acotados, semántica de rutas/IDs explícita, encoding, límites y defaults conocidos. No obligar al modelo a reconstruir quoting o rutas si la herramienta ya conoce el proyecto.
3. **Resultado uniforme:** conservar ToolResult y añadir datos tipados por herramienta; summary, data, warnings, provenance, truncated, cursor y artifacts cuando apliquen. Un éxito HTTP de transporte no implica éxito de negocio.
4. **Error accionable:** código estable, recurso afectado, fase, retryable calculado y opciones de recuperación. Diferenciar missing dependency, missing config, permission denied, auth, not found, timeout y unknown outcome.
5. **Efectos por operación:** read/write resources, idempotency y outcome certainty con argumentos reales. Mantener grants ligados a la acción; agrupar llamadas no permite omitir validación de cada recurso.
6. **Salida incremental:** handles/cursors para tareas largas; nunca polling sin información nueva como estrategia por defecto. Separar espera agotada de ejecución fallida.
7. **Caché con procedencia:** sesión + recurso canónico + versión/hash + scope/permisos. Invalidar por edición, cambio de cwd, credenciales/config o expiración. No cachear indiscriminadamente shell, errores de auth ni datos sensibles.
8. **Presupuesto:** deadline mínimo heredado, límites de bytes/tokens/tiempo y llamadas de red internas. Una macro de cinco consultas no debe ocultar cinco operaciones al budget.
9. **Concurrencia conservadora:** empezar con lecturas independientes que ya estén autorizadas; exclusión por recurso para escrituras. Persistir y presentar resultados en orden estable; auditar seguridad de SQLite, handles, approvals y hooks antes de habilitar workers.
10. **Repeticiones:** huella de herramienta + argumentos normalizados + versión de estado. Después de fallo determinista repetido, devolver la causa y ruta de recuperación; no penalizar polling válido ni reintentos después de un cambio real.

No añadir un runtime de JavaScript ni otro backend de procesos. La composición puede ser un batch tipado en el motor y un ejecutor común que conserve resultados y permisos por acción.

## Matriz completa: 105 herramientas

P0 = corregir contrato antes de acelerar. P1 = eficiencia/fiabilidad de uso diario. P2 = pulido posterior.
Las entradas son propuestas pendientes, no cambios ya implementados. Todas heredan el contrato común anterior.

### agent

| Herramienta | Prioridad y optimización | Criterio de aceptación |
|---|---|---|
| `agent.spawn` | **P1** — Tarea acotada, presupuesto heredado y request_id; no delegar tareas triviales por defecto. | Reenvío no crea dos agentes. |
| `agent.wait` | **P1** — Espera por eventos con cursor y múltiples agentes; resultados solo nuevos. | No repetir resultados ya entregados. |
| `agent.status` | **P1** — Snapshot compacto, actualizado y cacheado por revisión. | Estado cambia de running a completed. |
| `agent.message` | **P0** — ID de mensaje y acuse; no duplicar instrucciones por reintento. | Respuesta perdida conserva una sola entrega. |
| `agent.cancel` | **P0** — Cancelación propagada con estado solicitado/confirmado. | Herramienta del hijo detenida o pendiente explícita. |
| `agent.result` | **P1** — Resultado versionado con artefactos y evidencia; evitar transcript completo. | Resultado voluminoso y agente fallido. |
| `agent.synthesize` | **P1** — Deduplicar hallazgos, preservar desacuerdos y referencias; presupuesto explícito. | Dos agentes con conclusiones contradictorias. |

### artifact

| Herramienta | Prioridad y optimización | Criterio de aceptación |
|---|---|---|
| `artifact.read` | **P1** — Cursor y representación por tipo; conservar límites de bytes y sesión. | Corte UTF-8, binario y artefacto ausente. |
| `artifact.metadata` | **P1** — Añadir mime/hash/origen/tamaño y estado de retención consistente con el store. | Metadatos y lectura describen mismo objeto. |

### browser

| Herramienta | Prioridad y optimización | Criterio de aceptación |
|---|---|---|
| `browser.status` | **P1** — Snapshot de disponibilidad/conexión que evite encadenar preflights. | Estado distingue instalado de conectado. |
| `browser.launch` | **P0** — Reutilizar instancia por sesión y clave de arranque; no lanzar duplicados. | Respuesta perdida después de iniciar. |
| `browser.connect` | **P1** — Adjuntar a instancia explícita, capabilities y ownership; no cerrar navegador ajeno. | Reconexión al mismo endpoint. |
| `browser.close` | **P0** — Cerrar solo instancia autorizada y confirmar cierre. | Navegador adjunto frente a instancia propia. |
| `browser.tabs` | **P1** — IDs estables, títulos/URLs acotados y versión del snapshot. | Tabs creadas por otra acción. |
| `browser.tabs_close` | **P0** — ID explícito, resultado idempotente y protección de ownership. | Tab ya cerrada no cierra la activa. |
| `browser.open` | **P0** — Separar crear tab de navegar; request_id evita duplicados. | Apertura exitosa con respuesta perdida. |
| `browser.navigate` | **P1** — Destino explícito, espera readiness acotada y snapshot al terminar. | Redirect y navegación lenta. |
| `browser.snapshot` | **P1** — Snapshot semántico compacto con element_ids y versión; permitir diferencias. | Página grande con cambios pequeños. |
| `browser.a11y` | **P1** — Compartir snapshot/IDs y filtrar por scope sin volcar todo el árbol. | Fallback cuando accessibility no aporta nodos. |
| `browser.screenshot` | **P1** — Retorno visual nativo/artefacto y clip por región; no texto base64 al modelo. | Viewport grande y captura parcial. |
| `browser.click` | **P0** — No reintentar automáticamente; IDs observados y snapshot posterior opcional. | Click envía formulario pero respuesta se pierde. |
| `browser.fill` | **P1** — Set de valor verificado; devolver estado objetivo y tolerar noop. | Campo ya tiene valor correcto. |
| `browser.type` | **P0** — Inserción no idempotente; separar Enter y no repetir en fallo ambiguo. | Texto no se duplica. |
| `browser.select` | **P1** — Selección por valor/label con confirmación y estado observado. | Opción ausente frente a ya seleccionada. |
| `browser.check` | **P1** — Establecer booleano, nunca toggle ciego; confirmar. | Checkbox ya marcado. |
| `browser.scroll` | **P1** — Scroll absoluto o relativo explícito, región y final visible. | Repetición no salta contenido accidentalmente. |
| `browser.drag` | **P0** — Operación no idempotente con origen/destino observados y comprobación. | Drag completado pero sin respuesta. |
| `browser.evaluate` | **P0** — Distinguir lectura y mutación; no asumir idempotencia de JS arbitrario. | JS incrementa contador y produce fallo posterior. |
| `browser.console` | **P1** — Cursor, niveles y deduplicación; devolver solo novedades. | Logs repetidos no consumen contexto. |
| `browser.network` | **P1** — Cursor y filtros por error/recurso; conservar redacción. | Página con miles de requests. |
| `browser.cookies` | **P1** — Consultar metadatos filtrados por dominio; mantener valores redactados. | Valores de autenticación no aparecen. |
| `browser.set_cookie` | **P0** — Scope explícito y resultado sin secreto; invalidar estado relevante. | Cookie HttpOnly/Secure y URL inválida. |
| `browser.upload` | **P0** — Archivo/procedencia y control de envío; nunca retry ciego de comunicación. | Upload termina con respuesta incierta. |
| `browser.download` | **P1** — Handle/evento de descarga, progreso y resultado por artefacto. | Dos descargas simultáneas no se confunden. |

### capability

| Herramienta | Prioridad y optimización | Criterio de aceptación |
|---|---|---|
| `capability.search` | **P0** — Catálogo completo, relevancia por intención, disponibilidad y ejemplos; eliminar fallback browser ficticio para búsquedas sin match. | ssh casa3090 devuelve ruta SSH; integración ausente se declara. |
| `capability.activate` | **P1** — Cargar esquemas seleccionados con presupuesto duro y permiso sin cambios; ofrecer search+load opcional. | Activar muchas herramientas no desborda contexto. |
| `capability.deactivate` | **P2** — Liberar schemas y explicar retención por core/recencia. | Desactivar no promete ocultar si sigue en core. |

### context

| Herramienta | Prioridad y optimización | Criterio de aceptación |
|---|---|---|
| `context.retrieve` | **P1** — Presupuesto de tokens, deduplicación entre memoria/índice y procedencia. | Consulta repetida devuelve contexto vigente. |
| `context.pin` | **P1** — Validar existencia y versión del recurso; pin idempotente. | Pin de archivo luego movido o borrado. |
| `context.unpin` | **P2** — Resultado removed/already_absent y revisión del conjunto. | Desanclar dos veces. |
| `context.list_pins` | **P1** — Mostrar vigencia, coste y referencias rotas; paginar. | Pins históricos después de mover sesión. |

### fs

| Herramienta | Prioridad y optimización | Criterio de aceptación |
|---|---|---|
| `fs.read` | **P1** — Añadir límites y lectura por rango; devolver hash, encoding, truncación y continuación sin releer todo. | Archivo grande, binario y UTF-8 con ñ. |
| `fs.read_lines` | **P1** — Leer hasta el rango solicitado por streaming; no cortar el archivo a 1 MB antes de localizar las líneas. | Consultar líneas posteriores al primer MB. |
| `fs.write` | **P0** — Escritura atómica por archivo y expected_hash opcional; devolver hash y diff resumido. | Cambio concurrente conserva el contenido del usuario. |
| `fs.patch` | **P0** — Conservar reemplazo exacto; añadir parches de varios bloques/archivos con prevalidación y resultados por archivo. | Coincidencia ambigua, CRLF, rollback y conflicto concurrente. |
| `fs.list` | **P1** — Paginación, filtros, orden estable y resumen; distinguir directorio vacío de inaccesible. | Directorio de 100000 entradas y reparse points. |
| `fs.glob` | **P1** — Límite, cursor e ignores explícitos; compartir implementación con search.files. | Mismo patrón produce rutas equivalentes y acotadas. |
| `fs.search_text` | **P1** — Unificar backend con search.regex y conservar alias compatible; contexto por coincidencia. | Equivalencia entre herramientas y regex inválida. |
| `fs.stat` | **P1** — Consulta múltiple acotada y metadatos suficientes para no hacer una lectura posterior innecesaria. | Lote con archivo ausente y symlink. |
| `fs.diff` | **P1** — No presentar diff de lecturas truncadas como completo; aceptar rangos y devolver artefacto para grandes. | Diferencia después del límite de lectura. |

### git

| Herramienta | Prioridad y optimización | Criterio de aceptación |
|---|---|---|
| `git.status` | **P1** — Snapshot estructurado reutilizable y parsing de rutas con separadores seguros. | Renombres, espacios y saltos de línea en nombres. |
| `git.diff` | **P1** — Filtros de archivos, base/head y estadísticas; contenido completo mediante artefacto. | Diff grande y cambios staged/unstaged. |
| `git.log` | **P1** — Cursor/ref y formato estructurado con hash, fecha y asunto. | Historial extenso y mensajes Unicode. |
| `git.show` | **P1** — Distinguir commit de archivo en ref; limitar salida e indicar resolución exacta. | Ref inválida y archivo grande en commit. |
| `git.branch` | **P1** — Devolver rama, upstream y estado detached; cache por estado del repo. | Detached HEAD y ausencia de upstream. |

### http

| Herramienta | Prioridad y optimización | Criterio de aceptación |
|---|---|---|
| `http.request` | **P0** — Idempotencia por método/operación y fase de fallo; coordinar retry interno/externo; filtros de respuesta. | POST aceptado con conexión cortada no se reenvía. |
| `http.sse` | **P1** — Cursor/event_id y reconexión limitada si servidor permite replay; salida incremental. | Corte y reconexión sin eventos duplicados. |

### lsp

| Herramienta | Prioridad y optimización | Criterio de aceptación |
|---|---|---|
| `lsp.definition` | **P1** — Disponibilidad por lenguaje y resultados con URI, rango y versión. | Archivo sin servidor y varias definiciones. |
| `lsp.references` | **P1** — Paginación y agrupación por archivo; fallback textual identificado. | Proyecto grande y referencias ambiguas. |
| `lsp.symbols` | **P1** — Cache por versión del documento; selección documento/workspace explícita. | Edición invalida el cache. |
| `lsp.diagnostics` | **P1** — Esperar versión diagnóstica solicitada con límite; distinguir vacío de todavía pendiente. | Diagnósticos llegan después de abrir. |
| `lsp.hover` | **P2** — Contenido compacto y sanitizado con rango y lenguaje. | Markdown grande y respuesta nula. |
| `lsp.signature` | **P2** — Firma activa y parámetro estructurados; límites de documentación. | Sobrecargas y Unicode en posición. |
| `lsp.rename` | **P1** — Aclarar que solo propone WorkspaceEdit; aplicar después por fs con precondiciones. | PLAN obtiene propuesta sin modificar archivos. |

### memory

| Herramienta | Prioridad y optimización | Criterio de aceptación |
|---|---|---|
| `memory.remember` | **P1** — Deduplicación por clave/hash y procedencia; scope siempre explícito. | Guardar dos veces la misma observación. |
| `memory.recall` | **P1** — Ranking por relevancia, vigencia y scope; salida acotada con referencias. | Datos contradictorios o vencidos. |
| `memory.update` | **P1** — Versión esperada y resultado changed/noop; invalidación de recuperación. | Dos actualizaciones concurrentes. |
| `memory.forget` | **P1** — Borrado idempotente por ID y resultado already_absent. | Repetición y aislamiento de proyectos. |
| `memory.episodic` | **P1** — Generar resumen acotado al cierre con hechos y evidencia; evitar episodios duplicados. | Reanudar después de caída no duplica episodio. |

### process

| Herramienta | Prioridad y optimización | Criterio de aceptación |
|---|---|---|
| `process.start` | **P0** — Handle estable ligado a sesión, argv y evento de arranque; reusar este backend para shell asíncrono. | Un arranque por request_id y proceso aún vivo. |
| `process.wait` | **P1** — Espera por evento/cursor con salida nueva; expiración de espera no equivale a matar proceso. | Espera sin novedades y proceso finalizado. |
| `process.output` | **P1** — Cursor por stdout/stderr, max_bytes y aviso de datos descartados. | Dos lecturas no repiten todo el buffer. |
| `process.signal` | **P0** — Normalizar señales por plataforma y devolver estado confirmado o pendiente. | TERM/INT/KILL en Windows y POSIX. |
| `process.list` | **P1** — Filtros por sesión/estado y retención limitada de procesos terminados. | Ningún handle ajeno aparece. |

### pty

| Herramienta | Prioridad y optimización | Criterio de aceptación |
|---|---|---|
| `pty.start` | **P1** — Exponer disponibilidad POSIX hoy; evaluar ConPTY dentro del motor para Windows. | Herramienta deshabilitada con motivo antes de fallar. |
| `pty.read` | **P1** — Salida por cursor y decoder incremental; espera hasta cambios con deadline. | Carácter UTF-8 dividido entre chunks. |
| `pty.write` | **P0** — Separar bytes literales de submit_line; no inferir Enter; evitar reenvío tras resultado incierto. | Ctrl-C, texto sin Enter y reintento ambiguo. |
| `pty.resize` | **P1** — Coalescer cambios rápidos de tamaño y validar límites. | Redimensionamiento rápido sin tormenta de llamadas. |
| `pty.terminate` | **P0** — Cierre idempotente observable y liberación de PTY/árbol. | Repetir terminación no afecta otro proceso. |

### search

| Herramienta | Prioridad y optimización | Criterio de aceptación |
|---|---|---|
| `search.files` | **P1** — Backend compartido con glob, respetar ignores y ordenar rutas por relevancia. | Monorepo con node_modules y rutas Unicode. |
| `search.regex` | **P1** — Priorizar rg cuando esté disponible; fallback explícito con presupuesto de tiempo y contexto. | Paridad del fallback, cancelación y regex costosa. |
| `search.symbols` | **P1** — Indicar motor AST/LSP/regex, exactitud e índice vigente; filtrar lenguaje y clase. | Mismo símbolo en varios lenguajes. |
| `search.references` | **P1** — Separar referencias semánticas de coincidencias textuales y limitar por símbolo/ámbito. | Homónimos en módulos diferentes. |
| `search.hybrid` | **P1** — Deduplicar rutas/rangos y explicar brevemente origen del resultado. | Consulta equivalente a búsquedas individuales sin duplicados. |

### shell

| Herramienta | Prioridad y optimización | Criterio de aceptación |
|---|---|---|
| `shell.exec` | **P0** — Añadir ejecución argv sin shell y shell explícito; salida incremental y transición a handle para comandos largos. | Windows quoting, ñ, timeout, cancelación del árbol. |

### skills

| Herramienta | Prioridad y optimización | Criterio de aceptación |
|---|---|---|
| `skills.list` | **P1** — Catálogo canónico compartido con resume y búsqueda; metadatos mínimos y disponibilidad. | Skill empaquetada aparece en los tres. |
| `skills.show` | **P1** — Cuerpo versionado, carga bajo demanda y referencias resueltas. | Skill cambia entre listar y abrir. |
| `skills.activate` | **P1** — Activación idempotente ligada a versión y trust; recuperar antes de inyectar. | Recarga conserva activación y detecta cambios. |
| `skills.deactivate` | **P2** — Noop explícito y retirada del contexto futuro. | Desactivar dos veces sin error falso. |

### ssh

| Herramienta | Prioridad y optimización | Criterio de aceptación |
|---|---|---|
| `ssh.inspect` | **P1** — Resolver alias OpenSSH de forma controlada además de destinos fijados; sections múltiples en una conexión y resultados parciales tipados. | casa3090 resuelto sin búsquedas repetidas; falta nvidia-smi no elimina CPU/RAM. |

### user

| Herramienta | Prioridad y optimización | Criterio de aceptación |
|---|---|---|
| `user.ask` | **P1** — Canal persistente de aclaraciones con respuesta explícita; permitir trabajo independiente cuando el contrato lo soporte. | Omisión/cierre/cancelación/doble envío no equivalen a consentimiento. |

### verify

| Herramienta | Prioridad y optimización | Criterio de aceptación |
|---|---|---|
| `verify.record` | **P0** — Vincular evidencia a tool_call_id, turno y revisión; separar registro declarado de ejecución comprobada. | No aceptar evidencia vieja para cambios nuevos. |
| `verify.plan` | **P1** — Derivar checks relevantes del proyecto y cambios sin inventar scripts. | Proyecto sin tests y cambio solo documental. |
| `verify.evaluate` | **P0** — Evaluar cobertura y vigencia de evidencia, con motivos concretos por requisito. | Test aprobado antes de una nueva edición no basta. |

### web

| Herramienta | Prioridad y optimización | Criterio de aceptación |
|---|---|---|
| `web.search` | **P1** — Varias consultas acotadas, filtros de dominio/fecha y IDs de fuente. | Consultas independientes sin una ronda por consulta. |
| `web.fetch` | **P1** — Store de fuentes por sesión con ETag/TTL y force_refresh; devolver source_id. | Fetch repetido comparte snapshot vigente. |
| `web.open` | **P1** — Abrir source_id/rango del snapshot, conservando soporte URL. | Abrir resultado buscado sin descargar innecesariamente. |
| `web.links` | **P1** — Extraer del snapshot y paginar enlaces con IDs estables. | Mismos IDs hasta cambiar versión. |
| `web.find` | **P1** — Buscar en source_id con rangos de contexto y cursor. | Varias búsquedas sobre una sola descarga. |
| `web.extract_text` | **P1** — Reusar parseo y seleccionar secciones por presupuesto. | HTML largo sin duplicar fetch. |
| `web.extract_markdown` | **P1** — Conversión cacheada con estructura, tablas y referencias. | No ejecutar HTML y preservar enlaces. |
| `web.extract_metadata` | **P2** — Metadatos estructurados con origen y campos desconocidos explícitos. | Fechas ausentes o contradictorias. |
| `web.download` | **P1** — Streaming a Artifact Store con progreso, hash y tamaño máximo. | Cancelación elimina parcial y conserva resultado previo. |
| `web.cite` | **P1** — Citar snapshot y pasaje ya obtenido; no convertir la cita en otra descarga. | La cita corresponde a la versión leída. |
| `web.sources` | **P1** — Listado de referencias ya usadas y consultas múltiples acotadas; semántica explícita. | Sin descargas sorpresa para listar fuentes. |

## Extensiones: MCP, plugins y OpenAPI

La lista dinámica exacta depende de lo instalado. Estas recomendaciones cubren los adaptadores, sin inventar un número de herramientas conectadas.

| Fuente | Optimización | Aceptación |
|---|---|---|
| MCP | Reusar conexiones y cachear tools/list con invalidación; conservar structuredContent, outputSchema e isError; propagar cancelación/deadline; tratar hints como metadatos sujetos a confianza. | Dos servidores con nombres parecidos sin colisiones; reinicio sin catálogo obsoleto; cancelación observable; error estructurado no se transforma en éxito. |
| Plugins | Diagnóstico por plugin en lugar de silenciar la carga con suppress(Exception); versión del manifiesto, disponibilidad y aislamiento del presupuesto. | Un plugin roto aparece con motivo y no oculta los demás. |
| OpenAPI | Contratos compactos por operación, paginación estándar, auth preflight sin secretos, idempotencia por método/operación y esquema de respuesta cuando sea viable. | POST incierto no se reenvía; respuesta parcial tiene cursor; operación deshabilitada no se ofrece como callable. |
| GitHub futuro | Integración específica sobre servicio existente o gh, con repo/remote y auth resueltos una vez; tipos para issues/PR/checks. | Repo local identifica owner/repo; lectura no necesita buscar “cómo usar GitHub”; no publicar ni comentar sin autorización. |

GitHub no forma parte de las 105 herramientas nativas actuales. Su incorporación es una ampliación posterior, no una optimización ya hecha.

## Responsabilidades entre repositorios

| Capa | Trabajo |
|---|---|
| Engine/CLI | Catálogo, resolver de destinos, schemas, ejecución, permisos, composición, deadlines, retries, cursors, caché, procedencia y pruebas. |
| CLI | tools list/search/show usa catálogo real con contexto; salida JSON y humana coherentes; disponibilidad antes de ejecutar. |
| Protocolo | Versionar capacidades nuevas y generar tipos. Mantener resultados antiguos durante migración o declarar incompatibilidad. |
| Code | Mostrar operación lógica y detalles expandibles: destino, progreso, resultado parcial, siguiente acción y error accionable. Conservar tool_call_id y contar llamadas reales, sin ocultarlas bajo un número ficticio. |
| Skills | Procedimientos cortos de diagnóstico/desarrollo que usen capacidades comprobadas; no parsear SSH ni duplicar política en prompts. |

## Orden de implementación

1. **P0: contrato y evidencia.** Catálogo único, diagnósticos de carga, deadline heredado, retry por operación, errores y schemas de salida prioritarios. Empezar por HTTP/browser/fs y pruebas de fallos ambiguos.
2. **P1: flujo diario.** Search + lectura por rangos, patch con precondiciones, shell/process con salida incremental. Reducir rondas sin cambiar autoridad de permisos.
3. **P1: integraciones.** Resolver SSH y consulta agregada; store de fuentes web; browser con IDs/snapshots; LSP disponible por lenguaje.
4. **P1: composición.** Habilitar batches y concurrencia real solo después del aislamiento de recursos y budgets. Comenzar con operaciones de lectura y éxito/fallo parcial explícitos.
5. **P1/P2: estado y extensiones.** Memoria/contexto/artefactos, evidencia verificable, agentes/skills y matriz MCP/plugin/OpenAPI; integrar UX y documentación generada en Code.

### Caso SSH

Objetivo propuesto para un alias existente y confiable: una invocación lógica de inspección, una resolución local y una conexión remota para sistema/CPU/RAM/discos/GPU. Cada sección retorna ok/unsupported/error y su origen. No registrar ni confiar silenciosamente en una nueva clave. Falta de GPU no obliga a repetir CPU/RAM. La resolución debe considerar Include, Host, ProxyJump y agentes; no basta parsear líneas con regex. Evaluar cualquier directiva que pueda ejecutar procesos durante resolución antes de usar OpenSSH como resolver.

### Evaluación reproducible

Los siguientes son objetivos propuestos; no cifras medidas ni garantías:

| Escenario | Objetivo de aceptación |
|---|---|
| Hardware remoto | Una inspección lógica y una conexión en el caso listo; resultados parciales por sección. |
| Encontrar y corregir una función | Búsqueda acotada → lectura contextual → patch → validación pertinente, sin leer el repo entero. |
| Consultar varias secciones de una página | Un snapshot descargado, operaciones locales hasta refresco explícito/expiración. |
| Proceso largo | Un arranque; esperas por evento; output incremental sin duplicados. |
| Herramienta no configurada | Primer resultado identifica qué falta; no cadena de búsquedas equivalentes. |
| Operación con efecto y respuesta perdida | Cero reintentos automáticos sin prueba de no ejecución o garantía de idempotencia. |
| Mover sesión | Ninguna caché o referencia histórica se resuelve contra el proyecto incorrecto. |
| Windows | Rutas con espacios/ñ, CRLF, handles, quoting y cancelación probados en plataforma real. |

Medir por tarea: éxito verificado, rondas del modelo, llamadas reales e internas, porcentaje de fallos evitables, repeticiones sin estado nuevo, p50/p95 de latencia, tokens de schemas y resultados, solicitudes de aprobación redundantes y cancelación. Comparar con el mismo modelo/provider/modo, fixtures y estado inicial; repetir para separar variación del modelo de mejoras del motor. Usar dobles locales para fallos de red y mutaciones ambiguas; probar conexiones reales solo con autorización y destinos preparados.

## Apéndice: cobertura del inventario

Inventario obtenido instanciando las fábricas de herramientas sin invocar handlers ni cargar secretos. Los metadatos son del checkout auditado y pueden cambiar; core indica always_loaded, no disponibilidad efectiva.

| Herramienta | Handler en src/rinari | Core | Idempotente declarado | Output schema |
|---|---|---|---|---|
| `agent.cancel` | `agents/tools.py` | sí | sí | no |
| `agent.message` | `agents/tools.py` | sí | sí | no |
| `agent.result` | `agents/tools.py` | sí | sí | no |
| `agent.spawn` | `agents/tools.py` | sí | sí | no |
| `agent.status` | `agents/tools.py` | sí | sí | no |
| `agent.synthesize` | `agents/tools.py` | sí | sí | no |
| `agent.wait` | `agents/tools.py` | sí | sí | no |
| `artifact.metadata` | `tools/native/artifact.py` | sí | sí | no |
| `artifact.read` | `tools/native/artifact.py` | sí | sí | no |
| `browser.a11y` | `tools/native/browse.py` | no | sí | no |
| `browser.check` | `tools/native/browse.py` | no | sí | no |
| `browser.click` | `tools/native/browse.py` | no | sí | no |
| `browser.close` | `tools/native/browse.py` | no | sí | no |
| `browser.connect` | `tools/native/browse.py` | no | sí | no |
| `browser.console` | `tools/native/browse.py` | no | sí | no |
| `browser.cookies` | `tools/native/browse.py` | no | sí | no |
| `browser.download` | `tools/native/browse.py` | no | sí | no |
| `browser.drag` | `tools/native/browse.py` | no | sí | no |
| `browser.evaluate` | `tools/native/browse.py` | no | sí | no |
| `browser.fill` | `tools/native/browse.py` | no | sí | no |
| `browser.launch` | `tools/native/browse.py` | no | sí | no |
| `browser.navigate` | `tools/native/browse.py` | no | sí | no |
| `browser.network` | `tools/native/browse.py` | no | sí | no |
| `browser.open` | `tools/native/browse.py` | no | sí | no |
| `browser.screenshot` | `tools/native/browse.py` | no | sí | no |
| `browser.scroll` | `tools/native/browse.py` | no | sí | no |
| `browser.select` | `tools/native/browse.py` | no | sí | no |
| `browser.set_cookie` | `tools/native/browse.py` | no | sí | no |
| `browser.snapshot` | `tools/native/browse.py` | no | sí | no |
| `browser.status` | `tools/native/browse.py` | no | sí | no |
| `browser.tabs` | `tools/native/browse.py` | no | sí | no |
| `browser.tabs_close` | `tools/native/browse.py` | no | sí | no |
| `browser.type` | `tools/native/browse.py` | no | sí | no |
| `browser.upload` | `tools/native/browse.py` | no | sí | no |
| `capability.activate` | `capability_search.py` | sí | no | no |
| `capability.deactivate` | `capability_search.py` | sí | no | no |
| `capability.search` | `capability_search.py` | sí | sí | no |
| `context.list_pins` | `tools/native/context.py` | sí | sí | no |
| `context.pin` | `tools/native/context.py` | sí | sí | no |
| `context.retrieve` | `tools/native/context.py` | sí | sí | no |
| `context.unpin` | `tools/native/context.py` | sí | sí | no |
| `fs.diff` | `tools/native/fs.py` | sí | sí | no |
| `fs.glob` | `tools/native/fs.py` | sí | sí | no |
| `fs.list` | `tools/native/fs.py` | sí | sí | no |
| `fs.patch` | `tools/native/fs.py` | sí | no | no |
| `fs.read` | `tools/native/fs.py` | sí | sí | no |
| `fs.read_lines` | `tools/native/fs.py` | sí | sí | no |
| `fs.search_text` | `tools/native/fs.py` | sí | sí | no |
| `fs.stat` | `tools/native/fs.py` | sí | sí | no |
| `fs.write` | `tools/native/fs.py` | sí | sí | no |
| `git.branch` | `tools/native/git.py` | sí | sí | no |
| `git.diff` | `tools/native/git.py` | sí | sí | no |
| `git.log` | `tools/native/git.py` | sí | sí | no |
| `git.show` | `tools/native/git.py` | sí | sí | no |
| `git.status` | `tools/native/git.py` | sí | sí | no |
| `http.request` | `tools/native/http.py` | sí | sí | no |
| `http.sse` | `tools/native/http.py` | sí | sí | no |
| `lsp.definition` | `tools/native/lsp.py` | sí | sí | no |
| `lsp.diagnostics` | `tools/native/lsp.py` | sí | sí | no |
| `lsp.hover` | `tools/native/lsp.py` | sí | sí | no |
| `lsp.references` | `tools/native/lsp.py` | sí | sí | no |
| `lsp.rename` | `tools/native/lsp.py` | sí | sí | no |
| `lsp.signature` | `tools/native/lsp.py` | sí | sí | no |
| `lsp.symbols` | `tools/native/lsp.py` | sí | sí | no |
| `memory.episodic` | `tools/native/memory.py` | sí | no | no |
| `memory.forget` | `tools/native/memory.py` | sí | sí | no |
| `memory.recall` | `tools/native/memory.py` | sí | sí | no |
| `memory.remember` | `tools/native/memory.py` | sí | sí | no |
| `memory.update` | `tools/native/memory.py` | sí | no | no |
| `process.list` | `tools/native/process.py` | sí | sí | no |
| `process.output` | `tools/native/process.py` | sí | sí | no |
| `process.signal` | `tools/native/process.py` | sí | no | no |
| `process.start` | `tools/native/process.py` | sí | no | no |
| `process.wait` | `tools/native/process.py` | sí | sí | no |
| `pty.read` | `tools/native/ptytools.py` | sí | no | no |
| `pty.resize` | `tools/native/ptytools.py` | sí | sí | no |
| `pty.start` | `tools/native/ptytools.py` | sí | no | no |
| `pty.terminate` | `tools/native/ptytools.py` | sí | no | no |
| `pty.write` | `tools/native/ptytools.py` | sí | no | no |
| `search.files` | `tools/native/search.py` | sí | sí | no |
| `search.hybrid` | `tools/native/search.py` | sí | sí | no |
| `search.references` | `tools/native/search.py` | sí | sí | no |
| `search.regex` | `tools/native/search.py` | sí | sí | no |
| `search.symbols` | `tools/native/search.py` | sí | sí | no |
| `shell.exec` | `tools/native/shell.py` | sí | no | no |
| `skills.activate` | `skills/tools.py` | sí | sí | no |
| `skills.deactivate` | `skills/tools.py` | sí | sí | no |
| `skills.list` | `skills/tools.py` | sí | sí | no |
| `skills.show` | `skills/tools.py` | sí | sí | no |
| `ssh.inspect` | `tools/native/ssh.py` | sí | sí | no |
| `user.ask` | `tools/native/questions.py` | sí | no | no |
| `verify.evaluate` | `tools/native/verify.py` | sí | sí | no |
| `verify.plan` | `tools/native/verify.py` | sí | sí | no |
| `verify.record` | `tools/native/verify.py` | sí | no | no |
| `web.cite` | `tools/native/web.py` | sí | sí | no |
| `web.download` | `tools/native/web.py` | sí | sí | no |
| `web.extract_markdown` | `tools/native/web.py` | sí | sí | no |
| `web.extract_metadata` | `tools/native/web.py` | sí | sí | no |
| `web.extract_text` | `tools/native/web.py` | sí | sí | no |
| `web.fetch` | `tools/native/web.py` | sí | sí | no |
| `web.find` | `tools/native/web.py` | sí | sí | no |
| `web.links` | `tools/native/web.py` | sí | sí | no |
| `web.open` | `tools/native/web.py` | sí | sí | no |
| `web.search` | `tools/native/web.py` | sí | sí | no |
| `web.sources` | `tools/native/web.py` | sí | sí | no |
