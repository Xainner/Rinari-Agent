import type { RinariState } from './RinariAvatar'

/**
 * Estado de Rinari para un turno, a partir del estado de la actividad
 * (`activityState`). Una decisión pendiente gana a todo; después, lo que
 * realmente está pasando. Nunca «terminó» si el turno no terminó.
 */
export function rinariStateForTurn(kind: string): RinariState {
  switch (kind) {
    case 'approval':
    case 'question':
      return 'waiting'
    case 'action':
    case 'recovering':
    case 'preparing':
      return 'working'
    case 'responding':
      return 'streaming'
    case 'thinking':
    case 'retrying':
    case 'waiting':
    case 'cancelling':
      return 'thinking'
    case 'completed':
      return 'done'
    case 'failed':
      return 'error'
    default:
      return 'idle'
  }
}
