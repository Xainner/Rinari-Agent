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
