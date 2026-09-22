// @vitest-environment jsdom
// Pruebas del hook, separadas de las visuales de `FlowView`: aquí se mira
// **cuándo se consulta al Engine y con qué**, que es donde vivían los fallos
// de membresía (F11-05), invalidación (F11-06) y refresco fallido (F11-12).
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
      sessions: (...args: unknown[]) => sessionList(...args),
    },
    onEngineEvent: vi.fn(async (callback: (event: { type: string; event: string; payload: Record<string, unknown> }) => void) => {
      listeners.add(callback)
      return () => listeners.delete(callback)
    }),
  }
})

import { flowFixture, stageFixture } from './flowFixtures'
import { FLOW_REFRESH_DEBOUNCE_MS, useFlow } from './useFlow'

function emit(event: string, payload: Record<string, unknown> = {}) {
  for (const listener of listeners) listener({ type: 'event', event, payload })
}

/** Deja correr el debounce y las promesas que dispara. */
async function settle(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(FLOW_REFRESH_DEBOUNCE_MS * 2)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

const emptyProject = () => flowFixture([])
const withSessionA = () =>
  flowFixture([stageFixture({ id: 'stg_1', index: 1, sessions: [{ session_id: 'ses_a', title: 'Backend', turns: 1 }] })])

beforeEach(() => {
  listeners.clear()
  flowGet.mockReset()
  sessionList.mockReset()
  flowGet.mockResolvedValue(emptyProject())
  sessionList.mockResolvedValue({ sessions: [] })
  vi.useFakeTimers({ shouldAdvanceTime: true })
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

function mountFlow(scope: { kind: 'project' | 'session'; id: string } | null = { kind: 'project', id: 'proj_a' }) {
  return renderHook(() => useFlow(scope))
}

describe('F11-05: la membresía la decide el Engine, no las etapas cargadas', () => {
  it('un proyecto vacío no se refresca por actividad de una sesión ajena', async () => {
    // El fallo: sin etapas no había miembros, y «sin miembros» se leía como
    // «cualquiera vale». Cualquier turno del Engine movía este proyecto.
    mountFlow()
    await waitFor(() => expect(flowGet).toHaveBeenCalledTimes(1))
    act(() => emit('turn.completed', { session_id: 'ses_ajena' }))
    await settle()
    expect(flowGet).toHaveBeenCalledTimes(1)
  })

  it('una sesión del proyecto sin turnos todavía sí lo refresca en su primer turno', async () => {
    // La contraparte: es miembro aunque no aparezca en ninguna etapa, porque
    // la pertenencia se pregunta con `session_list`, no se deduce.
    sessionList.mockResolvedValue({ sessions: [{ id: 'ses_nueva' }] })
    mountFlow()
    await waitFor(() => expect(flowGet).toHaveBeenCalledTimes(1))
    await act(async () => { await Promise.resolve() })
    act(() => emit('turn.started', { session_id: 'ses_nueva' }))
    await settle()
    expect(flowGet).toHaveBeenCalledTimes(2)
    expect(sessionList).toHaveBeenCalledWith(undefined, true, 'proj_a')
  })

  it('una sesión creada después de cargar entra al flujo sin refresco manual', async () => {
    // Al montar no existía; su primer evento obliga a re-resolver la
    // pertenencia una vez, y entonces sí entra.
    mountFlow()
    await waitFor(() => expect(flowGet).toHaveBeenCalledTimes(1))
    sessionList.mockResolvedValue({ sessions: [{ id: 'ses_tardia' }] })
    act(() => emit('turn.started', { session_id: 'ses_tardia' }))
    await settle()
    await waitFor(() => expect(flowGet).toHaveBeenCalledTimes(2))
  })

  it('una sesión ajena sólo cuesta una comprobación: la segunda vez no se pregunta', async () => {
    mountFlow()
    await waitFor(() => expect(flowGet).toHaveBeenCalledTimes(1))
    act(() => emit('turn.completed', { session_id: 'ses_ajena' }))
    await settle()
    const asked = sessionList.mock.calls.length
    act(() => emit('turn.completed', { session_id: 'ses_ajena' }))
    await settle()
    expect(sessionList.mock.calls.length).toBe(asked)
    expect(flowGet).toHaveBeenCalledTimes(1)
  })

  it('mover una sesión de proyecto re-resuelve la pertenencia y consulta', async () => {
    mountFlow()
    await waitFor(() => expect(flowGet).toHaveBeenCalledTimes(1))
    const asked = sessionList.mock.calls.length
    act(() => emit('session.moved', { session_id: 'ses_a', project_id: 'proj_b' }))
    await settle()
    expect(sessionList.mock.calls.length).toBeGreaterThan(asked)
    await waitFor(() => expect(flowGet).toHaveBeenCalledTimes(2))
  })
})

describe('F11-06: lo que cambia una etapa sin producir un turno', () => {
  it('`flow.invalidated` del propio proyecto refresca', async () => {
    mountFlow()
    await waitFor(() => expect(flowGet).toHaveBeenCalledTimes(1))
    act(() => emit('flow.invalidated', { project_id: 'proj_a', root: 'C:/repo/backend', reason: 'checkpoint.restore' }))
    await settle()
    expect(flowGet).toHaveBeenCalledTimes(2)
  })

  it('`flow.invalidated` de otro alcance no refresca', async () => {
    mountFlow()
    await waitFor(() => expect(flowGet).toHaveBeenCalledTimes(1))
    act(() => emit('flow.invalidated', { project_id: 'proj_z', root: 'C:/otro', reason: 'checkpoint.restore' }))
    await settle()
    expect(flowGet).toHaveBeenCalledTimes(1)
  })

  it('una sesión suelta reconoce la invalidación por la raíz que declara su propio flujo', async () => {
    flowGet.mockResolvedValue(
      flowFixture([], { scope: { kind: 'session', id: 'ses_x', title: 'Charla', root: 'C:/repo/backend' } }),
    )
    mountFlow({ kind: 'session', id: 'ses_x' })
    await waitFor(() => expect(flowGet).toHaveBeenCalledTimes(1))
    act(() => emit('flow.invalidated', { project_id: null, root: 'C:/repo/backend', reason: 'checkpoint.restore' }))
    await settle()
    expect(flowGet).toHaveBeenCalledTimes(2)
  })

  it('los eventos que el Engine proyecta están todos: verificación cuenta', async () => {
    flowGet.mockResolvedValue(withSessionA())
    mountFlow()
    await waitFor(() => expect(flowGet).toHaveBeenCalledTimes(1))
    act(() => emit('verification.completed', { session_id: 'ses_a' }))
    await settle()
    expect(flowGet).toHaveBeenCalledTimes(2)
  })

  it('una ráfaga de la misma sesión produce una sola consulta', async () => {
    flowGet.mockResolvedValue(withSessionA())
    mountFlow()
    await waitFor(() => expect(flowGet).toHaveBeenCalledTimes(1))
    act(() => {
      emit('turn.started', { session_id: 'ses_a' })
      emit('model.started', { session_id: 'ses_a' })
      emit('turn.changes.completed', { session_id: 'ses_a' })
      emit('turn.completed', { session_id: 'ses_a' })
    })
    await settle()
    expect(flowGet).toHaveBeenCalledTimes(2)
  })
})

describe('revisión y respuestas tardías', () => {
  it('la misma revisión no reemplaza el objeto que ya se estaba mostrando', async () => {
    const first = withSessionA()
    flowGet.mockResolvedValue(first)
    const hook = mountFlow()
    await waitFor(() => expect(hook.result.current.data).not.toBeNull())
    const shown = hook.result.current.data
    // Otra respuesta con la misma revisión: mismos hechos, objeto distinto.
    flowGet.mockResolvedValue({ ...withSessionA() })
    act(() => emit('turn.completed', { session_id: 'ses_a' }))
    await settle()
    expect(flowGet).toHaveBeenCalledTimes(2)
    expect(hook.result.current.data).toBe(shown)
  })

  it('una revisión nueva sí se adopta', async () => {
    flowGet.mockResolvedValue(withSessionA())
    const hook = mountFlow()
    await waitFor(() => expect(hook.result.current.data).not.toBeNull())
    flowGet.mockResolvedValue(flowFixture([stageFixture({ id: 'stg_2', index: 2 })], { revision: 'rev-2' }))
    act(() => emit('turn.completed', { session_id: 'ses_a' }))
    await settle()
    await waitFor(() => expect(hook.result.current.data?.revision).toBe('rev-2'))
  })

  it('una respuesta de un alcance anterior no pisa al alcance nuevo', async () => {
    let releaseOld: ((value: unknown) => void) | null = null
    flowGet.mockImplementationOnce(() => new Promise((resolve) => { releaseOld = resolve }))
    const hook = renderHook(({ scope }) => useFlow(scope), {
      initialProps: { scope: { kind: 'project' as const, id: 'proj_a' } },
    })
    flowGet.mockResolvedValue(flowFixture([stageFixture({ id: 'stg_new', index: 1 })], { revision: 'rev-nuevo' }))
    hook.rerender({ scope: { kind: 'project' as const, id: 'proj_b' } })
    await waitFor(() => expect(hook.result.current.data?.revision).toBe('rev-nuevo'))
    // La vieja resuelve ahora, tarde: no debe reemplazar nada.
    await act(async () => {
      releaseOld?.(flowFixture([stageFixture({ id: 'stg_old', index: 9 })], { revision: 'rev-viejo' }))
      await Promise.resolve()
    })
    expect(hook.result.current.data?.revision).toBe('rev-nuevo')
  })
})

describe('F11-12: un refresco fallido no borra ni disfraza lo leído', () => {
  it('con datos previos el estado es «desactualizado», no «sin datos»', async () => {
    flowGet.mockResolvedValue(withSessionA())
    const hook = mountFlow()
    await waitFor(() => expect(hook.result.current.data).not.toBeNull())
    const readAt = hook.result.current.updatedAt
    expect(readAt).not.toBeNull()
    flowGet.mockRejectedValue(new Error('engine unavailable'))
    act(() => emit('turn.completed', { session_id: 'ses_a' }))
    await settle()
    await waitFor(() => expect(hook.result.current.error).toContain('engine unavailable'))
    expect(hook.result.current.data).not.toBeNull()
    expect(hook.result.current.stale).toBe(true)
    // La marca sigue siendo la de la última lectura buena: fechar el aviso con
    // el fallo diría que los datos son de ahora.
    expect(hook.result.current.updatedAt).toBe(readAt)
  })

  it('sin datos previos el error es el estado, y `stale` es falso', async () => {
    flowGet.mockRejectedValue(new Error('engine unavailable'))
    const hook = mountFlow()
    await waitFor(() => expect(hook.result.current.error).toContain('engine unavailable'))
    expect(hook.result.current.data).toBeNull()
    expect(hook.result.current.stale).toBe(false)
  })

  it('cambiar de alcance no arrastra los datos del anterior', async () => {
    flowGet.mockResolvedValue(withSessionA())
    const hook = renderHook(({ scope }) => useFlow(scope), {
      initialProps: { scope: { kind: 'project' as const, id: 'proj_a' } },
    })
    await waitFor(() => expect(hook.result.current.data).not.toBeNull())
    flowGet.mockRejectedValue(new Error('no existe'))
    hook.rerender({ scope: { kind: 'project' as const, id: 'proj_b' } })
    await waitFor(() => expect(hook.result.current.error).toContain('no existe'))
    expect(hook.result.current.data).toBeNull()
    expect(hook.result.current.stale).toBe(false)
  })
})

it('sin capability no se llama al Engine en absoluto', async () => {
  renderHook(() => useFlow({ kind: 'project', id: 'proj_a' }, { enabled: false }))
  await settle()
  expect(flowGet).not.toHaveBeenCalled()
  expect(sessionList).not.toHaveBeenCalled()
})
