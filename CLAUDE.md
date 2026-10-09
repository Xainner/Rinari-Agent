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
recorrido `ui-tour` deja capturas de todas las superficies).
