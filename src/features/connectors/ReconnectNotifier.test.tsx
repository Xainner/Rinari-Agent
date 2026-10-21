// @vitest-environment jsdom
// «Hay que reconectar» sin pantalla (conectores C8): un aviso del sistema y
// del centro al pasar a reauth_required, una vez por caída.
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'

let listener: ((event: { event: string; payload: unknown }) => void) | null = null
const sendSystemNotification = vi.fn(async (_notification: unknown) => true)
const push = vi.fn()
vi.mock('../../services/engine', () => ({
  onEngineEvent: vi.fn(async (callback: (event: { event: string; payload: unknown }) => void) => {
    listener = callback
    return () => { listener = null }
  }),
}))
vi.mock('../../services/notifications', () => ({
  sendSystemNotification: (notification: unknown) => sendSystemNotification(notification),
}))
vi.mock('../../stores/notificationCenter', () => ({
  useNotificationCenter: { getState: () => ({ push }) },
}))

import ReconnectNotifier from './ReconnectNotifier'

const status = (name: string, value: string) => act(() => listener!({ event: 'mcp.status.changed', payload: { name, status: value } }))

beforeEach(() => { sendSystemNotification.mockClear(); push.mockClear() })
afterEach(() => cleanup())

it('tells once when a connector needs to sign in again, also with the app in the tray', async () => {
  render(<I18nProvider lang="es"><ReconnectNotifier /></I18nProvider>)
  await vi.waitFor(() => expect(listener).not.toBeNull())
  status('gmail', 'connected')
  expect(sendSystemNotification).not.toHaveBeenCalled()
  status('gmail', 'reauth_required')
  status('gmail', 'reauth_required')
  expect(sendSystemNotification).toHaveBeenCalledTimes(1)
  expect(sendSystemNotification).toHaveBeenCalledWith(expect.objectContaining({ title: 'Hay que reconectar gmail' }))
  expect(push).toHaveBeenCalledWith(expect.objectContaining({ id: 'reauth:gmail', tone: 'warning', target: { kind: 'connector', name: 'gmail' } }))
  status('gmail', 'connected')
  status('gmail', 'reauth_required')
  expect(sendSystemNotification).toHaveBeenCalledTimes(2)
})
