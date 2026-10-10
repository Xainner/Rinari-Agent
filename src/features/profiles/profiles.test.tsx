// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { engineApi, type ProfileBundle, type ProjectSummary, type SessionSummary } from '../../services/engine'
import { AppSidebar, type AppSidebarProps } from '../../components/app-shell/AppSidebar'
import { useProjectExpansionStore } from '../../stores/projectExpansion'
import { inProfile, onProfileEvent, useProfileStore } from './profileStore'
import { useProfileMoves } from './useProfileMoves'

const now = '2026-10-10T00:00:00Z'

const profiles: ProfileBundle[] = [
  { id: 'default', name: 'Default', description: '', soul_id: null, mode: null, agents: {}, builtin: true, active: true, counts: { projects: 1, sessions: 2 } },
  { id: 'trabajo', name: 'Trabajo', description: '', soul_id: null, mode: null, agents: {}, builtin: false, active: false, counts: { projects: 0, sessions: 0 } },
]

function project(id: string, name: string, profile = 'default'): ProjectSummary {
  return {
    id, root: `/repo/${id}`, canonical_root: `/repo/${id}`, name, description: '', pinned: false, archived: false,
    git_fingerprint: null, created_at: now, updated_at: now, last_opened_at: now, active_session_id: null, rinari_profile_id: profile,
  }
}

function session(id: string, title: string, projectId: string | null = null, profile = 'default'): SessionSummary {
  return {
    id, kind: projectId ? 'PROJECT' : 'CHAT', title, mode: 'build', state: 'active', updated_at: now, project_id: projectId,
    project_root: projectId ? `/repo/${projectId}` : null, current_cwd: null, git_branch: null, last_active_at: now,
    provider_id: 'p', model_id: 'm', permission_profile: 'workspace', effective_permission_profile: 'workspace', rinari_profile_id: profile,
  }
}

function sidebar(overrides: Partial<AppSidebarProps> = {}) {
  const props: AppSidebarProps = {
    collapsed: false, onSearch: vi.fn(), onOpenSettings: vi.fn(), onOpenEngine: vi.fn(), onOpenProjectHome: null,
    onNewChat: vi.fn(), onOpenFolder: vi.fn(),
    sessions: [session('ps', 'Arreglar el gobernador', 'repo'), session('chat', 'Investigación')],
    closedSessions: [], archivedSessions: [], projects: [project('repo', 'Rinari CLI')], archivedProjects: [],
    activeId: 'chat', onSelectSession: vi.fn(), onOpenProject: vi.fn(), onCloseSession: vi.fn(), onRenameSession: vi.fn(),
    onArchiveSession: vi.fn(), onRestoreSession: vi.fn(), onForkSession: vi.fn(), onDeleteSession: vi.fn(),
    onUpdateProject: vi.fn(), onArchiveProject: vi.fn(), approvals: [],
    ...overrides,
  }
  return render(<I18nProvider lang="es"><AppSidebar {...props} /></I18nProvider>)
}

beforeEach(() => {
  useProfileStore.setState({ activeId: 'default', profiles, loaded: true, revision: 0 })
  vi.spyOn(engineApi, 'bundleList').mockResolvedValue({ profiles, active_id: 'default' })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
  useProjectExpansionStore.setState({ choices: {}, query: '' })
})

describe('profile filtering', () => {
  it('shows only the active profile, and everything when there is none', () => {
    expect(inProfile({ rinari_profile_id: 'trabajo' }, 'default')).toBe(false)
    expect(inProfile({}, 'default')).toBe(true)
    expect(inProfile({ rinari_profile_id: 'trabajo' }, null)).toBe(true)
  })

  it('the sidebar lists the active profile and greets an empty one', async () => {
    const view = sidebar()
    expect(screen.getByText('Rinari CLI')).toBeTruthy()
    expect(screen.getByText('Investigación')).toBeTruthy()
    expect(screen.queryByTestId('profile-empty')).toBeNull()
    act(() => useProfileStore.setState({ activeId: 'trabajo' }))
    await waitFor(() => expect(screen.queryByText('Rinari CLI')).toBeNull())
    const empty = await screen.findByTestId('profile-empty')
    expect(empty.textContent).toContain('«Trabajo» está vacío')
    view.unmount()
  })

  it('the switcher names the active profile and activates another', async () => {
    const activate = vi.spyOn(engineApi, 'bundleActivate').mockResolvedValue({ active_id: 'trabajo', previous_id: 'default', profile: profiles[1] })
    sidebar()
    const switcher = screen.getByTestId('profile-switcher')
    expect(switcher.textContent).toContain('Predeterminado')
    await userEvent.click(switcher)
    const item = await screen.findByRole('menuitem', { name: /Trabajo/ })
    expect(item.textContent).toContain('0 proyectos')
    vi.mocked(engineApi.bundleList).mockResolvedValue({ profiles, active_id: 'trabajo' })
    await userEvent.click(item)
    expect(activate).toHaveBeenCalledWith('trabajo')
    await waitFor(() => expect(useProfileStore.getState().activeId).toBe('trabajo'))
  })

  it('engine events bump the revision so lists refetch', () => {
    const before = useProfileStore.getState().revision
    onProfileEvent('project.moved')
    onProfileEvent('turn.completed')
    expect(useProfileStore.getState().revision).toBe(before + 1)
  })
})

function MoveHarness({ target }: { target: SessionSummary }) {
  const moves = useProfileMoves([project('repo', 'Rinari CLI')])
  return <>
    <button type="button" onClick={() => moves.moveSession(target, 'trabajo')}>mover</button>
    {moves.dialog}
  </>
}

describe('moving between profiles', () => {
  it('a loose conversation moves directly', async () => {
    const move = vi.spyOn(engineApi, 'sessionMoveProfile').mockResolvedValue({})
    render(<I18nProvider lang="es"><MoveHarness target={session('chat', 'Suelta')} /></I18nProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'mover' }))
    expect(move).toHaveBeenCalledWith('chat', 'trabajo', undefined)
    expect(screen.queryByTestId('profile-move-dialog')).toBeNull()
  })

  it('a project conversation asks: leave the project or move it whole', async () => {
    const move = vi.spyOn(engineApi, 'sessionMoveProfile').mockResolvedValue({})
    render(<I18nProvider lang="es"><MoveHarness target={session('ps', 'Del proyecto', 'repo')} /></I18nProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'mover' }))
    const dialog = await screen.findByTestId('profile-move-dialog')
    expect(dialog.textContent).toContain('Rinari CLI')
    expect(move).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /Mover el proyecto entero/ }))
    expect(move).toHaveBeenCalledWith('ps', 'trabajo', 'move_project')
    await waitFor(() => expect(screen.queryByTestId('profile-move-dialog')).toBeNull())
  })
})
