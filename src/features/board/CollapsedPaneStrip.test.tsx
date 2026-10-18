// @vitest-environment jsdom
import { installMockPlatform } from '../../test/mockPlatform'
installMockPlatform()
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { useChecklistStore } from '../checklist/checklistStore'
import type { TurnTimeline } from '../activity/types'
import type { PaneSession } from './usePaneSession'
import type { BoardPane } from '../../stores/board'
import CollapsedPaneStrip, { COLUMN_WIDTH } from './CollapsedPaneStrip'
import { collapsedVariantFor } from './BoardView'
import { PEEK_OPEN_DELAY_MS } from './PanePeek'

const running: TurnTimeline = {
  turnId: 't2', sessionId: 'ses_a', status: 'running', startedAt: Date.now() - 4_000, userMessage: 'Migra los pagos',
  items: [{ id: 'tool:a', type: 'tool', activitySeq: 1, occurredAt: Date.now() - 1_000, toolCallId: 'a', tool: 'shell.exec', status: 'running' }],
}
const finished: TurnTimeline = {
  turnId: 't1', sessionId: 'ses_a', status: 'completed', startedAt: 1_000, completedAt: 2_000, userMessage: 'Hola',
  items: [{ id: 'model:m1', type: 'model', activitySeq: 1, occurredAt: 2_000, modelCallId: 'm1', status: 'completed', content: '## Listo\nMigré los webhooks a la versión 3.', outputKind: 'final' }],
}

function session(patch: Partial<PaneSession> = {}): PaneSession {
  return {
    sessionId: 'ses_a',
    record: { id: 'ses_a', title: 'Migrar pagos a Stripe v3', model_id: 'main' },
    project: { name: 'pagos' },
    projectRoot: '/repo/pagos',
    activeModel: { alias: 'main', provider: 'local' },
    gitStatus: { status: { branch: 'stripe-v3' } },
    timelines: { t1: finished, t2: running },
    approvals: [],
    pendingQuestions: 0,
    status: { kind: 'working', sessionId: 'ses_a', turnId: 't2', latestTerminalTurnId: 't1', latestOutcome: 'completed', unread: false, unreadResultCount: 0, pendingApprovals: 0, pendingQuestions: 0, availability: 'ready' },
    resolveApproval: vi.fn(),
    markAllSeen: vi.fn(),
    ...patch,
  } as unknown as PaneSession
}

function mount(value: PaneSession, variant: 'column' | 'strip' = 'column', onExpand = vi.fn()) {
  render(
    <I18nProvider lang="es">
      <CollapsedPaneStrip paneId="pane_0" session={value} focused={false} providers={[]} variant={variant} onExpand={onExpand} onOpenSingle={vi.fn()} onRemove={vi.fn()} />
    </I18nProvider>,
  )
  return onExpand
}

