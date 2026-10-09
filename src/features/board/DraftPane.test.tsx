// @vitest-environment jsdom
// «Añadir panel» con un chat o un proyecto deja un panel borrador: composer
// listo, ninguna sesión. El primer mensaje crea la sesión y el panel pasa a ella.
import { installMockPlatform } from '../../test/mockPlatform'
installMockPlatform()
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('../../services/desktop', () => ({
  desktopApi: { questions: vi.fn(async () => ({ questions: [] })), readFile: vi.fn(), answer: vi.fn() },
}))

import { defaultBoard, normalizeBoard, paneDraftKey, useBoardStore } from '../../stores/board'
import { useComposerStore } from '../../stores/composer'
import { resetSessionDockForTests } from '../../stores/sessionDock'
import { resetPendingQuestionsForTests } from '../questions/usePendingQuestions'
import BoardView from './BoardView'
import { BoardHarness, engineFixture, projectFixture, sessionFixture } from './testUtils'

beforeEach(() => {
  window.localStorage.clear()
  resetSessionDockForTests()
  resetPendingQuestionsForTests()
  useBoardStore.getState().hydrate(defaultBoard())
  useComposerStore.setState({ sessionKey: 'draft', text: '', attachments: [], draftsBySession: {} })
})
afterEach(cleanup)

it('a draft pane prepares no session; its first message creates one for its project and the pane becomes it', async () => {
  const engine = engineFixture({
    projects: [projectFixture('proj_a', 'Backend API')],
    sessions: [],
    materializeDraft: vi.fn(async () => 'ses_new'),
  })
  const pane = useBoardStore.getState().addDraftPane('proj_a')
  render(<BoardHarness engine={engine}><BoardView /></BoardHarness>)
  const region = screen.getByRole('region', { name: 'Nueva conversación' })
  expect(within(region).getByText('Backend API')).toBeTruthy()
  expect(engine.ensureSessionReady).not.toHaveBeenCalled()
  const box = within(region).getByRole('textbox', { name: 'Mensaje' })
  fireEvent.change(box, { target: { value: 'Arregla el login' } })
  fireEvent.keyDown(box, { key: 'Enter' })
  await waitFor(() => expect(engine.materializeDraft).toHaveBeenCalledTimes(1))
  expect(vi.mocked(engine.materializeDraft).mock.calls[0][0]).toMatchObject({ key: paneDraftKey(pane.paneId), projectId: 'proj_a', mode: 'build' })
  await waitFor(() => expect(engine.sendTo).toHaveBeenCalledWith('ses_new', 'Arregla el login', []))
  await waitFor(() => expect(useBoardStore.getState().panes[0]).toMatchObject({ paneId: pane.paneId, sessionId: 'ses_new' }))
  expect(useBoardStore.getState().panes[0].draft).toBeUndefined()
})

it('a failed first send keeps the draft pane and remembers the created session for the retry', async () => {
  const engine = engineFixture({ sessions: [], materializeDraft: vi.fn(async () => 'ses_new'), sendTo: vi.fn(async () => false) })
  const pane = useBoardStore.getState().addDraftPane(null)
  render(<BoardHarness engine={engine}><BoardView /></BoardHarness>)
  const box = within(screen.getByRole('region', { name: 'Nueva conversación' })).getByRole('textbox', { name: 'Mensaje' })
  fireEvent.change(box, { target: { value: 'Hola' } })
  fireEvent.keyDown(box, { key: 'Enter' })
  await waitFor(() => expect(useBoardStore.getState().panes[0].draft?.sessionId).toBe('ses_new'))
  expect(useBoardStore.getState().panes[0]).toMatchObject({ paneId: pane.paneId, sessionId: '' })
})

it('asking again for an empty draft of the same destination focuses it instead of adding another', () => {
  const first = useBoardStore.getState().addDraftPane('proj_a')
  const again = useBoardStore.getState().addDraftPane('proj_a')
  expect(again.paneId).toBe(first.paneId)
  useComposerStore.getState().setTextFor(paneDraftKey(first.paneId), 'algo escrito')
  const third = useBoardStore.getState().addDraftPane('proj_a')
  expect(third.paneId).not.toBe(first.paneId)
  expect(useBoardStore.getState().panes).toHaveLength(2)
})

it('draft panes survive a reload of the layout and never collide with session dedupe', () => {
  const board = normalizeBoard({
    version: 4,
    panes: [
      { paneId: 'p1', sessionId: '', draft: { projectId: 'proj_a', mode: 'plan', permissionProfile: 'read-only' } },
      { paneId: 'p2', sessionId: '', draft: { projectId: null } },
      { paneId: 'p3', sessionId: 'ses_a' },
      { paneId: 'p4', sessionId: '' },
    ],
  })
  expect(board.panes.map((pane) => pane.paneId)).toEqual(['p1', 'p2', 'p3'])
  expect(board.panes[0].draft).toEqual({ projectId: 'proj_a', mode: 'plan', permissionProfile: 'read-only' })
  expect(board.panes[1].draft).toEqual({ projectId: null, mode: 'build', permissionProfile: 'workspace' })
})

it('a board with an existing session keeps working beside a draft', async () => {
  const engine = engineFixture({ sessions: [sessionFixture('ses_a', 'Docs')] })
  useBoardStore.getState().addPane('ses_a')
  useBoardStore.getState().addDraftPane(null)
  render(<BoardHarness engine={engine}><BoardView /></BoardHarness>)
  expect(screen.getByRole('region', { name: 'Docs' })).toBeTruthy()
  expect(screen.getByRole('region', { name: 'Nueva conversación' })).toBeTruthy()
  await waitFor(() => expect(engine.ensureSessionReady).toHaveBeenCalledTimes(1))
  expect(engine.ensureSessionReady).toHaveBeenCalledWith('ses_a')
})
