# Optimización de herramientas: entrega local

Fecha: 2026-09-10. Engine y CLI comparten implementación; Code consume el protocolo.
No se añadió un segundo runtime. Los cambios están en los checkouts y en el motor
empaquetado local; no constituyen una versión publicada ni un push.

## Cobertura verificable

El [inventario generado](tool-contracts-inventory.json) (regenerado el 2026-09-24) contiene las **112 herramientas**,
sus schemas de entrada/salida, efectos, idempotencia declarada, disponibilidad de
plataforma y soporte de request_id. La [auditoría original](tool-optimization-audit.md)
conserva el diagnóstico previo y las propuestas, no el estado de ejecución actual.

Todas las herramientas registradas pasan por la validación, permisos, presupuestos,
deadlines, errores y límites de salida del runtime compartido. Los schemas de salida
son aditivos: los campos conocidos son opcionales para admitir respuestas alternativas.
Las extensiones mantienen sus propios contratos y los fallos de carga dejan diagnóstico.
Las operaciones con efectos no tienen reintentos automáticos del runtime.
Los errores conservan resultados parciales; las salidas estructuradas grandes se
guardan completas en artefactos JSON después de ocultar secretos.

| Familia | Mejora aplicada |
|---|---|
| capability | Ranking común, búsqueda y activación en una llamada, presupuesto de schemas, sin resultados ficticios; omite requisitos conocidos ausentes. |
| fs | SHA y reemplazo atómico, Unicode/CRLF, rangos y paginación; lectura/stat por lotes de hasta 16 rutas con cuatro workers; parches de varios archivos prevalidan permisos y contenido, con rollback que respeta cambios concurrentes. |
| search | Glob compartido, límites de recorrido y tamaño, exclusión de enlaces que escapan; búsquedas literal/regex en worker cancelable con ripgrep o Python. |
| shell/process | argv sin shell, background mediante el servicio existente, cwd de sesión, stdin cerrado y cursores de salida; listado de procesos activos. |
| pty | Un único lector del descriptor, consumo incremental del buffer, escritura literal y escalado TERM/KILL; requisito POSIX explícito. |
| git | Rutas y renombres con NUL, diff de contenido por defecto, log estructurado/paginado y deadline heredado. |
| ssh | Destinos registrados y alias estáticos existentes; hardware por secciones en una conexión, resultado parcial y clave de host estricta. |
| web/http | Snapshot acotado y source_id reutilizable, varias consultas, fuentes sin refetch; una sola autoridad de retry HTTP y Last-Event-ID para SSE. |
| browser | Reutilización de conexión, snapshot semántico e IDs de nodos para apuntar; conserva drenado incremental de consola/red y política de mutaciones. |
| memory | Versiones optimistas, deduplicación persistente de episodios y aislamiento de memoria de chats generales. |
| context | Presupuesto de recuperación, paginación, existencia y origen absoluto de archivos fijados. |
| verify | Revisión de metadatos del workspace para invalidar evidencia anterior a cambios. |
| lsp | Ruta correcta, documentos acotados, evita didChange redundante; conversión opcional Unicode a UTF-16, estado/versiones de diagnósticos y cancelación/deadline. |
| agent/skills | Espera de varios agentes, efectos declarados correctamente, activaciones repetidas sin duplicación. |
| artifact/user.ask | Contratos compartidos; páginas de artefactos respetan UTF-8; las preguntas conservan su ciclo de respuesta/cancelación del motor. |

Las herramientas con efectos que anuncian request_id deduplican en el mismo runtime
las últimas 256 solicitudes. Reutilizar una clave con otros argumentos produce conflicto.

## Integración y paquete

- CLI y `tool.list` usan el mismo catálogo incorporado. El catálogo de inspección
  muestra requisitos conocidos; la sesión comprueba servicios y permisos al ejecutar.
- Code permite buscar por nombre/descripción, agrupar por familia y ver requisitos
  ausentes. Los tipos TypeScript/Rust provienen del esquema del motor.
- El handshake exige `tool_contracts_v1` para impedir que un motor viejo parezca compatible.
- `engine-manifest.json` identifica la base Git y marca `development_build=true`.
  El paquete local contiene los cambios sin commit y registra su SHA-256 de wheel
  en `engine-dist/ENGINE_SOURCE.json` y `ENGINE_VERSION`.
- El empaquetador exige `-Development` para fuentes modificadas, comprueba rutas
  antes de limpiar y prueba el contrato con un home temporal.
- Comprobación reproducible: `python scripts/check-engine-tools.py` (desde Code).
  Arranca el Python empaquetado y verifica 105 nombres únicos, schemas y capacidades.

## Validación realizada en Windows

- Motor: **1.201 aprobadas, 7 omitidas** en la suite unitaria completa.
- Regresiones adicionales de LSP, contratos y operaciones nuevas: **56 aprobadas**.
- SSH: **7 pruebas aprobadas**, incluida la prueba adicional de hardware en una conexión con GPU ausente.
- Ruff sobre `src` y `tests/unit`: aprobado.
- Code: **47 pruebas aprobadas**, TypeScript/Vite aprobado.
- Rust: **35 pruebas aprobadas** y ejecutable de escritorio compilado.
- `protocol:check`: aprobado.
- Python empaquetado: handshake y catálogo de **105 herramientas** aprobados con
  un RINARI_HOME temporal, tanto en engine-dist como en los recursos del ejecutable;
  ambas copias tienen el mismo SHA-256 de wheel. No se alteró el estado del usuario
  durante la prueba.
- La suite usa `RINARI_KEYRING=0` por el límite de recursos del almacén Windows
  observado durante las pruebas. No se borraron credenciales.

## Límites de esta implementación

La auditoría contiene propuestas de expansión que no son garantías del producto.
La concurrencia se limita a lecturas puras por lotes; la ejecución general permanece
serial para conservar orden de políticas, presupuestos y eventos. No hay ConPTY en
Windows. Los alias SSH con Match, Include o proxies requieren registrar el destino o
usar shell; no se ejecutan directivas de configuración automáticamente.

Los recibos y snapshots web no sobreviven al runtime ni son almacenamiento duradero.
El rollback de varios archivos no equivale a una transacción del sistema de archivos.
La revisión de verificación usa tamaño/mtime, no acredita por sí sola que una prueba
se ejecutó ni protege contra alteración deliberada de esos metadatos. Los cursores
persistentes de navegador no se añadieron. Las columnas LSP de salida usan UTF-16;
la entrada admite column_encoding=unicode.

No se han certificado conexiones reales a SSH, navegadores ni todos los servicios
externos. Las pruebas locales no garantizan una experiencia perfecta para cualquier
proveedor. Una instancia ya abierta debe reiniciar su motor para cargar el paquete nuevo.
