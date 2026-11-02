import { describe, expect, it } from 'vitest'
import { paneInProfile } from './profilePanes'
import type { BoardPane } from '../../stores/board'

const pane = (patch: Partial<BoardPane>): BoardPane => ({ paneId: 'p', sessionId: '', width: 600, collapsed: false, ...patch })
const data = {
  sessionsById: { s_cafe: { rinari_profile_id: 'cafe' }, s_home: { rinari_profile_id: 'default' } },
  projects: [{ id: 'prj_cafe', rinari_profile_id: 'cafe' }],
}

describe('one board per profile', () => {
  it('shows a pane only in its conversation profile', () => {
    expect(paneInProfile(pane({ sessionId: 's_cafe' }), data, 'cafe')).toBe(true)
    expect(paneInProfile(pane({ sessionId: 's_cafe' }), data, 'default')).toBe(false)
    expect(paneInProfile(pane({ sessionId: 's_home' }), data, 'default')).toBe(true)
  })

  it('a draft follows its project; a general draft or an unloaded conversation stays', () => {
    expect(paneInProfile(pane({ draft: { projectId: 'prj_cafe' } as BoardPane['draft'] }), data, 'default')).toBe(false)
    expect(paneInProfile(pane({ draft: { projectId: null } as BoardPane['draft'] }), data, 'default')).toBe(true)
    expect(paneInProfile(pane({ sessionId: 's_unknown' }), data, 'default')).toBe(true)
  })
})
