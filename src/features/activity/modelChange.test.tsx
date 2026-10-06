// @vitest-environment jsdom
// «Se cambió de modelo de A a B»: lo decide el Engine (`model.changed`) y se
// pinta debajo del primer texto de B, en vivo y al reconstruir el historial.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import type { TimelineTurn } from '../../services/engine'
import TurnTimelineView from './TurnTimelineView'
import { createInitialTimelineState, engineEventAction, turnTimelineReducer } from './turnTimelineReducer'

const NOW = 1_700_000_000_000
const ids = { turn_id: 't2', session_id: 's1' }
const event = (name: string, payload: Record<string, unknown>) => engineEventAction({ type: 'event', event: name, payload }, NOW)!
const change = {
  ...ids,
  after_model_call_id: 'model_1',
  previous: { model_id: 'mdl_a', alias: 'deepseek-v4.1-flash', provider_alias: 'opencode-go' },
  next: { model_id: 'mdl_b', alias: 'glm-5.3-flash', provider_alias: 'opencode-go' },
  activity_seq: 4,
}

afterEach(cleanup)

function view(timeline: Parameters<typeof TurnTimelineView>[0]['timeline'], lang: 'es' | 'en' = 'es') {
  return render(<I18nProvider lang={lang}><TurnTimelineView timeline={timeline} now={NOW} onResolveApproval={vi.fn()} /></I18nProvider>)
}

describe('model change notice', () => {
  it('sits right after the first progress text of the new model, once', () => {
    let state = turnTimelineReducer(createInitialTimelineState(), event('turn.started', { ...ids, message: 'Sigue' }))
    state = turnTimelineReducer(state, event('model.started', { ...ids, model_call_id: 'model_1', model: 'mdl_b', activity_seq: 1 }))
    state = turnTimelineReducer(state, event('model.content.completed', { ...ids, model_call_id: 'model_1', content: 'Voy a revisar el selector.', output_kind: 'progress', activity_seq: 1 }))
    state = turnTimelineReducer(state, event('model.changed', change))
    state = turnTimelineReducer(state, event('tool.requested', { ...ids, tool_call_id: 'c1', tool: 'fs.read', model_call_id: 'model_1', activity_seq: 2 }))
    state = turnTimelineReducer(state, event('model.content.completed', { ...ids, model_call_id: 'model_2', content: 'Listo.', output_kind: 'final', activity_seq: 3 }))
    state = turnTimelineReducer(state, event('turn.completed', ids))
    view(state.timelines.t2)
    const notices = screen.getAllByTestId('model-change')
    expect(notices).toHaveLength(1)
    expect(notices[0].textContent).toBe('Se cambió de modelo de deepseek-v4.1-flash a glm-5.3-flash.')
    // Debajo del progreso, antes de la respuesta final.
    const progress = screen.getByText('Voy a revisar el selector.')
    expect(progress.compareDocumentPosition(notices[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(notices[0].compareDocumentPosition(screen.getByText('Listo.')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('is rebuilt in place from the persisted timeline, under a final answer, in English too', () => {
    const turn: TimelineTurn = {
      turn_id: 't2', session_id: 's1', turn_index: 1, status: 'completed', started_at: '2026-10-05T10:00:00Z', completed_at: '2026-10-05T10:00:05Z',
      user_message: 'Hola', final_response: 'Hola de nuevo.',
      items: [
        { event: 'model.started', ...ids, model_call_id: 'model_1', model: 'mdl_b', activity_seq: 1 },
        { event: 'model.content.completed', ...ids, model_call_id: 'model_1', content: 'Hola de nuevo.', output_kind: 'final', activity_seq: 1 },
        { event: 'model.changed', ...change },
      ],
    } as unknown as TimelineTurn
    const state = turnTimelineReducer(createInitialTimelineState(), { type: 'timeline/loaded', sessionId: 's1', turns: [turn] })
    view(state.timelines.t2, 'en')
    expect(screen.getByTestId('model-change').textContent).toBe('Model changed from deepseek-v4.1-flash to glm-5.3-flash.')
  })

  it('names the provider when both models share a name, and does not invent a missing one', () => {
    let state = turnTimelineReducer(createInitialTimelineState(), event('turn.started', ids))
    state = turnTimelineReducer(state, event('model.content.completed', { ...ids, model_call_id: 'model_1', content: 'Hola.', output_kind: 'final', activity_seq: 1 }))
    state = turnTimelineReducer(state, event('model.changed', { ...change, previous: { model_id: 'mdl_a', alias: 'gpt-5', provider_alias: 'openai' }, next: { model_id: 'mdl_b', alias: 'gpt-5', provider_alias: 'openrouter' } }))
    view(state.timelines.t2)
    expect(screen.getByTestId('model-change').textContent).toBe('Se cambió de modelo de gpt-5 (openai) a gpt-5 (openrouter).')
    cleanup()
    state = turnTimelineReducer(state, event('model.changed', { ...change, previous: { model_id: 'mdl_gone' } }))
    view(state.timelines.t2)
    expect(screen.getByTestId('model-change').textContent).toBe('Se cambió de modelo a glm-5.3-flash.')
  })

  it('without a text to anchor to, nothing is announced', () => {
    let state = turnTimelineReducer(createInitialTimelineState(), event('turn.started', ids))
    state = turnTimelineReducer(state, event('model.changed', change))
    expect(state.timelines.t2.items).toHaveLength(0)
  })
})