beforeEach(() => {
  useChecklistStore.setState({ bySession: {} })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('collapsed pane as a column (plan-boards B.2)', () => {
  it('keeps telling its live state: title, project and branch, steps, the action and the footer', () => {
    useChecklistStore.getState().apply('ses_a', {
      session_id: 'ses_a', turn_id: 't2', revision: 1, state: 'active', explanation: '', updated_at: '',
      counts: { total: 6, completed: 4, in_progress: 1, pending: 1, blocked: 0 },
      items: [
        ...Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, content: `Paso ${i + 1}`, status: 'completed' as const })),
        { id: 's4', content: 'Integrar las ramas', status: 'in_progress' as const },
        { id: 's5', content: 'Probar', status: 'pending' as const },
      ],
    } as never, true)
    mount(session())
    const column = screen.getByRole('region', { name: 'Migrar pagos a Stripe v3' })
    expect(column.dataset.variant).toBe('column')
    expect(column.style.width).toBe(`${COLUMN_WIDTH}px`)
    expect(column.textContent).toContain('pagos · stripe-v3')
    expect(screen.getByTestId('pane-column-steps').textContent).toContain('4/6')
    expect(screen.getByTestId('pane-column-steps').textContent).toContain('Integrar las ramas · Paso 5 de 6')
    expect(screen.getByTestId('pane-column-now').textContent).toBeTruthy()
  })

  it('resolves an approval without unfolding', () => {
    const resolve = vi.fn()
    mount(session({
      approvals: [{ approval_id: 'apr_1', session_id: 'ses_a', turn_id: 't2', capability: 'shell.exec', target: 'npm test', risk: 'medium', description: 'Correr npm test' }],
      status: { kind: 'needs_you', sessionId: 'ses_a', turnId: 't2', latestTerminalTurnId: 't1', latestOutcome: 'completed', unread: false, unreadResultCount: 0, pendingApprovals: 1, pendingQuestions: 0, availability: 'ready' } as never,
      resolveApproval: resolve,
    }))
    expect(screen.getByText('Correr npm test')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Permitir una vez' }))
    expect(resolve).toHaveBeenCalledWith('apr_1', 'allow_once')
  })

  it('a finished session shows its result in one line, marked new while unread', () => {
    mount(session({
      timelines: { t1: finished },
      status: { kind: 'done', sessionId: 'ses_a', turnId: 't1', latestTerminalTurnId: 't1', latestOutcome: 'completed', unread: true, unreadResultCount: 1, pendingApprovals: 0, pendingQuestions: 0, availability: 'ready' } as never,
    }))
    const result = screen.getByTestId('pane-column-result')
    expect(result.textContent).toContain('Listo')
    expect(result.textContent).toContain('Nuevo')
  })

  it('the peek opens after a pause, not when passing by, and Space opens it from the keyboard', () => {
    vi.useFakeTimers()
    const expand = mount(session({ timelines: { t1: finished } }), 'strip')
    const strip = screen.getByRole('region', { name: 'Migrar pagos a Stripe v3' })
    fireEvent.pointerEnter(strip)
    act(() => { vi.advanceTimersByTime(PEEK_OPEN_DELAY_MS - 100) })
    fireEvent.pointerLeave(strip)
    act(() => { vi.advanceTimersByTime(400) })
    expect(screen.queryByTestId('pane-peek')).toBeNull()

    fireEvent.pointerEnter(strip)
    act(() => { vi.advanceTimersByTime(PEEK_OPEN_DELAY_MS + 10) })
    const peek = screen.getByTestId('pane-peek')
    expect(peek.textContent).toContain('Migré los webhooks a la versión 3.')
    fireEvent.click(screen.getByRole('button', { name: 'Ver todo' }))
    expect(expand).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(screen.getByRole('button', { name: 'Expandir «Migrar pagos a Stripe v3»' }), { key: ' ', code: 'Space' })
    expect(screen.getByTestId('pane-peek')).toBeTruthy()
    expect(expand).toHaveBeenCalledTimes(1)
  })
})

describe('column or strip', () => {
  const pane = (id: string, collapsed: boolean, width = 700): BoardPane => ({ paneId: id, sessionId: `ses_${id}`, width, collapsed })
  it('is a column when every collapsed pane fits beside the open ones, a strip otherwise', () => {
    const panes = [pane('a', false), pane('b', true), pane('c', true)]
    expect(collapsedVariantFor(panes, true, 320 + 2 * COLUMN_WIDTH + 132)).toBe('column')
    expect(collapsedVariantFor(panes, true, 320 + 2 * COLUMN_WIDTH + 131)).toBe('strip')
    expect(collapsedVariantFor(panes, false, 700 + 2 * COLUMN_WIDTH + 132)).toBe('column')
    expect(collapsedVariantFor(panes, false, 700 + 2 * COLUMN_WIDTH + 131)).toBe('strip')
    // Not measured yet: the strip, as before.
    expect(collapsedVariantFor(panes, true, 0)).toBe('strip')
  })
})
