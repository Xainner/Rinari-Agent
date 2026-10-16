// @vitest-environment jsdom
// Plan 0.4.0 #54: un mensaje enviado durante el turno se edita en su sitio
// (Enter guarda, Esc cancela) o se borra mientras Rinari no lo lea.
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

import { I18nProvider } from '../../i18n'
import { engineApi } from '../../services/engine'
import { SteerBubble } from './SteerBubble'
import type { SteerTimelineItem } from './types'

const item = (status: SteerTimelineItem['status'] = 'pending'): SteerTimelineItem =>
  ({ id: 's', type: 'steer', activitySeq: 1, occurredAt: 0, steerId: 't1:steer_1', content: 'solo .py', status } as SteerTimelineItem)

const mount = (value = item()) => render(<I18nProvider lang="es"><SteerBubble item={value} sessionId="s1" /></I18nProvider>)

let update: ReturnType<typeof vi.spyOn>
let cancel: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  update = vi.spyOn(engineApi, 'turnSteerUpdate').mockResolvedValue({ status: 'updated', steer_id: 't1:steer_1', message: '' })
  cancel = vi.spyOn(engineApi, 'turnSteerCancel').mockResolvedValue({ status: 'cancelled', steer_id: 't1:steer_1' })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); toast.mockClear(); toast.error.mockClear() })

it('se edita en su sitio: Enter guarda el texto nuevo', async () => {
  mount()
  await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
  const field = screen.getByRole('textbox', { name: 'Editar el mensaje' })
  expect(document.activeElement).toBe(field)
  await userEvent.clear(field)
  await userEvent.type(field, 'solo .ts{Enter}')
  expect(update).toHaveBeenCalledWith('s1', 't1:steer_1', 'solo .ts')
  await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
})

it('Esc cancela sin enviar nada, y Mayús+Enter es un salto de línea', async () => {
  mount()
  await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
  const field = screen.getByRole('textbox', { name: 'Editar el mensaje' })
  await userEvent.type(field, '{Shift>}{Enter}{/Shift}más')
  expect((field as HTMLTextAreaElement).value).toBe('solo .py\nmás')
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(update).not.toHaveBeenCalled()
  expect(screen.getByText('solo .py')).toBeTruthy()
})

it('si Rinari ya lo leyó, lo dice y el mensaje queda como estaba', async () => {
  update.mockRejectedValue({ code: 'STEER_ALREADY_READ', message: 'already read' })
  mount()
  await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
  await userEvent.type(screen.getByRole('textbox'), ' y .ts{Enter}')
  await waitFor(() => expect(toast).toHaveBeenCalledWith('Rinari ya lo leyó: el mensaje queda como estaba.'))
  expect(toast.error).not.toHaveBeenCalled()
  expect(screen.queryByRole('textbox')).toBeNull()
})

it('Borrar lo retira', async () => {
  mount()
  await userEvent.click(screen.getByRole('button', { name: 'Borrar' }))
  expect(cancel).toHaveBeenCalledWith('s1', 't1:steer_1')
})

it('ya leído no ofrece editar ni borrar', () => {
  mount(item('applied'))
  expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Borrar' })).toBeNull()
  expect(screen.getByText('Enviado mientras trabajaba')).toBeTruthy()
})
