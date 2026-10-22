# Rinari Agent — notas para Claude

Las reglas del proyecto están en [AGENTS.md](AGENTS.md): arquitectura (el
renderer solo habla con el host por `platform()`), el Engine fijado, contrato
de comandos, cómo se entrega una versión, la regla de diseño vigente y las
comprobaciones antes de un PR. Léelo antes de cambiar nada.

Para cualquier cambio de interfaz, lee primero
[docs/design/obsidiana-neon.md](docs/design/obsidiana-neon.md): tokens,
componentes canónicos, movimiento, arte de Rinari (cómo se genera y revisa) y
la lista de comprobación para una pantalla nueva.

Un cambio en el Engine (Rinari-CLI) sigue las reglas de su `AGENTS.md`. En
especial «Herramientas»: cada petición lleva solo un núcleo pequeño de
herramientas y el resto va bajo demanda. El núcleo no crece para arreglar lo
que un modelo no supo: se le dice en una línea de su prompt (un hecho, la
sección de su equipo o una skill), y meter una herramienta al núcleo lo decide
el dueño.

Lo que hay en [docs/historia/](docs/historia/README.md) es histórico: sirve de
contexto, pero no son reglas ni tareas pendientes.
