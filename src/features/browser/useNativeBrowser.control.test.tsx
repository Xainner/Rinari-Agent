// @vitest-environment jsdom
import { installMockPlatform } from '../../test/mockPlatform'
const host = installMockPlatform()
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { platform } from '../../platform'
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

// Plan 0.4.0 #46: el panel ya no reparte el control entre turnos ni pide
// capturas. La página se ve en vivo; el dueño la toma usándola (main lo
// detecta) y el Engine se la devuelve al agente cuando lleva 3 s sin tocarla.
it('the panel never moves the control nor polls captures', async () => {
  const preview = vi.spyOn(platform().browser, 'preview')
  const hook = renderHook(({ shown }) => useNativeBrowser('s1', { shown }), { initialProps: { shown: true } })
  await waitFor(() => expect(hook.result.current.context?.control_state).toBe('agent'))
  hook.rerender({ shown: false })
  hook.rerender({ shown: true })
  await new Promise((resolve) => setTimeout(resolve, 50))
  const kinds = host.bridge.browserCalls.map((call) => call.kind)
  expect(kinds).not.toContain('setControl')
  expect(preview).not.toHaveBeenCalled()
})
