// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue({}) }))

import { I18nProvider } from '../../i18n'
import { engineEventAction } from '../activity/turnTimelineReducer'
import { createRuntimeStore } from '../engine/runtimeStore'
import { useBoardAttentionStore } from '../../stores/boardAttention'
import { useComposerStore } from '../../stores/composer'
import ResultSummaryCard from './ResultSummaryCard'

const NOW = 1_700_000_000_000
const event = (name: string, payload: Record<string, unknown>) => engineEventAction({ type: 'event', event: name, payload }, NOW)!

beforeEach(() => {
  window.localStorage.clear()
  useBoardAttentionStore.getState().hydrate({})
  useBoardAttentionStore.getState().initializeSessionAttention('ses_a', [])
  useComposerStore.setState({ sessionKey: 'draft', text: '', attachments: [], draftsBySession: {} })
})
afterEach(cleanup)

function completedTurn() {
  const store = createRuntimeStore()
  const { dispatch } = store.getState()
  dispatch(event('turn.started', { turn_id: 't1', session_id: 'ses_a', occurred_at: NOW }))
  dispatch(event('model.content.completed', { turn_id: 't1', session_id: 'ses_a', model_call_id: 'm1', output_kind: 'final', content: '# Listo\n\nHe **actualizado** el README y `docs/`.', activity_seq: 1, model: 'gpt-fake' }))
  dispatch(event('turn.changes.completed', { turn_id: 't1', session_id: 'ses_a', id: 'cs1', status: 'active', additions: 3, deletions: 1, undoable: true, attribution_complete: true, warnings: [], files: [{ path: 'README.md', absolute_path: '/p/README.md', kind: 'modified' }, { path: 'docs/a.md', absolute_path: '/p/docs/a.md', kind: 'created' }], activity_seq: 2 }))
  dispatch(event('turn.completed', { turn_id: 't1', session_id: 'ses_a', occurred_at: NOW + 12_000 }))
  return store.getState().timelines.t1
}

it('shows outcome, a plain-text preview, files of that turn, duration and the executing model; marks read on demand', async () => {
  useBoardAttentionStore.getState().observeTerminal('ses_a', 't1', 'completed', 'live')
  const review = vi.fn()
  render(<I18nProvider lang="es"><ResultSummaryCard sessionId="ses_a" timeline={completedTurn()} messages={[]} onReviewChanges={review} /></I18nProvider>)
  const card = screen.getByTestId('result-summary-card')
  expect(card.dataset.outcome).toBe('completed')
  expect(card.dataset.unread).toBe('true')
  expect(card.textContent).toContain('Turno finalizado')
  expect(card.textContent).toContain('Listo He actualizado el README y docs/.')
  expect(card.textContent).not.toContain('**')
  expect(card.textContent).toContain('2 archivos cambiados')
  expect(card.textContent).toContain('Duración 12s')
  expect(card.textContent).toContain('Ejecutado por gpt-fake')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Revisar cambios' }))
  expect(review).toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Marcar como leído' }))
  expect(useBoardAttentionStore.getState().sessions.ses_a.turns.t1.state).toBe('seen')
  expect(screen.getByTestId('result-summary-card').dataset.unread).toBeUndefined()
})

it('degrades without data instead of inventing it, and prepares a retry from the turn input without sending', async () => {
  const store = createRuntimeStore()
  const { dispatch } = store.getState()
  dispatch(event('turn.started', { turn_id: 't2', session_id: 'ses_a' }))
  dispatch(event('turn.failed', { turn_id: 't2', session_id: 'ses_a', error: { message: 'boom' } }))
  const timeline = { ...store.getState().timelines.t2, startedAt: 0, completedAt: undefined }
  const messages = [
    { id: 'm1', role: 'user' as const, content: 'arregla el build', createdAt: 1, turnId: 't2' },
    { id: 'm2', role: 'user' as const, content: 'otra tarea posterior', createdAt: 2 },
  ]
  render(<I18nProvider lang="es"><ResultSummaryCard sessionId="ses_a" timeline={timeline} messages={messages} /></I18nProvider>)
  const card = screen.getByTestId('result-summary-card')
  expect(card.dataset.outcome).toBe('failed')
  expect(card.textContent).toContain('boom')
  expect(card.textContent).toContain('Cambios: sin datos')
  expect(card.textContent).toContain('Duración no disponible')
  expect(card.textContent).toContain('Modelo ejecutor: sin datos')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Preparar reintento' }))
  expect(useComposerStore.getState().draftsBySession.ses_a?.text).toBe('arregla el build')
  // A different existing draft is never overwritten silently.
  useComposerStore.getState().setTextFor('ses_a', 'mi borrador')
  await user.click(screen.getByRole('button', { name: 'Preparar reintento' }))
  expect(await screen.findByRole('alertdialog')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Conservar borrador' }))
  expect(useComposerStore.getState().draftsBySession.ses_a?.text).toBe('mi borrador')
})
