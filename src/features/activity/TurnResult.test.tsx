// @vitest-environment jsdom
// Doc 01 §4: una respuesta final canónica, una sola vez, con los mismos
// metadatos en Normal y Boards (UX-03, UX-04, UX-05).
import { installMockPlatform } from '../../test/mockPlatform'
installMockPlatform()
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('../../services/desktop', () => ({
  desktopApi: { questions: vi.fn(async () => ({ questions: [] })), readFile: vi.fn(), answer: vi.fn() },
}))
vi.mock('../workspace/WorkspaceView', () => ({
  default: ({ session }: { session: { id: string } | null }) => <div data-testid={`workspace-${session?.id ?? 'none'}`} />,
}))
// jsdom no mide: el virtualizador no pintaría ninguna fila. Se sustituye por
// un render completo para poder afirmar sobre el contenido del transcript.
vi.mock('virtua', async () => {
  const React = await import('react')
  const Virtualizer = React.forwardRef(function Virtualizer(
    { data, children }: { data: unknown[]; children: (row: never, index: number) => React.ReactNode },
    ref: React.ForwardedRef<{ scrollToIndex: () => void }>,
  ) {
    React.useImperativeHandle(ref, () => ({ scrollToIndex: () => {} }))
    return <>{data.map((row, index) => children(row as never, index))}</>
  })
  return { Virtualizer }
})

import { I18nProvider } from '../../i18n'
import { useBoardStore, defaultBoard } from '../../stores/board'
import { useBoardAttentionStore } from '../../stores/boardAttention'
import { useComposerStore } from '../../stores/composer'
import BoardView from '../board/BoardView'
import { BoardHarness, engineFixture, sessionFixture } from '../board/testUtils'
import { ReadTrackingContext } from '../board/useResultVisibility'
import { resetPendingQuestionsForTests } from '../questions/usePendingQuestions'
import SingleSessionView from '../engine/SingleSessionView'
import { engineEventAction } from './turnTimelineReducer'
import TurnTimelineView from './TurnTimelineView'
import type { TurnTimeline } from './types'

const NOW = 1_700_000_000_000
const event = (name: string, payload: Record<string, unknown>) => engineEventAction({ type: 'event', event: name, payload }, NOW)!

const LONG_MARKDOWN = [
  '# Informe de la migración',
  '',
  'La frase única de este resultado es: zanahoria-cuarenta-y-dos.',
  '',
  '```ts',
  'export const answer = 42',
  '```',
  '',
  'Ver [la referencia](https://example.com/ref) y `inline`.',
  '',
  '- punto uno',
  '- punto dos',
].join('\n')

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  ;(window as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub
  // jsdom no implementa scroll: el virtualizador del chat lo llama al seguir el final.
  Element.prototype.scrollTo = vi.fn() as unknown as Element['scrollTo']
  window.localStorage.clear()
  resetPendingQuestionsForTests()
  useBoardStore.getState().hydrate(defaultBoard())
  useBoardAttentionStore.getState().hydrate({})
  useComposerStore.setState({ sessionKey: 'draft', text: '', attachments: [], draftsBySession: {} })
})
afterEach(cleanup)

const sessions = [sessionFixture('ses_a', 'Backend API', 'proj_a'), sessionFixture('ses_b', 'Docs')]

function completeTurn(engine: ReturnType<typeof engineFixture>, sessionId: string, turnId: string, content: string, extra: Record<string, unknown> = {}) {
  const { dispatch } = engine.runtime.getState()
  dispatch(event('turn.started', { turn_id: turnId, session_id: sessionId, occurred_at: NOW, message: 'haz el informe', ...extra }))
  dispatch(event('model.content.completed', { turn_id: turnId, session_id: sessionId, model_call_id: `m-${turnId}`, output_kind: 'final', content, activity_seq: 1, model: 'gpt-fake' }))
  dispatch(event('turn.completed', { turn_id: turnId, session_id: sessionId, occurred_at: NOW + 15_000 }))
}

function assertCanonical(container: HTMLElement) {
  // One final response, rendered once: the unique sentence appears exactly once.
  expect(container.textContent!.split('zanahoria-cuarenta-y-dos').length - 1).toBe(1)
  expect(within(container).getAllByTestId('turn-result')).toHaveLength(1)
  expect(within(container).queryByTestId('result-summary-card')).toBeNull()
  // Structure survives: heading, code block, link with provenance, list.
  expect(within(container).getByRole('heading', { name: 'Informe de la migración' })).toBeTruthy()
  expect(container.querySelector('pre code, pre')?.textContent).toContain('export const answer = 42')
  expect(within(container).getByRole('link', { name: 'la referencia' }).getAttribute('href')).toBe('https://example.com/ref')
  expect(within(container).getAllByRole('listitem').map((item) => item.textContent)).toEqual(expect.arrayContaining(['punto uno', 'punto dos']))
  // Metadata row once, without repeating the body.
  const meta = within(container).getAllByTestId('turn-meta')
  expect(meta).toHaveLength(1)
  expect(meta[0]!.textContent).toContain('Turno finalizado')
  expect(meta[0]!.textContent).toContain('15s')
  expect(meta[0]!.textContent).toContain('Ejecutado por gpt-fake')
  expect(meta[0]!.textContent).not.toContain('zanahoria')
}

