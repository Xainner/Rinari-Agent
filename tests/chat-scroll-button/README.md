# Flecha para ir al final cerca del composer

El botón pasa de 96 a 8 píxeles sobre el borde inferior del historial.
Con el espaciado existente queda a 20 píxeles del composer en Normal y a
30 en Boards. Su posición sigue al historial cuando crece el borrador.

Prueba con Electron y Engine reales, perfil temporal y respuesta local
guionizada, sin usar sesiones personales:

```powershell
npm run build
npm run desktop:build
$env:RINARI_ENGINE_BIN='<checkout-engine>\.venv\Scripts\python.exe'
$env:RINARI_ENGINE_ARGS_JSON='["-m","rinari"]'
$env:RINARI_ENGINE_CWD='<checkout-engine>'
node scripts/chat-scroll-button-e2e.mjs --keep
```

Comprueba un turno completo, la distancia y el centrado de la flecha,
su acceso mediante el ratón, que lleva al final y desaparece, los estados
vacío/al final, Normal y Boards, composer compacto/expandido y ventana
baja. Conserva capturas y mediciones en `release/evidence/chat-scroll-button/`.
Con `--keep` deja abierta la app para la prueba del dueño.
