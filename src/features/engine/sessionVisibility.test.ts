import { describe, expect, it } from 'vitest'
import { isSessionHidden, partitionSessions } from './sessionVisibility'
import type { SessionSummary } from '../../services/engine'

function session(id: string, state: SessionSummary['state'] | string): SessionSummary {
  return {
    id,
    kind: 'CHAT',
    title: id,
    mode: 'build',
    state: state as SessionSummary['state'],
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

describe('sessionVisibility', () => {
  it('keeps interrupted and stopped sessions visible', () => {
    expect(isSessionHidden(session('a', 'active'))).toBe(false)
    expect(isSessionHidden(session('b', 'interrupted'))).toBe(false)
    expect(isSessionHidden(session('c', 'stopped'))).toBe(false)
  })

  it('hides only closed and archived sessions', () => {
    expect(isSessionHidden(session('d', 'closed'))).toBe(true)
    expect(isSessionHidden(session('e', 'archived'))).toBe(true)
  })

  it('partitions engine sessions without dropping runtime states', () => {
    const items = [
      session('a', 'active'),
      session('b', 'interrupted'),
      session('c', 'stopped'),
      session('d', 'closed'),
      session('e', 'archived'),
    ]
    const parts = partitionSessions(items)
    expect(parts.visible.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(parts.closed.map((s) => s.id)).toEqual(['d'])
    expect(parts.archived.map((s) => s.id)).toEqual(['e'])
  })
})
