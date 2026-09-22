// @vitest-environment jsdom
// Plan 06 (Flujos): la vista presenta lo que el Engine proyecta (`flow.get`),
// se refresca por eventos de las sesiones del alcance y navega al turno
// origen sin inventar datos (FLOW-01…FLOW-09).
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue({}) }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))

const listeners = new Set<(event: { type: string; event: string; payload: Record<string, unknown> }) => void>()
const flowGet = vi.fn()
vi.mock('../../services/engine', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/engine')>()
  return {
    ...original,
    engineApi: { ...original.engineApi, flowGet: (...args: unknown[]) => flowGet(...args) },
    onEngineEvent: vi.fn(async (callback: (event: { type: string; event: string; payload: Record<string, unknown> }) => void) => {
      listeners.add(callback)
      return () => listeners.delete(callback)
    }),
  }
})

import { useBoardStore, defaultBoard } from '../../stores/board'
import { useUIStore } from '../../stores/ui'
import { BoardHarness, engineFixture, projectFixture, sessionFixture } from '../board/testUtils'
import { REVEAL_TURN_EVENT } from '../board/boardCommands'
import FlowView from './FlowView'
import { flowFixture, projectFlowFixture, stageFixture } from './flowFixtures'
import { FLOW_REFRESH_DEBOUNCE_MS } from './useFlow'

const projects = [projectFixture('proj_a', 'Backend', { root: 'C:/repo/backend' }), projectFixture('proj_b', 'Web')]
const sessions = [
  sessionFixture('ses_a', 'Backend API', 'proj_a', { project_root: 'C:/repo/backend' }),
  sessionFixture('ses_b', 'Docs', 'proj_a', { project_root: 'C:/repo/backend' }),
  sessionFixture('ses_c', 'Infra', 'proj_a', { project_root: 'C:/repo/backend' }),
  sessionFixture('ses_chat', 'Charla suelta'),
]

function emit(event: string, payload: Record<string, unknown>) {
  for (const listener of listeners) listener({ type: 'event', event, payload })
}

beforeEach(() => {
  window.localStorage.clear()
  listeners.clear()
  flowGet.mockReset()
  flowGet.mockResolvedValue(projectFlowFixture())
  useBoardStore.getState().hydrate(defaultBoard())
  useUIStore.setState({ view: 'flows', flowScope: { kind: 'project', id: 'proj_a' } })
})
afterEach(cleanup)

const status = { state: 'ready' as const, engine_version: '0.1.0', protocol_version: 1, detail: null, capabilities: { project_flow_v1: true } }

function mount(engine = engineFixture({ sessions, projects, activeSession: 'ses_a', status })) {
  return { engine, ...render(<BoardHarness engine={engine}><FlowView /></BoardHarness>) }
}

it('FLOW-01: renders the stages the engine projected, in order, with cycles and executors', async () => {
  mount()
  const stages = await screen.findAllByTestId('flow-stage')
  expect(flowGet).toHaveBeenCalledWith({ project_id: 'proj_a' })
  expect(stages.map((stage) => stage.dataset.kind)).toEqual(['planning', 'implementation', 'review', 'planning'])
  expect(within(stages[0]!).getByText('Paso 1 · Planificación')).toBeTruthy()
  expect(within(stages[0]!).getByRole('button', { name: 'Diseño de la API' })).toBeTruthy()
  expect(within(stages[0]!).getByText('opus')).toBeTruthy()
  expect(within(stages[1]!).getByText('sonnet')).toBeTruthy()
  expect(within(stages[1]!).getByText('explore')).toBeTruthy()
  // Un solo separador de ciclo, antes del segundo PLAN.
  expect(screen.getAllByRole('separator', { name: 'Ciclo 2' })).toHaveLength(1)
  expect(screen.getByRole('heading', { level: 1, name: 'Backend' })).toBeTruthy()
})

it('FLOW-02: progress shows the engine number or "sin datos", never a guess; files cap with +n', async () => {
  mount()
  const stages = await screen.findAllByTestId('flow-stage')
  expect(within(stages[1]!).getByText('75%')).toBeTruthy()
  expect(within(stages[3]!).getByText('sin datos')).toBeTruthy()
  expect(within(stages[3]!).getByText('Duración no disponible')).toBeTruthy()
  // 5 archivos listados + 3 más: chips de 4 y «+4».
  expect(within(stages[1]!).getByRole('list', { name: '8 archivos' })).toBeTruthy()
  expect(within(stages[1]!).getByText('+4')).toBeTruthy()
  expect(within(stages[0]!).getByText('Sin archivos cambiados')).toBeTruthy()
  // El fixture tiene una etapa sin progreso conocido, así que **no hay
  // total**: enseñar un porcentaje aquí era decir «terminado» de algo a
  // medias. La vista lo dice en vez de rellenarlo.
  expect(screen.getByTestId('flow-overall').textContent).toContain('Progreso no calculable')
  expect(screen.getByTestId('flow-overall').textContent).not.toContain('% completado')
  expect(screen.getByText('sin tareas registradas')).toBeTruthy()
})

