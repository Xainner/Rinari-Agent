// @vitest-environment jsdom
import { installMockPlatform } from '../../test/mockPlatform'
installMockPlatform()
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('../../services/desktop', () => ({
  desktopApi: { questions: vi.fn(async () => ({ questions: [] })), readFile: vi.fn(), answer: vi.fn() },
}))
vi.mock('../workspace/WorkspaceView', () => ({
  default: ({ session }: { session: { id: string } | null }) => <div data-testid={`workspace-${session?.id ?? 'none'}`} />,
}))

import { engineEventAction } from '../activity/turnTimelineReducer'
import { useBoardStore, defaultBoard } from '../../stores/board'
import { useBoardAttentionStore } from '../../stores/boardAttention'
import { useComposerStore } from '../../stores/composer'
import { resetPendingQuestionsForTests } from '../questions/usePendingQuestions'
import BoardActivityController from './BoardActivityController'
import BoardView from './BoardView'
import { BoardHarness, engineFixture, sessionFixture } from './testUtils'

const NOW = 1_700_000_000_000
const event = (name: string, payload: Record<string, unknown>) => engineEventAction({ type: 'event', event: name, payload }, NOW)!

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  ;(window as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub
  // jsdom no implementa scroll: el virtualizador del chat lo llama al seguir el final.
  Element.prototype.scrollTo = vi.fn() as unknown as Element['scrollTo']
  window.localStorage.clear()
  resetPendingQuestionsForTests()
  useBoardStore.getState().hydrate({ ...defaultBoard(), boardId: 'board_1' })
  useBoardAttentionStore.getState().hydrate({})
  useComposerStore.setState({ sessionKey: 'draft', text: '', attachments: [], draftsBySession: {} })
})
afterEach(cleanup)

const sessions = [sessionFixture('ses_a', 'Backend API', 'proj_a')]

it('shows the derived status, a NEW badge for unread results and clears it on "mark as read"', async () => {
  const engine = engineFixture({ sessions, historyInfo: { ses_a: { total: 0, hasMore: false } } })
  const { dispatch } = engine.runtime.getState()
  useBoardStore.getState().addPane('ses_a')
  render(<BoardHarness engine={engine}><BoardActivityController /><BoardView /></BoardHarness>)
  const pane = await screen.findByRole('region', { name: 'Backend API' })
  expect(within(pane).getByTestId('pane-status').dataset.kind).toBe('idle')

  act(() => {
    dispatch(event('turn.started', { turn_id: 't1', session_id: 'ses_a' }))
  })
  expect(within(pane).getByTestId('pane-status').dataset.kind).toBe('working')
  expect(pane.dataset.status).toBe('working')
  act(() => {
    dispatch(event('approval.requested', { turn_id: 't1', session_id: 'ses_a', approval_id: 'apr_1', capability: 'shell.exec', target: 'ls', risk: 'medium', description: 'run', choices: ['deny', 'allow_once'] }))
  })
  expect(within(pane).getByTestId('pane-status').dataset.kind).toBe('needs_you')
  act(() => {
    dispatch(event('approval.resolved', { turn_id: 't1', session_id: 'ses_a', approval_id: 'apr_1', decision: 'allow_once' }))
    dispatch(event('turn.completed', { turn_id: 't1', session_id: 'ses_a' }))
  })
  expect(within(pane).getByTestId('pane-status').dataset.kind).toBe('done')
  expect(within(pane).getByTestId('pane-unread').textContent).toContain('Nuevo')
  expect(pane.dataset.unread).toBe('true')

  // A second live turn keeps the unread badge of the first one.
  act(() => {
    dispatch(event('turn.started', { turn_id: 't2', session_id: 'ses_a' }))
  })
  expect(within(pane).getByTestId('pane-status').dataset.kind).toBe('working')
  expect(within(pane).getByTestId('pane-unread')).toBeTruthy()

  const user = userEvent.setup()
  await user.click(within(pane).getByRole('button', { name: 'Opciones del panel' }))
  await user.click(await screen.findByRole('menuitem', { name: 'Marcar resultados como leídos' }))
  expect(within(pane).queryByTestId('pane-unread')).toBeNull()
})
