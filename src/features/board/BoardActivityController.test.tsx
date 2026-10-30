// @vitest-environment jsdom
import { installMockPlatform } from '../../test/mockPlatform'
const mockPlatform = installMockPlatform()
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('../../services/desktop', () => ({
  desktopApi: { questions: vi.fn(async () => ({ questions: [] })), readFile: vi.fn(), answer: vi.fn() },
}))

import { engineEventAction } from '../activity/turnTimelineReducer'
import { useBoardStore, defaultBoard } from '../../stores/board'
import { unreadTurnIds, useBoardAttentionStore } from '../../stores/boardAttention'
import BoardActivityController from './BoardActivityController'
import { BoardHarness, engineFixture, sessionFixture } from './testUtils'

const NOW = 1_700_000_000_000
const event = (name: string, payload: Record<string, unknown>) => engineEventAction({ type: 'event', event: name, payload }, NOW)!

beforeEach(() => {
  window.localStorage.clear()
  useBoardStore.getState().hydrate({ ...defaultBoard(), boardId: 'board_1' })
  useBoardAttentionStore.getState().hydrate({})
})
afterEach(cleanup)

const sessions = [sessionFixture('ses_a', 'Backend API', 'proj_a')]

function harness(historyLoaded: boolean) {
  const engine = engineFixture({ sessions, historyInfo: historyLoaded ? { ses_a: { total: 2, hasMore: false } } : {} })
  return engine
}

it('treats finished history as baseline and only live terminals as unread', () => {
  const engine = harness(true)
  const { dispatch } = engine.runtime.getState()
  dispatch({
    type: 'timeline/loaded',
    sessionId: 'ses_a',
    turns: [
      { turn_id: 't1', session_id: 'ses_a', turn_index: 1, status: 'completed', started_at: '2026-09-15T10:00:00Z', completed_at: '2026-09-15T10:00:05Z', user_message: 'a', items: [], final_response: 'ok' },
    ],
  })
  useBoardStore.getState().addPane('ses_a')
  render(<BoardHarness engine={engine}><BoardActivityController /></BoardHarness>)
  let session = useBoardAttentionStore.getState().sessions.ses_a
  expect(session.initialized).toBe(true)
  expect(session.turns.t1.state).toBe('baseline')

  act(() => {
    dispatch(event('turn.started', { turn_id: 't2', session_id: 'ses_a' }))
  })
  expect(useBoardAttentionStore.getState().sessions.ses_a.trackedActiveTurnIds).toEqual(['t2'])
  act(() => {
    dispatch(event('turn.completed', { turn_id: 't2', session_id: 'ses_a', content: 'ok' }))
  })
  session = useBoardAttentionStore.getState().sessions.ses_a
  expect(unreadTurnIds(session)).toEqual(['t2'])
  // A turn that starts and finishes before the next render is still registered.
  act(() => {
    dispatch(event('turn.started', { turn_id: 't3', session_id: 'ses_a' }))
    dispatch(event('turn.failed', { turn_id: 't3', session_id: 'ses_a', error: { message: 'x' } }))
  })
  expect(unreadTurnIds(useBoardAttentionStore.getState().sessions.ses_a)).toEqual(['t2', 't3'])
  // Cancelling by hand is not a result to review.
  act(() => {
    dispatch(event('turn.started', { turn_id: 't4', session_id: 'ses_a' }))
    dispatch(event('turn.cancelled', { turn_id: 't4', session_id: 'ses_a' }))
  })
  expect(unreadTurnIds(useBoardAttentionStore.getState().sessions.ses_a)).toEqual(['t2', 't3'])
})

it('does not turn live terminals seen before the history load into baseline', () => {
  const engine = harness(false)
  const { dispatch } = engine.runtime.getState()
  useBoardStore.getState().addPane('ses_a')
  const view = render(<BoardHarness engine={engine}><BoardActivityController /></BoardHarness>)
  expect(useBoardAttentionStore.getState().sessions.ses_a).toBeUndefined()
  act(() => {
    dispatch(event('turn.started', { turn_id: 't1', session_id: 'ses_a' }))
    dispatch(event('turn.completed', { turn_id: 't1', session_id: 'ses_a', content: 'ok' }))
  })
  // History arrives later: t0 was already finished (baseline), t1 finished in front of us (unread).
  act(() => {
    dispatch({
      type: 'timeline/loaded',
      sessionId: 'ses_a',
      turns: [{ turn_id: 't0', session_id: 'ses_a', turn_index: 0, status: 'completed', started_at: '2026-09-15T09:00:00Z', completed_at: '2026-09-15T09:00:05Z', user_message: 'a', items: [], final_response: 'ok' }],
    })
  })
  view.rerender(<BoardHarness engine={{ ...engine, historyInfo: { ses_a: { total: 2, hasMore: false } } }}><BoardActivityController /></BoardHarness>)
  const session = useBoardAttentionStore.getState().sessions.ses_a
  expect(session.initialized).toBe(true)
  expect(session.turns.t0.state).toBe('baseline')
  expect(session.turns.t1.state).toBe('unread')
})

