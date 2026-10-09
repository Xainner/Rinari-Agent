# Composer: arrastrar archivos a todo el chat

Al arrastrar archivos, toda el área del chat muestra un velo de acento y
«Suelta los archivos aquí», sin cambiar de tamaño ni de foco. Acepta el
archivo sobre el historial y sobre el composer. En Boards cubre solo el chat
que está bajo el cursor, aunque no tenga el foco. Soltar no envía. Los estados
de carga o error sin composer no anuncian adjuntos.

El estado es local y se limpia al salir, soltar, cancelar, perder la ventana o
cambiar de borrador. La detección usa los tipos e items, porque durante un
arrastre protegido los archivos no están disponibles. Las lecturas siguen
usando FileReader y la preparación del Engine de siempre. El límite de ocho
adjuntos se consulta en el borrador actualizado, para no preparar archivos que
se van a descartar en un lote.

```bash
npm run ui:e2e -- composer-file-drag [--keep]
```

Chromium recibe archivos reales de disco por CDP y produce eventos de
confianza con un DataTransfer protegido.

Qué comprueba:

- Texto e imagen preparados, el envío del texto adjunto y la respuesta del Engine.
- En la pantalla inicial y en la conversación, el velo cubre toda el área
  visible del chat, la geometría no cambia y el velo no captura eventos.
- El cursor de copia, la limpieza al soltar y la cancelación con Escape.
- En Boards, arrastrar de A a B con A enfocado: solo B recibe el archivo.

El comando `dragCancel` de CDP no siempre emite `dragleave`; por eso la prueba
también pulsa Escape. CDP no sustituye arrastrar desde el Explorador de Windows.

## Revisión manual

Arrastra una imagen o un documento desde el Explorador sobre el chat. Muévelo
entre el historial, el textarea, los adjuntos y los botones; sal, vuelve a
entrar, cancela y suelta. Repítelo en Normal y en los dos paneles de Boards.
El velo debe desaparecer al instante y el archivo quedar en el borrador de
destino.

Los tests de componente (`src/components/composer/Composer.drag.test.tsx`)
cubren:

- entradas anidadas o repetidas, texto y URLs;
- salida, Escape, blur, `dragend`, visibilidad, desmontaje y cambio de borrador;
- preparación tardía, streaming, errores, límite de tamaño y lotes de más de
  ocho archivos.
