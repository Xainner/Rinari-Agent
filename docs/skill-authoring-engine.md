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

## Mejoras de skills aprendidas: aviso para revisar, no para aprobar

El Engine guarda activa la actualización de una skill **aprendida** en cualquier
turno, no solo con `/learn`. El aviso `skill.learned` (`status: active`,
`update: true`, `previous_version`) es para revisar:

- El aviso y el centro de notificaciones ofrecen «Revisar», que abre la ficha de
  esa skill con el último cambio desplegado (diff por líneas de `SKILL.md`), y
  «Deshacer», que vuelve a la versión anterior con `skill.revert`.
- La ficha de una skill aprendida con historial muestra «Último cambio» a partir
  de `skill.get` → `previous` (`{version, skill_md}`), con el mismo diff y el
  botón para volver a esa versión. Un Engine anterior no envía `previous` y la
  sección no aparece.
- Siguen esperando aprobación en «Por aprobar»: una skill nueva que Rinari
  propone fuera de `/learn`, un cambio a una skill instalada o creada por el
  dueño y cualquier contenido que la revisión marque como peligroso. Las
  actualizaciones pendientes también se revisan como diff.

El Engine refuerza estas actualizaciones: exige subir la versión, conserva las
referencias que no se reenvían, ignora reenvíos idénticos, descarta propuestas
antiguas del mismo nombre al aplicar una versión y conserva 20 versiones por skill.
No hay métodos ni eventos nuevos de protocolo: solo campos opcionales.

## Comprobaciones de integración

- `npm run protocol:check`: el esquema fijado sigue coincidiendo.
- `npm run parity:check`: inventario de comandos sin métodos pendientes.
- `npm run typecheck:electron`, `npm test`, `npm run build` y
  `npm run desktop:build`.
- `npm run desktop:smoke`: arranque del renderer, bridge y aislamiento de Node;
  esta prueba no demuestra por sí sola la finalización de una sesión `/learn`.
- El Engine prueba `/learn` por su protocolo con un modelo determinista:
  validar no crea la skill, proponer sí y deshacer conserva su comportamiento.

El pin apunta al merge de Rinari-CLI #38 en `main` (`f3fecbd`), que incluye el
de #37; el inventario de herramientas coincide con el catálogo de ese commit y
`protocol:check` se repitió contra ese SHA.
Este cambio no instala una nueva versión sobre la aplicación del usuario ni
reescribe sus skills, historial o memorias anteriores.
