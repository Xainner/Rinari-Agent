// @vitest-environment jsdom
// Doc 03 §10 y doc 04 §5: solo se sondea con la superficie del navegador a la
// vista. `browser.view.get` siempre captura la pantalla del target cuando hay
// un browser conectado, así que oculto no puede haber poll de capturas: solo
// una sonda puntual al montar y al terminar un turno.
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => ({ state: 'disconnected' })) }))

import { invoke } from '@tauri-apps/api/core'
import { BROWSER_POLL_ACTIVE_MS, useBrowserFrame } from './useBrowserFrame'

const invoked = vi.mocked(invoke)

beforeEach(() => {
  invoked.mockClear()
  invoked.mockResolvedValue({ state: 'disconnected' })
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

it('con la superficie oculta consulta una vez y no deja temporizador', async () => {
  renderHook(() => useBrowserFrame('ses_a', { active: false }))
  await vi.advanceTimersByTimeAsync(0)
  expect(invoked).toHaveBeenCalledTimes(1)

  // Diez veces la cadencia de capturas: sigue sin haber un segundo frame.
  await vi.advanceTimersByTimeAsync(BROWSER_POLL_ACTIVE_MS * 10)
  expect(invoked).toHaveBeenCalledTimes(1)
})

it('la sonda de fin de turno pide exactamente un frame más', async () => {
  const { rerender } = renderHook(
    ({ probe }: { probe: number }) => useBrowserFrame('ses_a', { active: false, probe }),
    { initialProps: { probe: 0 } },
  )
  await vi.advanceTimersByTimeAsync(0)
  expect(invoked).toHaveBeenCalledTimes(1)

  rerender({ probe: 1 })
  await vi.advanceTimersByTimeAsync(0)
  expect(invoked).toHaveBeenCalledTimes(2)

  await vi.advanceTimersByTimeAsync(BROWSER_POLL_ACTIVE_MS * 10)
  expect(invoked).toHaveBeenCalledTimes(2)
})

it('con la superficie a la vista encadena a la cadencia de capturas y para al ocultarla', async () => {
  const { rerender } = renderHook(
    ({ active }: { active: boolean }) => useBrowserFrame('ses_a', { active }),
    { initialProps: { active: true } },
  )
  await vi.advanceTimersByTimeAsync(0)
  expect(invoked).toHaveBeenCalledTimes(1)

  await vi.advanceTimersByTimeAsync(BROWSER_POLL_ACTIVE_MS)
  expect(invoked).toHaveBeenCalledTimes(2)

  // Ocultarla detiene el sondeo y no dispara una consulta de despedida.
  rerender({ active: false })
  const afterHiding = invoked.mock.calls.length
  await vi.advanceTimersByTimeAsync(BROWSER_POLL_ACTIVE_MS * 10)
  expect(invoked).toHaveBeenCalledTimes(afterHiding)
})

it('sin capability del Engine no consulta nada', async () => {
  renderHook(() => useBrowserFrame('ses_a', { active: true, enabled: false }))
  await vi.advanceTimersByTimeAsync(BROWSER_POLL_ACTIVE_MS * 4)
  expect(invoked).not.toHaveBeenCalled()
})
