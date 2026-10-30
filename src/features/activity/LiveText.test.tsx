// @vitest-environment jsdom
// Plan 0.4.0 #52: el texto en streaming se revela con suavidad y no por
// oraciones de golpe; al terminar sale entero; con movimiento reducido, tal
// como llega. Las palabras nuevas llevan su fundido; lo ya pintado, no.
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Markdown from '../../components/Markdown'
import { useUIStore } from '../../stores/ui'
import LiveText from './LiveText'
import { resetSmoothTextForTests, revealStep, wordEnd } from './smoothText'

const SENTENCE = 'Rinari revisó los tres archivos y encontró que el ticket no imprimía el código QR en la caja. '

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout', 'Date'] })
  resetSmoothTextForTests()
  useUIStore.setState({ reduceMotion: false })
})
afterEach(() => { cleanup(); vi.useRealTimers() })

/** Lo que se ve: el texto recibido menos las palabras que aún esperan invisibles. */
const visible = (container: HTMLElement) => {
  const body = container.querySelector('.md-body')?.cloneNode(true) as HTMLElement | undefined
  if (!body) return ''
  body.querySelectorAll('.sw-wait').forEach((word) => word.remove())
  return (body.textContent ?? '').trim()
}

it('el ritmo acelera con lo acumulado y corta por palabras', () => {
  expect(revealStep(0, 16)).toBe(0)
  expect(revealStep(10, 16)).toBeCloseTo(1.92)
  // Mucho acumulado: se pone al día en unos 300 ms.
  expect(revealStep(3000, 16)).toBeCloseTo(160)
  expect(wordEnd('hola mundo', 2)).toBe(4)
  expect(wordEnd('hola mundo', 6)).toBe(-1)
})

it('una oración entera aparece en varios cuadros, no de golpe, y al terminar sale toda', () => {
  const view = render(<LiveText id="m1" content={SENTENCE} streaming live />)
  expect(visible(view.container)).toBe('')
  act(() => { vi.advanceTimersByTime(50) })
  const early = visible(view.container).length
  expect(early).toBeGreaterThan(0)
  expect(early).toBeLessThan(SENTENCE.trim().length)
  act(() => { vi.advanceTimersByTime(120) })
  expect(visible(view.container).length).toBeGreaterThan(early)
  // El turno terminó: lo que quede sale de inmediato y sin animación.
  view.rerender(<LiveText id="m1" content={SENTENCE} streaming={false} live={false} />)
  expect(visible(view.container)).toBe(SENTENCE.trim())
  expect(view.container.querySelector('.md-body')?.hasAttribute('data-streaming')).toBe(false)
})

it('al volver a montarse sigue donde iba y no repite lo ya mostrado', () => {
  const first = render(<LiveText id="m2" content={SENTENCE} streaming live />)
  act(() => { vi.advanceTimersByTime(200) })
  const shown = visible(first.container).length
  first.unmount()
  const again = render(<LiveText id="m2" content={SENTENCE} streaming live />)
  expect(visible(again.container).length).toBe(shown)
  // Las palabras que ya estaban no vuelven a animarse.
  expect(again.container.querySelectorAll('.sw:not(.sw-wait)')).toHaveLength(0)
})

it('con movimiento reducido el texto sale tal como llega', () => {
  useUIStore.setState({ reduceMotion: true })
  const view = render(<LiveText id="m3" content={SENTENCE} streaming live />)
  expect(visible(view.container)).toBe(SENTENCE.trim())
  expect(view.container.querySelector('.sw')).toBeNull()
})

it('el texto recibido ocupa su sitio desde el principio: el revelado no cambia alturas', () => {
  const view = render(<LiveText id="m4" content={SENTENCE} streaming live />)
  // Todo está en el DOM (la altura no crece cuadro a cuadro), pero nada se ve aún.
  expect(view.container.querySelector('.md-body')?.textContent).toBe(SENTENCE.trim())
  expect(visible(view.container)).toBe('')
  act(() => { vi.advanceTimersByTime(80) })
  expect(view.container.querySelectorAll('.sw-edge')).toHaveLength(1)
})

it('solo las palabras desde fadeFrom llevan fundido, las de después de shownTo esperan, y el código no se toca', () => {
  const view = render(<Markdown stream={{ fadeFrom: 5, shownTo: 12 }}>{'Hola mundo bonito y `codigo largo`'}</Markdown>)
  const words = [...view.container.querySelectorAll('.sw')].map((span) => span.textContent?.trim())
  expect(words).toEqual(['mundo', 'bonito', 'y'])
  expect([...view.container.querySelectorAll('.sw-wait')].map((span) => span.textContent?.trim())).toEqual(['y'])
  expect(view.container.querySelector('.sw-edge')?.textContent?.trim()).toBe('bonito')
  expect(view.container.querySelector('code .sw')).toBeNull()
  expect(view.container.querySelector('.md-body')?.getAttribute('data-streaming')).toBe('true')
})
