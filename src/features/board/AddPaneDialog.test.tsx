// @vitest-environment jsdom
import { installMockPlatform } from '../../test/mockPlatform'
const { invoke, openFiles: openFolderDialog } = installMockPlatform()
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'


import { useBoardStore, defaultBoard } from '../../stores/board'
import { useProjectExpansionStore } from '../../stores/projectExpansion'
import { useCreateProjectStore } from '../projects/createProjectStore'
import AddPaneDialog from './AddPaneDialog'
import { BoardHarness, engineFixture, projectFixture, sessionFixture } from './testUtils'

beforeEach(() => {
  window.localStorage.clear()
  useProjectExpansionStore.setState({ choices: {}, query: '' })
  useBoardStore.getState().hydrate(defaultBoard())
  useCreateProjectStore.getState().close()
  vi.mocked(invoke).mockReset()
})
afterEach(cleanup)

const projects = [projectFixture('proj_a', 'Backend API'), projectFixture('proj_b', 'Desktop UI')]
const sessions = [sessionFixture('ses_a', 'Backend chat', 'proj_a'), sessionFixture('ses_free', 'Libre')]

it('a registered project opens a draft pane; no session is created until its first message', async () => {
  const onAdded = vi.fn()
  const onAddDraft = vi.fn()
  const engine = engineFixture({ projects, sessions, createSession: vi.fn(async () => 'ses_new') })
  render(<BoardHarness engine={engine}><AddPaneDialog open onOpenChange={vi.fn()} onAdded={onAdded} onAddDraft={onAddDraft} /></BoardHarness>)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /Desktop UI/ }))
  expect(onAddDraft).toHaveBeenCalledWith('proj_b')
  expect(engine.createSession).not.toHaveBeenCalled()
  expect(engine.openProject).not.toHaveBeenCalled()
  expect(onAdded).not.toHaveBeenCalled()
})

it('warns before adding a second pane on a root already present and only creates after confirming', async () => {
  useBoardStore.getState().addPane('ses_a')
  const onAddDraft = vi.fn()
  const engine = engineFixture({ projects, sessions, createSession: vi.fn(async () => 'ses_second') })
  render(<BoardHarness engine={engine}><AddPaneDialog open onOpenChange={vi.fn()} onAdded={vi.fn()} onAddDraft={onAddDraft} /></BoardHarness>)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /Backend API/ }))
  expect(onAddDraft).not.toHaveBeenCalled()
  const dialog = await screen.findByRole('alertdialog')
  expect(dialog.textContent).toContain('Backend chat')
  await user.click(screen.getByRole('button', { name: 'Añadir de todos modos' }))
  expect(onAddDraft).toHaveBeenCalledWith('proj_a')
  expect(engine.createSession).not.toHaveBeenCalled()
})

it('a new folder opens the «Nuevo proyecto» window; creating there adds a draft pane', async () => {
  vi.mocked(openFolderDialog).mockResolvedValue(['/repo/new'])
  const onOpenChange = vi.fn()
  const onAddDraft = vi.fn()
  const engine = engineFixture({ projects, sessions, createSession: vi.fn(async () => 'ses_folder') })
  render(<BoardHarness engine={engine}><AddPaneDialog open onOpenChange={onOpenChange} onAdded={vi.fn()} onAddDraft={onAddDraft} /></BoardHarness>)
  await userEvent.click(screen.getByRole('button', { name: /Abrir carpeta/ }))
  await vi.waitFor(() => expect(useCreateProjectStore.getState().open).toBe(true))
  const state = useCreateProjectStore.getState()
  expect(state.paths).toEqual(['/repo/new'])
  // The pane is a draft: the window must not create a first conversation.
  expect(state.options.openSession).toBe(false)
  expect(onOpenChange).toHaveBeenCalledWith(false)
  // Nothing is registered until the window creates the project.
  expect(invoke).not.toHaveBeenCalledWith('project_add', expect.anything())
  expect(onAddDraft).not.toHaveBeenCalled()

  state.options.onCreated?.(projectFixture('proj_new', 'Nuevo', { root: '/repo/new', canonical_root: '/repo/new' }), null)
  expect(engine.refreshProjects).toHaveBeenCalled()
  expect(onAddDraft).toHaveBeenCalledWith('proj_new')
  expect(engine.createSession).not.toHaveBeenCalled()
  expect(engine.openProject).not.toHaveBeenCalled()
})

it('a folder of a visible project (root or extra folder) adds that project without the window', async () => {
  const withExtra = [projectFixture('proj_c', 'Tienda', {
    folders: [
      { path: '/repo/proj_c', primary: true, position: 0, exists: true },
      { path: 'C:\\Code\\Web', primary: false, position: 1, exists: true },
    ],
  })]
  vi.mocked(openFolderDialog).mockResolvedValue(['c:\\code\\web\\'])
  const onAddDraft = vi.fn()
  const engine = engineFixture({ projects: withExtra, sessions })
  render(<BoardHarness engine={engine}><AddPaneDialog open onOpenChange={vi.fn()} onAdded={vi.fn()} onAddDraft={onAddDraft} /></BoardHarness>)
  await userEvent.click(screen.getByRole('button', { name: /Abrir carpeta/ }))
  await vi.waitFor(() => expect(onAddDraft).toHaveBeenCalledWith('proj_c'))
  expect(useCreateProjectStore.getState().open).toBe(false)
})

it('does not reveal an existing folder when duplicate creation is cancelled', async () => {
  useBoardStore.getState().addPane('ses_a')
  useProjectExpansionStore.setState({ choices: { proj_a: false }, query: 'hidden' })
  vi.mocked(openFolderDialog).mockResolvedValue(['/repo/proj_a'])
  const engine = engineFixture({ projects, sessions })
  render(<BoardHarness engine={engine}><AddPaneDialog open onOpenChange={vi.fn()} onAdded={vi.fn()} onAddDraft={vi.fn()} /></BoardHarness>)
  await userEvent.click(screen.getByRole('button', { name: /Abrir carpeta/ }))
  await screen.findByRole('alertdialog')
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(engine.createSession).not.toHaveBeenCalled()
  expect(useProjectExpansionStore.getState().choices.proj_a).toBe(false)
  expect(useProjectExpansionStore.getState().query).toBe('hidden')
})

it('lists existing sessions not on the board and adds them without creating anything', async () => {
  useBoardStore.getState().addPane('ses_a')
  const onAdded = vi.fn()
  const engine = engineFixture({ projects, sessions })
  render(<BoardHarness engine={engine}><AddPaneDialog open onOpenChange={vi.fn()} onAdded={onAdded} onAddDraft={vi.fn()} /></BoardHarness>)
  const user = userEvent.setup()
  expect(screen.queryByRole('button', { name: /Backend chat/ })).toBeNull()
  await user.click(screen.getByRole('button', { name: /Libre/ }))
  expect(engine.createSession).not.toHaveBeenCalled()
  expect(onAdded).toHaveBeenCalledWith('ses_free')
})
