# Actividad plegable en vivo y resumen al terminar

```bash
npm run build
npm run desktop:build
npm run ui:e2e -- activity-disclosure
npm run ui:e2e -- activity-disclosure --keep
```

Usa el Engine real fijado por `engine-manifest.json`, un perfil y home
temporales y un proveedor guionizado en loopback. El modelo retiene cada
petición hasta que el escenario permite avanzar. No utiliza credenciales
ni modifica las conversaciones personales.

El recorrido ejecuta 24 herramientas con progreso público extenso e
intercala una instrucción mediante el composer. Comprueba:

- Actividad inicialmente plegada y sin montar su cuerpo.
- Instrucción visible entre segmentos, con identidades independientes.
- Apertura manual conservada durante la ejecución, al terminar y al pasar
  de Normal a Boards; restauración de los detalles interiores.
- Respuesta final completa y única, fuera de la actividad.
- Navegación al cuerpo del resultado aunque la actividad esté abierta.
- Cabecera visible y foco conservado al plegar un historial largo.
- Apertura y cierre mediante teclado, dos paneles, ventana estrecha y
  preferencia de movimiento reducido.
- Error real del proveedor visible fuera, seguido de un turno nuevo válido.
- Reconstrucción del historial al recargar; la apertura no persiste entre
  ejecuciones de la app.

`report.json` registra el número de nodos con la actividad abierta y cerrada
y el tiempo desde abrir hasta el segundo frame (`expandTwoFramesMs`). Es una
medición diagnóstica del equipo que ejecuta la prueba, no un benchmark.

Con `--keep`, el proveedor deja de retener peticiones tras verificar el
recorrido. La ventana queda disponible para revisar el historial y enviar
mensajes de prueba. El watchdog del lanzador se desactiva solo cuando el
escenario confirma éxito.

Complementos: `subagent-follow`, `chat-image-overlay`, `chat-scroll-button`,
`chat-send-jump` y `attention-taskbar`. Los tests unitarios de
`activityPresentation` y `ActivityDisclosure` cubren precedencias, eventos
repetidos/tardíos, aprobaciones de subagentes, texto parcial y clasificado,
steering, duraciones, aislamiento y restauración de la lectura interna.
