import { describe, expect, it } from 'vitest'
import { engineEventAction } from '../activity/turnTimelineReducer'
import { createRuntimeStore } from './runtimeStore'
import {
  EMPTY_APPROVALS,
  EMPTY_MESSAGES,
  selectBusy,
  selectHasContent,
  selectLatestTurn,
  selectSessionApprovals,
  selectSessionModel,
  selectSessionTimelines,
  selectThread,
  derivePaneStatus,
  samePaneStatus,
  selectLatestTerminalTurn,
  selectTurnFinalText,
} from './sessionSelectors'
import type { ModelSummary, SessionSummary } from '../../services/engine'

const NOW = 1_700_000_000_000
const event = (name: string, payload: Record<string, unknown>) =>
  engineEventAction({ type: 'event', event: name, payload }, NOW)!

function storeWithTwoSessions() {
  const store = createRuntimeStore()
  const { dispatch } = store.getState()
  dispatch(event('turn.started', { turn_id: 'a1', session_id: 'A' }))
  dispatch(event('turn.started', { turn_id: 'b1', session_id: 'B' }))
  dispatch(event('model.started', { turn_id: 'b1', session_id: 'B', model_call_id: 'm1', activity_seq: 1 }))
  return store
}

describe('runtime store', () => {
  it('applies the shared reducer and resets by generation', () => {
    const store = storeWithTwoSessions()
    expect(store.getState().busySessions.has('A')).toBe(true)
    expect(store.getState().generation).toBe(0)
    store.getState().reset()
    expect(store.getState().timelines).toEqual({})
    expect(store.getState().generation).toBe(1)
  })

  it('keeps the busy set reference across content deltas of a session', () => {
    const store = storeWithTwoSessions()
    const before = store.getState().busySessions
    store.getState().dispatch(event('model.content.delta', {
      turn_id: 'b1', session_id: 'B', model_call_id: 'm1', delta: 'tok', activity_seq: 2, stream_seq: 1,
    }))
    expect(store.getState().busySessions).toBe(before)
  })
})

describe('session selectors', () => {
  it('returns the same timeline map for a session when only another session changed', () => {
    const store = storeWithTwoSessions()
    const first = selectSessionTimelines(store.getState(), 'A')
    expect(Object.keys(first)).toEqual(['a1'])
    store.getState().dispatch(event('model.content.delta', {
      turn_id: 'b1', session_id: 'B', model_call_id: 'm1', delta: 'tok', activity_seq: 2, stream_seq: 1,
    }))
    const second = selectSessionTimelines(store.getState(), 'A')
    expect(second).toBe(first)
    const changedB = selectSessionTimelines(store.getState(), 'B')
    expect(Object.keys(changedB)).toEqual(['b1'])
  })

  it('returns a new map when the session itself changed', () => {
    const store = storeWithTwoSessions()
    const first = selectSessionTimelines(store.getState(), 'A')
    store.getState().dispatch(event('turn.completed', { turn_id: 'a1', session_id: 'A' }))
    const second = selectSessionTimelines(store.getState(), 'A')
    expect(second).not.toBe(first)
    expect(second.a1.status).toBe('completed')
  })

  it('uses stable empty values and busy/content booleans', () => {
    const store = storeWithTwoSessions()
    expect(selectThread(store.getState(), 'missing')).toBe(EMPTY_MESSAGES)
    expect(selectSessionApprovals(store.getState(), 'A')).toBe(EMPTY_APPROVALS)
    expect(selectBusy(store.getState(), 'A')).toBe(true)
    expect(selectBusy(store.getState(), '')).toBe(false)
    expect(selectHasContent(store.getState(), 'A')).toBe(true)
    expect(selectHasContent(store.getState(), 'C')).toBe(false)
  })

  it('filters approvals per session and keeps the reference between unrelated events', () => {
    const store = storeWithTwoSessions()
    store.getState().dispatch(event('approval.requested', {
      turn_id: 'a1', session_id: 'A', approval_id: 'ap1', capability: 'shell.exec', risk: 'high', description: 'run',
    }))
    const first = selectSessionApprovals(store.getState(), 'A')
    expect(first.map((item) => item.approval_id)).toEqual(['ap1'])
    expect(selectSessionApprovals(store.getState(), 'B')).toBe(EMPTY_APPROVALS)
    store.getState().dispatch(event('model.content.delta', {
      turn_id: 'b1', session_id: 'B', model_call_id: 'm1', delta: 'x', activity_seq: 2, stream_seq: 1,
    }))
    expect(selectSessionApprovals(store.getState(), 'A')).toBe(first)
  })

  it('picks the latest turn by turnIndex, then time, then stable id', () => {
    const base = { sessionId: 'A', status: 'completed' as const, startedAt: 10, userMessage: '', items: [] }
    expect(selectLatestTurn({ timelines: {
      t1: { ...base, turnId: 't1', turnIndex: 1 },
      t2: { ...base, turnId: 't2', turnIndex: 2, startedAt: 5 },
    } }, 'A')?.turnId).toBe('t2')
    expect(selectLatestTurn({ timelines: {
      t1: { ...base, turnId: 't1', startedAt: 10 },
      t2: { ...base, turnId: 't2', startedAt: 20 },
    } }, 'A')?.turnId).toBe('t2')
    expect(selectLatestTurn({ timelines: {
      tb: { ...base, turnId: 'tb' },
      ta: { ...base, turnId: 'ta' },
    } }, 'A')?.turnId).toBe('tb')
    expect(selectLatestTurn({ timelines: {} }, 'A')).toBeNull()
  })

  it('resolves the session model only from the record, never the global default', () => {
    const models = [
      { id: 'm-global', alias: 'G', active: true },
      { id: 'm-session', alias: 'S', active: false },
    ] as ModelSummary[]
    expect(selectSessionModel(models, { model_id: 'm-session' } as SessionSummary)?.alias).toBe('S')
    expect(selectSessionModel(models, { model_id: 'gone' } as SessionSummary)).toBeNull()
    expect(selectSessionModel(models, null)).toBeNull()
  })
})

