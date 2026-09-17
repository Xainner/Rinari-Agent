// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { ResizeHandle } from '../components/ui/resize-handle'
import { useDragResize } from './useDragResize'

afterEach(cleanup)

function Harness({ direction, onCommit }: { direction: 'left' | 'right'; onCommit: (value: number) => void }) {
  const [width, setWidth] = useState(400)
  const { handleProps } = useDragResize({ value: width, min: 300, max: 600, direction, onChange: setWidth, onCommit })
  return (
    <>
      <output data-testid="width">{width}</output>
      <ResizeHandle {...handleProps} label="Ancho" />
    </>
  )
}

it('resizes with the pointer, clamps to bounds and commits once on release', () => {
  const onCommit = vi.fn()
  render(<Harness direction="right" onCommit={onCommit} />)
  const handle = screen.getByRole('separator', { name: 'Ancho' })
  handle.setPointerCapture = vi.fn()
  handle.releasePointerCapture = vi.fn()
  handle.hasPointerCapture = vi.fn(() => true)
  fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, button: 0 })
  fireEvent.pointerMove(handle, { pointerId: 1, clientX: 150 })
  expect(screen.getByTestId('width').textContent).toBe('450')
  fireEvent.pointerMove(handle, { pointerId: 1, clientX: 900 })
  expect(screen.getByTestId('width').textContent).toBe('600')
  fireEvent.pointerUp(handle, { pointerId: 1, clientX: 900 })
  expect(onCommit).toHaveBeenCalledTimes(1)
  expect(onCommit).toHaveBeenCalledWith(600)
  expect(handle.getAttribute('aria-valuenow')).toBe('600')
  expect(handle.getAttribute('aria-valuemin')).toBe('300')
  expect(handle.getAttribute('aria-valuemax')).toBe('600')
})

it('inverts the drag for elements to the right of the handle and ends on pointer cancel', () => {
  const onCommit = vi.fn()
  render(<Harness direction="left" onCommit={onCommit} />)
  const handle = screen.getByRole('separator', { name: 'Ancho' })
  handle.setPointerCapture = vi.fn()
  handle.hasPointerCapture = vi.fn(() => true)
  fireEvent.pointerDown(handle, { pointerId: 2, clientX: 100, button: 0 })
  fireEvent.pointerMove(handle, { pointerId: 2, clientX: 140 })
  expect(screen.getByTestId('width').textContent).toBe('360')
  fireEvent.pointerCancel(handle, { pointerId: 2 })
  expect(onCommit).toHaveBeenCalledWith(360)
  // After cancel, further moves are ignored.
  fireEvent.pointerMove(handle, { pointerId: 2, clientX: 300 })
  expect(screen.getByTestId('width').textContent).toBe('360')
})

it('supports keyboard steps and commits each one', () => {
  const onCommit = vi.fn()
  render(<Harness direction="right" onCommit={onCommit} />)
  const handle = screen.getByRole('separator', { name: 'Ancho' })
  fireEvent.keyDown(handle, { key: 'ArrowRight' })
  expect(screen.getByTestId('width').textContent).toBe('420')
  fireEvent.keyDown(handle, { key: 'ArrowLeft' })
  fireEvent.keyDown(handle, { key: 'ArrowLeft' })
  expect(screen.getByTestId('width').textContent).toBe('380')
  fireEvent.keyDown(handle, { key: 'Home' })
  expect(screen.getByTestId('width').textContent).toBe('300')
  expect(onCommit).toHaveBeenCalledTimes(4)
})
