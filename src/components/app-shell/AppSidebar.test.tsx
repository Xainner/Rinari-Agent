// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import type { ProjectSummary, SessionSummary } from '../../services/engine'
import { AppSidebar, type AppSidebarProps } from './AppSidebar'
import { useUIStore } from '../../stores/ui'

const now = '2026-09-09T00:00:00Z'
afterEach(cleanup)

function project(id: string, name: string, archived = false): ProjectSummary {
  return {
    id,
    root: `/repo/${id}`,
    canonical_root: `/repo/${id}`,
    name,
    description: `${name} description`,
    pinned: false,
    archived,
    git_fingerprint: null,
    created_at: now,
    updated_at: now,
    last_opened_at: now,
    active_session_id: null,
  }
}

function session(
  id: string,
  title: string,
  projectId: string | null = null,
  state: SessionSummary['state'] = 'active',
): SessionSummary {
  return {
    id,
    kind: projectId ? 'PROJECT' : 'CHAT',
    title,
    mode: 'build',
    state,
    updated_at: now,
    project_id: projectId,
    project_root: projectId ? `/repo/${projectId}` : null,
    current_cwd: null,
    git_branch: null,
    last_active_at: now,
    provider_id: 'provider',
    model_id: 'model',
    permission_profile: 'workspace',
    effective_permission_profile: 'workspace',
  }
}

function renderSidebar(overrides: Partial<AppSidebarProps> = {}) {
  const props: AppSidebarProps = {
    collapsed: false,
    onToggleCollapse: vi.fn(),
    onSearch: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenEngine: vi.fn(),
    onOpenProjectHome: null,
    onNewChat: vi.fn(),
    onOpenFolder: vi.fn(),
    sessions: [session('project-session', 'Fix governor', 'project'), session('chat', 'Research')],
    closedSessions: [],
    archivedSessions: [],
    projects: [project('project', 'Rinari CLI')],
    archivedProjects: [project('old', 'Old project', true)],
    activeId: 'chat',
    onSelectSession: vi.fn(),
    onOpenProject: vi.fn(),
    onCloseSession: vi.fn(),
    onRenameSession: vi.fn(),
    onArchiveSession: vi.fn(),
    onRestoreSession: vi.fn(),
    onForkSession: vi.fn(),
    onDeleteSession: vi.fn(),
    onUpdateProject: vi.fn(),
    onArchiveProject: vi.fn(),
    approvals: [],
    ...overrides,
  }
  render(<I18nProvider lang="es"><AppSidebar {...props} /></I18nProvider>)
  return props
}

describe('AppSidebar project and session lifecycle', () => {
  it('separates project sessions from standalone chats and searches both', async () => {
    renderSidebar()
    expect(screen.getByText('Rinari CLI')).toBeTruthy()
    expect(screen.getByText('Fix governor')).toBeTruthy()
    expect(screen.getByText('Research')).toBeTruthy()

    const search = screen.getByPlaceholderText('Buscar proyectos y sesiones…')
    await userEvent.type(search, 'governor')
    expect(screen.getByText('Fix governor')).toBeTruthy()
    expect(screen.queryByText('Research')).toBeNull()
  })

  it('restores archived projects through the engine callback', async () => {
    const props = renderSidebar()
    await userEvent.click(screen.getByRole('button', { name: /Proyectos archivados/ }))
    expect(screen.getByText('Old project')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar proyecto' }))
    expect(props.onUpdateProject).toHaveBeenCalledWith('old', { archived: false })
  })

  it('keeps archived sessions distinct from merely closed sessions', async () => {
    const props = renderSidebar({
      archivedProjects: [],
      archivedSessions: [session('archived', 'Archived investigation', null, 'archived')],
      closedSessions: [session('closed', 'Closed draft', null, 'closed')],
    })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Sesiones archivadas/ }))
    expect(screen.getByText('Archived investigation')).toBeTruthy()
    await user.click(screen.getAllByRole('button', { name: 'Opciones de sesión' }).at(-1)!)
    await user.click(screen.getByRole('menuitem', { name: /Restaurar/ }))
    expect(props.onRestoreSession).toHaveBeenCalledWith('archived')
  })

  it('exposes fork, archive and rename instead of hiding engine lifecycle actions', async () => {
    const props = renderSidebar({ archivedProjects: [] })
    const user = userEvent.setup()
    const options = () => screen.getAllByRole('button', { name: 'Opciones de sesión' })[0]

    await user.click(options())
    await user.click(screen.getByRole('menuitem', { name: /Bifurcar/ }))
    expect(props.onForkSession).toHaveBeenCalledWith('project-session')

    await user.click(options())
    await user.click(screen.getByRole('menuitem', { name: /Archivar/ }))
    expect(props.onArchiveSession).toHaveBeenCalledWith('project-session')

    await user.click(options())
    await user.click(screen.getByRole('menuitem', { name: /Renombrar/ }))
    const title = screen.getByRole('textbox', { name: 'Renombrar' })
    await user.clear(title)
    await user.type(title, 'Governor complete')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(props.onRenameSession).toHaveBeenCalledWith('project-session', 'Governor complete')
  })
})

