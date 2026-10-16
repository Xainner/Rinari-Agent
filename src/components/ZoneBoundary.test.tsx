// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ZoneBoundary } from './ZoneBoundary'

afterEach(cleanup)

let fail = true
function Fragile() {
  if (fail) throw new Error('Maximum update depth exceeded')
  return <p>Chat en pie</p>
}

it('a failing zone shows «Recargar esta vista», logs the component stack and reloads (#58)', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  render(<div><ZoneBoundary zone="chat"><Fragile /></ZoneBoundary><p>Barra lateral</p></div>)
  expect(screen.getByTestId('zone-error').textContent).toContain('Recargar esta vista')
  expect(screen.getByText('Barra lateral')).toBeTruthy()
  const logged = error.mock.calls.map((call) => String(call[0])).find((line) => line.startsWith('[rinari] ui error in chat'))
  expect(logged).toContain('Maximum update depth exceeded')
  expect(logged).toContain('components: ')
  fail = false
  fireEvent.click(screen.getByRole('button', { name: /Recargar esta vista/ }))
  expect(screen.getByText('Chat en pie')).toBeTruthy()
  error.mockRestore()
})
