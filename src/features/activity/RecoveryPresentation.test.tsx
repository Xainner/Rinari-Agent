// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import TurnTimelineView from './TurnTimelineView'
import { createInitialTimelineState, engineEventAction, turnTimelineReducer } from './turnTimelineReducer'

afterEach(cleanup)

it('restores failed turn diagnostics and continues only on explicit click', () => {
  const error = { code: 'NETWORK_FAILURE', message: 'Interrupted', details: {
    history_preserved: true, phase: 'between_chunks', partial_text: 'private partial text',
  } }
  const state = turnTimelineReducer(createInitialTimelineState(), { type: 'timeline/loaded', sessionId: 's', turns: [{
    turn_id: 't', session_id: 's', turn_index: 0, status: 'failed', started_at: '2026-09-13',
    completed_at: '2026-09-13', user_message: 'test', items: [], final_response: '', terminal: { error },
  }] })
  expect(state.timelines.t.errorDetails).toEqual(error.details)
  const onContinue = vi.fn()
  render(<I18nProvider lang="es"><TurnTimelineView timeline={state.timelines.t} now={0}
    onResolveApproval={() => {}} onContinue={onContinue} /></I18nProvider>)
  expect(screen.getByText(/El trabajo previo está conservado/)).toBeTruthy()
  expect(screen.queryByText(/private partial text/)).toBeNull()
  expect(screen.getByText('Diagnóstico de la interrupción').closest('details')?.open).toBe(false)
  expect(onContinue).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  expect(onContinue).toHaveBeenCalledTimes(1)
})

it('retains live failure diagnostics when a stale running snapshot arrives', () => {
  const event = engineEventAction({ type: 'event', event: 'turn.failed', payload: {
    session_id: 's', turn_id: 't', error: { message: 'timeout', details: { history_preserved: true } },
  } }, 0)!
  let state = turnTimelineReducer(createInitialTimelineState(), event)
  state = turnTimelineReducer(state, { type: 'timeline/loaded', sessionId: 's', turns: [{
    turn_id: 't', session_id: 's', turn_index: 0, status: 'running', started_at: '2026-09-13',
    completed_at: null, user_message: '', items: [], final_response: '',
  }] })
  expect(state.timelines.t.status).toBe('failed')
  expect(state.timelines.t.errorDetails?.history_preserved).toBe(true)
})