it('UX-03: a long Markdown result renders once and identically in Normal and in a board pane', () => {
  const engine = engineFixture({ sessions, activeSession: 'ses_a' })
  completeTurn(engine, 'ses_a', 't1', LONG_MARKDOWN)
  useBoardAttentionStore.getState().initializeSessionAttention('ses_a', [])
  useBoardAttentionStore.getState().observeTerminal('ses_a', 't1', 'completed', 'live')

  const normal = render(<BoardHarness engine={engine}><SingleSessionView onOpenProviders={() => {}} /></BoardHarness>)
  assertCanonical(normal.container)
  expect(within(normal.container).getByTestId('turn-meta').textContent).toContain('Nuevo')
  normal.unmount()

  useBoardStore.getState().addPane('ses_a')
  render(<BoardHarness engine={engine}><BoardView /></BoardHarness>)
  const pane = screen.getByRole('region', { name: 'Backend API' })
  assertCanonical(pane)
  expect(within(pane).getByTestId('turn-meta').textContent).toContain('Nuevo')
})

it('UX-04: a completed PLAN keeps its plan card after switching the session to BUILD, and implements once', async () => {
  const engine = engineFixture({
    sessions: [sessionFixture('ses_a', 'Backend API', 'proj_a', { mode: 'plan' })],
    activeSession: 'ses_a',
  })
  // Implementing starts a turn: the session becomes busy and the plan is no
  // longer pending, exactly like the real command (setModeFor + sendTo).
  engine.implementPlan = vi.fn(async () => {
    engine.runtime.getState().dispatch({ type: 'busy/set', sessionId: 'ses_a', busy: true })
    return true
  })
  completeTurn(engine, 'ses_a', 't1', '1. Revisar requisitos\n2. Implementar', { mode: 'plan' })
  const view = render(<BoardHarness engine={engine}><SingleSessionView onOpenProviders={() => {}} /></BoardHarness>)
  expect(screen.getByRole('region', { name: 'Plan propuesto' })).toBeTruthy()
  const user = userEvent.setup()
  const implement = screen.getByRole('button', { name: 'Implementar plan' })
  await user.dblClick(implement)
  await act(async () => {})
  expect(engine.implementPlan).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('button', { name: 'Implementar plan' })).toBeNull()

  // The session now runs in BUILD: the historical turn still shows the plan
  // it produced, not a regular reply, and no second implement action appears.
  const build = engineFixture({ ...engine, sessions: [sessionFixture('ses_a', 'Backend API', 'proj_a', { mode: 'build' })], activeSession: 'ses_a' })
  view.rerender(<BoardHarness engine={build}><SingleSessionView onOpenProviders={() => {}} /></BoardHarness>)
  expect(screen.getByRole('region', { name: 'Plan propuesto' })).toBeTruthy()
  expect(screen.getByText('Revisar requisitos')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Implementar plan' })).toBeNull()
})

const base: TurnTimeline = { turnId: 't1', sessionId: 'ses_a', status: 'running', startedAt: 1_000, userMessage: 'arregla el build', items: [] }
const finalItem = { id: 'model:m1', type: 'model' as const, activitySeq: 1, occurredAt: 1_500, modelCallId: 'm1', status: 'completed' as const, content: 'Trabajo parcial conservado', outputKind: 'final' as const }

function terminal(status: TurnTimeline['status'], extra: Partial<TurnTimeline> = {}) {
  return render(
    <I18nProvider lang="es">
      <ReadTrackingContext.Provider value={{ sessionId: 'ses_a', visible: true }}>
        <TurnTimelineView timeline={{ ...base, status, completedAt: 2_000, items: [finalItem], ...extra }} now={2_000} onResolveApproval={vi.fn()} />
      </ReadTrackingContext.Provider>
    </I18nProvider>,
  )
}

