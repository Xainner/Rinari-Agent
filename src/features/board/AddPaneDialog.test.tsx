// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }))

import { invoke } from '@tauri-apps/api/core'
import { open as openFolderDialog } from '@tauri-apps/plugin-dialog'
import { useBoardStore, defaultBoard } from '../../stores/board'
import AddPaneDialog from './AddPaneDialog'
import { BoardHarness, engineFixture, projectFixture, sessionFixture } from './testUtils'

beforeEach(() => {
  window.localStorage.clear()
  useBoardStore.getState().hydrate(defaultBoard())
  vi.mocked(invoke).mockReset()
})
afterEach(cleanup)

const projects = [projectFixture('proj_a', 'Backend API'), projectFixture('proj_b', 'Desktop UI')]
const sessions = [sessionFixture('ses_a', 'Backend chat', 'proj_a'), sessionFixture('ses_free', 'Libre')]

it('creates a non-activating session for a registered project and reports it', async () => {
  const onAdded = vi.fn()
  const engine = engineFixture({ projects, sessions, createSession: vi.fn(async () => 'ses_new') })
  render(<BoardHarness engine={engine}><AddPaneDialog open onOpenChange={vi.fn()} onAdded={onAdded} /></BoardHarness>)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /Desktop UI/ }))
  expect(engine.createSession).toHaveBeenCalledWith('proj_b', { activate: false })
  expect(engine.openProject).not.toHaveBeenCalled()
  expect(onAdded).toHaveBeenCalledWith('ses_new')
})

it('warns before adding a second pane on a root already present and only creates after confirming', async () => {
  useBoardStore.getState().addPane('ses_a')
  const onAdded = vi.fn()
  const engine = engineFixture({ projects, sessions, createSession: vi.fn(async () => 'ses_second') })
  render(<BoardHarness engine={engine}><AddPaneDialog open onOpenChange={vi.fn()} onAdded={onAdded} /></BoardHarness>)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /Backend API/ }))
  expect(engine.createSession).not.toHaveBeenCalled()
  const dialog = await screen.findByRole('alertdialog')
  expect(dialog.textContent).toContain('Backend chat')
  await user.click(screen.getByRole('button', { name: 'Añadir de todos modos' }))
  expect(engine.createSession).toHaveBeenCalledWith('proj_a', { activate: false })
  expect(onAdded).toHaveBeenCalledWith('ses_second')
})

it('registers a picked folder with project.add and never calls project.open', async () => {
  vi.mocked(openFolderDialog).mockResolvedValue('/repo/new')
  vi.mocked(invoke).mockImplementation(async (command: string) => {
    if (command === 'project_add') return { project: projectFixture('proj_new', 'Nuevo', { root: '/repo/new', canonical_root: '/repo/new' }), created: true }
    return {}
  })
  const onAdded = vi.fn()
  const engine = engineFixture({ projects, sessions, createSession: vi.fn(async () => 'ses_folder') })
  render(<BoardHarness engine={engine}><AddPaneDialog open onOpenChange={vi.fn()} onAdded={onAdded} /></BoardHarness>)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /Abrir carpeta/ }))
  await screen.findByRole('button', { name: /Abrir carpeta/ })
  expect(invoke).toHaveBeenCalledWith('project_add', expect.objectContaining({ path: '/repo/new' }))
  expect(engine.refreshProjects).toHaveBeenCalled()
  expect(engine.createSession).toHaveBeenCalledWith('proj_new', { activate: false })
  expect(engine.openProject).not.toHaveBeenCalled()
  expect(onAdded).toHaveBeenCalledWith('ses_folder')
})

it('lists existing sessions not on the board and adds them without creating anything', async () => {
  useBoardStore.getState().addPane('ses_a')
  const onAdded = vi.fn()
  const engine = engineFixture({ projects, sessions })
  render(<BoardHarness engine={engine}><AddPaneDialog open onOpenChange={vi.fn()} onAdded={onAdded} /></BoardHarness>)
  const user = userEvent.setup()
  expect(screen.queryByRole('button', { name: /Backend chat/ })).toBeNull()
  await user.click(screen.getByRole('button', { name: /Libre/ }))
  expect(engine.createSession).not.toHaveBeenCalled()
  expect(onAdded).toHaveBeenCalledWith('ses_free')
})
