# Conversación nueva: borrador hasta el primer mensaje

«Nueva conversación», el «+» de un proyecto, la página del proyecto y
«Añadir panel» abren un borrador: composer, modo, permisos y modelo listos,
sin `session.create`. La sesión se crea con el primer mensaje, vinculada al
proyecto (o como chat general), con lo que se eligió en el borrador.

```bash
npm run ui:e2e -- conversation-draft [--keep]
```

Qué comprueba:

- Pulsar el «+» del proyecto y «Nueva conversación» varias veces no crea
  sesiones.
- El primer mensaje crea una sola sesión, del proyecto y en el modo elegido
  (PLAN).
- En Boards, un panel borrador no crea sesión; al enviar, el mismo panel pasa a
  ser la sesión nueva.
