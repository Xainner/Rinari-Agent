# Auditoría de documentación (2026-10-12)

Revisión de solo lectura de la documentación de Rinari-Agent (main 3ae3d25, 0.3.1) y Rinari-CLI (main cf4828b). Cada hallazgo se comparó con el código.

## Rinari-Agent

| Documento | Estado | Evidencia | Acción |
|---|---|---|---|
| `AGENTS.md` (3 921 líneas) | **Mezcla** | Las primeras ~75 líneas son las reglas vigentes: Electron, contrato de comandos, cómo se entrega una versión, diseño Obsidiana. El resto (≈3 850 líneas) es el **plan maestro v1 del 2026-09-08**: Tauri/Rust (51 menciones), Luma, fases 0–12 y prioridades P0–P2. | Dejar `AGENTS.md` solo con las reglas (más las comprobaciones de `CLAUDE.md`). Mover el plan v1 a `docs/historia/plan-maestro-v1.md` con un aviso de «histórico». |
| `docs/debt.md` | **Desactualizado en parte** | Siguen `OPEN` cosas ya resueltas o que ya no aplican: herramientas de Claude Subscription (resuelto en 0.3.1, CLI #71); compilación Rust con Smart App Control y firma con `TAURI_SIGNING_PRIVATE_KEY` (ya no hay Rust ni Tauri); «Timeline narrativa (archivo 4)» y «Permisos + TurnChangeSet (archivo 5)» (entregados en las rondas de permisos v3 y del timeline); `mcp_get` sin llamador (revisar). | Repasar entrada por entrada: `DONE` u «obsoleto» con su PR, y quitar lo de Tauri. Sumar lo que el plan 0.3.2 deja pendiente. |
| `docs/context-compaction-review-plan.md` | **Plan terminado** | Dice «Estado: propuesta; implementación pendiente», pero el plan A–E está fusionado (CLI 4ed3b97 y #18, Agent c3ec74b). | Archivar o condensar en `docs/context-compaction.md`. |
| `docs/providers-subscriptions-review-plan.md` | **Plan terminado** | Suscripciones entregadas: ChatGPT, Claude Subscription (0.3.1) y OpenCode Go. | Archivar. |
| Visión: `vision-refactor-plan.md`, `vision-refactor-validation.md`, `vision-hermes-refactor.md`, `next-vision-experience.md`, `session-vision-recovery-analysis.md` | **Planes terminados y solapados** | Cinco documentos sobre lo mismo, de septiembre, ya implementados. | Un solo `docs/vision.md` con cómo funciona hoy (enlazando el #14 del plan 0.3.2). Los cinco al archivo. |
| `tool-optimization-audit.md`, `tool-optimization-status.md` | **Auditoría cerrada** | La auditoría describe un checkout «con cambios sin commit»; el estado se actualizó por última vez el 2026-09-26. | Archivar, dejando los pendientes reales (si quedan) en `debt.md`. |
| `engine-ux-review.md`, `engine-results.md` | **Revisión antigua** (09-20) | Revisión de la entrega H. | Archivar. |
| `docs/evidence/*` (delivery-g3, delivery-h, flows-*, plan01) | **Evidencia histórica** | Entregas de septiembre. | Archivar (o dejarlas, porque son evidencia). |
| `docs/migration/tauri-electron-transition.md`, `transition-0.1.3/` | **Historia** | La migración a Electron terminó el 2026-09-20. `desktop-parity.md` y el contrato JSON siguen vigentes. | Archivar los dos de transición. |
| `docs/releases.md` | **Desactualizado** (09-23) | 4 menciones a Tauri. El flujo vigente es `release:bump`, tags `v0.2.*`/`v0.3.*` y notas desde `docs/releases/<tag>.md`. | Reescribir con el flujo actual. |
| `docs/releases/` | **Incompleto** | Solo tiene `v0.3.0.md` y `v0.3.1.md`. Las 0.2.0–0.2.5 tienen sus notas solo en GitHub. | Opcional: traer las notas de 0.2.x desde GitHub para que el historial esté completo. |
| `docs/assets/readme-artwork.md`, `readme-artwork-v2.md` | **Reemplazado** | El README nuevo (#110) usa `docs/assets/readme/`. | Borrar o unir en una nota de arte del README. |
| `docs/soul-default-3.0.md`, `docs/identity-migration.md` | Revisar | 09-08 y 09-20. El Soul activo ya es Soul 4.0 / `rinari-default`. | Actualizar o archivar. |
| Vigentes | **OK** | `CLAUDE.md`, `README.md` (#110), `docs/design/obsidiana-neon.md`, `docs/interactive-workspace.md`, `docs/migration/desktop-parity.md`, `tests/ui/README.md` y los README de escenarios, `docs/attachments.md`, `docs/sounds.md`, `docs/image-viewer.md`, `docs/ocr-packaging.md`, `docs/background-processes.md`, `docs/architecture/browser-native.md`. | Mantener. `interactive-workspace.md` cambiará con el plan de Boards. |
| Nuevos sin commitear (en `worktrees/v032-agent/docs`) | **Vigentes** | `plan-0.3.2.md`, `planka-triage-0.3.2.md`, `plan-boards-reimaginado.md`, `idea-rinari-bots.md` (hoy `idea-rinari-agency.md`) y esta auditoría. | Commitearlos en la rama `0.3.2`, bajo `docs/planes/`. |

## Rinari-CLI

| Documento | Estado | Evidencia | Acción |
|---|---|---|---|
| `AGENTS.md` (1 285 líneas, **2026-08-16**) | **Desactualizado** | Pide leer `TODO.md` para saber «la fase actual». Es de antes del motor de escritorio, de los PR por fases y del Engine fijado en el Agent. | Reescribirlo corto, con las reglas vigentes: el CLI se fusiona primero y luego se fija en el Agent; pytest completo y ruff; numeración de migraciones (sin `;` en los comentarios); `schema/v1.json` y su capacidad; nada específico del dueño; el idioma de las pruebas. |
| `TODO.md` (3 107 líneas) | **Roadmap v1 cerrado** | Su estado dice «Fase 9 en curso (2026-08-20)». Tiene 963 casillas marcadas y 108 sin marcar, casi todas listas de métricas y evals del plan original. Algunas ya existen: los hooks `SubagentStart`/`SubagentStop` se emiten en `orchestrator.py`. | Archivarlo como `docs/historia/roadmap-v1.md` y sacar a una lista corta los pendientes que sigan valiendo (métricas agregadas, la suite de inyección). |
| `docs/commands.md` (4 752 líneas) | **Casi completo** | Cubre 57 de 59 comandos. Faltan `rinari tasks` y `rinari network`. | Documentar los dos. Al hacer el #8 del plan, añadir el dictado en un build desde fuente. |
| `docs/desktop/09-peer-messaging.md` | **Se retirará** | El plan de Boards quita la mensajería entre paneles. | Marcarlo como «se retira» cuando entre esa fase. |
| `docs/analysis-opencode-session-01M2C2MS.md`, `docs/plan-read-scope.md`, `docs/skill-authoring-regression.md` | **Análisis puntuales** | Son de septiembre y ya están resueltos. | Archivar. |
| `docs/harness.md` (9 512), `docs/stack.md` (3 465), `docs/tools.md`, `docs/skills.md` | Vigentes pero enormes | Actualizados el 10-08/09. | Mantener. Revisar más adelante si conviene partirlos. |
| Vigentes | **OK** | `README.md` (#72), `docs/providers/claude-subscription.md`, `docs/provider-subscriptions.md`, `docs/context-compaction.md`, `docs/tool-results.md`, `docs/troubleshooting.md`, `docs/vision-execution.md`, `docs/soul.md`, `docs/desktop/*` (salvo 09). | Mantener. |

## Pendientes reales que siguen vivos

- Conflictos de escritura entre paneles del mismo proyecto (`debt.md`). Se resuelven con los worktrees del plan de Boards o de sesiones hijas.
- `busy` en `session.list` (`debt.md`).
- Recibos de lectura por instalación en lugar de por perfil (`debt.md`). Se relaciona con el #34 del plan 0.3.2.
- Firma del instalador (Authenticode): sigue sin firmar.
- Fuentes remotas (Google Fonts en el CSP) y el tamaño del bundle principal: revisar si siguen igual.
- Métricas agregadas de evals y la suite de inyección de prompts (de `TODO.md`).

## Propuesta de orden

1. `AGENTS.md` de los dos repos: las reglas vigentes, cortas. El histórico va a `docs/historia/`.
2. `debt.md` al día, y `TODO.md` del CLI archivado con su lista corta de pendientes.
3. Archivar o condensar los planes terminados: compactación, suscripciones, los cinco de visión, la optimización de herramientas, las revisiones viejas y la transición a Electron.
4. `docs/releases.md` con el flujo actual (y las notas de 0.2.x, si se quiere).
5. `commands.md`: `tasks` y `network`.
6. Los documentos de planes nuevos, commiteados en `0.3.2` bajo `docs/planes/`.

Todo es documentación: no toca código ni pruebas. Pueden ser dos PR (uno por repo), cada uno con el CI de siempre.
