# Chat: aviso de cambio de modelo

Cuando un turno lo escribe un modelo distinto del Ãºltimo que escribiÃ³ en la
conversaciÃ³n, el Engine registra `model.changed` y la app muestra Â«Se cambiÃ³
de modelo de A a BÂ» debajo del primer texto del modelo nuevo. Un modelo
elegido que falla antes de escribir no cuenta. Ver `docs/activity-timeline.md`.

```bash
npm run ui:e2e -- model-change-notice [--keep]
```

Dos modelos sobre el mismo modelo falso (`prueba-local` y `prueba-dos`).

QuÃ© comprueba:

- El primer modelo de una conversaciÃ³n no produce aviso.
- Cambiar de modelo en el composer y enviar: un aviso, debajo de la respuesta.
- Otro turno con el mismo modelo no lo repite.
- Tras reiniciar la app y el Engine, el aviso sigue en su sitio.
