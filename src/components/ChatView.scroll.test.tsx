// @vitest-environment jsdom
// Doc 01 §4.4 / UX-06: al desmontar (colapsar un panel, cambiar de vista) se
// guarda un ancla de fila + desplazamiento y el modo de seguimiento; al volver
// se restaura tras hidratar las filas. Leer arriba nunca termina abajo.
import { installMockPlatform } from '../test/mockPlatform'
installMockPlatform()
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('../services/desktop', () => ({
  desktopApi: { questions: vi.fn(async () => ({ questions: [] })), readFile: vi.fn(), answer: vi.fn() },
}))

const scrollToIndex = vi.fn()
const handle = { scrollOffset: 0, scrollSize: 0, viewportSize: 0 }
vi.mock('virtua', async () => {
  const React = await import('react')
  const Virtualizer = React.forwardRef(function Virtualizer(
    { data, children }: { data: unknown[]; children: (row: never, index: number) => React.ReactNode },
    ref: React.ForwardedRef<unknown>,
  ) {
    React.useImperativeHandle(ref, () => ({
      scrollToIndex,
      get scrollOffset() { return handle.scrollOffset },
      // Filas de 100 px: el índice y el offset se derivan del scroll simulado.
      findItemIndex: (offset: number) => Math.min(data.length - 1, Math.floor(offset / 100)),
      getItemOffset: (index: number) => index * 100,
    }))
    return <>{data.map((row, index) => children(row as never, index))}</>
  })
  return { Virtualizer }
})

import { useBoardStore, defaultBoard } from '../stores/board'
import { useComposerStore } from '../stores/composer'
import { resetScrollAnchorsForTests, readScrollAnchor } from '../features/engine/scrollAnchors'
import { BoardHarness, engineFixture, sessionFixture } from '../features/board/testUtils'
import SingleSessionView from '../features/engine/SingleSessionView'
import { engineEventAction } from '../features/activity/turnTimelineReducer'
import { resetPendingQuestionsForTests } from '../features/questions/usePendingQuestions'

const NOW = 1_700_000_000_000
const event = (name: string, payload: Record<string, unknown>) => engineEventAction({ type: 'event', event: name, payload }, NOW)!

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  ;(window as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub
  Element.prototype.scrollTo = vi.fn() as unknown as Element['scrollTo']
  scrollToIndex.mockClear()
  handle.scrollOffset = 0
  resetScrollAnchorsForTests()
  window.localStorage.clear()
  resetPendingQuestionsForTests()
  useBoardStore.getState().hydrate(defaultBoard())
  useComposerStore.setState({ sessionKey: 'draft', text: '', attachments: [], draftsBySession: {} })
})
afterEach(cleanup)

function engineWithTurns(count: number) {
  const engine = engineFixture({ sessions: [sessionFixture('ses_a', 'Backend API', 'proj_a')], activeSession: 'ses_a' })
  const { dispatch } = engine.runtime.getState()
  for (let index = 0; index < count; index += 1) {
    const turnId = `t${index}`
    dispatch(event('turn.started', { turn_id: turnId, session_id: 'ses_a', occurred_at: NOW + index * 1_000, message: `pregunta ${index}` }))
    dispatch(event('model.content.completed', { turn_id: turnId, session_id: 'ses_a', model_call_id: `m${index}`, output_kind: 'final', content: `respuesta ${index}`, activity_seq: 1 }))
    dispatch(event('turn.completed', { turn_id: turnId, session_id: 'ses_a', occurred_at: NOW + index * 1_000 + 500 }))
  }
  return engine
}

function scroller(): HTMLElement {
  return document.querySelector('.overflow-y-auto') as HTMLElement
}

/** Simula una posición de scroll: 10 filas de 100 px en un viewport de 300 px. */
function scrollTo(top: number) {
  const el = scroller()
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 1_000 })
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: 300 })
  Object.defineProperty(el, 'scrollTop', { configurable: true, writable: true, value: top })
  handle.scrollOffset = top
  fireEvent.scroll(el)
}

it('UX-06: collapsing while reading mid-history restores the same row and offset, not the end', () => {
  const engine = engineWithTurns(10)
  const first = render(<BoardHarness engine={engine}><SingleSessionView onOpenProviders={() => {}} /></BoardHarness>)
  expect(screen.getByText('respuesta 9')).toBeTruthy()
  // El usuario sube a la mitad del historial: fila 4, 30 px dentro de ella.
  scrollTo(430)
  first.unmount()
  expect(readScrollAnchor('ses_a')).toEqual({ follow: false, rowId: 'timeline:t4', offset: 30 })

  scrollToIndex.mockClear()
  render(<BoardHarness engine={engine}><SingleSessionView onOpenProviders={() => {}} /></BoardHarness>)
  expect(scrollToIndex).toHaveBeenCalledWith(4, { align: 'start', offset: 30 })
  expect(scrollToIndex).not.toHaveBeenCalledWith(9, expect.anything())
  expect(screen.getByRole('button', { name: /final|bottom/i })).toBeTruthy()
})

it('UX-06: a reader who was at the end keeps following the end after remounting', () => {
  const engine = engineWithTurns(10)
  const first = render(<BoardHarness engine={engine}><SingleSessionView onOpenProviders={() => {}} /></BoardHarness>)
  scrollTo(700)
  first.unmount()
  expect(readScrollAnchor('ses_a')).toEqual({ follow: true })

  scrollToIndex.mockClear()
  render(<BoardHarness engine={engine}><SingleSessionView onOpenProviders={() => {}} /></BoardHarness>)
  expect(scrollToIndex).not.toHaveBeenCalledWith(4, expect.anything())
  expect(scrollToIndex).toHaveBeenCalledWith(9, { align: 'end' })
})

it('an anchor whose row no longer exists falls back to the end once the transcript is loaded', () => {
  const engine = engineWithTurns(10)
  const first = render(<BoardHarness engine={engine}><SingleSessionView onOpenProviders={() => {}} /></BoardHarness>)
  scrollTo(430)
  first.unmount()

  const rebuilt = engineWithTurns(3)
  scrollToIndex.mockClear()
  render(<BoardHarness engine={rebuilt}><SingleSessionView onOpenProviders={() => {}} /></BoardHarness>)
  expect(scrollToIndex).not.toHaveBeenCalledWith(4, expect.anything())
  expect(scrollToIndex).toHaveBeenCalledWith(2, { align: 'end' })
})
