// @vitest-environment jsdom
// Ajustes → Notificaciones (plan 0.4.0 #33, #64): su propia página, y la
// vista previa dice qué se verá en la notificación del sistema.
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('../../services/notifications', () => ({ notificationSupport: { canSend: true } }))

import { I18nProvider } from '../../i18n'
import { DEFAULT_NOTIFICATION_PREFS, useNotificationPrefs } from '../../stores/notificationPrefs'
import NotificationSettings from './NotificationSettings'

beforeEach(() => useNotificationPrefs.setState({ ...DEFAULT_NOTIFICATION_PREFS }))
afterEach(() => cleanup())

it('la vista previa sigue a «Mostrar el contenido» y desaparece sin notificaciones del sistema', async () => {
  render(<I18nProvider lang="es"><NotificationSettings /></I18nProvider>)
  const preview = screen.getByTestId('notification-preview')
  expect(preview.textContent).toContain('Informe de ventas')
  expect(preview.textContent).toContain('Listo: preparé el informe')
  await userEvent.click(screen.getByRole('switch', { name: 'Mostrar el contenido en la notificación' }))
  expect(useNotificationPrefs.getState().showContent).toBe(false)
  expect(screen.getByTestId('notification-preview').textContent).toContain('«Informe de ventas» terminó.')
  expect(screen.getByTestId('notification-preview').textContent).not.toContain('Listo: preparé')
  await userEvent.click(screen.getByRole('switch', { name: 'Notificaciones del sistema' }))
  expect(screen.queryByTestId('notification-preview')).toBeNull()
  expect((screen.getByRole('switch', { name: 'Mostrar el contenido en la notificación' }) as HTMLButtonElement).disabled).toBe(true)
})
