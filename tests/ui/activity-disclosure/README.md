# Actividad visible en vivo y resumen plegado al terminar

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

- Leyenda de tiempo sin desplegable del turno; progreso visible tras clasificarse.
- Operaciones plegadas con los detalles pesados sin montar hasta abrirlas.
- Instrucción visible entre segmentos, con identidades independientes.
- Inspección conservada durante la ejecución y al pasar de Normal a Boards.
- Plegado automático de todos los segmentos al terminar, aunque hubiera
  operaciones abiertas; reapertura que restaura los detalles interiores.
- Respuesta final completa y única, fuera de la actividad.
- Navegación al cuerpo del resultado aunque la actividad esté abierta.
- Cabecera visible y foco conservado al plegar un historial largo.
- Apertura y cierre mediante teclado, dos paneles, ventana estrecha y
  preferencia de movimiento reducido.
- Error real del proveedor visible fuera, seguido de un turno nuevo válido.
- Cancelación real mientras el proveedor espera; su respuesta tardía no revive
  el turno ni altera la lectura del panel vecino.
- Colapsar y expandir paneles conserva la inspección.
- Reconstrucción del historial al recargar; la apertura no persiste entre
  ejecuciones de la app.

`report.json` registra el número de nodos con la actividad abierta y cerrada
y el tiempo desde abrir hasta el segundo frame (`expandTwoFramesMs`). Es una
medición diagnóstica del equipo que ejecuta la prueba, no un benchmark.

Con `--keep`, el proveedor libera un paso cada cuatro segundos tras verificar
el recorrido para poder inspeccionar la presentación durante la ejecución. La ventana queda disponible para revisar el historial y enviar
mensajes de prueba. El watchdog del lanzador se desactiva solo cuando el
escenario confirma éxito.

Complementos: `subagent-follow`, `chat-image-overlay`, `chat-scroll-button`,
`chat-send-jump` y `attention-taskbar`. Los tests unitarios de
`activityPresentation` y `ActivityDisclosure` cubren precedencias, eventos
repetidos/tardíos, aprobaciones de subagentes, texto parcial y clasificado,
steering, duraciones, aislamiento y restauración de la lectura interna.
