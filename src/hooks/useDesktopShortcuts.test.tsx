// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DEFAULT_SHORTCUT_BINDINGS } from '../stores/ui'
import { useDesktopShortcuts } from './useDesktopShortcuts'

afterEach(cleanup)

function Harness({ onAction }: { onAction: (action: string) => void }) {
  useDesktopShortcuts(DEFAULT_SHORTCUT_BINDINGS, (action) => onAction(action))
  return null
}

const press = (init: KeyboardEventInit) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))

it('fires one action per key press and ignores repeats and IME composition', () => {
  const onAction = vi.fn()
  render(<Harness onAction={onAction} />)
  press({ key: 'B', ctrlKey: true, shiftKey: true })
  press({ key: 'B', ctrlKey: true, shiftKey: true, repeat: true })
  press({ key: 'B', ctrlKey: true, shiftKey: true, isComposing: true })
  expect(onAction).toHaveBeenCalledTimes(1)
  expect(onAction).toHaveBeenCalledWith('boards')
  press({ key: 'b', ctrlKey: true })
  expect(onAction).toHaveBeenLastCalledWith('sidebar')
})

it('blocks navigation shortcuts under a modal dialog but keeps the palette', () => {
  const onAction = vi.fn()
  render(
    <>
      <div role="dialog" aria-modal="true" />
      <Harness onAction={onAction} />
    </>,
  )
  press({ key: 'B', ctrlKey: true, shiftKey: true })
  expect(onAction).not.toHaveBeenCalled()
  press({ key: 'K', ctrlKey: true })
  expect(onAction).toHaveBeenCalledWith('palette')
})
