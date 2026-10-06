# Chat: visor de adjuntos sobre la ventana

El visor de adjuntos se monta como diálogo sobre la ventana, fuera de los
contenedores de la conversación. Mientras está abierto bloquea el
desplazamiento del fondo y retiene el foco.

```bash
npm run ui:e2e -- chat-image-overlay [--keep]
```

El modelo falso genera cuatro turnos largos. Solo se guioniza el selector
nativo de archivos; la validación del host, la preparación del adjunto, el
envío, el historial y la lectura de la imagen son el código de producción.

Qué comprueba:

- El diálogo y su fondo cubren la ventana en Normal y en Boards, abiertos
  desde el historial y desde el composer.
- Con rueda y teclado de Electron, el fondo no se desplaza, el visor no se
  mueve y el foco no sale de él.
- Se cierra con Escape, con el botón y con el fondo, y después el chat vuelve
  a responder al scroll.
- Un adjunto de texto largo se desplaza dentro del visor.
- Una ventana más baja.
