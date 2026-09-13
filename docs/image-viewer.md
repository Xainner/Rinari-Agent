# Lectura y visor de imágenes

Rinari Agent y CLI usan `fs.read_image` del motor para inspeccionar PNG, JPEG y WebP
locales. Para una carpeta, el modelo enumera primero los archivos y selecciona
las imágenes pertinentes. `fs.read` explica cómo abrir una imagen visualmente.
El argumento `path` también acepta referencias `artifact://` de la misma sesión,
incluidos los adjuntos ya importados. Se valida su integridad y se reutiliza la
copia almacenada; nunca se interpreta la URI como una ruta local ni se vuelve a importar.

La herramienta pasa por los permisos de lectura habituales. Valida formato,
tamaño (10 MiB) y resolución (40 megapíxeles), e importa una copia inmutable al
Artifact Store. No accede al navegador ni ejecuta contenido de la imagen.
Requiere visión conocida o confirmación explícita de capacidad desconocida.
La confirmación se conserva por sesión, proveedor y modelo, y se utiliza tanto
para adjuntos como para `fs.read_image`, incluso después de recargar. No declara
que el modelo tenga visión ni habilita modelos que explícitamente no la admiten.
Una imagen adjunta puede describirse directamente: usar una herramienta no es
requisito para verla. Las tarjetas de herramientas solo representan llamadas reales.

La imagen se conserva en el resultado de herramienta del historial, separada de
los mensajes del usuario. Los adaptadores entregan los píxeles al proveedor
después de los resultados del grupo de herramientas. El contexto visual conserva
como máximo las cuatro imágenes más recientes; la actividad histórica conserva
las referencias anteriores. Para carpetas grandes, se inspeccionan por grupos.

La actividad muestra «Vio una imagen», nombre y miniatura. Al pulsarla se abre
un diálogo con la ruta de origen y una vista de hasta 2048 píxeles, limitada a
512 KiB. Escape, el botón de cierre y el fondo cierran el diálogo. Si falla la
lectura de la copia almacenada, se muestra el error y se permite reintentar.
El visor consulta artefactos al motor; no vuelve a ejecutar la herramienta.

La copia sigue disponible después de eliminar el original o mover la sesión.
La capacidad `local_image_view_v1` identifica los motores compatibles.

La CLI muestra la ruta, dimensiones y referencia de artefacto en texto. El visor
ampliable pertenece a Rinari Agent.
