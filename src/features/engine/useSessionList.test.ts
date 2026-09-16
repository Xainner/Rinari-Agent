// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSessionList } from './useSessionList'
import type { SessionSummary } from '../../services/engine'

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}))

const { openSession, sessions, sessionHistory } = vi.hoisted(() => ({
  openSession: vi.fn(),
  sessions: vi.fn(),
  sessionHistory: vi.fn(),
}))

vi.mock('../../services/engine', async () => {
  const actual = await vi.importActual<typeof import('../../services/engine')>(
    '../../services/engine',
  )
  return {
    ...actual,
    engineApi: {
      openSession,
      sessions,
      sessionHistory,
      sessionTimeline: vi.fn(),
    },
    commandMessage: (error: unknown) => String(error),
  }
})

function summary(id: string, state: SessionSummary['state'] = 'active'): SessionSummary {
  return {
    id,
    kind: 'CHAT',
    title: id,
    mode: 'build',
    state,
    updated_at: '2026-09-15T00:00:00.000Z',
    project_id: null,
    project_root: null,
    current_cwd: null,
    git_branch: null,
    last_active_at: '2026-09-15T00:00:00.000Z',
    provider_id: 'p',
    model_id: 'm',
    permission_profile: 'workspace',
    effective_permission_profile: 'workspace',
  }
}

function setup() {
  openSession.mockReset()
  sessions.mockReset()
  sessionHistory.mockReset()
  sessionHistory.mockResolvedValue({ session_id: '', messages: [], total: 0, has_more: false })
  return renderHook(() =>
    useSessionList({ dispatch: vi.fn(), engineReady: false, timelineEnabled: false }),
  )
}

describe('useSessionList session visibility', () => {
  it.each(['interrupted', 'stopped'] as const)(
    'keeps a selected %s session visible without moving selection',
    async (state) => {
      const { result } = setup()
      sessions.mockResolvedValue({
        sessions: [summary('other'), summary('mine', state)],
      })
      await act(async () => {
        result.current.setActiveSession('mine')
      })
      await act(async () => {
        await result.current.refreshSessions()
      })
      expect(result.current.activeSession).toBe('mine')
      expect(result.current.sessions.map((s) => s.id)).toEqual(['other', 'mine'])
    },
  )

  it('reconciles selectSession with the resumed record instead of stale list data', async () => {
    const { result } = setup()
    sessions.mockResolvedValue({ sessions: [summary('a', 'interrupted')] })
    await act(async () => {
      await result.current.refreshSessions()
    })
    const resumed = { ...summary('a', 'active'), model_id: 'm2' }
    openSession.mockResolvedValue({ session: resumed, created: false, warnings: [] })
    await act(async () => {
      await result.current.selectSession('a')
    })
    expect(result.current.sessions).toHaveLength(1)
    expect(result.current.sessions[0]).toEqual(resumed)
  })

  it('moves a reopened closed session to visible without duplicating trays', async () => {
    const { result } = setup()
    sessions.mockResolvedValue({ sessions: [summary('c', 'closed')] })
    await act(async () => {
      await result.current.refreshSessions()
    })
    expect(result.current.closedSessions.map((s) => s.id)).toEqual(['c'])
    openSession.mockResolvedValue({
      session: summary('c', 'active'),
      created: false,
      warnings: [],
    })
    await act(async () => {
      await result.current.selectSession('c')
    })
    expect(result.current.sessions.map((s) => s.id)).toEqual(['c'])
    expect(result.current.closedSessions).toEqual([])
    expect(result.current.archivedSessions).toEqual([])
  })

  it('does not invent an active session when openSession fails', async () => {
    const { result } = setup()
    sessions.mockResolvedValue({ sessions: [summary('a')] })
    await act(async () => {
      await result.current.refreshSessions()
    })
    openSession.mockRejectedValue(new Error('ENGINE_DOWN'))
    await act(async () => {
      await result.current.selectSession('missing')
    })
    expect(result.current.activeSession).toBe('a')
    expect(result.current.sessions.map((s) => s.id)).toEqual(['a'])
  })

  it('does not reload history when reopening a session with history loaded', async () => {
    const { result } = setup()
    openSession.mockResolvedValue({
      session: summary('a'),
      created: false,
      warnings: [],
    })
    await act(async () => {
      await result.current.selectSession('a')
    })
    await act(async () => {
      await result.current.selectSession('a')
    })
    expect(sessionHistory).toHaveBeenCalledTimes(1)
  })

  it('ignores a stale refresh that resolves after a newer one', async () => {
    const { result } = setup()
    let resolveStale!: (value: { sessions: SessionSummary[] }) => void
    sessions
      .mockImplementationOnce(
        () => new Promise<{ sessions: SessionSummary[] }>((resolve) => {
          resolveStale = resolve
        }),
      )
      .mockImplementationOnce(async () => ({ sessions: [summary('fresh')] }))
    let first!: Promise<void>
    await act(async () => {
      first = result.current.refreshSessions()
      await result.current.refreshSessions()
      resolveStale({ sessions: [summary('stale')] })
      await first
    })
    expect(result.current.sessions.map((s) => s.id)).toEqual(['fresh'])
  })
})
