// @vitest-environment jsdom
// Plan C: the running turn in one line above the composer: the list's step or
// the action as the title, «n/m», the action's own clock (it restarts when the
// action changes), the total time and the model's output tokens.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { I18nProvider } from '../../i18n'
import type { Checklist } from '../../types/protocol.generated'
import TurnStatusLine, { shortElapsed } from './TurnStatusCard'
import { formatTokens } from './tokenUsage'
import type { TurnTimeline } from './types'

const base: TurnTimeline = { turnId: 't1', sessionId: 's1', status: 'running', startedAt: 1_000, items: [] } as unknown as TurnTimeline
const tool = (id: string, at: number, tool = 'fs.read') => ({ id, type: 'tool', toolCallId: id, tool, status: 'running', activitySeq: at, occurredAt: at, args: {} })
const list: Checklist = {
  session_id: 's1', turn_id: 't1', revision: 1, state: 'active', explanation: '', updated_at: '',
  counts: { pending: 1, in_progress: 1, completed: 3, blocked: 0, total: 5 },
  items: [
    { id: '1', content: 'Uno', status: 'completed' }, { id: '2', content: 'Dos', status: 'completed' },
    { id: '3', content: 'Tres', status: 'completed' }, { id: '4', content: 'Generar el video del búho', status: 'in_progress' },
    { id: '5', content: 'Cinco', status: 'pending' },
  ],
}

afterEach(() => cleanup())

const line = (timeline: TurnTimeline, now: number, checklist: Checklist | null = null) =>
  <I18nProvider lang="es"><TurnStatusLine timeline={timeline} checklist={checklist} now={now} /></I18nProvider>
const mount = (timeline: TurnTimeline, now: number, checklist: Checklist | null = null) => render(line(timeline, now, checklist))

it('formatea corto: segundos, minutos y horas', () => {
  expect(shortElapsed(25_000)).toBe('25 s')
  expect(shortElapsed(20 * 60_000)).toBe('20 min')
  expect(shortElapsed(65 * 60_000)).toBe('1 h 05 min')
})

it('sin lista: la acción del momento con su tiempo, que se reinicia al cambiar de acción', () => {
  const view = mount({ ...base, items: [tool('a', 5_000)] } as unknown as TurnTimeline, 30_000)
  expect(screen.getByRole('status').textContent).toBe('Leyendo un archivo…')
  expect(screen.getByTestId('turn-action-time').textContent).toBe('25 s')
  expect(screen.getByTestId('turn-total-time').textContent).toBe('29 s')
  view.rerender(line({ ...base, items: [{ ...tool('a', 5_000), status: 'completed' }, tool('b', 28_000, 'shell.exec')] } as unknown as TurnTimeline, 30_000))
  expect(screen.getByTestId('turn-action-time').textContent).toBe('2 s')
})

it('con lista: el paso en curso como título, «n/m» y la acción al lado', () => {
  mount({ ...base, items: [tool('a', 5_000, 'agent.wait')] } as unknown as TurnTimeline, 30_000, list)
  expect(screen.getByRole('status').textContent).toBe('Generar el video del búho')
  expect(document.querySelector('.turn-line-count')!.textContent).toBe('4/5')
  expect(document.querySelector('.turn-line-detail')!.textContent).toContain('Esperando resultados de subagentes…')
})

it('una lista de otro turno no presta su paso', () => {
  mount({ ...base, items: [tool('a', 5_000)] } as unknown as TurnTimeline, 30_000, { ...list, turn_id: 'otro' })
  expect(screen.getByRole('status').textContent).toBe('Leyendo un archivo…')
  expect(document.querySelector('.turn-line-count')).toBeNull()
})

it('solo pensando dice «Pensando…», también con un subagente al lado', () => {
  const view = mount(base, 3_000)
  expect(screen.getByRole('status').textContent).toBe('Pensando…')
  view.rerender(line({ ...base, items: [{ id: 'agent:a', type: 'agent', activitySeq: 1, occurredAt: 1_100, agentId: 'a', agent: 'implementer', phase: 'started', status: 'running', objective: 'Escribir generate.ps1', items: [] }] } as unknown as TurnTimeline, 2_500))
  expect(screen.getByRole('status').textContent).toBe('Pensando…')
})

it('cancelando lo dice al momento y deja de moverse', () => {
  mount({ ...base, status: 'cancelling' } as TurnTimeline, 2_000)
  expect(screen.getByRole('status').textContent).toBe('Cancelando…')
  expect(document.querySelector('.activity-text-shimmer')).toBeNull()
  expect(document.querySelector('[data-live-activity]')!.hasAttribute('data-working')).toBe(false)
})

// Plan 0.4.0 extras, E2: al empezar, el reloj de la acción marcaría lo mismo que el total.
it('mientras la acción empezó con el turno, solo se ve el tiempo total', () => {
  mount({ ...base, items: [] } as unknown as TurnTimeline, 13_000)
  expect(screen.queryByTestId('turn-action-time')).toBeNull()
  expect(screen.getByTestId('turn-total-time')).toBeTruthy()
})

it('los tokens son los que produjo el modelo, y no salen antes del primero', () => {
  const usage = { input_tokens: 14_000, output_tokens: 0, total_tokens: 14_000, model_calls: 1, revision: 1, source: 'estimated' as const, phase: 'thinking' as const }
  const view = mount({ ...base, usage } as TurnTimeline, 2_000)
  expect(screen.queryByTestId('token-usage')).toBeNull()
  view.rerender(line({ ...base, usage: { ...usage, output_tokens: 1_230, total_tokens: 15_230, revision: 2, phase: 'streaming' } } as TurnTimeline, 3_000))
  expect(screen.getByTestId('token-usage').textContent).toBe(`↓ ~${formatTokens(1_230, 'es')} tokens`)
})
