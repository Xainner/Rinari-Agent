// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { I18nProvider } from '../../i18n'
import { setPlatformForTests } from '../../platform'
import { createTestBridge } from '../../platform/testBridge'
import BackgroundSettings from './BackgroundSettings'

afterEach(cleanup)

const view = () => render(<I18nProvider lang="es"><BackgroundSettings /></I18nProvider>)

it('shows what the host confirms and turns the tray off through the bridge', async () => {
  const bridge = createTestBridge()
  setPlatformForTests(bridge)
  view()
  const tray = await screen.findByRole('switch', { name: 'Seguir en la bandeja al cerrar' })
  expect(tray.getAttribute('aria-checked')).toBe('true')
  fireEvent.click(tray)
  await waitFor(() => expect(tray.getAttribute('aria-checked')).toBe('false'))
  expect(bridge.background.backgroundMode).toBe(false)
  fireEvent.click(screen.getByRole('switch', { name: 'Iniciar con Windows' }))
  await waitFor(() => expect(bridge.background.launchAtLogin).toBe(true))
})

it('offers start with Windows only in the installed app', async () => {
  const bridge = createTestBridge()
  bridge.background = { backgroundMode: true, launchAtLogin: false, launchAtLoginSupported: false }
  setPlatformForTests(bridge)
  view()
  const login = await screen.findByRole('switch', { name: 'Iniciar con Windows' })
  expect(login.hasAttribute('disabled')).toBe(true)
  expect(screen.getByText('Disponible en la app instalada.')).toBeTruthy()
})
