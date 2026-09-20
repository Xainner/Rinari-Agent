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
import { useBoardStatusStore } from '../../stores/boardStatus'
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
  Element.prototype.scrollTo = vi.fn() as unknown as Element['scrollTo']
  window.localStorage.clear()
  resetPendingQuestionsForTests()
  useBoardStore.getState().hydrate({ ...defaultBoard(), boardId: 'board_1' })
  useBoardAttentionStore.getState().hydrate({})
  useBoardStatusStore.getState().publish({})
  useComposerStore.setState({ sessionKey: 'draft', text: '', attachments: [], draftsBySession: {} })
})
afterEach(cleanup)

const sessions = [sessionFixture('ses_a', 'Backend API', 'proj_a'), sessionFixture('ses_b', 'Docs'), sessionFixture('ses_c', 'Infra')]

it('collapses a pane into a 48px strip without its chat, and expands it back from the strip button', async () => {
  const engine = engineFixture({ sessions, historyInfo: { ses_a: { total: 0, hasMore: false }, ses_b: { total: 0, hasMore: false } } })
  useBoardStore.getState().addPane('ses_a')
  useBoardStore.getState().addPane('ses_b')
  render(<BoardHarness engine={engine}><BoardActivityController /><BoardView /></BoardHarness>)
  const user = userEvent.setup()
  const paneB = await screen.findByRole('region', { name: 'Docs' })
  await user.click(within(paneB).getByRole('button', { name: 'Colapsar panel' }))
  const strip = screen.getByRole('region', { name: 'Docs' })
  expect(strip.dataset.collapsed).toBe('true')
  expect(strip.style.width).toBe('48px')
  expect(within(strip).queryByRole('textbox', { name: 'Mensaje' })).toBeNull()
  expect(screen.queryByTestId('workspace-ses_b')).toBeNull()
  // Focus moved to the remaining expanded pane.
  expect(useBoardStore.getState().focusedPaneId).toBe(useBoardStore.getState().panes[0].paneId)
  // The strip keeps confirmed status and badges while collapsed.
  act(() => {
    engine.runtime.getState().dispatch(event('turn.started', { turn_id: 't1', session_id: 'ses_b' }))
  })
  expect(screen.getByRole('region', { name: 'Docs' }).dataset.status).toBe('working')
  act(() => {
    engine.runtime.getState().dispatch(event('turn.completed', { turn_id: 't1', session_id: 'ses_b' }))
  })
  expect(within(screen.getByRole('region', { name: 'Docs' })).getByRole('status', { name: '1 resultados sin leer' })).toBeTruthy()
  await user.click(within(screen.getByRole('region', { name: 'Docs' })).getByRole('button', { name: 'Expandir «Docs»' }))
  const expanded = screen.getByRole('region', { name: 'Docs' })
  expect(expanded.dataset.collapsed).toBeUndefined()
  expect(within(expanded).getByRole('textbox', { name: 'Mensaje' })).toBeTruthy()
  expect(useBoardStore.getState().focusedPaneId).toBe(useBoardStore.getState().panes[1].paneId)
})

it('toolbar: counts by session, collapse finished, focus mode and expand all', async () => {
  const engine = engineFixture({ sessions, historyInfo: Object.fromEntries(sessions.map((row) => [row.id, { total: 0, hasMore: false }])) })
  for (const row of sessions) useBoardStore.getState().addPane(row.id)
  useBoardStore.getState().focusPane(useBoardStore.getState().panes[0].paneId)
  render(<BoardHarness engine={engine}><BoardActivityController /><BoardView /></BoardHarness>)
  const user = userEvent.setup()
  const toolbar = await screen.findByRole('toolbar', { name: 'Acciones del board' })
  expect(toolbar.textContent).toContain('3 paneles')
  act(() => {
    engine.runtime.getState().dispatch(event('turn.started', { turn_id: 'tb', session_id: 'ses_b' }))
    engine.runtime.getState().dispatch(event('turn.started', { turn_id: 'tc', session_id: 'ses_c' }))
    engine.runtime.getState().dispatch(event('turn.completed', { turn_id: 'tc', session_id: 'ses_c' }))
  })
  expect(within(toolbar).getByTestId('count-working').textContent).toBe('1 trabajando')
  expect(within(toolbar).getByTestId('count-unread').textContent).toBe('1 con resultados sin leer')

  // Collapse finished: only the idle/done, unfocused panes fold (ses_c is done but unread → still done kind, allowed; ses_b working stays).
  await user.click(within(toolbar).getByRole('button', { name: 'Colapsar terminados' }))
  let collapsed = useBoardStore.getState().panes.filter((pane) => pane.collapsed).map((pane) => pane.sessionId)
  expect(collapsed).toEqual(['ses_c'])

  await user.click(within(toolbar).getByRole('button', { name: 'Modo foco' }))
  expect(useBoardStore.getState().focusMode).toBe(true)
  collapsed = useBoardStore.getState().panes.filter((pane) => pane.collapsed).map((pane) => pane.sessionId)
  expect(collapsed).toEqual(['ses_b', 'ses_c'])
  expect(within(toolbar).getByRole('button', { name: 'Colapsar terminados' })).toHaveProperty('disabled', true)

  await user.click(within(toolbar).getByRole('button', { name: 'Expandir todo' }))
  expect(useBoardStore.getState().focusMode).toBe(false)
  expect(useBoardStore.getState().panes.some((pane) => pane.collapsed)).toBe(false)

  await user.click(within(toolbar).getByRole('button', { name: 'Marcar todos los resultados como leídos' }))
  expect(within(toolbar).queryByTestId('count-unread')).toBeNull()
})