it('follows Normal chats too: a live result there counts as pending', () => {
  // Para el número de la barra de tareas: un chat fuera del board que termina
  // mientras miras otro queda pendiente, como en un panel.
  const engine = harness(true)
  const { dispatch } = engine.runtime.getState()
  render(<BoardHarness engine={engine}><BoardActivityController /></BoardHarness>)
  act(() => {
    dispatch(event('turn.started', { turn_id: 't1', session_id: 'ses_a' }))
    dispatch(event('turn.completed', { turn_id: 't1', session_id: 'ses_a', content: 'ok' }))
  })
  expect(useBoardAttentionStore.getState().sessions.ses_a.turns.t1.state).toBe('unread')
})

it('never counts the past of a chat whose history is not loaded', () => {
  const engine = harness(false)
  const { dispatch } = engine.runtime.getState()
  render(<BoardHarness engine={engine}><BoardActivityController /></BoardHarness>)
  act(() => {
    dispatch({
      type: 'timeline/loaded',
      sessionId: 'ses_a',
      turns: [{ turn_id: 't0', session_id: 'ses_a', turn_index: 0, status: 'completed', started_at: '2026-09-15T09:00:00Z', completed_at: '2026-09-15T09:00:05Z', user_message: 'a', items: [], final_response: 'ok' }],
    })
  })
  expect(useBoardAttentionStore.getState().sessions.ses_a).toBeUndefined()
})

it('#103: follows a chat the app never opened (a child, a scheduled task) from its first live result', () => {
  const engine = harness(false)
  const { dispatch } = engine.runtime.getState()
  render(<BoardHarness engine={engine}><BoardActivityController /></BoardHarness>)
  act(() => {
    dispatch({
      type: 'timeline/loaded',
      sessionId: 'ses_a',
      turns: [{ turn_id: 't0', session_id: 'ses_a', turn_index: 0, status: 'completed', started_at: '2026-09-15T09:00:00Z', completed_at: '2026-09-15T09:00:05Z', user_message: 'a', items: [], final_response: 'ok' }],
    })
  })
  act(() => {
    dispatch(event('turn.started', { turn_id: 't1', session_id: 'ses_a' }))
    dispatch(event('turn.completed', { turn_id: 't1', session_id: 'ses_a', content: 'ok' }))
  })
  const session = useBoardAttentionStore.getState().sessions.ses_a
  expect(session.initialized).toBe(true)
  expect(session.turns.t0.state).toBe('baseline')
  expect(unreadTurnIds(session)).toEqual(['t1'])
  // The next one is tracked like in any followed chat.
  act(() => {
    dispatch(event('turn.started', { turn_id: 't2', session_id: 'ses_a' }))
    dispatch(event('turn.completed', { turn_id: 't2', session_id: 'ses_a', content: 'ok' }))
  })
  expect(unreadTurnIds(useBoardAttentionStore.getState().sessions.ses_a)).toEqual(['t1', 't2'])
})

it('#103: waits for a history that is loading instead of guessing', () => {
  const engine = { ...harness(false), historyPhases: { ses_a: 'loading' as const } }
  const { dispatch } = engine.runtime.getState()
  render(<BoardHarness engine={engine}><BoardActivityController /></BoardHarness>)
  act(() => {
    dispatch(event('turn.started', { turn_id: 't1', session_id: 'ses_a' }))
    dispatch(event('turn.completed', { turn_id: 't1', session_id: 'ses_a', content: 'ok' }))
  })
  expect(useBoardAttentionStore.getState().sessions.ses_a).toBeUndefined()
})

it('#84: a turn that only compacted the context is not an unread result', () => {
  const engine = harness(true)
  const { dispatch } = engine.runtime.getState()
  dispatch({ type: 'timeline/loaded', sessionId: 'ses_a', turns: [] })
  useBoardStore.getState().addPane('ses_a')
  render(<BoardHarness engine={engine}><BoardActivityController /></BoardHarness>)
  act(() => {
    dispatch(event('turn.started', { turn_id: 't_compact', session_id: 'ses_a' }))
    dispatch(event('turn.completed', { turn_id: 't_compact', session_id: 'ses_a', kind: 'compaction', content: '' }))
  })
  const receipt = useBoardAttentionStore.getState().sessions.ses_a?.turns.t_compact
  expect(receipt?.state).toBe('seen')
})

it('#64: «Responder» from a system notification sends the text to that conversation, or steers it while it works', async () => {
  const steerTo = vi.fn(async () => true)
  const isBusy = vi.fn(() => false)
  const engine = engineFixture({ sessions, historyInfo: { ses_a: { total: 0, hasMore: false } }, steerTo, isBusy } as never)
  render(<BoardHarness engine={engine}><BoardActivityController /></BoardHarness>)
  await act(async () => { await Promise.resolve() })
  act(() => { mockPlatform.bridge.replyNotification({ target: { sessionId: 'ses_a', turnId: 't1' }, text: 'sí, adelante' }) })
  expect(engine.sendTo).toHaveBeenCalledWith('ses_a', 'sí, adelante')
  isBusy.mockReturnValue(true)
  act(() => { mockPlatform.bridge.replyNotification({ target: { sessionId: 'ses_a' }, text: 'y el logo en SVG' }) })
  expect(steerTo).toHaveBeenCalledWith('ses_a', 'y el logo en SVG')
})
