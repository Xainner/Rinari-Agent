// @vitest-environment jsdom
import { installMockPlatform } from '../../test/mockPlatform'
const host = installMockPlatform()
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { useNativeBrowser } from './useNativeBrowser'

const context = {
  session_id: 's1',
  supported: true,
  backend: 'electron-native',
  context_state: 'ready',
  control: 'agent',
  control_state: 'agent',
  control_revision: 1,
  targets: [],
  active_target_id: null,
}

beforeEach(() => {
  host.bridge.browserCalls.length = 0
  host.bridge.browserContext = { ...context } as never
})
afterEach(cleanup)

const controls = () =>
  host.bridge.browserCalls.filter((call) => call.kind === 'setControl').map((call) => (call as { owner: string }).owner)

it('between turns the page goes live; a new turn hands it back to Rinari', async () => {
  const hook = renderHook(({ busy }) => useNativeBrowser('s1', { shown: true, busy }), { initialProps: { busy: false } })
  await waitFor(() => expect(controls()).toEqual(['user']))
  hook.rerender({ busy: true })
  await waitFor(() => expect(controls()).toEqual(['user', 'agent']))
  hook.rerender({ busy: false })
  await waitFor(() => expect(controls()).toEqual(['user', 'agent', 'user']))
})

it('what you decide by hand is respected', async () => {
  const hook = renderHook(({ busy }) => useNativeBrowser('s1', { shown: true, busy }), { initialProps: { busy: true } })
  await waitFor(() => expect(hook.result.current.context?.control_state).toBe('agent'))
  // Taking control mid-turn: the turn does not take it back.
  await act(() => hook.result.current.takeControl())
  hook.rerender({ busy: false })
  hook.rerender({ busy: true })
  await waitFor(() => expect(controls()).toEqual(['user', 'agent']))
  // Handing it back while idle: it stays with Rinari until the next turn.
  hook.rerender({ busy: false })
  await waitFor(() => expect(controls()).toEqual(['user', 'agent', 'user']))
  await act(() => hook.result.current.returnControl())
  hook.rerender({ busy: false })
  expect(controls()).toEqual(['user', 'agent', 'user', 'agent'])
})
