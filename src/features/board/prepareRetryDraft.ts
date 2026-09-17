import type { ChatMessage } from '../../types'
import type { TurnTimeline } from '../activity/types'
import { useComposerStore } from '../../stores/composer'

export type PrepareRetryResult =
  | { outcome: 'prepared' }
  | { outcome: 'no-input' }
  | { outcome: 'draft-exists'; apply: () => void }
  | { outcome: 'peer-origin'; apply: () => void }

/**
 * "Preparar reintento": recupera la entrada correlacionada con **ese** turno
 * (no el último mensaje del usuario, que puede ser otra tarea), la deja en el
 * compositor del panel y nunca envía. Si ya hay borrador, devuelve una
 * decisión pendiente en lugar de sobrescribir. Un turno iniciado por otro
 * agente conserva su procedencia y exige intención explícita.
 */
export function prepareRetryDraft(sessionId: string, timeline: TurnTimeline, messages: readonly ChatMessage[]): PrepareRetryResult {
  const input = messages.find((message) => message.role === 'user' && message.turnId === timeline.turnId)
  const text = (input?.content ?? timeline.userMessage ?? '').trim()
  if (!text) return { outcome: 'no-input' }
  const store = useComposerStore.getState()
  const existing = store.draftsBySession[sessionId]?.text?.trim() ?? ''
  const apply = () => useComposerStore.getState().setTextFor(sessionId, text)
  const origin = input?.origin ?? timeline.origin ?? null
  if (origin && origin.kind === 'peer') return { outcome: 'peer-origin', apply }
  if (existing && existing !== text) return { outcome: 'draft-exists', apply }
  apply()
  return { outcome: 'prepared' }
}
