// @vitest-environment jsdom
// Plan 0.4.0 #62: un resultado que terminó mientras no estabas lleva la marca
// «Nuevo · terminó hace…» hasta leerse; luego se apaga en unos segundos (al
// instante con movimiento reducido). Uno ya leído al montarse no se marca.
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { useBoardAttentionStore, type TurnReadReceipt } from '../../stores/boardAttention'
import { ReadTrackingContext } from '../board/useResultVisibility'
import { RETURN_FADE_MS, ReturnPill, useReturnMark } from './ReturnMark'

const NOW = Date.UTC(2026, 9, 16, 12, 0, 0)

function Probe({ calm = false }: { calm?: boolean }) {
  const mark = useReturnMark('t1', calm)
  return <div data-testid="probe" data-return={mark.state ?? 'none'}>{mark.state && <ReturnPill outcome={mark.outcome} completedAt={mark.completedAt} />}</div>
}

function receipt(patch: Partial<TurnReadReceipt>) {
  act(() => {
    useBoardAttentionStore.setState((state) => ({
      sessions: { ...state.sessions, s1: { ...(state.sessions.s1 ?? { initialized: true, unreadPeerMessageIds: [] }), turns: { t1: { turnId: 't1', state: 'unread', outcome: 'completed', completedAt: NOW - 4 * 60_000, away: true, ...patch } } } as never },
    }))
  })
}

const mount = (calm = false) => render(
  <I18nProvider lang="es"><ReadTrackingContext.Provider value={{ sessionId: 's1', visible: true }}><Probe calm={calm} /></ReadTrackingContext.Provider></I18nProvider>,
)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(NOW)
  useBoardAttentionStore.setState({ sessions: {} })
})
afterEach(() => { cleanup(); vi.useRealTimers() })

it('marca «Nuevo · terminó hace 4 minutos» y, al leerse, se apaga en unos segundos', () => {
  receipt({})
  mount()
  expect(screen.getByTestId('probe').dataset.return).toBe('unread')
  expect(screen.getByTestId('turn-return').textContent).toBe('Nuevoterminó hace 4 minutos')
  receipt({ state: 'seen' })
  expect(screen.getByTestId('probe').dataset.return).toBe('fading')
  act(() => { vi.advanceTimersByTime(RETURN_FADE_MS) })
  expect(screen.getByTestId('probe').dataset.return).toBe('none')
})

it('un fallo dice «Falló» con su tono', () => {
  receipt({ outcome: 'failed' })
  mount()
  const pill = screen.getByTestId('turn-return')
  expect(pill.dataset.tone).toBe('danger')
  expect(pill.textContent).toContain('Falló')
})

it('con movimiento reducido se quita al leerse, sin apagarse poco a poco', () => {
  receipt({})
  mount(true)
  receipt({ state: 'seen' })
  expect(screen.getByTestId('probe').dataset.return).toBe('none')
})

it('ya leído, o sin haber estado fuera, no lleva marca', () => {
  receipt({ state: 'seen' })
  mount()
  expect(screen.getByTestId('probe').dataset.return).toBe('none')
  cleanup()
  receipt({ away: undefined })
  mount()
  expect(screen.getByTestId('probe').dataset.return).toBe('none')
})
