// @vitest-environment jsdom
import { installMockPlatform } from '../../test/mockPlatform'
const { invoke, openFiles } = installMockPlatform()
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import type { ProfileBundle } from '../../services/engine'
import { useProfileStore } from '../profiles/profileStore'
import { CreateProjectDialog } from './CreateProjectDialog'
import { useCreateProjectStore } from './createProjectStore'
import { useProjectExpansionStore } from '../../stores/projectExpansion'

const profiles: ProfileBundle[] = [
  { id: 'default', name: 'Default', description: '', soul_id: null, mode: null, agents: {}, builtin: true },
  { id: 'trabajo', name: 'Trabajo', description: '', soul_id: null, mode: null, agents: {}, builtin: false },
]

function check(path: string, ok = true, code?: string, project?: string) {
  return {
    input: path, canonical_path: path, ok, trust_state: 'not-trusted',
    git_head: { branch: ok ? 'main' : null, detached: false, sha_short: null, operation: null },
    error: ok ? null : { code, message: code, project_id: project ? 'p1' : null, project_name: project ?? null },
  }
}

beforeEach(() => {
  useProfileStore.setState({ profiles, activeId: 'default', loaded: true, revision: 0 })
  vi.mocked(invoke).mockReset()
  vi.mocked(invoke).mockImplementation(async (name: string, args: Record<string, unknown> = {}) => {
    if (name === 'project_folders_validate') {
      const paths = args.paths as string[]
      return { folders: paths.map((path) => (path.endsWith('taken') ? check(path, false, 'IN_PROJECT', 'Viejo') : check(path))) }
    }
    if (name === 'project_create') return { project: { id: 'p9', name: args.name, root: '/a/api' }, session: { id: 's9' }, trust: [] }
    if (name === 'bundle_list') return { profiles, active_id: 'default' }
    if (name === 'bundle_activate') return { active_id: 'trabajo', previous_id: 'default', profile: profiles[1] }
    return {}
  })
})
afterEach(() => { cleanup(); act(() => useCreateProjectStore.getState().close()) })

function mount(onCreated = vi.fn()) {
  render(<I18nProvider lang="es"><CreateProjectDialog onCreated={onCreated} /></I18nProvider>)
  return onCreated
}

it('folders are checked, the name comes from the first, and the summary reviews it all', async () => {
  vi.mocked(openFiles).mockResolvedValueOnce(['/a/api', '/b/web'])
  mount()
  act(() => useCreateProjectStore.getState().openWith())
  await screen.findByTestId('create-project')
  expect((screen.getByTestId('create-project-submit') as HTMLButtonElement).disabled).toBe(true)
  await userEvent.click(screen.getByTestId('create-project-add'))
  await waitFor(() => expect(screen.getAllByTestId('create-project-row')).toHaveLength(2))
  expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('api')
  expect(screen.getAllByTestId('create-project-row')[0].textContent).toContain('Principal')
  await userEvent.click(screen.getAllByRole('checkbox')[1])
  expect(screen.getByTestId('create-project-summary').textContent).toContain('2 carpetas (1 de confianza)')
  await waitFor(() => expect((screen.getByTestId('create-project-submit') as HTMLButtonElement).disabled).toBe(false))
})

it('explains each invalid folder and does not let create', async () => {
  mount()
  act(() => useCreateProjectStore.getState().openWith(['/a/api', '/x/taken']))
  const rows = await screen.findAllByTestId('create-project-row')
  await waitFor(() => expect(rows[1].textContent).toContain('Ya es parte del proyecto «Viejo»'))
  expect((screen.getByTestId('create-project-submit') as HTMLButtonElement).disabled).toBe(true)
})

it('creates with name, description, folders, trust and profile', async () => {
  const onCreated = mount()
  act(() => useCreateProjectStore.getState().openWith(['/a/api', '/b/web']))
  await screen.findAllByTestId('create-project-row')
  const name = screen.getByLabelText('Nombre')
  await userEvent.clear(name)
  await userEvent.type(name, 'Tienda')
  await userEvent.type(screen.getByLabelText(/Descripción/), 'La tienda')
  await userEvent.click(screen.getByRole('button', { name: /Confiar en todas/ }))
  await userEvent.selectOptions(screen.getByLabelText('Perfil'), 'trabajo')
  await waitFor(() => expect((screen.getByTestId('create-project-submit') as HTMLButtonElement).disabled).toBe(false))
  await userEvent.click(screen.getByTestId('create-project-submit'))
  await waitFor(() => expect(onCreated).toHaveBeenCalled())
  const create = vi.mocked(invoke).mock.calls.find(([name]) => name === 'project_create')!
  expect(create[1]).toMatchObject({
    name: 'Tienda',
    description: 'La tienda',
    folders: [{ path: '/a/api', trust: true }, { path: '/b/web', trust: true }],
    rinari_profile_id: 'trabajo',
  })
  expect(useCreateProjectStore.getState().open).toBe(false)
  expect(useProjectExpansionStore.getState().choices.p9).toBe(true)
  expect(useProjectExpansionStore.getState().query).toBe('')
})
