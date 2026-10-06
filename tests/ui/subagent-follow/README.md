# Actividad de subagente: seguir el final

Â«Ver actividadÂ» de un subagente tiene su propio scroll (32rem). Sigue el final
mientras se lee abajo, tambiÃ©n cuando crece un mensaje existente; se pausa al
subir, solo en esa tarjeta, y vuelve con Â«Ir al finalÂ». Un agente terminado se
abre desde el principio, para leerlo.

```bash
npm run ui:e2e -- subagent-follow [--keep]
```

El modelo falso reparte las peticiones por carriles: el coordinador lanza un
`explore` y lo espera; el subagente avanza un paso cada vez que la prueba lo
suelta (`/__release?lane=sub`), con la tarjeta abierta.

QuÃ© comprueba:

- Abierta con el agente en marcha, la tarjeta muestra el Ãºltimo paso y sigue
  los siguientes aunque desborden.
- Subir pausa el seguimiento: un paso nuevo no la mueve y aparece Â«Ir al
  finalÂ».
- Â«Ir al finalÂ» reanuda; el resumen final tambiÃ©n queda a la vista.
