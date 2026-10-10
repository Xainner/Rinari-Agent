# Rinari Agent — notas para Claude

Las reglas del proyecto están en [AGENTS.md](AGENTS.md): arquitectura (el
renderer solo habla con el host por `platform()`), contrato de comandos,
cómo se entrega una versión y la regla de diseño vigente.

Para cualquier cambio de interfaz, lee primero
[docs/design/obsidiana-neon.md](docs/design/obsidiana-neon.md): tokens,
componentes canónicos, movimiento, arte de Rinari (cómo se genera y revisa) y
la lista de comprobación para una pantalla nueva.

Comprobaciones antes de un PR: `npx vitest run`, `npm run build`,
`npm run typecheck:electron`, `npm run protocol:check`, `npm run parity:check`
y los escenarios de `tests/ui` afectados (`npm run ui:e2e -- <nombre>`; el
recorrido `ui-tour` deja capturas de todas las superficies). Si el cambio toca
el navegador nativo, los toasts o los overlays, también `npm run
browser:vertical` (es la prueba `browser-integration` del CI).

Para comprobar movimiento no basta una captura: muestrea cuadro a cuadro con
`requestAnimationFrame` (como `dock-pill-resize` y `boards-fold` en `ui-tour`),
y en las pruebas que miden tamaños espera antes a las animaciones finitas.

Antes de subir: los escenarios tocados varias veces, también con la máquina
cargada y con `RINARI_UI_REDUCED_MOTION=1` (el CI corre con movimiento
reducido), y la batería completa `npm run ui:e2e -- --all`.

Mientras el CI de un PR está en curso, los cambios nuevos se dejan en commits
locales y se suben cuando termina, para no reiniciarlo.
