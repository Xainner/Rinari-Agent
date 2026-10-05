# Vista previa fija sobre la ventana

```powershell
npm run build
npm run desktop:build
$env:RINARI_ENGINE_BIN='<checkout-engine>\.venv\Scripts\python.exe'
$env:RINARI_ENGINE_ARGS_JSON='["-m","rinari"]'
$env:RINARI_ENGINE_CWD='<checkout-engine>'
node scripts/chat-image-overlay-e2e.mjs --keep
```

La prueba abre Electron y el Engine reales en un perfil aislado. Un proveedor
local guionizado genera cuatro turnos largos. El selector nativo devuelve los
archivos de prueba; la validación del host, la preparación del adjunto, el envío,
el historial y la lectura de la imagen pasan por el código de producción.

Comprueba que el diálogo y su fondo cubren la ventana en Normal y Boards,
desde el historial y el composer. Usa eventos de rueda y teclado de Electron
para comprobar que el fondo no se desplaza, el visor permanece fijo y el foco
queda dentro. Verifica Escape, cierre y fondo, y que el chat vuelva a responder
al scroll después de cerrar. Los textos largos se desplazan dentro del visor.
También comprueba una ventana más baja y deja una imagen abierta para revisión.

Capturas, perfil y mediciones: `release/evidence/chat-image-overlay/` (ignorada).
