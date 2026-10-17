// @vitest-environment jsdom
import { installMockPlatform } from '../../test/mockPlatform'
const { invoke } = installMockPlatform()
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { unifiedDiff } from '../../lib/lineDiff'
import { createInitialTimelineState, engineEventAction, turnTimelineReducer } from '../activity/turnTimelineReducer'
import type { InstructionsTimelineItem } from '../activity/types'
import { InstructionsProposalCard } from './InstructionsProposalCard'

const NOW = 1_000
const event = (name: string, payload: Record<string, unknown>) => engineEventAction({ type: 'event', event: name, payload }, NOW)!

describe('unifiedDiff (#81)', () => {
  it('marks what changed with context', () => {
    const diff = unifiedDiff('# A\nuno\ndos\n', '# A\nuno\ntres\n')
    expect(diff).toContain('--- a/RINARI.md')
    expect(diff).toContain('-dos')
    expect(diff).toContain('+tres')
    expect(diff).toContain(' uno')
  })
  it('is empty when nothing changed', () => {
    expect(unifiedDiff('x\n', 'x\n')).toBe('')
  })
})

describe('timeline: the /init proposal (#81)', () => {
  const proposed = { session_id: 's1', turn_id: 't1', activity_seq: 4, proposal_id: 'call_1', path: '/p/RINARI.md', content: '# P\n', previous: null, summary: 'Un resumen', reuses: ['AGENTS.md'] }

  it('becomes a card item and takes its resolution', () => {
    let state = turnTimelineReducer(createInitialTimelineState(), event('instructions.proposed', proposed))
    const item = state.timelines.t1.items.find((entry) => entry.type === 'instructions') as InstructionsTimelineItem
    expect(item).toMatchObject({ proposalId: 'call_1', status: 'pending', previous: null, reuses: ['AGENTS.md'] })
    state = turnTimelineReducer(state, event('instructions.proposal.resolved', { session_id: 's1', turn_id: 't1', proposal_id: 'call_1', status: 'saved' }))
    expect((state.timelines.t1.items.find((entry) => entry.type === 'instructions') as InstructionsTimelineItem).status).toBe('saved')
    // A repeated proposal (reload) does not undo the resolution.
    state = turnTimelineReducer(state, event('instructions.proposed', proposed))
    expect((state.timelines.t1.items.find((entry) => entry.type === 'instructions') as InstructionsTimelineItem).status).toBe('saved')
  })

  it('a resolution for a turn this window did not load creates nothing', () => {
    const state = turnTimelineReducer(createInitialTimelineState(), event('instructions.proposal.resolved', { session_id: 's1', turn_id: 'other', proposal_id: 'x', status: 'saved' }))
    expect(state.timelines.other).toBeUndefined()
  })
})

describe('InstructionsProposalCard (#81)', () => {
  const item: InstructionsTimelineItem = { id: 'instructions:call_1', type: 'instructions', activitySeq: 1, occurredAt: 0, proposalId: 'call_1', path: '/p/RINARI.md', content: '# Nuevo\n\nDetalle\n', previous: '# Viejo\n', summary: 'Resumen', reuses: [], status: 'pending' }

  beforeEach(() => {
    vi.mocked(invoke).mockReset()
    vi.mocked(invoke).mockImplementation(async (_name: string, args: Record<string, unknown> = {}) => ({ proposal_id: 'call_1', status: args.decision === 'save' ? 'saved' : 'discarded', path: '/p/RINARI.md' }))
  })
  afterEach(cleanup)

  const mount = (value = item) => render(<I18nProvider lang="es"><InstructionsProposalCard item={value} sessionId="s1" /></I18nProvider>)

  it('an update shows the changes first, and «Guardar» saves it as proposed', async () => {
    mount()
    expect(screen.getByText('Actualización de RINARI.md')).toBeTruthy()
    expect(screen.getByTestId('instructions-proposal-body').textContent).toContain('# Nuevo')
    await userEvent.click(screen.getByTestId('instructions-proposal-save'))
    await waitFor(() => expect(screen.getByTestId('instructions-proposal-outcome').textContent).toContain('Guardado'))
    expect(vi.mocked(invoke).mock.calls[0]).toEqual(['project_instructions_resolve', { sessionId: 's1', proposalId: 'call_1', decision: 'save', content: null }])
  })

  it('«Editar» saves the owner text', async () => {
    mount({ ...item, previous: null })
    expect(screen.getByText('Propuesta de RINARI.md')).toBeTruthy()
    await userEvent.click(screen.getByTestId('instructions-proposal-edit'))
    const editor = screen.getByTestId('instructions-proposal-editor')
    await userEvent.clear(editor)
    await userEvent.type(editor, '# Mío')
    await userEvent.click(screen.getByTestId('instructions-proposal-save-edited'))
    await waitFor(() => expect(screen.getByTestId('instructions-proposal-outcome')).toBeTruthy())
    expect(vi.mocked(invoke).mock.calls[0][1]).toMatchObject({ decision: 'save', content: '# Mío' })
  })

  it('«Descartar» writes nothing and says so', async () => {
    mount()
    await userEvent.click(screen.getByTestId('instructions-proposal-discard'))
    await waitFor(() => expect(screen.getByTestId('instructions-proposal-outcome').textContent).toContain('no se escribió nada'))
    expect(vi.mocked(invoke).mock.calls[0][1]).toMatchObject({ decision: 'discard' })
  })
})
