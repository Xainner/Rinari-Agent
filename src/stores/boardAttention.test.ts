// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  ATTENTION_STORAGE_KEY,
  flushAttentionPersistence,
  readPersistedAttention,
  unreadResultCount,
  unreadTurnIds,
  useBoardAttentionStore,
} from './boardAttention'

beforeEach(() => {
  window.localStorage.clear()
  useBoardAttentionStore.getState().hydrate({})
})

describe('bootstrap', () => {
  it('takes finished history as baseline, keeps live terminals seen during the load as unread', () => {
    const store = useBoardAttentionStore.getState()
    store.initializeSessionAttention('ses_a', [
      { turnId: 't1', outcome: 'completed' },
      { turnId: 't2', outcome: 'failed' },
      { turnId: 't3', outcome: 'completed' },
    ], { liveTerminalTurnIds: ['t3'] })
    const session = useBoardAttentionStore.getState().sessions.ses_a
    expect(session.initialized).toBe(true)
    expect(session.turns.t1.state).toBe('baseline')
    expect(session.turns.t2.state).toBe('baseline')
    expect(session.turns.t3.state).toBe('unread')
    expect(unreadTurnIds(session)).toEqual(['t3'])
  })

  it('honours a legacy lastSeenTurnId by exact match only', () => {
    const store = useBoardAttentionStore.getState()
    store.initializeSessionAttention('ses_a', [
      { turnId: 't1', outcome: 'completed' },
      { turnId: 't2', outcome: 'completed' },
    ], { legacyLastSeenTurnId: 't1', liveTerminalTurnIds: ['t1', 't2'] })
    const session = useBoardAttentionStore.getState().sessions.ses_a
    expect(session.turns.t1.state).toBe('seen')
    expect(session.turns.t2.state).toBe('unread')
    expect(session.lastSeenTurnId).toBeNull()
  })

  it('keeps an unresolvable legacy id as pending data instead of guessing', () => {
    useBoardAttentionStore.getState().initializeSessionAttention('ses_a', [], { legacyLastSeenTurnId: 't_old' })
    expect(useBoardAttentionStore.getState().sessions.ses_a.lastSeenTurnId).toBe('t_old')
  })

  it('is idempotent: a second initialization never rewrites receipts', () => {
    const store = useBoardAttentionStore.getState()
    store.initializeSessionAttention('ses_a', [{ turnId: 't1', outcome: 'completed' }])
    store.observeTerminal('ses_a', 't2', 'completed', 'live')
    store.initializeSessionAttention('ses_a', [{ turnId: 't1', outcome: 'completed' }, { turnId: 't2', outcome: 'completed' }])
    expect(useBoardAttentionStore.getState().sessions.ses_a.turns.t2.state).toBe('unread')
  })
})

