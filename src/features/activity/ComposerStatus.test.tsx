// @vitest-environment jsdom
// Plan C: the status at the top of the composer opens when a turn starts,
// closes when it ends, starts still when the view mounts on a running turn,
// and shares its bar with the list of steps.
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { engineApi } from '../../services/engine'
import type { Checklist } from '../../types/protocol.generated'
import { BoardHarness, engineFixture } from '../board/testUtils'
import { useChecklistStore } from '../checklist/checklistStore'
import { ComposerStatus } from './ComposerStatus'
import { engineEventAction } from './turnTimelineReducer'

const NOW = 1_000
const event = (name: string, payload: Record<string, unknown>) => engineEventAction({ type: 'event', event: name, payload }, NOW)!
const status = () => document.querySelector<HTMLElement>('[data-testid="composer-status"]')
const start = (engine: ReturnType<typeof engineFixture>, turn = 't1') =>
  act(() => engine.runtime.getState().dispatch(event('turn.started', { turn_id: turn, session_id: 's1', occurred_at: NOW, message: 'hola' })))
const finish = (engine: ReturnType<typeof engineFixture>, turn = 't1') =>
  act(() => engine.runtime.getState().dispatch(event('turn.completed', { turn_id: turn, session_id: 's1', occurred_at: NOW + 5_000 })))
const list: Checklist = {
  session_id: 's1', turn_id: 't1', revision: 1, state: 'active', explanation: '', updated_at: '',
  counts: { pending: 1, in_progress: 1, completed: 0, blocked: 0, total: 2 },
  items: [{ id: 'a', content: 'Leer', status: 'in_progress', active_form: 'Leyendo' }, { id: 'b', content: 'Escribir', status: 'pending' }],
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] })
  useChecklistStore.setState({ bySession: {}, expanded: {} })
  vi.spyOn(engineApi, 'sessionChecklist').mockResolvedValue({ checklist: null })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

const mount = (engine: ReturnType<typeof engineFixture>) => render(<BoardHarness engine={engine}><ComposerStatus sessionId="s1" /></BoardHarness>)

it('shows nothing without a turn or a list', () => {
  mount(engineFixture())
  expect(status()).toBeNull()
})

it('opens when a turn starts and closes, folding its pinned height, when it ends', () => {
  const engine = engineFixture()
  mount(engine)
  start(engine)
  expect(status()!.dataset.phase).toBe('opening')
  act(() => { vi.advanceTimersByTime(300) })
  expect(['open', 'settled']).toContain(status()!.dataset.phase)
  act(() => { vi.advanceTimersByTime(300) })
  expect(status()!.dataset.phase).toBe('settled')
  expect(screen.getByRole('status').textContent).toBe('Pensando…')
  finish(engine)
  expect(status()!.dataset.phase).toBe('closing')
  // While it folds it keeps what it said, instead of going blank.
  expect(status()!.querySelector('[data-live-activity]')).not.toBeNull()
  act(() => { vi.advanceTimersByTime(300) })
  expect(status()).toBeNull()
})

it('starts still when the view mounts on a running turn', () => {
  const engine = engineFixture()
  act(() => engine.runtime.getState().dispatch(event('turn.started', { turn_id: 't1', session_id: 's1', occurred_at: NOW, message: 'hola' })))
  mount(engine)
  expect(status()!.dataset.phase).toBe('settled')
})

it('shares its bar with the list: the live line while the turn runs, the list after', () => {
  const engine = engineFixture()
  mount(engine)
  start(engine)
  act(() => useChecklistStore.getState().apply('s1', list, true))
  act(() => { vi.advanceTimersByTime(300) })
  act(() => { vi.advanceTimersByTime(300) })
  const dock = screen.getByTestId('checklist-dock')
  expect(dock.dataset.mode).toBe('live')
  expect(dock.querySelector('.turn-line-count')!.textContent).toBe('1/2')
  expect(screen.getByRole('status').textContent).toBe('Leyendo')
  // While it works the list cannot be dismissed or completed by hand.
  expect(screen.queryByRole('button', { name: 'Quitar la lista' })).toBeNull()
  act(() => useChecklistStore.getState().apply('s1', { ...list, revision: 2, state: 'open' }, true))
  finish(engine)
  expect(status()!.dataset.phase).toBe('settled')
  expect(screen.getByTestId('checklist-dock').dataset.mode).toBe('list')
  expect(screen.getByTestId('checklist-dock').querySelector('.checklist-bar-content')!.classList.contains('is-swapped')).toBe(true)
  expect(screen.getByRole('button', { name: 'Quitar la lista' })).toBeTruthy()
})
