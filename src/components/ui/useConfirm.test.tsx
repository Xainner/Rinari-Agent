// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'
import { useConfirm } from './useConfirm'

afterEach(cleanup)

const options = { title: '¿Confías en esta carpeta?', body: 'Detalle', confirmLabel: 'Confiar', cancelLabel: 'Ahora no' }

it('asks in an app dialog and resolves with the choice', async () => {
  const hook = renderHook(() => useConfirm())
  let answer: Promise<boolean> = Promise.resolve(false)
  act(() => { answer = hook.result.current.ask(options) })
  const view = render(<>{hook.result.current.dialog}</>)
  expect(await screen.findByRole('alertdialog', { name: '¿Confías en esta carpeta?' })).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Confiar' }))
  await expect(answer).resolves.toBe(true)
  view.unmount()

  act(() => { answer = hook.result.current.ask(options) })
  render(<>{hook.result.current.dialog}</>)
  await userEvent.click(await screen.findByRole('button', { name: 'Ahora no' }))
  await expect(answer).resolves.toBe(false)
})
