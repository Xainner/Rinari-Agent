// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import type { ProjectSummary, SessionSummary } from '../../services/engine'
import { bornAt } from '../../features/projects/workspaceModel'
import { AppSidebar, type AppSidebarProps } from './AppSidebar'
import { useUIStore } from '../../stores/ui'
import { useProjectExpansionStore } from '../../stores/projectExpansion'

const now = '2026-09-09T00:00:00Z'
afterEach(() => {
  cleanup()
  localStorage.clear()
  useProjectExpansionStore.setState({ choices: {}, query: '' })
})

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
    renderSidebar({ activeId: 'project-session' })
    expect(screen.getByText('Rinari CLI')).toBeTruthy()
    expect(screen.getByText('Fix governor')).toBeTruthy()
    expect(screen.getByText('Research')).toBeTruthy()

    const search = screen.getByPlaceholderText('Buscar proyectos y sesiones…')
    await userEvent.type(search, 'governor')
    expect(screen.getByText('Fix governor')).toBeTruthy()
    expect(screen.queryByText('Research')).toBeNull()
  })

  it('projects start collapsed except the active one, and a manual choice is remembered', async () => {
    renderSidebar()
    // The active conversation is a loose chat: its project stays collapsed.
    expect(screen.queryByText('Fix governor')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /Rinari CLI/ }))
    expect(screen.getByText('Fix governor')).toBeTruthy()
    cleanup()
    renderSidebar()
    expect(screen.getByText('Fix governor')).toBeTruthy()

    cleanup()
    localStorage.clear()
    renderSidebar({ activeId: 'project-session' })
    expect(screen.getByText('Fix governor')).toBeTruthy()
  })

  it('restores archived projects through the engine callback', async () => {
    const props = renderSidebar()
    await userEvent.click(screen.getByRole('button', { name: /Proyectos archivados/ }))
    expect(screen.getByText('Old project')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar proyecto' }))
    expect(props.onUpdateProject).toHaveBeenCalledWith('old', { archived: false })
  })

  it('deletes an archived project only when the engine offers it', async () => {
    const onDeleteProject = vi.fn()
    renderSidebar({ onDeleteProject })
    await userEvent.click(screen.getByRole('button', { name: /Proyectos archivados/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar definitivamente' }))
    expect(onDeleteProject).toHaveBeenCalledWith('old')
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
    const props = renderSidebar({ archivedProjects: [], activeId: 'project-session' })
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
  const props = renderSidebar({ activeId: 'project-session' })
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /Rinari CLI/ }))
  expect(screen.queryByText('Fix governor')).toBeNull()
  expect(screen.getByText('Research')).toBeTruthy()
  expect(props.onOpenProject).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: /Rinari CLI/ }))
  expect(screen.getByText('Fix governor')).toBeTruthy()
})

it('reveals project sessions and clears search when creating from a collapsed project', async () => {
  const props = renderSidebar({ onNewProjectChat: vi.fn(), activeId: 'project-session' })
  const user = userEvent.setup()
  await user.click(screen.getByTitle('/repo/project'))
  expect(screen.queryByText('Fix governor')).toBeNull()
  const search = screen.getByPlaceholderText('Buscar proyectos y sesiones…')
  await user.type(search, 'Rinari')
  await user.click(screen.getByLabelText('Nueva sesión en Rinari CLI'))
  // A click alone is not confirmation. The controller reveals on Engine success.
  expect((search as HTMLInputElement).value).toBe('Rinari')
  expect(useProjectExpansionStore.getState().choices.project).toBe(false)
  act(() => useProjectExpansionStore.getState().reveal('project'))
  expect((search as HTMLInputElement).value).toBe('')
  expect(screen.getByText('Fix governor')).toBeTruthy()
  expect(props.onNewProjectChat).toHaveBeenCalledWith('project')
})

