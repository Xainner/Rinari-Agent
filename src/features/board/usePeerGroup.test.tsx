// @vitest-environment jsdom
import { installMockPlatform } from '../../test/mockPlatform'
const { invoke } = installMockPlatform()
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'


import { I18nProvider } from '../../i18n'
import { useBoardStore, defaultBoard } from '../../stores/board'
import { peerMembersFor, usePeerGroup } from './usePeerGroup'
import { sessionFixture } from './testUtils'

const wrapper = ({ children }: { children: React.ReactNode }) => <I18nProvider lang="es">{children}</I18nProvider>

function group(overrides: Record<string, unknown> = {}) {
  return { group_id: 'group_1', board_id: 'board_1', revision: 1, authorization_epoch: 1, enabled: true, members: [], ...overrides }
}

beforeEach(() => {
  window.localStorage.clear()
  useBoardStore.getState().hydrate({ ...defaultBoard(), boardId: 'board_1' })
  invoke.mockReset()
})
afterEach(cleanup)

const sessions = {
  ses_a: sessionFixture('ses_a', 'Backend API', 'proj_a'),
  ses_b: sessionFixture('ses_b', 'Docs'),
}

it('derives members from panes: label, send/receive flags, unknown sessions skipped', () => {
  useBoardStore.getState().addPane('ses_a')
  useBoardStore.getState().addPane('ses_b')
  useBoardStore.getState().addPane('ses_ghost')
  const panes = useBoardStore.getState().panes
  useBoardStore.getState().setPeerFlags(panes[1].paneId, { peerSend: false })
  const members = peerMembersFor(useBoardStore.getState().panes, sessions, 'Nuevo chat')
  expect(members).toEqual([
    { session_id: 'ses_a', label: 'Backend API', send: true, receive: true },
    { session_id: 'ses_b', label: 'Docs', send: false, receive: true },
  ])
})

it('registers the group once with revision 0 and re-registers with the known revision on change', async () => {
  invoke.mockImplementation(async (command: string, args: Record<string, unknown>) => {
    if (command === 'peer_group_get') return { group: null }
    if (command === 'peer_group_set') return group({ revision: (args.expected_revision as number) + 1, members: args.members })
    throw new Error(`unexpected ${command}`)
  })
  useBoardStore.getState().addPane('ses_a')
  useBoardStore.getState().addPane('ses_b')
  const { rerender } = renderHook(
    ({ panes, enabled }) => usePeerGroup({
      boardId: 'board_1',
      panes,
      sessionsById: sessions,
      messagingEnabled: enabled,
      supported: true,
      engineReady: true,
      engineGeneration: 1,
    }),
    { wrapper, initialProps: { panes: useBoardStore.getState().panes, enabled: true } },
  )
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('peer_group_set', expect.objectContaining({ expected_revision: 0 })))
  const first = invoke.mock.calls.find(([command]) => command === 'peer_group_set')![1] as Record<string, unknown>
  expect(first.board_id).toBe('board_1')
  expect(first.enabled).toBe(true)
  expect(first.members).toEqual([
    { session_id: 'ses_a', label: 'Backend API', send: true, receive: true },
    { session_id: 'ses_b', label: 'Docs', send: true, receive: true },
  ])
  // Same composition again: no extra call.
  rerender({ panes: [...useBoardStore.getState().panes], enabled: true })
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(invoke.mock.calls.filter(([command]) => command === 'peer_group_set')).toHaveLength(1)

  // Disabling the board toggle replaces the group with enabled=false at the known revision.
  rerender({ panes: useBoardStore.getState().panes, enabled: false })
  await waitFor(() => expect(invoke.mock.calls.filter(([command]) => command === 'peer_group_set')).toHaveLength(2))
  const second = invoke.mock.calls.filter(([command]) => command === 'peer_group_set')[1][1] as Record<string, unknown>
  expect(second).toMatchObject({ group_id: 'group_1', expected_revision: 1, enabled: false })
})

it('re-reads the group and retries once on CONFLICT', async () => {
  let sets = 0
  invoke.mockImplementation(async (command: string, args: Record<string, unknown>) => {
    if (command === 'peer_group_get') return { group: group({ revision: 4, members: [] }) }
    if (command === 'peer_group_set') {
      sets += 1
      if (sets === 1) throw { code: 'CONFLICT', message: 'Peer group revision is 5, expected 4' }
      return group({ revision: (args.expected_revision as number) + 1, members: args.members })
    }
    throw new Error(`unexpected ${command}`)
  })
  useBoardStore.getState().addPane('ses_a')
  renderHook(() => usePeerGroup({
    boardId: 'board_1',
    panes: useBoardStore.getState().panes,
    sessionsById: sessions,
    messagingEnabled: true,
    supported: true,
    engineReady: true,
    engineGeneration: 1,
  }), { wrapper })
  await waitFor(() => expect(sets).toBe(2))
  expect(invoke.mock.calls.filter(([command]) => command === 'peer_group_get')).toHaveLength(2)
})

it('does nothing when the engine lacks the capability', async () => {
  useBoardStore.getState().addPane('ses_a')
  renderHook(() => usePeerGroup({
    boardId: 'board_1',
    panes: useBoardStore.getState().panes,
    sessionsById: sessions,
    messagingEnabled: true,
    supported: false,
    engineReady: true,
    engineGeneration: 1,
  }), { wrapper })
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(invoke).not.toHaveBeenCalled()
})