describe('terminals and reading', () => {
  beforeEach(() => {
    useBoardAttentionStore.getState().initializeSessionAttention('ses_a', [])
  })

  it('live completed/failed/stopped become unread; cancelled is neutral; history is baseline', () => {
    const store = useBoardAttentionStore.getState()
    store.observeTerminal('ses_a', 't1', 'completed', 'live')
    store.observeTerminal('ses_a', 't2', 'failed', 'live')
    store.observeTerminal('ses_a', 't3', 'stopped', 'live')
    store.observeTerminal('ses_a', 't4', 'cancelled', 'live')
    store.observeTerminal('ses_a', 't5', 'completed', 'history')
    const session = useBoardAttentionStore.getState().sessions.ses_a
    expect(unreadTurnIds(session)).toEqual(['t1', 't2', 't3'])
    expect(session.turns.t4.state).toBe('seen')
    expect(session.turns.t5.state).toBe('baseline')
  })

  it('a tracked active turn that finishes while disconnected is unread even from a snapshot', () => {
    const store = useBoardAttentionStore.getState()
    store.trackActiveTurn('ses_a', 't9')
    store.observeTerminal('ses_a', 't9', 'completed', 'snapshot')
    const session = useBoardAttentionStore.getState().sessions.ses_a
    expect(session.turns.t9.state).toBe('unread')
    expect(session.trackedActiveTurnIds).toEqual([])
  })

  it('starting T2 does not clear T1; explicit reads are per id and per known set', () => {
    const store = useBoardAttentionStore.getState()
    store.observeTerminal('ses_a', 't1', 'completed', 'live')
    store.trackActiveTurn('ses_a', 't2')
    expect(unreadResultCount(useBoardAttentionStore.getState().sessions.ses_a)).toBe(1)
    store.markTurnSeen('ses_a', 't1')
    expect(unreadResultCount(useBoardAttentionStore.getState().sessions.ses_a)).toBe(0)
    store.observeTerminal('ses_a', 't2', 'completed', 'live')
    store.observeTerminal('ses_a', 't3', 'completed', 'live')
    store.markSessionResultsSeen('ses_a', ['t2'])
    expect(unreadTurnIds(useBoardAttentionStore.getState().sessions.ses_a)).toEqual(['t3'])
    store.markAllBoardResultsSeen({ ses_a: ['t3'], ses_missing: ['x'] })
    expect(unreadTurnIds(useBoardAttentionStore.getState().sessions.ses_a)).toEqual([])
  })

  it('claims a notification key at most once per turn', () => {
    const store = useBoardAttentionStore.getState()
    store.observeTerminal('ses_a', 't1', 'completed', 'live')
    expect(store.claimNotification('ses_a', 't1', 'k1')).toBe(true)
    expect(store.claimNotification('ses_a', 't1', 'k1')).toBe(false)
    expect(store.claimNotification('ses_a', 'unknown', 'k1')).toBe(false)
  })

  it('tracks peer messages separately from results', () => {
    const store = useBoardAttentionStore.getState()
    store.observePeerMessage('ses_a', 'msg_1')
    store.observePeerMessage('ses_a', 'msg_1')
    store.observePeerMessage('ses_a', 'msg_2')
    expect(useBoardAttentionStore.getState().sessions.ses_a.unreadPeerMessageIds).toEqual(['msg_1', 'msg_2'])
    store.markPeerMessagesSeen('ses_a', ['msg_1'])
    expect(useBoardAttentionStore.getState().sessions.ses_a.unreadPeerMessageIds).toEqual(['msg_2'])
  })
})

describe('persistence', () => {
  it('stores receipts under the profile key without any content and reloads them sanitized', () => {
    const store = useBoardAttentionStore.getState()
    store.initializeSessionAttention('ses_a', [{ turnId: 't1', outcome: 'completed' }])
    store.observeTerminal('ses_a', 't2', 'failed', 'live', 1234)
    flushAttentionPersistence()
    const raw = JSON.parse(window.localStorage.getItem(ATTENTION_STORAGE_KEY) ?? '{}')
    expect(raw.version).toBe(1)
    const profile = raw.profiles[useBoardAttentionStore.getState().profileKey]
    expect(profile.ses_a.turns.t2).toEqual({ turnId: 't2', state: 'unread', outcome: 'failed', completedAt: 1234 })
    expect(JSON.stringify(raw)).not.toContain('content')
    // Corrupt entries are dropped on load, valid ones survive.
    profile.ses_a.turns.bad = { state: 'weird', outcome: 'completed' }
    profile.ses_b = 'nope'
    window.localStorage.setItem(ATTENTION_STORAGE_KEY, JSON.stringify(raw))
    const reloaded = readPersistedAttention(useBoardAttentionStore.getState().profileKey)
    expect(Object.keys(reloaded)).toEqual(['ses_a'])
    expect(Object.keys(reloaded.ses_a.turns)).toEqual(['t1', 't2'])
    expect(reloaded.ses_a.turns.t2.state).toBe('unread')
  })

  it('forgetSession drops receipts only for that session', () => {
    const store = useBoardAttentionStore.getState()
    store.initializeSessionAttention('ses_a', [])
    store.initializeSessionAttention('ses_b', [])
    store.forgetSession('ses_a')
    expect(Object.keys(useBoardAttentionStore.getState().sessions)).toEqual(['ses_b'])
  })
})