it('creates a session for the exact project without invoking global new chat', async () => {
  const user = userEvent.setup()
  const props = renderSidebar({ onNewProjectChat: vi.fn() })
  await user.click(screen.getByLabelText('Nueva sesión en Rinari CLI'))
  expect(props.onNewProjectChat).toHaveBeenCalledWith('project')
  expect(props.onNewChat).not.toHaveBeenCalled()
  await user.click(screen.getByText('Nueva conversación'))
  expect(props.onNewChat).toHaveBeenCalledOnce()
})

it('collapses project sessions without opening the project', async () => {
  const props = renderSidebar()
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /Rinari CLI/ }))
  expect(screen.queryByText('Fix governor')).toBeNull()
  expect(screen.getByText('Research')).toBeTruthy()
  expect(props.onOpenProject).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: /Rinari CLI/ }))
  expect(screen.getByText('Fix governor')).toBeTruthy()
})

it('reveals project sessions and clears search when creating from a collapsed project', async () => {
  const props = renderSidebar({ onNewProjectChat: vi.fn() })
  const user = userEvent.setup()
  await user.click(screen.getByTitle('/repo/project'))
  expect(screen.queryByText('Fix governor')).toBeNull()
  const search = screen.getByPlaceholderText('Buscar proyectos y sesiones…')
  await user.type(search, 'Rinari')
  await user.click(screen.getByLabelText('Nueva sesión en Rinari CLI'))
  expect((search as HTMLInputElement).value).toBe('')
  expect(screen.getByText('Fix governor')).toBeTruthy()
  expect(props.onNewProjectChat).toHaveBeenCalledWith('project')
})

