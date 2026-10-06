import { describe, expect, it } from 'vitest'
import { indicatorTexts, pendingBySession, summarizeAttention, type SessionPending } from './attentionIndicators'
import { emptySessionAttention, type SessionAttention } from '../../stores/boardAttention'

const session = (patch: Partial<SessionPending>): SessionPending => ({ sessionId: 's', needsYou: false, unread: [], unreadPeers: 0, working: false, ...patch })

describe('summarizeAttention', () => {
  it('counts chats, not results, and working does not add to the number', () => {
    expect(summarizeAttention([])).toEqual({ count: 0, category: 'none', working: 0 })
    expect(summarizeAttention([session({ unread: ['completed', 'completed', 'completed'] })]).count).toBe(1)
    expect(summarizeAttention([
      session({ sessionId: 'a', unread: ['completed'], needsYou: true }),
      session({ sessionId: 'b', working: true }),
    ])).toEqual({ count: 1, category: 'needs_you', working: 1 })
  })

  it('an unread failure is not hidden by a later success', () => {
    expect(summarizeAttention([session({ unread: ['failed', 'completed'] })]).category).toBe('failed')
    expect(summarizeAttention([session({ sessionId: 'a', unread: ['completed'] }), session({ sessionId: 'b', unread: ['failed'] })]).category).toBe('failed')
  })

  it('a question or a permission wins; stopped results and peer messages are "other"', () => {
    expect(summarizeAttention([session({ sessionId: 'a', unread: ['failed'] }), session({ sessionId: 'b', needsYou: true })]).category).toBe('needs_you')
    expect(summarizeAttention([session({ unread: ['stopped'] })]).category).toBe('other')
    expect(summarizeAttention([session({ unreadPeers: 2 })]).category).toBe('other')
  })
})

describe('pendingBySession', () => {
  it('reads every unread receipt, approvals per session and active turns', () => {
    const receipts: SessionAttention = {
      ...emptySessionAttention(),
      initialized: true,
      turns: {
        t1: { turnId: 't1', state: 'unread', outcome: 'failed' },
        t2: { turnId: 't2', state: 'seen', outcome: 'completed' },
        t0: { turnId: 't0', state: 'baseline', outcome: 'completed' },
      },
    }
    const rows = pendingBySession(
      {
        timelines: { x: { sessionId: 'b', status: 'running' } } as never,
        approvals: [{ session_id: 'c', approval_id: 'ap', status: 'pending' }, { session_id: 'd', approval_id: 'ap2', status: 'resolving' }] as never,
      },
      { a: receipts },
      (id) => (id === 'b' ? 1 : 0),
    )
    const byId = Object.fromEntries(rows.map((row) => [row.sessionId, row]))
    expect(byId.a.unread).toEqual(['failed'])
    expect(byId.b).toMatchObject({ working: true, needsYou: true })
    expect(byId.c.needsYou).toBe(true)
    expect(byId.d).toBeUndefined()
  })
})

describe('indicatorTexts', () => {
  it('says how many and why, in the app language', () => {
    expect(indicatorTexts({ count: 1, category: 'needs_you', working: 2 }, 'es')).toEqual({
      tooltip: 'Rinari Agent · 1 chat pendiente · 2 trabajando',
      description: '1 chat pendiente. Uno necesita tu respuesta o permiso',
    })
    expect(indicatorTexts({ count: 3, category: 'done', working: 0 }, 'en').tooltip).toBe('Rinari Agent · 3 chats pending')
    expect(indicatorTexts({ count: 0, category: 'none', working: 0 }, 'es')).toEqual({ tooltip: 'Rinari Agent', description: '' })
  })
})
