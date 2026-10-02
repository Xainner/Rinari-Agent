# Arrastrar adjuntos sobre toda el área del chat

Toda el área del chat muestra un velo de acento y «Suelta los archivos aquí» al
arrastrar archivos. No cambia de tamaño ni foco. Acepta sobre el historial y
el Composer; en Boards cubre solo el chat bajo el cursor, aunque no tenga foco.
Soltar no envía. Los estados de carga/error sin Composer no anuncian adjuntos.

El estado es local y se limpia al salir, soltar, cancelar, perder la ventana o
cambiar de borrador. La detección usa tipos/items porque los archivos no están
disponibles durante el arrastre protegido. Las lecturas siguen usando FileReader
y la preparación existente del Engine. El límite de ocho se consulta en el
borrador actualizado para no preparar archivos descartados en un lote.

## Reproducción automatizada

Con Node >=22.12, npm 10 y el Engine fijado por el repositorio instalado:

```powershell
npm run build
npm run desktop:build
$env:RINARI_ENGINE_BIN='<checkout-engine>\.venv\Scripts\python.exe'
$env:RINARI_ENGINE_ARGS_JSON='["-m","rinari"]'
$env:RINARI_ENGINE_CWD='<checkout-engine>'
node scripts/composer-file-drag-e2e.mjs --keep
```

El script crea un perfil temporal y un proveedor local con respuesta guionizada.
Ejecuta la app y el Engine de producción. Chromium recibe archivos de disco por
CDP y produce eventos confiables con DataTransfer protegido. Se comprueban:

- Texto e imagen preparados, envío de texto adjunto y respuesta del Engine.
- Pantalla inicial y conversación, overlay que cubre toda el área visible del
  chat, geometría estable y overlay sin eventos.
- Cursor de copia, limpieza al soltar y cancelación mediante Escape.
- Transferencia de A a B en Boards con A enfocado; solo B recibe el archivo.

CDP no sustituye la comprobación manual desde el Explorador de Windows. Su
comando dragCancel no siempre emite dragleave, por eso la prueba también envía
Escape. La revisión desde el Explorador se reproduce con los pasos de abajo.
El dueño aprobó la app de prueba con el resaltado sobre toda el área del chat.

Evidencia: `release/evidence/composer-file-drag/` (ignorada por Git). Con
`--keep` la app y el proveedor local permanecen disponibles hasta cerrar la app.

## Pruebas del componente

```powershell
npx vitest run src/components/composer/Composer.drag.test.tsx src/components/composer/Composer.board.test.tsx
```

Cubren entradas anidadas/repetidas, texto/URLs, salida, Escape, blur, dragend,
visibilidad, desmontaje, cambio de borrador, preparación tardía, streaming,
errores, límite de tamaño y lote de más de ocho archivos.

## Revisión visual

Arrastrar desde el Explorador una imagen o documento sobre el área del chat;
mover entre historial, textarea, adjuntos y botones; salir, volver a entrar, cancelar y
soltar. Repetir en Normal y en ambos paneles de Boards. El indicador debe
desaparecer inmediatamente y el archivo quedar en el borrador de destino.

Esta base fija el tema oscuro y el acento nebula. El indicador usa los tokens
existentes y respeta las reglas globales de movimiento reducido.
