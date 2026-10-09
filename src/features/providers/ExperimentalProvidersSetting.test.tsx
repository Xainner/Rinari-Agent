// @vitest-environment jsdom
// Claude Subscription es opt-in: el interruptor lee y guarda el ajuste del
// Engine, y nunca aparece encendido si el Engine no lo confirma.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { createTestBridge } from '../../platform/testBridge'
import { setPlatformForTests } from '../../platform'
import { I18nProvider } from '../../i18n'
import ExperimentalProvidersSetting from './ExperimentalProvidersSetting'

let restore: (() => void) | undefined
afterEach(() => {
  cleanup()
  restore?.()
})

function mount(initial: boolean | Error) {
  const bridge = createTestBridge()
  restore = setPlatformForTests(bridge)
  let stored = initial instanceof Error ? false : initial
  bridge.mockCommand('provider_settings_get', () => {
    if (initial instanceof Error) throw initial
    return { external_runtimes: stored }
  })
  bridge.mockCommand('provider_settings_set', (args) => {
    stored = args.external_runtimes === true
    return { external_runtimes: stored }
  })
  render(
    <I18nProvider lang="es">
      <ExperimentalProvidersSetting />
    </I18nProvider>,
  )
  return bridge
}

it('CLAUDE-UI-20: off by default, turning it on saves the Engine setting and shows the usage notice', async () => {
  const bridge = mount(false)
  const toggle = await screen.findByRole('switch', { name: 'Claude Subscription (experimental)' })
  expect(toggle.getAttribute('aria-checked')).toBe('false')
  expect(screen.queryByText(/se descuenta de los límites/)).toBeNull()
  fireEvent.click(toggle)
  await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'))
  const saved = bridge.calls.filter((call) => call.name === 'provider_settings_set')
  expect(saved.map((call) => call.args)).toEqual([{ external_runtimes: true }])
  expect(screen.getByText(/se descuenta de los límites/)).toBeTruthy()
})

it('CLAUDE-UI-21: an Engine without the setting shows no switch at all', async () => {
  const bridge = mount(new Error('unknown method'))
  await waitFor(() => expect(bridge.calls.some((call) => call.name === 'provider_settings_get')).toBe(true))
  expect(screen.queryByTestId('experimental-providers')).toBeNull()
})
