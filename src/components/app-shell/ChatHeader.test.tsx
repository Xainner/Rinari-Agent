// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import ChatHeader from './ChatHeader'

afterEach(cleanup)

// #83: la barra de título solo lleva el título de la conversación.
it('solo el título, recortado con el completo al pasar el ratón', () => {
  const long = 'Tarjetas regalo: venta en caja con QR, correo al cliente y caducidad a los doce meses'
  const { container } = render(<ChatHeader title={long} sessionId="ses_a" />)
  expect(screen.getByText(long)).toBeTruthy()
  expect((container.firstElementChild as HTMLElement).title).toBe(long)
  expect(container.querySelector('button')).toBeNull()
  expect(container.textContent).toBe(long)
})

it('sin título no pinta nada', () => {
  const { container } = render(<ChatHeader title={null} />)
  expect(container.textContent).toBe('')
})

// #40: una conversación hija vuelve a su madre desde la cabecera.
it('a child shows «← Madre · Encargo» and opens the mother', async () => {
  const { fireEvent } = await import('@testing-library/react')
  const onOpen = (await import('vitest')).vi.fn()
  render(<ChatHeader title="Pruebas del parser" sessionId="ses_child" mother={{ id: 'ses_mother', title: 'Parser', brief: 'Añadir pruebas', onOpen }} />)
  const back = screen.getByTestId('chat-header-mother')
  expect(back.textContent).toContain('Parser')
  expect(back.textContent).toContain('Añadir pruebas')
  fireEvent.click(back)
  expect(onOpen).toHaveBeenCalledWith('ses_mother')
})