describe('pane status (§8.5)', () => {
  const base = { sessionId: 'A', pendingApprovals: 0, pendingQuestions: 0, unreadResultCount: 0, unreadPeerCount: 0, availability: 'ready' as const }

  function stateAfter(events: Array<[string, Record<string, unknown>]>) {
    const store = createRuntimeStore()
    for (const [name, payload] of events) store.getState().dispatch(event(name, payload))
    return store.getState()
  }

  it('follows the precedence: unavailable > cancelling > needs_you > working > terminal > idle', () => {
    const idle = stateAfter([])
    expect(derivePaneStatus({ ...base, timelines: idle.timelines }).kind).toBe('idle')
    const working = stateAfter([['turn.started', { turn_id: 't1', session_id: 'A' }]])
    expect(derivePaneStatus({ ...base, timelines: working.timelines })).toMatchObject({ kind: 'working', turnId: 't1' })
    expect(derivePaneStatus({ ...base, timelines: working.timelines, pendingApprovals: 1 }).kind).toBe('needs_you')
    expect(derivePaneStatus({ ...base, timelines: working.timelines, pendingQuestions: 1 }).kind).toBe('needs_you')
    expect(derivePaneStatus({ ...base, timelines: working.timelines, availability: 'loading' }).kind).toBe('loading')
    expect(derivePaneStatus({ ...base, timelines: working.timelines, availability: 'disconnected' }).kind).toBe('unavailable')
    const cancelling = stateAfter([['turn.started', { turn_id: 't1', session_id: 'A' }]])
    cancelling.dispatch({ type: 'turn/cancelling', sessionId: 'A' })
    const cancellingState = { timelines: { ...cancelling.timelines, t1: { ...cancelling.timelines.t1, status: 'cancelling' as const } } }
    expect(derivePaneStatus({ ...base, timelines: cancellingState.timelines, pendingApprovals: 1 }).kind).toBe('cancelling')
  })

  it('maps terminals to done/failed/stopped/cancelled and keeps unread as an independent dimension', () => {
    const done = stateAfter([
      ['turn.started', { turn_id: 't1', session_id: 'A' }],
      ['model.content.completed', { turn_id: 't1', session_id: 'A', model_call_id: 'm', output_kind: 'final', content: 'listo', activity_seq: 1 }],
      ['turn.completed', { turn_id: 't1', session_id: 'A' }],
    ])
    const status = derivePaneStatus({ ...base, timelines: done.timelines, unreadResultCount: 1 })
    expect(status).toMatchObject({ kind: 'done', turnId: 't1', latestTerminalTurnId: 't1', latestOutcome: 'completed', unread: true })
    expect(selectTurnFinalText(selectLatestTerminalTurn(done, 'A'))).toBe('listo')
    const failed = stateAfter([
      ['turn.started', { turn_id: 't1', session_id: 'A' }],
      ['turn.failed', { turn_id: 't1', session_id: 'A', error: { message: 'boom' } }],
    ])
    expect(derivePaneStatus({ ...base, timelines: failed.timelines })).toMatchObject({ kind: 'failed', error: 'boom' })
    const stopped = stateAfter([
      ['turn.started', { turn_id: 't1', session_id: 'A' }],
      ['turn.stopped', { turn_id: 't1', session_id: 'A', reason: 'budget', details: { content: 'Budget reached' } }],
    ])
    expect(derivePaneStatus({ ...base, timelines: stopped.timelines })).toMatchObject({ kind: 'stopped', stopReason: { code: 'budget' } })
    const cancelled = stateAfter([
      ['turn.started', { turn_id: 't1', session_id: 'A' }],
      ['turn.cancelled', { turn_id: 't1', session_id: 'A' }],
    ])
    expect(derivePaneStatus({ ...base, timelines: cancelled.timelines }).kind).toBe('cancelled')
  })

  it('a new active turn wins over an older terminal, and the terminal stays reachable', () => {
    const state = stateAfter([
      ['turn.started', { turn_id: 't1', session_id: 'A' }],
      ['turn.completed', { turn_id: 't1', session_id: 'A' }],
      ['turn.started', { turn_id: 't2', session_id: 'A' }],
    ])
    const status = derivePaneStatus({ ...base, timelines: state.timelines, unreadResultCount: 1 })
    expect(status).toMatchObject({ kind: 'working', turnId: 't2', latestTerminalTurnId: 't1', unread: true })
  })

  it('compares statuses by value so badges keep their reference across deltas', () => {
    const state = stateAfter([['turn.started', { turn_id: 't1', session_id: 'A' }]])
    const a = derivePaneStatus({ ...base, timelines: state.timelines })
    const b = derivePaneStatus({ ...base, timelines: state.timelines })
    expect(a).not.toBe(b)
    expect(samePaneStatus(a, b)).toBe(true)
    expect(samePaneStatus(a, { ...b, unreadResultCount: 2, unread: true })).toBe(false)
  })
})
