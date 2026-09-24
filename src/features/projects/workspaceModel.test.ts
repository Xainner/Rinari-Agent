import { describe, expect, it } from 'vitest'
import type { ProjectSummary, SessionSummary } from '../../services/engine'
import { buildWorkspaceModel, projectDisplayName, sortProjects } from './workspaceModel'

function session(partial: Partial<SessionSummary> & { id: string }): SessionSummary {
  return {
    kind: 'CHAT',
    title: null,
    mode: 'build',
    state: 'active',
    updated_at: '2026-09-09T00:00:00Z',
    project_id: null,
    project_root: null,
    current_cwd: null,
    git_branch: null,
    last_active_at: '2026-09-09T00:00:00Z',
    provider_id: 'p',
    model_id: 'm',
    permission_profile: 'workspace',
    effective_permission_profile: 'workspace',
    ...partial,
  }
}

function project(partial: Partial<ProjectSummary> & { id: string; root: string }): ProjectSummary {
  return {
    canonical_root: partial.root,
    name: projectDisplayName(partial.root),
    description: '',
    pinned: false,
    archived: false,
    git_fingerprint: null,
    created_at: '2026-09-09T00:00:00Z',
    updated_at: '2026-09-09T00:00:00Z',
    last_opened_at: '2026-09-09T00:00:00Z',
    active_session_id: null,
    ...partial,
  }
}

describe('projectDisplayName', () => {
  it('usa la última parte de la ruta', () => {
    expect(projectDisplayName('C:\\Projects\\Rinari-CLI')).toBe('Rinari-CLI')
    expect(projectDisplayName('/home/u/Rinari-Agent')).toBe('Rinari-Agent')
    expect(projectDisplayName('/')).toBe('/')
  })
})

describe('buildWorkspaceModel', () => {
  it('agrupa por project_id y separa chats', () => {
    const projects = [project({ id: 'p1', root: '/r/cli' })]
    const sessions = [
      session({ id: 's1', kind: 'PROJECT', project_id: 'p1', title: 'Fix' }),
      session({ id: 's2', kind: 'CHAT', title: 'Research' }),
    ]
    const model = buildWorkspaceModel(sessions, projects)
    expect(model.sections).toHaveLength(1)
    expect(model.sections[0].sessions.map((s) => s.id)).toEqual(['s1'])
    expect(model.chats.map((s) => s.id)).toEqual(['s2'])
  })

  it('resuelve por project_root cuando falta project_id', () => {
    const projects = [project({ id: 'p1', root: '/r/cli' })]
    const sessions = [session({ id: 's1', kind: 'PROJECT', project_root: '/r/cli' })]
    const model = buildWorkspaceModel(sessions, projects)
    expect(model.sections[0].sessions.map((s) => s.id)).toEqual(['s1'])
    expect(model.chats).toHaveLength(0)
  })

  it('muestra proyectos sin sesiones y manda huérfanos a chats', () => {
    const projects = [
      project({ id: 'p1', root: '/r/cli' }),
      project({ id: 'p2', root: '/r/luma' }),
    ]
    const sessions = [session({ id: 's1', kind: 'PROJECT', project_id: 'px' })]
    const model = buildWorkspaceModel(sessions, projects)
    expect(model.sections).toHaveLength(2)
    expect(model.sections[1].sessions).toHaveLength(0)
    expect(model.chats.map((s) => s.id)).toEqual(['s1'])
  })

  it('preserva el orden del engine', () => {
    const projects = [project({ id: 'p1', root: '/r/cli' })]
    const sessions = [
      session({ id: 's2', kind: 'PROJECT', project_id: 'p1' }),
      session({ id: 's1', kind: 'PROJECT', project_id: 'p1' }),
    ]
    const model = buildWorkspaceModel(sessions, projects)
    expect(model.sections[0].sessions.map((s) => s.id)).toEqual(['s2', 's1'])
  })

  it('busca proyecto por nombre, descripción y ruta, y sesiones por título', () => {
    const projects = [
      project({ id: 'p1', root: '/r/cli', name: 'Rinari CLI', description: 'Harness' }),
      project({ id: 'p2', root: '/r/code', name: 'Desktop', description: 'Tauri app' }),
    ]
    const sessions = [
      session({ id: 's1', kind: 'PROJECT', project_id: 'p1', title: 'Governor' }),
      session({ id: 's2', kind: 'PROJECT', project_id: 'p2', title: 'Timeline' }),
      session({ id: 's3', title: 'Independent research' }),
    ]
    expect(buildWorkspaceModel(sessions, projects, 'harness').sections.map((item) => item.project.id)).toEqual(['p1'])
    expect(buildWorkspaceModel(sessions, projects, '/code').sections.map((item) => item.project.id)).toEqual(['p2'])
    expect(buildWorkspaceModel(sessions, projects, 'timeline').sections[0].sessions[0].id).toBe('s2')
    expect(buildWorkspaceModel(sessions, projects, 'research').chats[0].id).toBe('s3')
  })
})

describe('sortProjects', () => {
  it('puts pinned projects first, then most recently opened', () => {
    const projects = [
      project({ id: 'old', root: '/old', last_opened_at: '2026-01-01T00:00:00Z' }),
      project({ id: 'new', root: '/new', last_opened_at: '2026-09-09T00:00:00Z' }),
      project({ id: 'pin', root: '/pin', pinned: true, last_opened_at: '2025-01-01T00:00:00Z' }),
    ]
    expect(sortProjects(projects).map((item) => item.id)).toEqual(['pin', 'new', 'old'])
  })
})

describe('fijadas', () => {
  it('saca las fijadas de su proyecto y de los chats, la más reciente primero', () => {
    const projects = [project({ id: 'p1', root: '/r/cli', name: 'Rinari CLI' })]
    const sessions = [
      session({ id: 'a', kind: 'PROJECT', project_id: 'p1', pinned_at: '2026-09-24T09:00:00Z' }),
      session({ id: 'b', pinned_at: '2026-09-24T10:00:00Z' }),
      session({ id: 'c', kind: 'PROJECT', project_id: 'p1' }),
      session({ id: 'd' }),
    ]
    const model = buildWorkspaceModel(sessions, projects)
    expect(model.pinned.map((entry) => [entry.session.id, entry.project?.id ?? null])).toEqual([['b', null], ['a', 'p1']])
    expect(model.sections[0].sessions.map((s) => s.id)).toEqual(['c'])
    expect(model.chats.map((s) => s.id)).toEqual(['d'])
  })

  it('la búsqueda filtra fijadas por título o nombre del proyecto', () => {
    const projects = [project({ id: 'p1', root: '/r/cli', name: 'Rinari CLI' })]
    const sessions = [
      session({ id: 'a', kind: 'PROJECT', project_id: 'p1', title: 'Governor', pinned_at: '2026-09-24T09:00:00Z' }),
      session({ id: 'b', title: 'Viaje', pinned_at: '2026-09-24T10:00:00Z' }),
    ]
    expect(buildWorkspaceModel(sessions, projects, 'rinari').pinned.map((entry) => entry.session.id)).toEqual(['a'])
    expect(buildWorkspaceModel(sessions, projects, 'viaje').pinned.map((entry) => entry.session.id)).toEqual(['b'])
  })
})
