// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { resetNotificationCenterForTests, useNotificationCenter } from '../../stores/notificationCenter'
import NotificationCenter from './NotificationCenter'

beforeEach(() => resetNotificationCenterForTests())
afterEach(cleanup)

function center(onOpenTarget = vi.fn()) {
  render(
    <I18nProvider lang="es">
      <NotificationCenter labelFor={(id) => id} goBoard={vi.fn()} onOpenTarget={onOpenTarget} />
    </I18nProvider>,
  )
  return onOpenTarget
}

it('groups what the app announced by module and counts it in the bell', async () => {
  const push = useNotificationCenter.getState().push
  push({ module: 'schedules', title: 'Recordatorio: Tomar agua', body: 'Un vaso', target: { kind: 'schedules' } })
  push({ module: 'skills', title: 'Skill guardada: deploy', target: { kind: 'skills' } })
  const onOpenTarget = center()
  const trigger = screen.getByTestId('notification-center-trigger')
  expect(trigger.textContent).toBe('2')
  await userEvent.click(trigger)
  const schedules = screen.getByRole('region', { name: 'Tareas programadas' })
  expect(within(schedules).getByText('Recordatorio: Tomar agua')).toBeTruthy()
  expect(within(screen.getByRole('region', { name: 'Skills' })).getByText('Skill guardada: deploy')).toBeTruthy()
  // Sin pendientes del board, su sección no ocupa sitio (como cualquier otro módulo).
  expect(screen.queryByRole('region', { name: 'Pendientes del board' })).toBeNull()
  await userEvent.click(within(schedules).getByText('Recordatorio: Tomar agua'))
  expect(onOpenTarget).toHaveBeenCalledWith({ kind: 'schedules' })
  // Verlas las deja leídas.
  await waitFor(() => expect(useNotificationCenter.getState().items.every((item) => item.read)).toBe(true))
})

it('removes one notification without opening it', async () => {
  useNotificationCenter.getState().push({ module: 'schedules', title: 'Backup: Falló' })
  const onOpenTarget = center()
  await userEvent.click(screen.getByTestId('notification-center-trigger'))
  await userEvent.click(screen.getByRole('button', { name: 'Quitar «Backup: Falló»' }))
  expect(useNotificationCenter.getState().items).toHaveLength(0)
  expect(onOpenTarget).not.toHaveBeenCalled()
})

it('says so when there is nothing to show', async () => {
  center()
  await userEvent.click(screen.getByTestId('notification-center-trigger'))
  expect(screen.getByText('Sin notificaciones.')).toBeTruthy()
  expect(screen.queryByText(/No hay pendientes en el board/)).toBeNull()
})
