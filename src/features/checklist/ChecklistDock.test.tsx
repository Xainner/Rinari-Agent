// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { engineApi } from '../../services/engine'
import type { Checklist, ChecklistItem } from '../../types/protocol.generated'
import { ChecklistDock } from './ChecklistDock'
import { applyChecklistEvent, useChecklistStore } from './checklistStore'

function list(state: Checklist['state'], items: ChecklistItem[], revision = 1): Checklist {
  const counts = { pending: 0, in_progress: 0, completed: 0, blocked: 0, total: items.length }
  for (const item of items) counts[item.status] += 1
  return { session_id: 's1', turn_id: 't1', revision, state, items, explanation: '', counts, updated_at: '' }
}

const steps = (...statuses: ChecklistItem['status'][]): ChecklistItem[] =>
  statuses.map((status, i) => ({ id: `s${i + 1}`, content: `Paso ${i + 1}`, status }))

function mount() {
  return render(<I18nProvider lang="es"><ChecklistDock sessionId="s1" /></I18nProvider>)
}

beforeEach(() => {
  useChecklistStore.setState({ bySession: {}, expanded: {} })
  vi.spyOn(engineApi, 'sessionChecklist').mockResolvedValue({ checklist: null })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('checklist store', () => {
  it('never lets an older revision come back, even after a clear', () => {
    const store = useChecklistStore.getState()
    store.apply('s1', list('active', steps('pending'), 3), true)
    store.apply('s1', list('active', steps('completed'), 2), true)
    expect(useChecklistStore.getState().bySession.s1.checklist?.revision).toBe(3)
    store.apply('s1', { ...list('cleared', [], 4) }, true)
    expect(useChecklistStore.getState().bySession.s1.checklist).toBeNull()
    store.apply('s1', list('active', steps('pending'), 3), true)
    expect(useChecklistStore.getState().bySession.s1.checklist).toBeNull()
  })

  it('ignores malformed events', () => {
    applyChecklistEvent({ session_id: 's1' })
    applyChecklistEvent(null)
    expect(useChecklistStore.getState().bySession).toEqual({})
  })
})

describe('ChecklistDock', () => {
  it('shows nothing for a conversation without a list', async () => {
    mount()
    await waitFor(() => expect(engineApi.sessionChecklist).toHaveBeenCalledWith('s1'))
    expect(screen.queryByTestId('checklist-dock')).toBeNull()
  })

  it('collapsed: progress and the step in progress; expanded: every step', async () => {
    const items = steps('completed', 'in_progress', 'pending')
    items[1].active_form = 'Escribiendo las pruebas'
    mount()
    act(() => applyChecklistEvent({ session_id: 's1', checklist: list('active', items) }))
    const dock = await screen.findByTestId('checklist-dock')
    expect(dock.getAttribute('data-state')).toBe('active')
    expect(dock.textContent).toContain('1/3')
    expect(dock.textContent).toContain('Escribiendo las pruebas')
    expect(screen.queryByRole('button', { name: 'Quitar la lista' })).toBeNull()
    const toggle = screen.getByRole('button', { expanded: false })
    await userEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const rows = dock.querySelectorAll('.checklist-item')
    expect([...rows].map((row) => row.getAttribute('data-status'))).toEqual(['completed', 'in_progress', 'pending'])
    expect(rows[0].textContent).toContain('Hecho')
  })

  it('says honestly when the work was interrupted, and can be dismissed', async () => {
    const clear = vi.spyOn(engineApi, 'clearSessionChecklist').mockResolvedValue({ checklist: { ...list('cleared', [], 3) } })
    vi.mocked(engineApi.sessionChecklist).mockResolvedValue({ checklist: list('interrupted', steps('completed', 'pending', 'pending'), 2) })
    mount()
    const dock = await screen.findByTestId('checklist-dock')
    expect(dock.textContent).toContain('Interrumpida: quedaron 2 pasos')
    await userEvent.click(screen.getByRole('button', { name: 'Quitar la lista' }))
    expect(clear).toHaveBeenCalledWith('s1')
    await waitFor(() => expect(screen.queryByTestId('checklist-dock')).toBeNull())
  })

  it('animates only what it sees change, not a list already there', async () => {
    vi.mocked(engineApi.sessionChecklist).mockResolvedValue({ checklist: list('active', steps('in_progress', 'pending'), 1) })
    mount()
    const dock = await screen.findByTestId('checklist-dock')
    expect(dock.classList.contains('is-live')).toBe(false)
    expect(dock.querySelector('.is-new, .just-done')).toBeNull()
    act(() => applyChecklistEvent({ session_id: 's1', checklist: list('active', [...steps('completed', 'in_progress'), { id: 's3', content: 'Nuevo', status: 'pending' }], 2) }))
    await waitFor(() => expect(dock.querySelector('.just-done')?.getAttribute('data-status')).toBe('completed'))
    expect(dock.querySelector('.is-new')?.textContent).toContain('Nuevo')
  })

  it('a completed list reads as done', async () => {
    vi.mocked(engineApi.sessionChecklist).mockResolvedValue({ checklist: list('completed', steps('completed', 'completed')) })
    mount()
    expect((await screen.findByTestId('checklist-dock')).textContent).toContain('Todo hecho')
  })
})
