import { describe, expect, it } from 'vitest'
import { projectActivity } from './activityPresentation'
import { createInitialTimelineState, engineEventAction, turnTimelineReducer } from './turnTimelineReducer'

const NOW = 1_700_000_000_000
const event = (name: string, payload: Record<string, unknown>) => engineEventAction({ type: 'event', event: name, payload }, NOW)!
const ids = { turn_id: 't1', session_id: 's1' }
const proposed = {
  ...ids, name: 'visual-lab-generate', status: 'pending', version: '1.0.0', update: false,
  description: 'Imágenes con ComfyUI', review: 'safe', pending_reason: 'similar_to_installed_skill',
  similar_to: [{ name: 'lab-image', score: 0.41, shared: ['int8', 'bf16'], reason: 'otro backend' }],
  replaces: [], activity_seq: 4,
}

describe('skills en la línea del turno', () => {
  it('skill.proposed crea una tarjeta fuera de la actividad plegada', () => {
    let state = turnTimelineReducer(createInitialTimelineState(), event('turn.started', ids))
    state = turnTimelineReducer(state, event('skill.proposed', proposed))
    const [item] = state.timelines.t1.items
    expect(item).toMatchObject({
      id: 'skill:visual-lab-generate', type: 'skill', name: 'visual-lab-generate', status: 'pending',
      description: 'Imágenes con ComfyUI', pendingReason: 'similar_to_installed_skill',
      similarTo: [{ name: 'lab-image', shared: ['int8', 'bf16'], reason: 'otro backend' }],
    })
    const projection = projectActivity(state.timelines.t1)
    expect(projection.skills.map((skill) => skill.id)).toEqual(['skill:visual-lab-generate'])
    expect(projection.segments.flatMap((segment) => segment.items)).toEqual([])
  })

  it('una fusión aprobada dice qué apagó, y un proposed repetido no la reabre', () => {
    let state = turnTimelineReducer(createInitialTimelineState(), event('turn.started', ids))
    state = turnTimelineReducer(state, event('skill.proposed', { ...proposed, name: 'image-lab', replaces: ['a', 'b'], similar_to: [] }))
    state = turnTimelineReducer(state, event('skill.proposal.resolved', { ...ids, name: 'image-lab', status: 'approved', turned_off: ['a', 'b'] }))
    expect(state.timelines.t1.items[0]).toMatchObject({ status: 'approved', replaces: ['a', 'b'], turnedOff: ['a', 'b'] })
    state = turnTimelineReducer(state, event('skill.proposed', { ...proposed, name: 'image-lab', replaces: ['a', 'b'] }))
    expect(state.timelines.t1.items[0]).toMatchObject({ status: 'approved' })
    state = turnTimelineReducer(state, event('skill.proposal.resolved', { ...ids, name: 'image-lab', status: 'undone', turned_on: ['a', 'b'] }))
    expect(state.timelines.t1.items[0]).toMatchObject({ status: 'undone', turnedOn: ['a', 'b'] })
  })

  it('una resolución sin tarjeta previa, o de un turno no cargado, no inventa nada', () => {
    let state = turnTimelineReducer(createInitialTimelineState(), event('turn.started', ids))
    state = turnTimelineReducer(state, event('skill.proposal.resolved', { ...ids, name: 'ghost', status: 'approved' }))
    expect(state.timelines.t1.items).toEqual([])
    const before = state
    state = turnTimelineReducer(state, event('skill.proposal.resolved', { turn_id: 'other', session_id: 's1', name: 'x', status: 'rejected' }))
    expect(state).toBe(before)
  })
})
