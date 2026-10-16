// @vitest-environment jsdom
// Plan 0.4.0 #55: los planes de la conversación y su vista en el panel lateral.
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'
import { I18nProvider } from '../../i18n'
import type { TurnTimeline } from '../activity/types'
import { parsePlan, sessionPlans } from './planModel'
import PlanView from './PlanView'
import { BoardHarness, engineFixture, sessionFixture } from '../board/testUtils'

const PLAN = [
  '# Tarjetas regalo: venta en caja',
  '',
  'Vender tarjetas desde la caja y guardar el saldo.',
  '',
  '## Pasos',
  '1. Crear el modelo `GiftCard`.',
  '2. Añadir **POST /api/tarjetas**.',
  '3. Pantalla de venta.',
  '',
  '## Pruebas',
  '- Saldo inicial correcto.',
].join('\n')

const plan = (turnId: string, startedAt: number, content = PLAN): TurnTimeline => ({
  turnId, sessionId: 's1', mode: 'plan', status: 'completed', startedAt, completedAt: startedAt + 10, userMessage: 'Planea',
  items: [{ id: `model:${turnId}`, type: 'model', activitySeq: 1, occurredAt: startedAt + 5, modelCallId: turnId, status: 'completed', content, outputKind: 'final' }],
})

afterEach(cleanup)

it('lee el título, los pasos, el resumen y las secciones sin inventar', () => {
  const parsed = parsePlan(PLAN)
  expect(parsed.title).toBe('Tarjetas regalo: venta en caja')
  expect(parsed.steps).toEqual(['Crear el modelo GiftCard.', 'Añadir POST /api/tarjetas.', 'Pantalla de venta.'])
  expect(parsed.summary).toBe('Vender tarjetas desde la caja y guardar el saldo.')
  expect(parsed.sections.map((section) => section.title)).toEqual([null, 'Pasos', 'Pruebas'])
  // El título no se repite dentro.
  expect(parsed.sections[0]!.body).not.toContain('# Tarjetas')
  expect(parsePlan('Solo una línea sin lista').steps).toEqual([])
})

it('solo cuentan los turnos PLAN terminados, el más reciente primero', () => {
  const build: TurnTimeline = { ...plan('t3', 3000), mode: 'build' }
  const running: TurnTimeline = { ...plan('t4', 4000), status: 'running' }
  expect(sessionPlans({ t1: plan('t1', 1000), t2: plan('t2', 2000), t3: build, t4: running }).map((entry) => entry.turnId)).toEqual(['t2', 't1'])
})

function loaded(turns: Array<{ id: string; at: string; content: string }>) {
  const engine = engineFixture({ sessions: [sessionFixture('s1', 'Plan')], activeSession: 's1' })
  engine.runtime.getState().dispatch({
    type: 'timeline/loaded',
    sessionId: 's1',
    turns: turns.map((turn, index) => ({ turn_id: turn.id, session_id: 's1', turn_index: index + 1, mode: 'plan', status: 'completed', started_at: turn.at, completed_at: turn.at, user_message: 'Planea', final_response: turn.content, items: [] })),
  } as never)
  return engine
}

it('la vista enseña el último plan con sus pasos y deja elegir los anteriores', async () => {
  const engine = loaded([
    { id: 't1', at: '2026-10-16T10:00:00Z', content: ['# Primer plan', '', '1. Uno', '2. Dos'].join('\n') },
    { id: 't2', at: '2026-10-16T11:00:00Z', content: PLAN },
  ])
  render(<BoardHarness engine={engine}><PlanView sessionId="s1" /></BoardHarness>)
  const view = await screen.findByTestId('plan-view')
  expect(view.dataset.turnId).toBe('t2')
  expect(within(view).getByRole('heading', { name: 'Tarjetas regalo: venta en caja' })).toBeTruthy()
  expect(within(view).getByRole('region', { name: '3 pasos' })).toBeTruthy()
  expect(within(view).getByRole('button', { name: 'Implementar plan' })).toBeTruthy()
  await userEvent.selectOptions(within(view).getByRole('combobox', { name: 'Plan' }), 't1')
  expect(screen.getByTestId('plan-view').dataset.turnId).toBe('t1')
  // Un plan anterior no se implementa desde aquí: solo el último.
  expect(screen.queryByRole('button', { name: 'Implementar plan' })).toBeNull()
})

it('sin planes lo dice', () => {
  render(<I18nProvider lang="es"><PlanView sessionId="s1" /></I18nProvider>)
  expect(screen.getByText('Esta conversación todavía no tiene un plan.')).toBeTruthy()
})

it('la tarjeta del chat es compacta: título, pasos a la vista y «Ver plan» abre el panel', async () => {
  const { default: PlanCard } = await import('./PlanCard')
  const { ReadTrackingContext } = await import('../board/useResultVisibility')
  const { resetSessionDockForTests, useSessionDockStore } = await import('../../stores/sessionDock')
  resetSessionDockForTests()
  const long = ['# Migración', '', '1. Uno', '2. Dos', '3. Tres', '4. Cuatro', '5. Cinco', '6. Seis'].join('\n')
  render(
    <I18nProvider lang="es">
      <ReadTrackingContext.Provider value={{ sessionId: 's1', visible: true }}>
        <PlanCard content={long} actions={<button type="button">Implementar plan</button>} />
      </ReadTrackingContext.Provider>
    </I18nProvider>,
  )
  const card = screen.getByRole('region', { name: 'Plan propuesto' })
  expect(within(card).getByRole('heading', { name: 'Migración' })).toBeTruthy()
  expect(within(card).getByText('6 pasos')).toBeTruthy()
  expect(within(card).getByText('Cuatro')).toBeTruthy()
  expect(within(card).queryByText('Cinco')).toBeNull()
  expect(within(card).getByText('y 2 pasos más')).toBeTruthy()
  await userEvent.click(within(card).getByRole('button', { name: 'Ver plan' }))
  expect(useSessionDockStore.getState().layoutFor('s1').views).toEqual(['plan'])
})
