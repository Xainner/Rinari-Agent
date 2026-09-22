// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { installMockPlatform } from '../test/mockPlatform'
import { useWindowBounds } from './useWindowBounds'

const host = installMockPlatform()
afterEach(() => {
  cleanup()
  host.clampToWorkArea.mockClear()
})

function Bounds() {
  useWindowBounds()
  return null
}

it('delega el clamp al host Electron una sola vez', async () => {
  render(<Bounds />)
  await waitFor(() => expect(host.clampToWorkArea).toHaveBeenCalledOnce())
})

it('no llama al host fuera del desktop', async () => {
  host.bridge.desktop = false
  render(<Bounds />)
  await Promise.resolve()
  expect(host.clampToWorkArea).not.toHaveBeenCalled()
  host.bridge.desktop = true
})
