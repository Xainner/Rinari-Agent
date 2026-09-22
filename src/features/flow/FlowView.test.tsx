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
const sessionList = vi.fn()
vi.mock('../../services/engine', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/engine')>()
  return {
    ...original,
    engineApi: {
      ...original.engineApi,
      flowGet: (...args: unknown[]) => flowGet(...args),
      // La membresía del alcance se resuelve contra el Engine (F11-05): aquí
      // se fija explícitamente para que «ajena» signifique ajena de verdad y
      // no «la consulta falló».
      sessions: (...args: unknown[]) => sessionList(...args),
    },
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
  sessionList.mockReset()
  sessionList.mockResolvedValue({ sessions: [{ id: 'ses_a' }, { id: 'ses_b' }, { id: 'ses_c' }] })
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

it('FLOW-03/04: failed and needs_you stages keep distinct status and the attend action', async () => {
  mount()
  const stages = await screen.findAllByTestId('flow-stage')
  expect(within(stages[2]!).getByRole('status').textContent).toBe('Falló')
  expect(within(stages[2]!).getByText('Verificación 1 ok · 1 fallidas')).toBeTruthy()
  expect(within(stages[3]!).getByRole('status').textContent).toBe('Te necesita')
  expect(within(stages[3]!).getByRole('button', { name: 'Atender' })).toBeTruthy()
  expect(within(stages[1]!).getByRole('button', { name: 'Ir al turno' })).toBeTruthy()
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
  expect(engine.prepareSession).not.toHaveBeenCalled()
  await waitFor(() => expect(revealed).toContainEqual({ sessionId: 'ses_a', turnId: 't1', requestId: undefined }))

  // ses_c no está en el board: se resuelve la sesión **antes** de cambiar de
  // vista, y sólo entonces se activa y se pide el reveal.
  await user.click(within(stages[3]!).getByRole('button', { name: 'Atender' }))
  await waitFor(() => expect(engine.prepareSession).toHaveBeenCalledWith('ses_c'))
  expect(engine.setActiveSession).toHaveBeenCalledWith('ses_c')
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

it('F11-13: an active loose conversation opens its own flow, not the first project', async () => {
  useUIStore.setState({ flowScope: null, flowScopeExplicit: false })
  mount(engineFixture({ sessions, projects, activeSession: 'ses_chat', status }))
  // Existen proyectos registrados, pero lo que la persona tiene delante es una
  // conversación suelta: responder por `proj_a` era abrir un proyecto ajeno.
  await waitFor(() => expect(flowGet).toHaveBeenCalledWith({ session_id: 'ses_chat' }))
  expect(flowGet).not.toHaveBeenCalledWith({ project_id: 'proj_a' })
})

it('F11-13: the active session\'s project wins over a valid persisted scope', async () => {
  // El alcance guardado existe y es válido, pero no es lo que se está
  // trabajando: sólo se usa cuando no hay sesión activa que mande.
  useUIStore.setState({ flowScope: { kind: 'project', id: 'proj_b' }, flowScopeExplicit: false })
  mount(engineFixture({ sessions, projects, activeSession: 'ses_a', status }))
  await waitFor(() => expect(flowGet).toHaveBeenCalledWith({ project_id: 'proj_a' }))
})

it('F11-13: a scope chosen by hand survives, and only the persisted one gives way', async () => {
  useUIStore.setState({ flowScope: { kind: 'project', id: 'proj_b' }, flowScopeExplicit: true })
  mount(engineFixture({ sessions, projects, activeSession: 'ses_a', status }))
  await waitFor(() => expect(flowGet).toHaveBeenCalledWith({ project_id: 'proj_b' }))
  expect(flowGet).not.toHaveBeenCalledWith({ project_id: 'proj_a' })
})

it('F11-13: without projects or sessions the persisted scope is the last thing standing', async () => {
  useUIStore.setState({ flowScope: { kind: 'project', id: 'proj_b' }, flowScopeExplicit: false })
  mount(engineFixture({ sessions: [], projects, activeSession: '', status }))
  await waitFor(() => expect(flowGet).toHaveBeenCalledWith({ project_id: 'proj_b' }))
})

it('F11-13: the capability has three states and "checking" is not "supported"', async () => {
  // Con el Engine arrancando no se sabe si ofrece flujos. Darlo por bueno
  // llamaba a `flow.get` contra un motor que podía no tenerlo.
  mount(engineFixture({
    sessions,
    projects,
    activeSession: 'ses_a',
    status: { state: 'starting', engine_version: null, protocol_version: null, detail: null, capabilities: {} },
  }))
  expect(await screen.findByTestId('flow-checking')).toBeTruthy()
  expect(screen.queryByTestId('flow-unsupported')).toBeNull()
  expect(flowGet).not.toHaveBeenCalled()
})

it('F11-08: a closed session offers restore instead of leaving an orphan reveal', async () => {
  // El Engine incluye a propósito sesiones cerradas y archivadas, así que la
  // que se ve en una tarjeta puede no ser abrible. Antes se cambiaba a Normal
  // y se pedía el reveal igualmente: la petición se quedaba sin consumidor y
  // la persona, en una vista que no había pedido.
  const goNormal = vi.fn()
  useUIStore.setState({ goNormal })
  const engine = engineFixture({ sessions, projects, activeSession: 'ses_a', status })
  engine.prepareSession = vi.fn(async () => ({ ok: false as const, reason: 'archived' as const, message: 'Infra' }))
  mount(engine)
  const user = userEvent.setup()
  const revealed: string[] = []
  const onReveal = (event: Event) => revealed.push((event as CustomEvent<{ sessionId: string }>).detail.sessionId)
  window.addEventListener(REVEAL_TURN_EVENT, onReveal)
  const stages = await screen.findAllByTestId('flow-stage')

  await user.click(within(stages[3]!).getByRole('button', { name: 'Atender' }))
  const prompt = await screen.findByTestId('flow-restore')
  expect(prompt.textContent).toContain('Infra')
  expect(prompt.textContent).toContain('archivada')
  expect(goNormal).not.toHaveBeenCalled()
  expect(engine.setActiveSession).not.toHaveBeenCalled()
  expect(revealed).toHaveLength(0)

  // Restaurar es una decisión explícita; después sí se abre y se revela.
  engine.prepareSession = vi.fn(async () => ({ ok: true as const, session: sessions[2]! }))
  await user.click(within(prompt).getByRole('button', { name: 'Restaurar y abrir' }))
  await waitFor(() => expect(engine.restoreSession).toHaveBeenCalledWith('ses_c'))
  await waitFor(() => expect(goNormal).toHaveBeenCalledTimes(1))
  expect(revealed).toContain('ses_c')
  window.removeEventListener(REVEAL_TURN_EVENT, onReveal)
})

it('F11-08: if the session cannot be opened the view stays in Flujos and says why', async () => {
  const goNormal = vi.fn()
  useUIStore.setState({ goNormal })
  const engine = engineFixture({ sessions, projects, activeSession: 'ses_a', status })
  engine.prepareSession = vi.fn(async () => ({ ok: false as const, reason: 'unavailable' as const, message: 'engine unavailable' }))
  mount(engine)
  const user = userEvent.setup()
  const stages = await screen.findAllByTestId('flow-stage')
  await user.click(within(stages[3]!).getByRole('button', { name: 'Atender' }))
  const error = await screen.findByTestId('flow-nav-error')
  expect(error.textContent).toContain('engine unavailable')
  expect(goNormal).not.toHaveBeenCalled()
  expect(screen.queryByTestId('flow-restore')).toBeNull()
})

it('F11-09: each session row answers for itself, not for the stage anchor', async () => {
  // La etapa 2 tiene dos sesiones y su anchor es ses_a. Con un único `onBoard`
  // calculado desde el anchor, «Docs» mostraba icono y destino de «Backend API».
  useBoardStore.getState().addPane('ses_a')
  mount()
  const user = userEvent.setup()
  const stages = await screen.findAllByTestId('flow-stage')
  await user.click(within(stages[1]!).getByRole('button', { name: 'implementa las rutas' }))
  const detail = screen.getByRole('complementary', { name: /Detalle de la etapa/ })
  expect(within(detail).getByRole('button', { name: /Backend API/ }).getAttribute('title')).toBe('Abrir en su panel del board')
  expect(within(detail).getByRole('button', { name: /Docs/ }).getAttribute('title')).toBe('Abrir en Normal')
})

it('F11-12: a failed refresh marks the flow as stale instead of replacing it with an error', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    mount()
    await screen.findAllByTestId('flow-stage')
    flowGet.mockRejectedValue(new Error('engine unavailable'))
    act(() => emit('turn.completed', { session_id: 'ses_a', turn_id: 't9' }))
    await act(async () => {
      vi.advanceTimersByTime(FLOW_REFRESH_DEBOUNCE_MS * 2)
      await Promise.resolve()
      await Promise.resolve()
    })
    const stale = await screen.findByTestId('flow-stale')
    expect(stale.textContent).toContain('engine unavailable')
    // Los datos siguen, rotulados como de antes; no se presentan como actuales
    // ni desaparecen porque un refresco fallara.
    expect(screen.getAllByTestId('flow-stage').length).toBeGreaterThan(0)
    expect(screen.queryByRole('alert')).toBeNull()
  } finally {
    vi.useRealTimers()
  }
})

it('excerpts are inert text: no HTML and no active Markdown', async () => {
  flowGet.mockResolvedValue(
    flowFixture([stageFixture({ id: 'stg_x', index: 1, title: '', excerpt: '<b>ojo</b> **negrita**' })]),
  )
  mount()
  const stage = await screen.findByTestId('flow-stage')
  expect(within(stage).getAllByText('<b>ojo</b> **negrita**').length).toBeGreaterThan(0)
  expect(stage.querySelector('b')).toBeNull()
})

it('keyboard: stage cards are reachable and Enter opens the detail', async () => {
  mount()
  const user = userEvent.setup()
  const stages = await screen.findAllByTestId('flow-stage')
  const title = within(stages[1]!).getByRole('button', { name: 'implementa las rutas' })
  title.focus()
  expect(document.activeElement).toBe(title)
  await user.keyboard('{Enter}')
  expect(screen.getByRole('complementary', { name: /Detalle de la etapa/ })).toBeTruthy()
  // El foco entra al detalle y vuelve al cerrarlo con Escape.
  await waitFor(() => expect(document.activeElement).not.toBe(title))
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('complementary')).toBeNull())
})

it('reduced motion: the app preference counts, not only the OS one', async () => {
  // «El ajuste del sistema siempre se respeta» dice Ajustes; el conmutador de
  // la app no hacía nada en esta vista porque sólo se leía `useReducedMotion`.
  useUIStore.setState({ reduceMotion: true })
  mount()
  const stages = await screen.findAllByTestId('flow-stage')
  // Sin animación de entrada la tarjeta es visible desde el primer render, en
  // vez de aparecer en opacidad 0 a la espera de que corra la animación.
  expect(stages[0]!.style.opacity === '' || stages[0]!.style.opacity === '1').toBe(true)
  useUIStore.setState({ reduceMotion: false })
})