it('UX-05: failed, stopped and cancelled keep distinct labels and the previous content', () => {
  const failed = terminal('failed', { error: 'boom', errorDetails: { history_preserved: true, code: 'E1' } })
  expect(failed.getByTestId('turn-meta').textContent).toContain('El turno falló')
  expect(failed.getByRole('alert').textContent).toContain('boom')
  expect(failed.getByText('Trabajo parcial conservado')).toBeTruthy()
  expect(failed.getByText('Diagnóstico de la interrupción')).toBeTruthy()
  expect(failed.container.textContent!.split('boom').length - 1).toBe(1)
  failed.unmount()

  const stopped = terminal('stopped', { stopReason: { code: 'user', message: 'Detenido por el usuario' } })
  expect(stopped.getByTestId('turn-meta').textContent).toContain('Turno detenido')
  expect(stopped.getByTestId('turn-meta').textContent).toContain('Detenido por el usuario')
  expect(stopped.getByText('Trabajo parcial conservado')).toBeTruthy()
  expect(stopped.queryByRole('alert')).toBeNull()
  stopped.unmount()

  const cancelled = terminal('cancelled')
  expect(cancelled.getByTestId('turn-meta').textContent).toContain('Turno cancelado')
  expect(cancelled.getByTestId('turn-meta').textContent).not.toContain('Turno finalizado')
})

it('UX-05: "Preparar reintento" fills the draft of that session and never sends', async () => {
  const send = vi.fn()
  window.addEventListener('rinari:send', send)
  const view = terminal('failed', { error: 'boom' })
  const user = userEvent.setup()
  await user.click(view.getByRole('button', { name: 'Preparar reintento' }))
  expect(useComposerStore.getState().draftsBySession.ses_a?.text).toBe('arregla el build')
  // An existing, different draft is never overwritten silently.
  useComposerStore.getState().setTextFor('ses_a', 'mi borrador')
  await user.click(view.getByRole('button', { name: 'Preparar reintento' }))
  expect(await screen.findByRole('alertdialog')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Conservar borrador' }))
  expect(useComposerStore.getState().draftsBySession.ses_a?.text).toBe('mi borrador')
  expect(send).not.toHaveBeenCalled()
  window.removeEventListener('rinari:send', send)
})

it('the metadata row stays out of ordinary short turns and appears for unread ones', () => {
  const quiet = render(
    <I18nProvider lang="es">
      <TurnTimelineView timeline={{ ...base, status: 'completed', completedAt: 1_600, items: [finalItem] }} now={1_600} onResolveApproval={vi.fn()} />
    </I18nProvider>,
  )
  expect(quiet.queryByTestId('turn-meta')).toBeNull()
  quiet.unmount()

  useBoardAttentionStore.getState().initializeSessionAttention('ses_a', [])
  useBoardAttentionStore.getState().observeTerminal('ses_a', 't1', 'completed', 'live')
  const unread = terminal('completed', { completedAt: 1_600 })
  const meta = unread.getByTestId('turn-meta')
  expect(meta.dataset.unread).toBe('true')
  expect(meta.textContent).toContain('Nuevo')
})

it.each([false,true])('M06: empty changesets keep the same coverage presentation in Normal and Boards (partial=%s)', partial => {
  const engine=engineFixture({sessions,activeSession:'ses_a'})
  completeTurn(engine,'ses_a','coverage','Respuesta final')
  engine.runtime.getState().dispatch(event('turn.changes.completed',{session_id:'ses_a',turn_id:'coverage',id:'c',activity_seq:5,files:[],warnings:[],attribution_complete:!partial,additions:0,deletions:0,undoable:false}))
  const verify=(container:HTMLElement)=>{
    expect(within(container).queryAllByTestId('coverage-warning')).toHaveLength(partial?1:0)
    expect(container.textContent).not.toMatch(/0 archivo|\+0|-0/)
    expect(within(container).queryByRole('button',{name:'Revisar cambios'})).toBeNull()
    expect(within(container).queryByRole('button',{name:'Deshacer'})).toBeNull()
  }
  const normal=render(<BoardHarness engine={engine}><SingleSessionView onOpenProviders={()=>{}}/></BoardHarness>)
  verify(normal.container);normal.unmount()
  useBoardStore.getState().addPane('ses_a')
  render(<BoardHarness engine={engine}><BoardView/></BoardHarness>)
  verify(screen.getByRole('region',{name:'Backend API'}))
})

it('M04: Normal and Boards use one terminal token indicator even after a short turn',()=>{
 const engine=engineFixture({sessions,activeSession:'ses_a'})
 completeTurn(engine,'ses_a','usage','Tokens verificados')
 engine.runtime.getState().dispatch(event('usage.updated',{session_id:'ses_a',turn_id:'usage',revision:2,input_tokens:100,output_tokens:20,total_tokens:120,model_calls:2,source:'reported',phase:'settled'}))
 const verify=(container:HTMLElement)=>{
  const counters=within(container).getAllByTestId('token-usage')
  expect(counters).toHaveLength(1)
  expect(counters[0].textContent).toBe('120 tokens')
  expect(counters[0].closest('[aria-live]')).toBeNull()
 }
 const normal=render(<BoardHarness engine={engine}><SingleSessionView onOpenProviders={()=>{}}/></BoardHarness>)
 verify(normal.container);normal.unmount()
 useBoardStore.getState().addPane('ses_a')
 render(<BoardHarness engine={engine}><BoardView/></BoardHarness>)
 verify(screen.getByRole('region',{name:'Backend API'}))
})
