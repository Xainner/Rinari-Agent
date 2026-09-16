// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const invoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }))
vi.mock('../../services/desktop', () => ({
  desktopApi: { questions: vi.fn(async () => ({ questions: [] })), readFile: vi.fn(), answer: vi.fn() },
}))
vi.mock('../workspace/WorkspaceView', () => ({
  default: ({ session }: { session: { id: string } | null }) => <div data-testid={`workspace-${session?.id ?? 'none'}`} />,
}))

import { useBoardStore, defaultBoard } from '../../stores/board'
import { useComposerStore } from '../../stores/composer'
import { resetPendingQuestionsForTests } from '../questions/usePendingQuestions'
import BoardView from './BoardView'
import { BoardHarness, engineFixture, sessionFixture } from './testUtils'

const sessions = [sessionFixture('ses_a', 'Backend API', 'proj_a'), sessionFixture('ses_b', 'Docs')]

function peerEngine(capabilities: Record<string, boolean>) {
  const engine = engineFixture({ sessions, activeSession: 'ses_a' })
  return { ...engine, status: { ...engine.status!, capabilities } }
}

function setCalls() {
  return invoke.mock.calls.filter(([command]) => command === 'peer_group_set')
}

beforeEach(() => {
  window.localStorage.clear()
  resetPendingQuestionsForTests()
  useBoardStore.getState().hydrate({ ...defaultBoard(), boardId: 'board_test' })
  useComposerStore.setState({ sessionKey: 'draft', text: '', attachments: [], draftsBySession: {} })
  invoke.mockReset()
  invoke.mockImplementation(async (command: string, args: Record<string, unknown>) => {
    if (command === 'peer_group_get') return { group: null }
    if (command === 'peer_group_set') {
      return { group_id: 'group_1', board_id: 'board_test', revision: (args.expected_revision as number) + 1, authorization_epoch: 1, enabled: args.enabled, members: args.members }
    }
    if (command === 'queue_list') return { session_id: args.session_id, queue: [], pending: 0, entries: [] }
    if (command === 'peer_message_forward') return { message_id: 'msg_1', to_session_id: args.target_session_id, state: 'queued', hop: 0, origin: { kind: 'user' } }
    return {}
  })
})
afterEach(cleanup)

it('hides messaging controls and never registers a group when the engine lacks the capability', async () => {
  useBoardStore.getState().addPane('ses_a')
  useBoardStore.getState().addPane('ses_b')
  render(<BoardHarness engine={peerEngine({})}><BoardView /></BoardHarness>)
  const paneA = await screen.findByRole('region', { name: 'Backend API' })
  expect(within(paneA).queryByTestId('pane-peer-state')).toBeNull()
  await userEvent.click(within(paneA).getByRole('button', { name: 'Opciones del panel' }))
  expect(screen.queryByRole('menuitem', { name: /Enviar al panel/ })).toBeNull()
  await new Promise((resolve) => setTimeout(resolve, 30))
  expect(setCalls()).toHaveLength(0)
})

it('registers every pane as a peer and re-registers when a toggle changes', async () => {
  useBoardStore.getState().addPane('ses_a')
  useBoardStore.getState().addPane('ses_b')
  render(<BoardHarness engine={peerEngine({ session_peer_messaging_v1: true })}><BoardView /></BoardHarness>)
  await waitFor(() => expect(setCalls()).toHaveLength(1))
  const first = setCalls()[0][1] as { board_id: string; expected_revision: number; enabled: boolean; members: Array<Record<string, unknown>> }
  expect(first.board_id).toBe('board_test')
  expect(first.expected_revision).toBe(0)
  expect(first.enabled).toBe(true)
  expect(first.members.map((m) => m.session_id)).toEqual(['ses_a', 'ses_b'])
  expect(first.members[0]).toMatchObject({ label: 'Backend API', send: true, receive: true })

  const paneB = screen.getByRole('region', { name: 'Docs' })
  expect(within(paneB).getByTestId('pane-peer-state').dataset.state).toBe('on')
  const user = userEvent.setup()
  await user.click(within(paneB).getByRole('button', { name: 'Opciones del panel' }))
  await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Recibir mensajes de otros paneles' }))
  await waitFor(() => expect(setCalls()).toHaveLength(2))
  const second = setCalls()[1][1] as { expected_revision: number; group_id: string; members: Array<Record<string, unknown>> }
  expect(second).toMatchObject({ group_id: 'group_1', expected_revision: 1 })
  expect(second.members.find((m) => m.session_id === 'ses_b')).toMatchObject({ receive: false, send: true })
  await waitFor(() => expect(within(paneB).getByTestId('pane-peer-state').dataset.state).toBe('sendOnly'))
})

