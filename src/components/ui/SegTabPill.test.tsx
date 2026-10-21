// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useUIStore } from '../../stores/ui'
import { SegTabPill } from './SegTabPill'

const animate = vi.fn()

beforeEach(() => {
  animate.mockReset()
  ;(HTMLElement.prototype as unknown as { animate: typeof animate }).animate = animate
  // Cada opción mide 60 px y la siguiente empieza 64 px más allá.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const index = Number(this.dataset.index ?? 0)
    return { left: index * 64, right: index * 64 + 60, width: 60, top: 0, bottom: 30, height: 30, x: index * 64, y: 0, toJSON: () => ({}) } as DOMRect
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useUIStore.setState({ reduceMotion: false })
})

function Tabs() {
  const [value, setValue] = useState(0)
  return (
    <div className="seg-tabs" role="radiogroup">
      {['Preguntar', 'Continuar', 'No'].map((label, index) => (
        <button key={label} type="button" role="radio" aria-checked={value === index} data-index={index} className="seg-tab" onClick={() => setValue(index)}>
          {value === index && <SegTabPill />}
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}

it('slides from the option that had it, without overshoot', async () => {
  render(<Tabs />)
  expect(animate).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('radio', { name: 'No' }))
  expect(animate).toHaveBeenCalledTimes(1)
  const [frames, options] = animate.mock.calls[0]
  expect(frames).toEqual([{ left: '-128px', right: '128px' }, { left: '0px', right: '0px' }])
  expect(options.easing).toMatch(/^cubic-bezier/)
})

it('stays put with «Reducir animaciones»', async () => {
  useUIStore.setState({ reduceMotion: true })
  render(<Tabs />)
  await userEvent.click(screen.getByRole('radio', { name: 'Continuar' }))
  expect(animate).not.toHaveBeenCalled()
  expect(screen.getByRole('radio', { name: 'Continuar' }).querySelector('.seg-tab-pill')).toBeTruthy()
})
