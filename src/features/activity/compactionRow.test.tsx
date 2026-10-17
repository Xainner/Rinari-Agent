// @vitest-environment jsdom
// La compactación del contexto como una acción más (#28): su fila, la barrita
// de tokens y, abierta, las comprobaciones en chips.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import TurnTimelineView from './TurnTimelineView'
import { useActivityDisclosure } from '../../stores/activityDisclosure'
import { createInitialTimelineState, engineEventAction, turnTimelineReducer } from './turnTimelineReducer'

const NOW = 1_700_000_000_000
const ids = { turn_id: 't1', session_id: 's1' }
const event = (name: string, payload: Record<string, unknown>) => engineEventAction({ type: 'event', event: name, payload }, NOW)!

afterEach(() => { cleanup(); useActivityDisclosure.getState().reset() })

function timeline(compact: Record<string, unknown>, done = false) {
  let state = turnTimelineReducer(createInitialTimelineState(), event('turn.started', { ...ids, message: 'Sigue' }))
  state = turnTimelineReducer(state, event('governor.compact', { ...ids, compaction_id: 'c1', reason: 'automatic', activity_seq: 1, ...compact }))
  if (done) state = turnTimelineReducer(state, event('turn.completed', ids))
  return state.timelines.t1
}

function view(turn: ReturnType<typeof timeline>) {
  return render(<I18nProvider lang="es"><TurnTimelineView timeline={turn} now={NOW} onResolveApproval={vi.fn()} /></I18nProvider>)
}

describe('compaction row', () => {
  it('while compacting: the row, the tokens it starts from and a full bar', () => {
    view(timeline({ status: 'running', used_tokens: 116_000 }))
    const row = screen.getByTestId('compaction-row')
    expect(row.getAttribute('data-tone')).toBe('running')
    expect(row.textContent).toContain('Compactando ·')
    expect(row.querySelector('.compact-bar[data-running]')).toBeTruthy()
  })

  it('done: the figures, the reduction and the checks as chips when opened', () => {
    view(timeline({ status: 'completed', used_tokens: 116_000, after_tokens: 19_000, duration_ms: 176_000, window_tokens: 192_000, checks: { structure: 'passed', records: 'passed', reduction: 'repaired' } }, true))
    // The finished turn folds its activity; the row is inside.
    fireEvent.click(screen.getByRole('button', { name: 'Ver actividad del turno' }))
    const row = screen.getByTestId('compaction-row')
    expect(row.getAttribute('data-tone')).toBe('done')
    expect(row.textContent).toContain('Contexto compactado')
    expect(row.textContent).toContain('−84 %')
    // Opened: the checks as chips with their tone.
    fireEvent.click(row.querySelector('summary')!)
    expect([...row.querySelectorAll('.compaction-checks > li')].map((chip) => chip.getAttribute('data-tone'))).toEqual(['success', 'success', 'warning'])
  })

  it('failed: amber or red, with «Compactar y continuar»', () => {
    view(timeline({ status: 'failed', error: 'No text.' }))
    const row = screen.getByTestId('compaction-row')
    expect(row.getAttribute('data-tone')).toBe('failed')
    expect(within(row).getByRole('button', { name: 'Compactar y continuar' })).toBeTruthy()
  })
})