describe('transición al cambiar de conversación', () => {
  function renderSwitchable(activeId: string) {
    const props: AppSidebarProps = {
      collapsed: false,
      onToggleCollapse: vi.fn(),
      onSearch: vi.fn(),
      onOpenSettings: vi.fn(),
      onOpenEngine: vi.fn(),
      onOpenProjectHome: null,
      onNewChat: vi.fn(),
      onOpenFolder: vi.fn(),
      sessions: [session('chat-a', 'Research'), session('chat-b', 'Notes'), session('project-session', 'Fix governor', 'project')],
      closedSessions: [],
      archivedSessions: [],
      projects: [project('project', 'Rinari CLI')],
      archivedProjects: [],
      activeId,
      onSelectSession: vi.fn(),
      onOpenProject: vi.fn(),
      onCloseSession: vi.fn(),
      onRenameSession: vi.fn(),
      onArchiveSession: vi.fn(),
      onRestoreSession: vi.fn(),
      onForkSession: vi.fn(),
      onDeleteSession: vi.fn(),
      onUpdateProject: vi.fn(),
      onArchiveProject: vi.fn(),
      approvals: [],
    }
    const view = render(<I18nProvider lang="es"><AppSidebar {...props} /></I18nProvider>)
    return { view, props }
  }

  function rerenderSwitchable(view: ReturnType<typeof render>, activeId: string) {
    view.rerender(
      <I18nProvider lang="es"><AppSidebar
        collapsed={false}
        onToggleCollapse={vi.fn()}
        onSearch={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenEngine={vi.fn()}
        onOpenProjectHome={null}
        onNewChat={vi.fn()}
        onOpenFolder={vi.fn()}
        sessions={[session('chat-a', 'Research'), session('chat-b', 'Notes'), session('project-session', 'Fix governor', 'project')]}
        closedSessions={[]}
        archivedSessions={[]}
        projects={[project('project', 'Rinari CLI')]}
        archivedProjects={[]}
        activeId={activeId}
        onSelectSession={vi.fn()}
        onOpenProject={vi.fn()}
        onCloseSession={vi.fn()}
        onRenameSession={vi.fn()}
        onArchiveSession={vi.fn()}
        onRestoreSession={vi.fn()}
        onForkSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onUpdateProject={vi.fn()}
        onArchiveProject={vi.fn()}
        approvals={[]}
      /></I18nProvider>,
    )
  }

  function railOf(title: string): string {
    const row = screen.getByRole('button', { name: title }).closest('li')
    return row?.querySelector('[data-testid="session-rail"]')?.className ?? ''
  }
  function mockRowGeometry(title: string, top: number, height: number) {
    const row = screen.getByRole('button', { name: title }).closest('li') as HTMLElement;
    Object.defineProperty(row, 'offsetTop', { value: top, configurable: true });
    Object.defineProperty(row, 'offsetHeight', { value: height, configurable: true });
    Object.defineProperty(row, 'offsetParent', { value: document.body, configurable: true });
  }
  function traveler(): HTMLElement {
    return screen.getByTestId('sessions-traveler');
  }
  it('el viajero marca la suelta activa y las filas sueltas no llevan riel propio', () => {
    const { view } = renderSwitchable('chat-a');
    mockRowGeometry('Research', 40, 32);
    mockRowGeometry('Notes', 76, 32);
    rerenderSwitchable(view, 'chat-a');
    expect(traveler().style.transform).toBe('translateY(40px)');
    expect(traveler().style.height).toBe('32px');
    expect(traveler().style.opacity).toBe('1');
    expect(railOf('Research')).toBe('');
    expect(railOf('Notes')).toBe('');
  });
  it('entre sueltas el viajero viaja sin corte', () => {
    const { view } = renderSwitchable('chat-a');
    mockRowGeometry('Research', 40, 32);
    mockRowGeometry('Notes', 76, 32);
    rerenderSwitchable(view, 'chat-b');
    expect(document.querySelector('.sidebar-switch-instant')).toBeNull();
    expect(traveler().style.transform).toBe('translateY(76px)');
    expect(traveler().style.opacity).toBe('1');
  });
  it('hacia sesion de proyecto oculta el viajero y corta transiciones', () => {
    const { view } = renderSwitchable('chat-a');
    rerenderSwitchable(view, 'project-session');
    expect(document.querySelector('.sidebar-scroll.sidebar-switch-instant')).not.toBeNull();
    expect(traveler().style.opacity).toBe('0');
    expect(railOf('Fix governor')).toContain('opacity-100');
  });


  it('fuera de la vista chat corta las transiciones', () => {
    useUIStore.setState({ view: 'workspace' })
    try {
      renderSwitchable('chat-a')
      expect(document.querySelector('.sidebar-scroll.sidebar-switch-instant')).not.toBeNull()
    } finally {
      useUIStore.setState({ view: 'chat' })
    }
  })
})

it('shows work in an unselected session and its collapsed project', async () => {
  renderSidebar({ busySessionIds: new Set(['project-session']) })
  expect(within(screen.getByText('Research').closest('button')!).queryByRole('status')).toBeNull()
  expect(within(screen.getByText('Fix governor').closest('button')!).getByRole('status')).toBeTruthy()
  await userEvent.click(screen.getByTitle('/repo/project'))
  expect(screen.queryByText('Fix governor')).toBeNull()
  expect(screen.getByRole('status', { name: 'Proyecto con sesiones en curso' })).toBeTruthy()
})

it('removes the work indicator when engine activity ends without changing selection', () => {
  const props = renderSidebar({ busySessionIds: new Set(['chat']) })
  cleanup()
  const view = render(<I18nProvider lang="es"><AppSidebar {...props} /></I18nProvider>)
  expect(screen.getByRole('status', { name: 'Sesión en curso' })).toBeTruthy()
  view.rerender(<I18nProvider lang="es"><AppSidebar {...props} busySessionIds={new Set()} /></I18nProvider>)
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.getByText('Research').closest('button')?.getAttribute('aria-current')).toBe('page')
})