it('FLOW-03/04: failed and needs_you stages keep distinct status and the attend action', async () => {
  mount()
  const stages = await screen.findAllByTestId('flow-stage')
  expect(within(stages[2]!).getByRole('status').textContent).toBe('Falló')
  expect(within(stages[2]!).getByText('Verificación 1 ok · 1 fallidas')).toBeTruthy()
  expect(within(stages[3]!).getByRole('status').textContent).toBe('Te necesita')
  expect(within(stages[3]!).getByRole('button', { name: 'Atender' })).toBeTruthy()
  expect(within(stages[1]!).getByRole('button', { name: 'Ir al turno' })).toBeTruthy()
})

it('FLOW-02b: con todas las etapas conocidas sí hay total', async () => {
  // La contraparte del caso anterior: el número aparece cuando se puede
  // calcular de verdad, no por defecto.
  flowGet.mockResolvedValue(
    flowFixture([
      stageFixture({ id: 'stg_1', index: 1, kind: 'planning', progress: 1, turns: 1 }),
      stageFixture({ id: 'stg_2', index: 2, progress: 0.5, turns: 1 }),
    ]),
  )
  mount()
  await screen.findAllByTestId('flow-stage')
  expect(screen.getByTestId('flow-overall').textContent).toContain('% completado')
})

it('FLOW-05: peer-originated turns are labelled as provenance, not as user orders', async () => {
  mount()
  const stages = await screen.findAllByTestId('flow-stage')
  expect(within(stages[1]!).getByText('1 de otro panel')).toBeTruthy()
  expect(within(stages[0]!).queryByText(/de otro panel/)).toBeNull()
})

it('FLOW-06: refreshes on events of sessions in the scope only, debounced', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    mount()
    await screen.findAllByTestId('flow-stage')
    expect(flowGet).toHaveBeenCalledTimes(1)
    act(() => emit('turn.completed', { session_id: 'ses_zzz', turn_id: 't9' }))
    act(() => { vi.advanceTimersByTime(FLOW_REFRESH_DEBOUNCE_MS * 2) })
    expect(flowGet).toHaveBeenCalledTimes(1)
    act(() => {
      emit('turn.started', { session_id: 'ses_b', turn_id: 't10' })
      emit('turn.completed', { session_id: 'ses_b', turn_id: 't10' })
    })
    act(() => { vi.advanceTimersByTime(FLOW_REFRESH_DEBOUNCE_MS * 2) })
    await waitFor(() => expect(flowGet).toHaveBeenCalledTimes(2))
    // Un evento que no cambia etapas no consulta.
    act(() => emit('model.content.delta', { session_id: 'ses_b' }))
    act(() => { vi.advanceTimersByTime(FLOW_REFRESH_DEBOUNCE_MS * 2) })
    expect(flowGet).toHaveBeenCalledTimes(2)
  } finally {
    vi.useRealTimers()
  }
})

it('FLOW-07: "Ir al turno" reveals the pane on the board, or selects the session in Normal', async () => {
  const goBoard = vi.fn()
  const goNormal = vi.fn()
  useUIStore.setState({ goBoard, goNormal })
  useBoardStore.getState().addPane('ses_a')
  const { engine } = mount()
  const user = userEvent.setup()
  const stages = await screen.findAllByTestId('flow-stage')
  const revealed: Array<{ sessionId: string; turnId: string }> = []
  const onReveal = (event: Event) => revealed.push((event as CustomEvent<{ sessionId: string; turnId: string }>).detail)
  window.addEventListener(REVEAL_TURN_EVENT, onReveal)

  // ses_a está en el board: expandir/enfocar el panel y revelar el turno.
  await user.click(within(stages[0]!).getByRole('button', { name: 'Ir al turno' }))
  expect(goBoard).toHaveBeenCalledTimes(1)
  expect(engine.selectSession).not.toHaveBeenCalled()
  await waitFor(() => expect(revealed).toContainEqual({ sessionId: 'ses_a', turnId: 't1', requestId: undefined }))

  // ses_c no está en el board: seleccionar la sesión en Normal y revelar.
  await user.click(within(stages[3]!).getByRole('button', { name: 'Atender' }))
  expect(engine.selectSession).toHaveBeenCalledWith('ses_c')
  expect(goNormal).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(revealed.some((item) => item.sessionId === 'ses_c' && item.turnId === 't5')).toBe(true))
  // Navegar nunca cambia modelo, modo ni borrador.
  expect(engine.setModeFor).not.toHaveBeenCalled()
  expect(engine.useModelFor).not.toHaveBeenCalled()
  window.removeEventListener(REVEAL_TURN_EVENT, onReveal)
})

