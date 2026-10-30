// @vitest-environment jsdom
import { installMockPlatform } from '../../test/mockPlatform'
const { invoke, openFiles } = installMockPlatform()
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { useProfileStore } from '../../features/profiles/profileStore'
import { useCreateProjectStore } from '../../features/projects/createProjectStore'

const projects = [
  { id: 'p_old', name: 'Viejo', root: '/w/viejo', archived: false, last_opened_at: '2026-10-01T00:00:00Z', rinari_profile_id: 'default', git_head: null },
  { id: 'p_new', name: 'Tienda', root: '/w/tienda', archived: false, last_opened_at: '2026-10-15T00:00:00Z', rinari_profile_id: 'default', git_head: { branch: 'main', detached: false, sha_short: null, operation: null } },
  { id: 'p_arch', name: 'Archivado', root: '/w/arch', archived: true, last_opened_at: '2026-10-16T00:00:00Z', rinari_profile_id: 'default', git_head: null },
  { id: 'p_other', name: 'De otro perfil', root: '/w/otro', archived: false, last_opened_at: '2026-10-16T00:00:00Z', rinari_profile_id: 'trabajo', git_head: null },
]
const refreshProjects = vi.fn()
vi.mock('../../features/engine/EngineContext', () => ({
  useOptionalEngineData: () => ({ projects }),
  useOptionalEngineCommands: () => ({ refreshProjects }),
}))

import { ProjectChip } from './ProjectChip'

beforeEach(() => {
  useProfileStore.setState({ activeId: 'default' })
  vi.mocked(invoke).mockReset()
})
afterEach(() => { cleanup(); useCreateProjectStore.getState().close() })

function mount(projectId: string | null, onChange = vi.fn()) {
  render(<I18nProvider lang="es"><ProjectChip projectId={projectId} onChange={onChange} /></I18nProvider>)
  return onChange
}

it('shows «Sin proyecto», then the active profile projects by recent use, and picks one (#42)', async () => {
  const onChange = mount(null)
  expect(screen.getByTestId('composer-project-chip').textContent).toContain('Sin proyecto')
  await userEvent.click(screen.getByTestId('composer-project-chip'))
  const options = await screen.findAllByTestId('composer-project-option')
  expect(options.map((option) => option.textContent)).toEqual([
    expect.stringContaining('Sin proyecto'),
    expect.stringContaining('Tienda'),
    expect.stringContaining('Viejo'),
  ])
  await userEvent.click(options[1])
  expect(onChange).toHaveBeenCalledWith('p_new')
})

it('shows the chosen project with its branch, and the search filters', async () => {
  mount('p_new')
  expect(screen.getByTestId('composer-project-chip').textContent).toContain('Tienda')
  expect(screen.getByTestId('composer-project-chip').textContent).toContain('main')
  await userEvent.click(screen.getByTestId('composer-project-chip'))
  await userEvent.type(screen.getByLabelText('Buscar proyecto…'), 'vie')
  const options = screen.getAllByTestId('composer-project-option')
  expect(options).toHaveLength(1)
  expect(options[0].textContent).toContain('Viejo')
})

it('«Abrir carpeta…» with a folder of an existing project picks that project', async () => {
  vi.mocked(openFiles).mockResolvedValueOnce(['/w/viejo/src'])
  vi.mocked(invoke).mockImplementation(async (name: string) => {
    if (name === 'project_folders_validate') return { folders: [{ ok: false, error: { code: 'IN_PROJECT', project_id: 'p_old', project_name: 'Viejo', message: '' } }] }
    return {}
  })
  const onChange = mount(null)
  await userEvent.click(screen.getByTestId('composer-project-chip'))
  await userEvent.click(await screen.findByTestId('composer-project-open-folder'))
  await waitFor(() => expect(onChange).toHaveBeenCalledWith('p_old'))
  expect(useCreateProjectStore.getState().open).toBe(false)
})

it('«Abrir carpeta…» with a new folder opens «Nuevo proyecto» without a first conversation', async () => {
  vi.mocked(openFiles).mockResolvedValueOnce(['/w/nueva'])
  vi.mocked(invoke).mockImplementation(async (name: string) => {
    if (name === 'project_folders_validate') return { folders: [{ ok: true, error: null }] }
    return {}
  })
  const onChange = mount(null)
  await userEvent.click(screen.getByTestId('composer-project-chip'))
  await userEvent.click(await screen.findByTestId('composer-project-open-folder'))
  await waitFor(() => expect(useCreateProjectStore.getState().open).toBe(true))
  expect(useCreateProjectStore.getState().paths).toEqual(['/w/nueva'])
  expect(useCreateProjectStore.getState().options.openSession).toBe(false)
  useCreateProjectStore.getState().options.onCreated?.({ id: 'p_created' } as never, null)
  expect(onChange).toHaveBeenCalledWith('p_created')
})
