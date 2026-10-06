# Archivos: video, imagen y PDF del workspace

Los enlaces a archivos que no son texto ya no pasan por la vista de texto del
Engine (512 KiB, UTF-8). `workspace.file.resolve` autoriza el archivo sin
leerlo; el host lo sirve a la app por tramos (`app://rinari/__media/<token>`)
y abre fuera o revela en su carpeta la ruta aprobada.

```bash
npm run ui:e2e -- file-media [--keep]
```

`clip.mp4` es un video de prueba de 2 s (H.264 + AAC) generado con ffmpeg.

Qué comprueba:

- El video se reproduce y salta a mitad (peticiones `Range`).
- Un PNG de más de 512 KiB se ve como imagen.
- Un PDF ofrece «Abrir externamente» y «Abrir en el Explorador»; este último
  entrega al sistema la ruta que aprobó el Engine.
- Los tonos de aviso (`sounds/`) se sirven como `audio/mpeg` y se cargan.
