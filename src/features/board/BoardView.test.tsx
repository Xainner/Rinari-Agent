// @vitest-environment jsdom
import { installMockPlatform } from '../../test/mockPlatform'
installMockPlatform()
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('../../services/desktop', () => ({
  desktopApi: { questions: vi.fn(async () => ({ questions: [] })), readFile: vi.fn(), answer: vi.fn() },
}))
vi.mock('../workspace/WorkspaceView', () => ({
  default: ({ session, embedded }: { session: { id: string } | null; embedded?: boolean }) => (
    <div data-testid={`workspace-${session?.id ?? 'none'}`} data-embedded={embedded ? 'yes' : 'no'} />
  ),
}))

import { useBoardStore, defaultBoard } from '../../stores/board'
import { useComposerStore } from '../../stores/composer'
import { resetSessionDockForTests } from '../../stores/sessionDock'
import { resetPendingQuestionsForTests } from '../questions/usePendingQuestions'
import BoardView from './BoardView'
import { BoardHarness, engineFixture, sessionFixture } from './testUtils'

beforeEach(() => {
  window.localStorage.clear()
  resetSessionDockForTests()
  resetPendingQuestionsForTests()
  useBoardStore.getState().hydrate(defaultBoard())
  useComposerStore.setState({ sessionKey: 'draft', text: '', attachments: [], draftsBySession: {} })
})
afterEach(cleanup)

const sessions = [sessionFixture('ses_a', 'Backend API', 'proj_a'), sessionFixture('ses_b', 'Docs')]

it('renders one pane per session with its own composer, workspace and focus', async () => {
  const engine = engineFixture({ sessions, activeSession: 'ses_a' })
  useBoardStore.getState().addPane('ses_a')
  useBoardStore.getState().addPane('ses_b')
  render(<BoardHarness engine={engine}><BoardView /></BoardHarness>)
  const paneA = screen.getByRole('region', { name: 'Backend API' })
  const paneB = screen.getByRole('region', { name: 'Docs' })
  expect(within(paneA).getByRole('textbox', { name: 'Mensaje' })).toBeTruthy()
  expect(within(paneB).getByRole('textbox', { name: 'Mensaje' })).toBeTruthy()
  expect(screen.queryByTestId('session-dock')).toBeNull()
  expect(paneA.querySelector('.session-workspace')?.getAttribute('data-dock')).toBe('hidden')
  expect(paneB.querySelector('.session-workspace')?.getAttribute('data-dock')).toBe('hidden')
  const user = userEvent.setup()
  await user.click(within(paneA).getByRole('button', { name: 'Mostrar u ocultar panel lateral' }))
  expect(within(paneA).getByTestId('workspace-ses_a').getAttribute('data-embedded')).toBe('yes')
  expect(within(paneB).queryByTestId('session-dock')).toBeNull()
  await user.click(within(paneB).getByRole('button', { name: 'Mostrar u ocultar panel lateral' }))
  expect(within(paneB).getByTestId('workspace-ses_b')).toBeTruthy()
  await user.click(within(paneA).getByRole('button', { name: 'Cerrar panel lateral' }))
  expect(within(paneA).queryByTestId('session-dock')).toBeNull()
  expect(within(paneB).getByTestId('session-dock')).toBeTruthy()
  expect(engine.closeSession).not.toHaveBeenCalled()
  expect(useBoardStore.getState().panes).toHaveLength(2)
  // Interacting with a pane focuses it; preparing sessions never changes Normal.
  expect(paneA.getAttribute('data-focused')).toBe('true')
  await waitFor(() => expect(engine.ensureSessionReady).toHaveBeenCalledTimes(2))
  expect(engine.selectSession).not.toHaveBeenCalled()
  expect(engine.setActiveSession).not.toHaveBeenCalled()
})

it('sends from a pane to its own session and removes a pane without closing the session', async () => {
  const engine = engineFixture({ sessions })
  useBoardStore.getState().addPane('ses_a')
  useBoardStore.getState().addPane('ses_b')
  render(<BoardHarness engine={engine}><BoardView /></BoardHarness>)
  const user = userEvent.setup()
  const paneA = screen.getByRole('region', { name: 'Backend API' })
  await user.type(within(paneA).getByRole('textbox', { name: 'Mensaje' }), 'hola')
  await user.click(within(paneA).getByRole('button', { name: 'Enviar mensaje' }))
  expect(engine.sendTo).toHaveBeenCalledWith('ses_a', 'hola', [])
  expect(engine.send).not.toHaveBeenCalled()

  await user.click(within(paneA).getByRole('button', { name: 'Opciones del panel' }))
  await user.click(await screen.findByRole('menuitem', { name: 'Quitar del board' }))
  expect(screen.queryByRole('region', { name: 'Backend API' })).toBeNull()
  expect(engine.closeSession).not.toHaveBeenCalled()
  expect(useBoardStore.getState().panes.map((pane) => pane.sessionId)).toEqual(['ses_b'])
})

it('drops panes whose sessions are confirmed closed and keeps the rest', async () => {
  const closed = sessionFixture('ses_gone', 'Vieja', null, { state: 'closed' })
  const engine = engineFixture({ sessions: [...sessions, closed] })
  useBoardStore.getState().addPane('ses_a')
  useBoardStore.getState().addPane('ses_gone')
  render(<BoardHarness engine={engine}><BoardView /></BoardHarness>)
  await waitFor(() => expect(useBoardStore.getState().panes.map((pane) => pane.sessionId)).toEqual(['ses_a']))
  expect(screen.getByRole('region', { name: 'Backend API' })).toBeTruthy()
})

it('shows the empty state with a CTA to add the current conversation', async () => {
  const engine = engineFixture({ sessions, activeSession: 'ses_b' })
  render(<BoardHarness engine={engine}><BoardView /></BoardHarness>)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Añadir conversación actual' }))
  await act(async () => {})
  expect(useBoardStore.getState().panes.map((pane) => pane.sessionId)).toEqual(['ses_b'])
  expect(screen.getByRole('region', { name: 'Docs' })).toBeTruthy()
})
