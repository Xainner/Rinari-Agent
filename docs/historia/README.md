# Historia de Rinari Agent

Planes, revisiones y evidencias ya terminados o retirados. Se guardan como
contexto: **no son reglas ni tareas pendientes**. Lo vigente está en
[AGENTS.md](../../AGENTS.md), y lo que sigue abierto, en
[debt.md](../debt.md). Se archivaron el 2026-10-12 con `git mv`, así que
`git log --follow` conserva su historia completa. La excepción es el plan
maestro: salió de `AGENTS.md`, que sigue existiendo, así que su historia es
la de `git log -- AGENTS.md` hasta esa fecha.

## Planes y revisiones

- [plan-maestro-v1.md](plan-maestro-v1.md) — el plan maestro v1 (2026-09-08),
  que estuvo en `AGENTS.md`: visión del producto, protocolo v1, fases 0–12 y
  prioridades P0–P2, con Tauri y Rust como host. Su parte vigente pasó al
  `AGENTS.md` nuevo.
- [engine-ux-review.md](engine-ux-review.md) — revisión UX del motor
  (2026-09-08, actualizada hasta el 09-20).
- [engine-results.md](engine-results.md) — resultados del motor y ejecución
  automática, la entrega H (2026-09-14 a 09-20).
- [context-compaction-review-plan.md](context-compaction-review-plan.md) —
  plan A–E de contexto y compactación (2026-09-22). Entregado: Rinari-CLI
  4ed3b97 y #18, Agent c3ec74b. Cómo funciona hoy:
  [context-compaction.md](../context-compaction.md).
- [providers-subscriptions-review-plan.md](providers-subscriptions-review-plan.md)
  — proveedores, suscripciones, cuotas y capacidades (2026-09-22). Entregado:
  ChatGPT, Claude Subscription (0.3.1) y OpenCode Go.
- [tool-optimization-audit.md](tool-optimization-audit.md) y
  [tool-optimization-status.md](tool-optimization-status.md) — auditoría de
  las herramientas del Engine y su estado (2026-09-11 a 09-26). Los P0 están
  resueltos; lo que quedó pasó a `debt.md`.

## Visión

Los cinco documentos de septiembre sobre imágenes y visión. Cómo funciona
hoy: [vision.md](../vision.md).

- [vision/vision-refactor-plan.md](vision/vision-refactor-plan.md) —
  corrección integral de visión (2026-09-13).
- [vision/vision-refactor-validation.md](vision/vision-refactor-validation.md)
  — su validación (2026-09-13 a 09-20).
- [vision/next-vision-experience.md](vision/next-vision-experience.md) —
  visión configurable (2026-09-13).
- [vision/session-vision-recovery-analysis.md](vision/session-vision-recovery-analysis.md)
  — análisis de una sesión que se saltó la visión con un script propio
  (2026-09-13).
- [vision/vision-hermes-refactor.md](vision/vision-hermes-refactor.md) —
  visión por mensaje, la implementación de referencia (2026-09-13 a 09-20).

## Transición de Tauri a Electron

- [tauri-electron-transition.md](tauri-electron-transition.md) — cómo pasó la
  app de Tauri 0.1.3 a Electron 0.2.x (2026-09-19/20).
- [transition-0.1.3/](transition-0.1.3/README.md) — el exportador de datos de
  la 0.1.3 (`migration.rs`, que ya no se compila desde `main`).
- [identity-migration.md](identity-migration.md) — el cambio de nombre de
  Rinari Code a Rinari Agent en la 0.1.2 (2026-09-12).

## Otros

- [soul-default-3.0.md](soul-default-3.0.md) — el texto del Soul 3.0 por
  defecto (2026-09-08). El activo es el Soul 4.0 (`rinari-default`) del
  Engine.
- Arte del README anterior: los prompts (`docs/assets/readme-artwork*.md`) y
  sus cinco imágenes se borraron el 2026-10-12, porque el README de #110 usa
  `docs/assets/readme/`. Se recuperan de los commits dc02b8b, 46f11de y 3a1d2e4.

## Evidencias

Capturas e informes de entregas de septiembre, en
[evidencias/](evidencias/):

- [plan01-2026-09-16](evidencias/plan01-2026-09-16/README.md) — base
  integrada de Boards y procesos (plan 00/01).
- [flows-2026-09-18](evidencias/flows-2026-09-18/README.md) — primera versión
  de la vista Flujos.
- [flows-2026-09-22](evidencias/flows-2026-09-22/README.md) — Flujos tras la
  revisión M02.
- [delivery-g3.md](evidencias/delivery-g3.md) — el updater de Electron
  (2026-09-20).
- [delivery-h.md](evidencias/delivery-h.md) — el cutover a Electron
  (2026-09-20).
