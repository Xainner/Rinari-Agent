// @vitest-environment jsdom
// Doc 01 §4.4 / UX-10: un resultado se marca leído solo cuando su cuerpo real
// está en pantalla con la ventana atendida y sin modal; nunca por enfocar la
// sesión, cambiar de vista o mostrar una tarjeta resumida.
import { installMockPlatform } from '../../test/mockPlatform'
installMockPlatform()
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'


import { I18nProvider } from '../../i18n'
import { useBoardAttentionStore } from '../../stores/boardAttention'
import TurnResult from '../activity/TurnResult'
import type { TurnTimeline } from '../activity/types'
import { refreshWindowAttentionForTests } from '../../hooks/useWindowAttention'
import {
  RESULT_READ_DWELL_MS,
  RESULT_READ_MIN_VISIBLE_PX,
  ReadTrackingContext,
  isResultBodyVisible,
} from './useResultVisibility'

type Callback = (entries: IntersectionObserverEntry[]) => void
const observers: Array<{ element: Element; callback: Callback }> = []

class IntersectionObserverStub {
  constructor(private readonly callback: Callback) {}
  observe(element: Element) { observers.push({ element, callback: this.callback }) }
  unobserve() {}
  disconnect() { observers.length = 0 }
}

function entry(partial: { ratio: number; height: number; visibleHeight: number }): IntersectionObserverEntry {
  return {
    isIntersecting: partial.visibleHeight > 0,
    intersectionRatio: partial.ratio,
    boundingClientRect: { height: partial.height } as DOMRectReadOnly,
    intersectionRect: { height: partial.visibleHeight } as DOMRectReadOnly,
  } as IntersectionObserverEntry
}

const timeline: TurnTimeline = {
  turnId: 't1', sessionId: 'ses_a', status: 'completed', startedAt: 1_000, completedAt: 2_000, userMessage: 'hola',
  items: [{ id: 'model:m1', type: 'model', activitySeq: 1, occurredAt: 1_500, modelCallId: 'm1', status: 'completed', content: 'Respuesta larga', outputKind: 'final' }],
}

beforeEach(() => {
  vi.useFakeTimers()
  observers.length = 0
  ;(window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IntersectionObserverStub
  Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true })
  refreshWindowAttentionForTests()
  window.localStorage.clear()
  useBoardAttentionStore.getState().hydrate({})
  useBoardAttentionStore.getState().initializeSessionAttention('ses_a', [])
  useBoardAttentionStore.getState().observeTerminal('ses_a', 't1', 'completed', 'live')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const receipt = () => useBoardAttentionStore.getState().sessions.ses_a?.turns.t1?.state

function mount(visible = true) {
  return render(
    <I18nProvider lang="es">
      <ReadTrackingContext.Provider value={{ sessionId: 'ses_a', visible }}>
        <TurnResult timeline={timeline} />
      </ReadTrackingContext.Provider>
    </I18nProvider>,
  )
}

function intersect(target: Element, partial: { ratio: number; height: number; visibleHeight: number }) {
  for (const observer of observers) if (observer.element === target) act(() => observer.callback([entry(partial)]))
}

it('isResultBodyVisible: half of the body, or a real slice of a tall one; never a 1px sliver', () => {
  expect(isResultBodyVisible(entry({ ratio: 0.6, height: 200, visibleHeight: 120 }))).toBe(true)
  expect(isResultBodyVisible(entry({ ratio: 0.1, height: 2_000, visibleHeight: RESULT_READ_MIN_VISIBLE_PX }))).toBe(true)
  expect(isResultBodyVisible(entry({ ratio: 0.0005, height: 2_000, visibleHeight: 1 }))).toBe(false)
  expect(isResultBodyVisible(entry({ ratio: 0.3, height: 200, visibleHeight: 60 }))).toBe(false)
  expect(isResultBodyVisible(entry({ ratio: 0, height: 200, visibleHeight: 0 }))).toBe(false)
})

it('observes the result body itself, and a 1px sliver of it does not count as read', () => {
  const view = mount()
  const body = view.getByTestId('turn-result')
  expect(observers.map((observer) => observer.element)).toEqual([body])
  intersect(body, { ratio: 0.0005, height: 2_000, visibleHeight: 1 })
  act(() => { vi.advanceTimersByTime(RESULT_READ_DWELL_MS * 2) })
  expect(receipt()).toBe('unread')
})

it('marks read after the dwell once a real slice of the body is on screen, and cancels if it leaves', () => {
  const view = mount()
  const body = view.getByTestId('turn-result')
  intersect(body, { ratio: 0.1, height: 2_000, visibleHeight: 300 })
  act(() => { vi.advanceTimersByTime(RESULT_READ_DWELL_MS - 50) })
  intersect(body, { ratio: 0, height: 2_000, visibleHeight: 0 })
  act(() => { vi.advanceTimersByTime(RESULT_READ_DWELL_MS) })
  expect(receipt()).toBe('unread')
  intersect(body, { ratio: 0.8, height: 400, visibleHeight: 320 })
  act(() => { vi.advanceTimersByTime(RESULT_READ_DWELL_MS) })
  expect(receipt()).toBe('seen')
})

it('does not mark read while a modal covers the surface or the surface is not the visible one', () => {
  const dialog = document.createElement('div')
  dialog.setAttribute('role', 'alertdialog')
  document.body.appendChild(dialog)
  const view = mount()
  const body = view.getByTestId('turn-result')
  intersect(body, { ratio: 1, height: 200, visibleHeight: 200 })
  act(() => { vi.advanceTimersByTime(RESULT_READ_DWELL_MS * 2) })
  expect(receipt()).toBe('unread')
  dialog.remove()
  view.unmount()
  observers.length = 0

  // Collapsed pane / background session: nothing is observed at all.
  mount(false)
  expect(observers).toHaveLength(0)
  expect(receipt()).toBe('unread')
})

it('UX-10: focusing the session or re-rendering the surface does not clear the badge by itself', () => {
  const view = mount()
  const body = view.getByTestId('turn-result')
  body.dispatchEvent(new FocusEvent('focus'))
  view.rerender(
    <I18nProvider lang="es">
      <ReadTrackingContext.Provider value={{ sessionId: 'ses_a', visible: true }}>
        <TurnResult timeline={timeline} />
      </ReadTrackingContext.Provider>
    </I18nProvider>,
  )
  act(() => { vi.advanceTimersByTime(RESULT_READ_DWELL_MS * 2) })
  expect(receipt()).toBe('unread')
})
