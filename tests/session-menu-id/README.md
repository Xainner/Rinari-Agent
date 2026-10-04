# ID de sesión en una sola línea

El menú adapta su ancho al contenido y el ID deja de partirse entre caracteres.
Si un identificador excede el ancho disponible, se trunca visualmente y se
conserva completo en el título y en las acciones de copia.

```powershell
npm run build
npm run desktop:build
$env:RINARI_ENGINE_BIN='<checkout-engine>\.venv\Scripts\python.exe'
$env:RINARI_ENGINE_ARGS_JSON='["-m","rinari"]'
$env:RINARI_ENGINE_CWD='<checkout-engine>'
node scripts/session-menu-id-e2e.mjs --keep
```

La prueba abre Electron con un perfil aislado y una sesión del Engine real.
Comprueba el ID completo en una sola línea, clic derecho y los tres puntos,
español e inglés, límites de ventana y las acciones de copiar ID/referencia.
Captura el argumento de la escritura nativa al final del IPC validado para
conservar el portapapeles del dueño; restaura la escritura nativa antes de
dejar la app abierta. La preparación no consulta ningún proveedor externo.

Capturas y mediciones: `release/evidence/session-menu-id/` (ignorada por Git).
