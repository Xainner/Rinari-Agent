// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { I18nProvider } from '../../i18n'
import { setPlatformForTests } from '../../platform'
import { createTestBridge } from '../../platform/testBridge'
import ServerSettings from './ServerSettings'

afterEach(cleanup)

const view = () => render(<I18nProvider lang="es"><ServerSettings /></I18nProvider>)

it('starts on this computer and pairs with the panel link', async () => {
  const bridge = createTestBridge()
  setPlatformForTests(bridge)
  view()
  const list = await screen.findByRole('list', { name: 'Rinari disponibles' })
  expect(within(list).getByText('Este equipo')).toBeTruthy()
  expect(within(list).getByText('En uso')).toBeTruthy()

  const pairButton = screen.getByRole('button', { name: 'Emparejar' }) as HTMLButtonElement
  expect(pairButton.disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Enlace del panel'), {
    target: { value: ' rinari://pair?url=https%3A%2F%2Frinari.example.test&code=ABCD2345 ' },
  })
  // Con enlace, la dirección y el código a mano no aplican.
  expect((screen.getByLabelText('Dirección del servidor') as HTMLInputElement).disabled).toBe(true)
  fireEvent.click(pairButton)

  await screen.findByText('Emparejado con rinari.example.test.')
  expect(bridge.pairRequests).toEqual([{ link: 'rinari://pair?url=https%3A%2F%2Frinari.example.test&code=ABCD2345' }])
  // Emparejar no cambia de Rinari hasta que se pide.
  expect(bridge.engineCalls).not.toContain(expect.stringMatching(/^use:/))
  expect(within(list).getByText('rinari.example.test')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Usar ahora' }))
  await waitFor(() => expect(bridge.engineTargets.active).toBe('00000000-0000-4000-8000-000000000001'))
  expect(bridge.engineCalls).toContain('use:00000000-0000-4000-8000-000000000001')
  await within(list).findByText('Conectado')
})

it('pairs with the address and code typed by hand and shows the server error', async () => {
  const bridge = createTestBridge()
  bridge.nextPairError = { code: 'BAD_CODE', message: 'bad code' }
  setPlatformForTests(bridge)
  view()
  fireEvent.change(await screen.findByLabelText('Dirección del servidor'), { target: { value: 'rinari.example.test' } })
  fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'abcd2345' } })
  fireEvent.click(screen.getByRole('button', { name: 'Emparejar' }))
  expect((await screen.findByRole('alert')).textContent).toMatch(/Ese código no es válido o ya caducó/)
  expect(bridge.pairRequests).toEqual([{ server: 'rinari.example.test', code: 'abcd2345' }])
  expect(bridge.engineTargets.remotes).toEqual([])
})

it('says when the server no longer knows this device, and forgets it after confirming', async () => {
  const bridge = createTestBridge()
  const remote = {
    id: '00000000-0000-4000-8000-000000000009',
    name: 'Saturno',
    server: 'https://rinari.example.test',
    device_id: 'dev_1',
    paired_at: '2026-11-06T00:00:00.000Z',
  }
  bridge.engineTargets = { active: remote.id, remotes: [remote] }
  bridge.engineStatus = { ...bridge.engineStatus, state: 'failed', detail: 'REMOTE_UNPAIRED: revoked', remote: { id: remote.id, name: remote.name, server: remote.server } }
  setPlatformForTests(bridge)
  view()
  const list = await screen.findByRole('list', { name: 'Rinari disponibles' })
  expect(await within(list).findByText('Ya no está emparejado')).toBeTruthy()

  fireEvent.click(within(list).getByRole('button', { name: 'Olvidar' }))
  const dialog = await screen.findByRole('alertdialog')
  expect(within(dialog).getByText('¿Olvidar Saturno?')).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Olvidar' }))
  await waitFor(() => expect(bridge.engineTargets).toEqual({ active: 'local', remotes: [] }))
  await waitFor(() => expect(within(list).queryByText('Saturno')).toBeNull())
})