describe('transición al cambiar de conversación', () => {
  function renderSwitchable(activeId: string) {
    const props: AppSidebarProps = {
      collapsed: false,
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
  // The project starts collapsed (the active chat is not in it): open it first.
  await userEvent.click(screen.getByTitle('/repo/project'))
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

describe('interrupted sessions', () => {
  it('marks interrupted sessions as resumable instead of hiding them', () => {
    renderSidebar({
      sessions: [session('resumable', 'Timed out chat', null, 'interrupted'), session('chat', 'Research')],
      activeId: 'chat',
    })
    const dot = screen.getByTestId('session-interrupted-dot')
    expect(dot.getAttribute('title')).toBe('Sesión interrumpida, se puede reanudar')
  })

  it('marks stopped sessions the same way', () => {
    renderSidebar({ sessions: [session('halted', 'Stopped chat', null, 'stopped')] })
    expect(screen.getByTestId('session-interrupted-dot')).toBeTruthy()
  })

  it('removes the marker when the session resumes without starting another turn', () => {
    const props = renderSidebar({
      sessions: [session('resumable', 'Timed out chat', null, 'interrupted')],
      activeId: 'resumable',
    })
    expect(screen.getByTestId('session-interrupted-dot')).toBeTruthy()
    cleanup()
    render(
      <I18nProvider lang="es">
        <AppSidebar {...props} sessions={[session('resumable', 'Timed out chat', null, 'active')]} />
      </I18nProvider>,
    )
    expect(screen.queryByTestId('session-interrupted-dot')).toBeNull()
  })

  it('shows no runtime marker for closed or archived sessions', () => {
    renderSidebar({
      sessions: [
        session('closed', 'Closed draft', null, 'closed'),
        session('archived', 'Archived work', null, 'archived'),
      ],
    })
    expect(screen.queryByTestId('session-interrupted-dot')).toBeNull()
  })

  it('shows no interrupted marker for active sessions', () => {
    renderSidebar()
    expect(screen.queryByTestId('session-interrupted-dot')).toBeNull()
  })
})

// M01 §3.4 — el sidebar ya no reparte el colapso entre tres sitios.
//
// Había un colapsador incrustado al final del campo de búsqueda y otro
// expansor al pie del rail. Con la barra superior como autoridad única, los
// dos sobran; repartir una acción entre tres lugares es lo que hacía parecer
// roto el control de la title bar.
it('no ofrece colapsar dentro de la búsqueda ni al pie del rail', () => {
  renderSidebar({ collapsed: false })
  expect(screen.queryByRole('button', { name: 'Colapsar barra' })).toBeNull()
  // La búsqueda se queda intacta: mismo campo, misma etiqueta y sigue
  // filtrando. El botón que salió de aquí no se llevó nada consigo.
  const buscar = screen.getByRole('textbox', { name: 'Buscar proyectos y sesiones…' })
  expect(screen.queryByText('Research')).toBeTruthy()
  fireEvent.change(buscar, { target: { value: 'governor' } })
  expect((buscar as HTMLInputElement).value).toBe('governor')
  expect(screen.queryByText('Research')).toBeNull()
  expect(screen.queryByText('Fix governor')).toBeTruthy()

  cleanup()
  renderSidebar({ collapsed: true })
  expect(screen.queryByRole('button', { name: 'Expandir barra' })).toBeNull()
})

describe('conversaciones fijadas', () => {
  const pinned = (base: SessionSummary, at: string): SessionSummary => ({ ...base, pinned_at: at })

  it('muestra Fijados arriba, con el proyecto en pequeño y sin repetirla abajo', () => {
    renderSidebar({
      sessions: [
        pinned(session('project-session', 'Fix governor', 'project'), '2026-09-24T10:00:00Z'),
        session('chat', 'Research'),
      ],
    })
    const section = screen.getByRole('region', { name: 'Fijados' })
    expect(within(section).getByText('Fix governor')).toBeTruthy()
    expect(within(section).getByText('Rinari CLI')).toBeTruthy()
    expect(screen.getAllByText('Fix governor')).toHaveLength(1)
    const projects = screen.getByRole('region', { name: 'Proyectos' })
    expect(within(projects).queryByText('Fix governor')).toBeNull()
  })

  it('fija y desfija desde el menú, y sin la capacidad del Engine no lo ofrece', async () => {
    const onPinSession = vi.fn()
    renderSidebar({
      onPinSession,
      sessions: [pinned(session('chat', 'Research'), '2026-09-24T10:00:00Z'), session('other', 'Notes')],
    })
    const user = userEvent.setup()
    const pinnedRegion = screen.getByRole('region', { name: 'Fijados' })
    await user.click(within(pinnedRegion).getByRole('button', { name: 'Opciones de sesión' }))
    await user.click(screen.getByRole('menuitem', { name: /Desfijar conversación/ }))
    expect(onPinSession).toHaveBeenCalledWith('chat', false)

    const chats = screen.getByRole('region', { name: 'Conversaciones' })
    await user.click(within(chats).getByRole('button', { name: 'Opciones de sesión' }))
    await user.click(screen.getByRole('menuitem', { name: /Fijar conversación/ }))
    expect(onPinSession).toHaveBeenCalledWith('other', true)
    cleanup()

    renderSidebar()
    await user.click(screen.getAllByRole('button', { name: 'Opciones de sesión' })[0])
    expect(screen.queryByRole('menuitem', { name: /Fijar conversación/ })).toBeNull()
  })

  it('muestra 8 y el resto con «Ver más»', async () => {
    const many = Array.from({ length: 10 }, (_, index) =>
      pinned(session(`p${index}`, `Fijada ${index}`), `2026-09-24T10:${String(index).padStart(2, '0')}:00Z`))
    renderSidebar({ sessions: many })
    const section = screen.getByRole('region', { name: 'Fijados' })
    expect(within(section).getAllByRole('listitem')).toHaveLength(8)
    // La más reciente primero.
    expect(within(section).getAllByRole('listitem')[0].textContent).toContain('Fijada 9')
    await userEvent.click(within(section).getByRole('button', { name: 'Ver más · 2' }))
    expect(within(section).getAllByRole('listitem')).toHaveLength(10)
  })

  it('Cerrar y Eliminar llevan icono como el resto del menú', async () => {
    renderSidebar()
    await userEvent.click(screen.getAllByRole('button', { name: 'Opciones de sesión' })[0])
    for (const name of [/^Cerrar$/, /^Eliminar$/]) {
      expect(screen.getByRole('menuitem', { name }).querySelector('svg')).not.toBeNull()
    }
  })
})

describe('AppSidebar destinations', () => {
  it('shows Tareas programadas only when the Engine offers them', async () => {
    renderSidebar()
    expect(screen.queryByRole('button', { name: 'Tareas programadas' })).toBeNull()
    cleanup()
    const props = renderSidebar({ onOpenSchedules: vi.fn() })
    await userEvent.click(screen.getByRole('button', { name: 'Tareas programadas' }))
    expect(props.onOpenSchedules).toHaveBeenCalled()
  })
})

// #83: la rama sale de la barra lateral; ni siquiera una rama larga le quita sitio al nombre.
it('las filas de proyecto no llevan la rama de git', () => {
  renderSidebar({ projects: [{ ...project('project', 'Rinari CLI'), git_head: { branch: 'fix/wizard-qa-status-reconcile', detached: false, sha_short: null, operation: null } }] })
  expect(screen.getByText('Rinari CLI')).toBeTruthy()
  expect(screen.queryByTestId('project-branch')).toBeNull()
  expect(screen.queryByText(/fix\/wizard/)).toBeNull()
})

describe('AppSidebar signals for every conversation (#33)', () => {
  it('a conversation outside Boards waiting for an approval shows «needs you» instead of the working circle', () => {
    renderSidebar({ busySessionIds: new Set(['chat']), signalBySession: { chat: 'needs_you' } })
    const row = screen.getByText('Research').closest('button')!
    expect(within(row).queryByLabelText('Sesión en curso')).toBeNull()
    expect(within(row).getByTestId('sidebar-signal').getAttribute('data-signal')).toBe('needs_you')
  })

  it('a collapsed project shows the most urgent signal of its conversations', () => {
    renderSidebar({ signalBySession: { 'project-session': 'failed' } })
    // The project is collapsed (the active conversation is a loose chat).
    expect(screen.queryByText('Fix governor')).toBeNull()
    expect(screen.getByTestId('sidebar-project-signal').getAttribute('data-signal')).toBe('failed')
  })
})

describe('child sessions under their mother (#40)', () => {
  const child = (id: string, title: string, parent: string, projectId: string | null = null): SessionSummary => ({
    ...session(id, title, projectId),
    parent_session_id: parent,
    lineage_kind: 'note',
  })

  it('a note and a fork hang from their mother with a done/total chip, and fold', async () => {
    renderSidebar({
      sessions: [session('mother', 'Parser'), child('ses_01_a', 'Pruebas', 'mother'), child('ses_02_b', 'Docs', 'mother'), session('other', 'Suelta')],
      busySessionIds: new Set(['ses_02_b']),
      activeId: 'other',
    })
    const nested = screen.getByTestId('session-children')
    expect(within(nested).getAllByRole('listitem').map((item) => item.textContent)).toEqual([expect.stringContaining('Pruebas'), expect.stringContaining('Docs')])
    // The working one shows its spinner; the other, the branch icon.
    expect(within(nested).getAllByTestId('session-child-icon')).toHaveLength(1)
    const chip = screen.getByTestId('session-children-chip')
    expect(chip.textContent).toBe('1/2')
    await userEvent.click(chip)
    expect(screen.queryByTestId('session-children')).toBeNull()
    await userEvent.click(chip)
    expect(screen.getByTestId('session-children')).toBeTruthy()
  })

  it('a child whose mother is not in the list stays on its own', () => {
    renderSidebar({ sessions: [child('ses_03_c', 'Huérfana', 'gone')], activeId: 'ses_03_c' })
    expect(screen.queryByTestId('session-children')).toBeNull()
    expect(screen.getByText('Huérfana')).toBeTruthy()
  })

  it('works inside a project too', () => {
    renderSidebar({
      sessions: [session('mother', 'Parser', 'project'), child('ses_04_d', 'Pruebas', 'mother', 'project')],
      activeId: 'mother',
    })
    expect(within(screen.getByTestId('session-children')).getByText('Pruebas')).toBeTruthy()
  })

  /** Un id de sesión real (ULID con prefijo) nacido en `ms`. */
  const ulidAt = (ms: number) => {
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
    let time = ''
    for (let value = ms, i = 0; i < 10; i += 1, value = Math.floor(value / 32)) time = alphabet[value % 32] + time
    return `ses_${time}${'0'.repeat(16)}`
  }

  it('reads when a session was born from its ULID', () => {
    expect(bornAt(ulidAt(1_760_000_000_000))).toBe(1_760_000_000_000)
    expect(bornAt('ses_01_a')).toBeNull()
  })

  it('a new child comes out of its mother; one that was there at mount does not move', () => {
    const fresh = ulidAt(Date.now())
    const props = renderSidebar({ sessions: [session('mother', 'Parser'), child('ses_01_a', 'Pruebas', 'mother')], activeId: 'mother' })
    cleanup()
    const view = render(<I18nProvider lang="es"><AppSidebar {...props} /></I18nProvider>)
    expect(screen.getByText('Pruebas').closest('li')?.hasAttribute('data-entering')).toBe(false)
    view.rerender(<I18nProvider lang="es"><AppSidebar {...props} sessions={[...props.sessions, child(fresh, 'Docs', 'mother')]} busySessionIds={new Set([fresh])} /></I18nProvider>)
    expect(screen.getByText('Docs').closest('li')?.hasAttribute('data-entering')).toBe(true)
    // Remounting with it already there replays nothing.
    cleanup()
    render(<I18nProvider lang="es"><AppSidebar {...props} sessions={[...props.sessions, child(fresh, 'Docs', 'mother')]} /></I18nProvider>)
    expect(screen.getByText('Docs').closest('li')?.hasAttribute('data-entering')).toBe(false)
  })

  it('a child seen finishing draws its check and its mother pulses once; a fresh one not started keeps the branch', () => {
    const fresh = ulidAt(Date.now())
    const props = renderSidebar({ sessions: [session('mother', 'Parser'), child(fresh, 'Docs', 'mother')], activeId: 'mother' })
    cleanup()
    const view = render(<I18nProvider lang="es"><AppSidebar {...props} /></I18nProvider>)
    expect(screen.queryByRole('img', { name: 'Terminada' })).toBeNull()
    view.rerender(<I18nProvider lang="es"><AppSidebar {...props} busySessionIds={new Set([fresh])} /></I18nProvider>)
    expect(screen.getByTestId('session-children-chip').hasAttribute('data-pulse')).toBe(false)
    view.rerender(<I18nProvider lang="es"><AppSidebar {...props} busySessionIds={new Set()} /></I18nProvider>)
    const check = screen.getByRole('img', { name: 'Terminada' })
    expect(check.getAttribute('data-drawn')).toBe('true')
    const chip = screen.getByTestId('session-children-chip')
    expect(chip.hasAttribute('data-pulse')).toBe(true)
    expect(chip.hasAttribute('data-complete')).toBe(true)
  })
})