it('forwards a message to another pane as the user (no consent, quoted source)', async () => {
  useBoardStore.getState().addPane('ses_a')
  useBoardStore.getState().addPane('ses_b')
  render(<BoardHarness engine={peerEngine({ session_peer_messaging_v1: true })}><BoardView /></BoardHarness>)
  const paneA = await screen.findByRole('region', { name: 'Backend API' })
  const user = userEvent.setup()
  await user.click(within(paneA).getByRole('button', { name: 'Opciones del panel' }))
  await user.click(await screen.findByRole('menuitem', { name: /Enviar al panel/ }))
  const dialog = await screen.findByRole('dialog', { name: 'Enviar mensaje a otro panel' })
  const select = within(dialog).getByRole('combobox', { name: 'Panel destino' })
  expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual(['Docs'])
  await user.type(within(dialog).getByRole('textbox', { name: /Mensaje/ }), 'revisa el README')
  await user.click(within(dialog).getByRole('button', { name: 'Enviar' }))
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('peer_message_forward', expect.objectContaining({
    target_session_id: 'ses_b',
    message: 'revisa el README',
    source_session_id: 'ses_a',
    quoted_source: { session_id: 'ses_a' },
  })))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Enviar mensaje a otro panel' })).toBeNull())
})

it('sends "@Docs message" from pane A composer straight to pane B as a user forward', async () => {
  useBoardStore.getState().addPane('ses_a')
  useBoardStore.getState().addPane('ses_b')
  render(<BoardHarness engine={peerEngine({ session_peer_messaging_v1: true })}><BoardView /></BoardHarness>)
  const paneA = await screen.findByRole('region', { name: 'Backend API' })
  const user = userEvent.setup()
  const textarea = within(paneA).getByRole('textbox', { name: 'Mensaje' })
  await user.type(textarea, '@Do')
  const list = await within(paneA).findByRole('listbox', { name: 'Paneles' })
  await user.click(within(list).getByRole('option', { name: 'Docs' }))
  await user.type(textarea, 'revisá el README')
  await user.click(within(paneA).getByRole('button', { name: 'Enviar mensaje' }))
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('peer_message_forward', expect.objectContaining({
    target_session_id: 'ses_b',
    message: 'revisá el README',
    source_session_id: 'ses_a',
    quoted_source: { session_id: 'ses_a' },
  })))
  // Never a normal turn on pane A.
  expect(invoke).not.toHaveBeenCalledWith('turn_start', expect.anything())
})

it('does not offer pane mentions when the engine lacks the capability', async () => {
  useBoardStore.getState().addPane('ses_a')
  useBoardStore.getState().addPane('ses_b')
  render(<BoardHarness engine={peerEngine({})}><BoardView /></BoardHarness>)
  const paneA = await screen.findByRole('region', { name: 'Backend API' })
  const user = userEvent.setup()
  await user.type(within(paneA).getByRole('textbox', { name: 'Mensaje' }), '@Do')
  await new Promise((resolve) => setTimeout(resolve, 200))
  expect(within(paneA).queryByRole('listbox', { name: 'Paneles' })).toBeNull()
})
