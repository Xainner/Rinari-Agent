# Corrección de autoría de skills

El motor fijado por `engine-manifest.json` incorpora la corrección del flujo
`/learn`: extracción de subtítulos y código dentro de Procedure, validación de
borradores sin guardar y diagnósticos estructurados con sugerencias de nombres
de herramientas. El detalle y las regresiones viven en Rinari-CLI, en
`docs/skill-authoring-regression.md`.

El modelo usa `skills.validate_draft` antes de `skills.propose`. Son herramientas
del Engine, no nuevas llamadas renderer→host: no se añade otra validación en
React ni un canal IPC o comando paralelo al inventario desktop. El esquema del
protocolo permanece compatible y las notificaciones normales solo se emiten
cuando hay un guardado o propuesta real.

## Comprobaciones de integración

- `npm run protocol:check`: el esquema fijado sigue coincidiendo.
- `npm run parity:check`: inventario de comandos sin métodos pendientes.
- `npm run typecheck:electron`, `npm test`, `npm run build` y
  `npm run desktop:build`.
- `npm run desktop:smoke`: arranque del renderer, bridge y aislamiento de Node;
  esta prueba no demuestra por sí sola la finalización de una sesión `/learn`.
- El Engine prueba `/learn` por su protocolo con un modelo determinista:
  validar no crea la skill, proponer sí y deshacer conserva su comportamiento.

El PR de Agent debe revisarse junto con el PR del motor y fusionarse después de
él. El SHA apunta al commit de la corrección; no es una dependencia flotante.
Este cambio no instala una nueva versión sobre la aplicación del usuario ni
reescribe sus skills, historial o memorias anteriores.
