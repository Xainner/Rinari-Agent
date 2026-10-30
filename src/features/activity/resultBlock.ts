import { presentedChangeSets } from './changeSetPresentation'
import type { TurnTimeline } from './types'

/**
 * Si un turno terminado tiene bloque de resultado (`TurnResult`): texto final
 * o el parcial de un turno detenido, cambios del turno o un fallo. Un turno
 * que solo compactó el contexto, o que se detuvo sin escribir nada, no lo
 * tiene: no hay nada que ver, así que no puede quedar «sin leer» (#84).
 */
export function hasResultBlock(timeline: TurnTimeline): boolean {
  if (timeline.status === 'failed') return true
  if (timeline.items.some((item) => item.type === 'model' && Boolean(item.content) && (item.outputKind === 'final' || !item.outputKind))) return true
  return presentedChangeSets(timeline).changes.length > 0
}