it('opens the stage detail inside the view and closes it with Escape', async () => {
  mount()
  const user = userEvent.setup()
  const stages = await screen.findAllByTestId('flow-stage')
  await user.click(within(stages[1]!).getByRole('button', { name: 'implementa las rutas' }))
  const detail = screen.getByRole('complementary', { name: 'Detalle de la etapa implementa las rutas' })
  expect(detail.closest('.flow-body')).toBeTruthy()
  expect(within(detail).getByText('y 3 archivos más')).toBeTruthy()
  expect(within(detail).getByRole('button', { name: /Docs/ })).toBeTruthy()
  expect(document.activeElement && detail.contains(document.activeElement)).toBe(true)
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('complementary')).toBeNull())
})

it('FLOW-08/09: scope switching, empty project, engine error with retry', async () => {
  flowGet.mockResolvedValueOnce(projectFlowFixture())
  mount()
  const user = userEvent.setup()
  await screen.findAllByTestId('flow-stage')

  flowGet.mockResolvedValueOnce(flowFixture([], { scope: { kind: 'project', id: 'proj_b', title: 'Web', root: 'C:/repo/web' } }))
  await user.selectOptions(screen.getByRole('combobox', { name: 'Alcance' }), 'project:proj_b')
  expect(flowGet).toHaveBeenLastCalledWith({ project_id: 'proj_b' })
  expect(await screen.findByTestId('flow-empty')).toBeTruthy()
  expect(screen.getByText(/aún no tiene turnos/)).toBeTruthy()
  expect(useUIStore.getState().flowScope).toEqual({ kind: 'project', id: 'proj_b' })

  flowGet.mockRejectedValueOnce(new Error('engine unavailable'))
  await user.selectOptions(screen.getByRole('combobox', { name: 'Alcance' }), 'session:ses_chat')
  expect(flowGet).toHaveBeenLastCalledWith({ session_id: 'ses_chat' })
  expect((await screen.findByRole('alert')).textContent).toContain('engine unavailable')
  flowGet.mockResolvedValueOnce(flowFixture([stageFixture({ id: 'stg_x', index: 1, sessions: [{ session_id: 'ses_chat', title: 'Charla suelta', turns: 1 }] })], { scope: { kind: 'session', id: 'ses_chat', title: 'Charla suelta', root: null } }))
  await user.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByTestId('flow-stage')).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
})

it('FLOW-09: a project session opened from the sidebar is offered as its own scope option', async () => {
  // «Ver flujo» sobre una sesión de proyecto: no es una conversación suelta,
  // pero el selector debe reflejar el alcance real, no caer al primer proyecto.
  useUIStore.setState({ flowScope: { kind: 'session', id: 'ses_b' } })
  flowGet.mockResolvedValueOnce(flowFixture([stageFixture({ id: 'stg_x', index: 1, sessions: [{ session_id: 'ses_b', title: 'Docs', turns: 1 }] })], { scope: { kind: 'session', id: 'ses_b', title: 'Docs', root: 'C:/repo/backend' } }))
  mount()
  await screen.findByTestId('flow-stage')
  expect(flowGet).toHaveBeenCalledWith({ session_id: 'ses_b' })
  const select = screen.getByRole('combobox', { name: 'Alcance' }) as HTMLSelectElement
  expect(select.value).toBe('session:ses_b')
  expect(within(screen.getByRole('group', { name: 'Sesiones del proyecto' })).getByRole('option', { name: 'Docs' })).toBeTruthy()
  // Las conversaciones sueltas siguen en su grupo; las de proyecto no se duplican allí.
  expect(within(screen.getByRole('group', { name: 'Conversaciones' })).queryByRole('option', { name: 'Docs' })).toBeNull()
})

it('FLOW-11: an engine without project_flow_v1 gets a clear notice and no flow.get call', async () => {
  mount(engineFixture({ sessions, projects, activeSession: 'ses_a' }))
  expect(await screen.findByTestId('flow-unsupported')).toBeTruthy()
  expect(flowGet).not.toHaveBeenCalled()
})

it('FLOW-08: many stages keep fixed-width cards in a horizontally scrollable canvas', async () => {
  flowGet.mockResolvedValue(flowFixture(Array.from({ length: 40 }, (_, index) => stageFixture({ id: `stg_${index}`, index: index + 1 }))))
  mount()
  const stages = await screen.findAllByTestId('flow-stage')
  expect(stages).toHaveLength(40)
  const canvas = screen.getByRole('list', { name: 'Etapas del flujo' })
  expect(canvas.className).toContain('flow-canvas')
  expect(stages.every((stage) => stage.closest('.flow-stage-slot'))).toBe(true)
})

it('falls back to the active session\'s project when no scope is stored', async () => {
  useUIStore.setState({ flowScope: null })
  mount(engineFixture({ sessions, projects, activeSession: 'ses_chat', status }))
  // La sesión activa es un chat sin proyecto: se usa el primer proyecto registrado.
  await waitFor(() => expect(flowGet).toHaveBeenCalledWith({ project_id: 'proj_a' }))
})
