// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { engineApi, type SessionSummary } from '../../services/engine'
import type { FollowupSuggestion } from '../../types/protocol.generated'
import { StickyNote } from './StickyNote'
import { applyFollowupEvent, useFollowupStore } from './followupStore'

function note(id: string, overrides: Partial<FollowupSuggestion> = {}): FollowupSuggestion {
  return {
    id, session_id: 's1', turn_id: 't1', project_id: null, title: `Idea ${id}`,
    prompt: 'Escribe pruebas para el parser y comprueba que pasan', rationale: '', status: 'pending',
    external_content: false, sources: [], accepted_session_id: null, created_at: '', resolved_at: null,
    ...overrides,
  }
}

function mount(compact = false) {
  return render(<I18nProvider lang="es"><div style={{ width: 1400 }}><StickyNote sessionId="s1" compact={compact} /></div></I18nProvider>)
}

beforeEach(() => {
  useFollowupStore.setState({ bySession: {}, loaded: {}, live: {} })
  vi.spyOn(engineApi, 'followupList').mockResolvedValue({ suggestions: [] })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('followup store', () => {
  it('keeps only pending notes and ignores malformed events', () => {
    applyFollowupEvent('followup.suggested', { suggestion: note('a') })
    applyFollowupEvent('followup.suggested', { suggestion: note('b') })
    expect(useFollowupStore.getState().bySession.s1.map((n) => n.id)).toEqual(['b', 'a'])
    applyFollowupEvent('followup.resolved', { suggestion: note('b', { status: 'superseded' }) })
    expect(useFollowupStore.getState().bySession.s1.map((n) => n.id)).toEqual(['a'])
    applyFollowupEvent('followup.suggested', {})
    applyFollowupEvent('turn.completed', { suggestion: note('c') })
    expect(useFollowupStore.getState().bySession.s1).toHaveLength(1)
  })
})

describe('StickyNote', () => {
  it('shows nothing without notes', async () => {
    mount()
    await waitFor(() => expect(engineApi.followupList).toHaveBeenCalledWith({ sessionId: 's1' }))
    expect(screen.queryByTestId('followup-note')).toBeNull()
  })

  it('a note that arrives shows without starting anything, with how many wait', async () => {
    const accept = vi.spyOn(engineApi, 'followupAccept')
    mount()
    act(() => {
      applyFollowupEvent('followup.suggested', { suggestion: note('a') })
      applyFollowupEvent('followup.suggested', { suggestion: note('b', { external_content: true }) })
    })
    const card = await screen.findByTestId('followup-note')
    expect(card.classList.contains('is-arriving')).toBe(true)
    expect(card.textContent).toContain('Idea b')
    expect(card.textContent).toContain('+1')
    expect(card.textContent).toContain('contenido de internet')
    expect(accept).not.toHaveBeenCalled()
  })

  it('accepting opens another conversation; the next note takes its place', async () => {
    useFollowupStore.getState().setPending('s1', [note('b'), note('a')])
    const accept = vi.spyOn(engineApi, 'followupAccept').mockResolvedValue({
      suggestion: note('b', { status: 'accepted' }),
      session: { id: 'new', title: 'Idea b' } as SessionSummary,
      turn: { turn_id: 'tn' },
      already_accepted: false,
    })
    mount()
    const card = await screen.findByTestId('followup-note')
    expect(card.classList.contains('is-arriving')).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: /Hacer en otra conversación/ }))
    expect(accept).toHaveBeenCalledWith('b')
    await waitFor(() => expect(screen.getByTestId('followup-note').textContent).toContain('Idea a'))
  })

  it('dismissing peels it away', async () => {
    useFollowupStore.getState().setPending('s1', [note('a')])
    const dismiss = vi.spyOn(engineApi, 'followupDismiss').mockResolvedValue({ suggestion: note('a', { status: 'dismissed' }) })
    mount()
    await screen.findByTestId('followup-note')
    await userEvent.click(screen.getByRole('button', { name: 'Descartar la nota' }))
    expect(dismiss).toHaveBeenCalledWith('a')
    await waitFor(() => expect(screen.queryByTestId('followup-note')).toBeNull())
  })

  it('in a Boards pane it waits as a chip and opens on demand', async () => {
    useFollowupStore.getState().setPending('s1', [note('a')])
    mount(true)
    const chip = await screen.findByTestId('followup-chip')
    expect(screen.queryByTestId('followup-note')).toBeNull()
    await userEvent.click(chip)
    expect(await screen.findByTestId('followup-note')).toBeTruthy()
  })
})
