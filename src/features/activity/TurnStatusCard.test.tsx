// @vitest-environment jsdom
// Plan 0.4.0 #49: la cabecera del turno en curso como tarjeta de estado: el
// paso de la lista o la acción, «Paso n/m», el tiempo de la acción (que se
// reinicia al cambiar) y a la derecha el tiempo total.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { I18nProvider } from '../../i18n'
import { useChecklistStore } from '../checklist/checklistStore'
import TurnStatusCard, { shortElapsed } from './TurnStatusCard'
import type { TurnTimeline } from './types'

const base: TurnTimeline = { turnId: 't1', sessionId: 's1', status: 'running', startedAt: 1_000, items: [] } as unknown as TurnTimeline
const tool = (id: string, at: number, tool = 'fs.read') => ({ id, type: 'tool', toolCallId: id, tool, status: 'running', activitySeq: at, occurredAt: at, args: {} })

beforeEach(() => useChecklistStore.setState({ bySession: {} }))
afterEach(() => cleanup())

const mount = (timeline: TurnTimeline, now: number) =>
  render(<I18nProvider lang="es"><TurnStatusCard timeline={timeline} now={now} /></I18nProvider>)

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
  view.rerender(<I18nProvider lang="es"><TurnStatusCard timeline={{ ...base, items: [{ ...tool('a', 5_000), status: 'completed' }, tool('b', 28_000, 'shell.exec')] } as unknown as TurnTimeline} now={30_000} /></I18nProvider>)
  expect(screen.getByTestId('turn-action-time').textContent).toBe('2 s')
})

it('con lista: el paso en curso como título y «Paso n/m»', () => {
  useChecklistStore.getState().apply('s1', {
    session_id: 's1', turn_id: 't1', revision: 1, state: 'active', explanation: '', updated_at: '',
    counts: { pending: 1, in_progress: 1, completed: 3, blocked: 0, total: 5 },
    items: [
      { id: '1', content: 'Uno', status: 'completed' }, { id: '2', content: 'Dos', status: 'completed' },
      { id: '3', content: 'Tres', status: 'completed' }, { id: '4', content: 'Generar el video del búho', status: 'in_progress' },
      { id: '5', content: 'Cinco', status: 'pending' },
    ],
  }, true)
  mount({ ...base, items: [tool('a', 5_000, 'agent.wait')] } as unknown as TurnTimeline, 30_000)
  expect(screen.getByRole('status').textContent).toBe('Generar el video del búho')
  const detail = document.querySelector('.turn-status-detail')!.textContent
  expect(detail).toContain('Paso 4/5')
  expect(detail).toContain('Esperando resultados de subagentes…')
})

it('solo pensando dice «Pensando…»', () => {
  mount(base, 3_000)
  expect(screen.getByRole('status').textContent).toBe('Pensando…')
})
