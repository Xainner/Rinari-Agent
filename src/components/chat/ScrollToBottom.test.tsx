// @vitest-environment jsdom
// Plan 0.4.0 #89: «Ir al final» muestra tres puntos mientras Rinari trabaja,
// con la misma función; el nombre del botón no cambia.
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import ScrollToBottom from './ScrollToBottom'

afterEach(() => cleanup())

const mount = (props: Partial<Parameters<typeof ScrollToBottom>[0]> = {}) => {
  const onClick = vi.fn()
  render(<I18nProvider lang="es"><ScrollToBottom visible onClick={onClick} {...props} /></I18nProvider>)
  return onClick
}

it('sin turno es la flecha; con turno, los puntos, y baja igual', async () => {
  const idle = mount()
  const button = screen.getByRole('button', { name: 'Ir al final' })
  expect(button.dataset.working).toBeUndefined()
  expect(button.getAttribute('aria-describedby')).toBeNull()
  await userEvent.click(button)
  expect(idle).toHaveBeenCalledTimes(1)
  cleanup()

  const working = mount({ working: true })
  const busy = screen.getByRole('button', { name: 'Ir al final' })
  expect(busy.dataset.working).toBe('true')
  expect(busy.querySelectorAll('.scroll-bottom-dots i')).toHaveLength(3)
  expect(document.getElementById(busy.getAttribute('aria-describedby')!)?.textContent).toBe('Rinari trabajando')
  await userEvent.click(busy)
  expect(working).toHaveBeenCalledTimes(1)
})

it('una aprobación esperando lo dice con el punto ámbar', () => {
  mount({ working: true, needsYou: true })
  const button = screen.getByRole('button', { name: 'Ir al final' })
  expect(button.querySelector('.scroll-bottom-flag')).toBeTruthy()
  expect(button.title).toBe('Ir al final · Rinari te necesita')
})

it('no se pinta si ya estás al final', () => {
  mount({ visible: false, working: true })
  expect(screen.queryByRole('button')).toBeNull()
})

it('#62: con un resultado sin leer más abajo es «↓ Nuevo resultado» y sigue llamándose «Ir al final»', async () => {
  const onClick = mount({ newResult: true, working: true })
  const button = screen.getByRole('button', { name: 'Ir al final' })
  expect(button.dataset.new).toBe('true')
  expect(button.dataset.working).toBeUndefined()
  expect(button.querySelector('.scroll-bottom-label')?.textContent).toBe('Nuevo resultado')
  await userEvent.click(button)
  expect(onClick).toHaveBeenCalledTimes(1)
})
