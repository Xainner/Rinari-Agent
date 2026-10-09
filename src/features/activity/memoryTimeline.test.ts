import { describe, expect, it } from 'vitest'
import { projectActivity } from './activityPresentation'
import { createInitialTimelineState, engineEventAction, turnTimelineReducer } from './turnTimelineReducer'

const NOW = 1_700_000_000_000
const event = (name: string, payload: Record<string, unknown>) => engineEventAction({ type: 'event', event: name, payload }, NOW)!
const ids = { turn_id: 't1', session_id: 's1' }
const candidate = {
  ...ids, candidate_id: 'c1', topic: 'Editor', text: 'Usa VS Code', kind: 'environment',
  scope: 'user', reason: 'Lo mencionaste dos veces', sensitive: false, activity_seq: 3,
}

describe('memoria en la línea del turno', () => {
  it('memory.candidate.created crea una propuesta pendiente fuera de la actividad plegada', () => {
    let state = turnTimelineReducer(createInitialTimelineState(), event('turn.started', ids))
    state = turnTimelineReducer(state, event('memory.candidate.created', candidate))
    const [item] = state.timelines.t1.items
    expect(item).toMatchObject({
      id: 'memory:candidate:c1', type: 'memory', memoryEvent: 'candidate', candidateId: 'c1',
      topic: 'Editor', text: 'Usa VS Code', kind: 'environment', reason: 'Lo mencionaste dos veces',
      sensitive: false, status: 'pending',
    })
    const projection = projectActivity(state.timelines.t1)
    expect(projection.memories.map((memory) => memory.id)).toEqual(['memory:candidate:c1'])
    expect(projection.segments.flatMap((segment) => segment.items)).toEqual([])
  })

  it('memory.candidate.resolved actualiza la propuesta y un created repetido no la reabre', () => {
    let state = turnTimelineReducer(createInitialTimelineState(), event('turn.started', ids))
    state = turnTimelineReducer(state, event('memory.candidate.created', candidate))
    state = turnTimelineReducer(state, event('memory.candidate.resolved', { ...ids, candidate_id: 'c1', status: 'approved', memory_id: 'm9' }))
    expect(state.timelines.t1.items[0]).toMatchObject({ status: 'approved', memoryId: 'm9' })
    state = turnTimelineReducer(state, event('memory.candidate.created', candidate))
    expect(state.timelines.t1.items[0]).toMatchObject({ status: 'approved' })
    state = turnTimelineReducer(state, event('memory.candidate.resolved', { ...ids, candidate_id: 'c1', status: 'denied' }))
    expect(state.timelines.t1.items[0]).toMatchObject({ status: 'denied' })
  })

  it('memory.remembered crea el aviso «Recordado»', () => {
    let state = turnTimelineReducer(createInitialTimelineState(), event('turn.started', ids))
    state = turnTimelineReducer(state, event('memory.remembered', { ...ids, memory_id: 'm1', topic: 'Idioma', text: 'Responde en español', kind: 'preference', scope: 'user' }))
    expect(state.timelines.t1.items[0]).toMatchObject({
      id: 'memory:remembered:m1', type: 'memory', memoryEvent: 'remembered', memoryId: 'm1',
      text: 'Responde en español', status: 'remembered',
    })
    expect(projectActivity(state.timelines.t1).memories).toHaveLength(1)
  })

  it('una resolución que cita un turno no cargado no crea un turno fantasma', () => {
    let state = createInitialTimelineState()
    state = turnTimelineReducer(state, event('memory.candidate.resolved', { turn_id: 'otro', session_id: 's2', candidate_id: 'c1', status: 'approved' }))
    expect(state.timelines.otro).toBeUndefined()
    expect(state.busySessions.has('s2')).toBe(false)
    // Sin turno (resuelta desde Ajustes) tampoco toca la línea de tiempo.
    expect(engineEventAction({ type: 'event', event: 'memory.candidate.resolved', payload: { candidate_id: 'c1', status: 'denied' } }, NOW)).toBeTruthy()
    expect(turnTimelineReducer(state, event('memory.candidate.resolved', { candidate_id: 'c1', status: 'denied' }))).toBe(state)
  })

  it('una propuesta de un subagente también sale como tarjeta, una sola vez', () => {
    let state = turnTimelineReducer(createInitialTimelineState(), event('turn.started', ids))
    state = turnTimelineReducer(state, event('agent.started', { ...ids, agent_id: 'a1', activity_seq: 1 }))
    state = turnTimelineReducer(state, event('agent.activity', { ...candidate, agent_id: 'a1', child_event: 'memory.candidate.created' }))
    const projection = projectActivity(state.timelines.t1)
    expect(projection.memories.map((memory) => memory.candidateId)).toEqual(['c1'])
  })
})
