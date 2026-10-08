import { describe, expect, it } from 'vitest'
import { activityState, projectActivity, turnDuration } from './activityPresentation'
import { elapsedLabel } from './TurnMeta'
import type { ApprovalTimelineItem, ModelTimelineItem, TimelineItem, ToolTimelineItem, TurnTimeline } from './types'
import { createInitialTimelineState, engineEventAction, turnTimelineReducer } from './turnTimelineReducer'

const tool = (id: string, seq: number, status: ToolTimelineItem['status'] = 'running'): ToolTimelineItem => ({ id: `tool:${id}`, type: 'tool', toolCallId: id, tool: 'shell.exec', status, activitySeq: seq, occurredAt: seq })
const model: ModelTimelineItem = { id: 'm', type: 'model', modelCallId: 'm', status: 'streaming', content: 'Texto público', activitySeq: 1, occurredAt: 1 }
const approval: ApprovalTimelineItem = { id: 'p', type: 'approval', approvalId: 'p', status: 'pending', capability: 'shell.exec', risk: 'high', description: 'Ejecutar', activitySeq: 4, occurredAt: 4 }
const turn = (items: TimelineItem[], status: TurnTimeline['status'] = 'running'): TurnTimeline => ({ turnId: 't', sessionId: 's', startedAt: 1000, userMessage: 'Hola', items, status })

describe('activity projection and state', () => {
  it('chooses a still-active action by logical start, never by stdout timestamps', () => {
    const timeline = turn([tool('first', 2), tool('second', 3), tool('done', 4, 'completed')])
    expect(activityState(timeline)).toMatchObject({ kind: 'action', item: { id: 'tool:second' }, simultaneous: 2 })
    timeline.items[0] = { ...tool('first', 2), occurredAt: 999, presentation: { kind: 'command', stdout: 'changing output' } }
    expect(activityState(timeline)).toMatchObject({ item: { id: 'tool:second' }, simultaneous: 2 })
    timeline.items[1] = tool('second', 3, 'completed')
    expect(activityState(timeline)).toMatchObject({ item: { id: 'tool:first' }, simultaneous: 1 })
  })
  it.each(['completed', 'failed', 'cancelled', 'stopped'] as const)('terminal %s wins over late events, questions, tools and children', status => {
    expect(activityState(turn([tool('a', 1), approval], status))).toEqual({ kind: status, parallel: 0 })
    expect(projectActivity(turn([approval], status)).approvals).toEqual([])
  })
  it('orders intervention, cancellation, compaction, action and model states', () => {
    expect(activityState(turn([approval, tool('a', 1)], 'cancelling')).kind).toBe('approval')
    expect(activityState(turn([{ ...approval, status: 'resolving' }], 'cancelling')).kind).toBe('cancelling')
    expect(activityState(turn([{ id: 'c', type: 'context', status: 'running', activitySeq: 1, occurredAt: 1 }, tool('a', 2)]))).toMatchObject({ kind: 'action', item: { type: 'context' } })
    expect(activityState(turn([model])).kind).toBe('responding')
    expect(activityState(turn([{ ...model, content: '' }])).kind).toBe('thinking')
    expect(activityState(turn([{ ...model, status: 'completed', outputKind: 'progress' }])).kind).toBe('waiting')
  })
  it('counts a vision/tool pair once and keeps child tools out of the coordinator count', () => {
    const timeline = turn([tool('a', 1), { id: 'v', type: 'vision', toolCallId: 'a', status: 'running', route: 'dedicated', activitySeq: 2, occurredAt: 2, modelId: '', modelName: '', providerName: '', question: '', analysis: '', images: [], cached: false }, { id: 'agent:a', type: 'agent', agentId: 'a', agent: 'explore', status: 'running', phase: 'started', activitySeq: 3, occurredAt: 3, items: [tool('child', 1)] }])
    expect(activityState(timeline)).toMatchObject({ simultaneous: 1, parallel: 1 })
    expect(projectActivity(timeline).actions).toBe(2)
  })
  it('deduplicates pending child approvals, preserving the resolver identity outside activity', () => {
    const timeline = turn([approval, { id: 'agent:a', type: 'agent', agentId: 'a', agent: 'explore', status: 'running', phase: 'started', activitySeq: 3, occurredAt: 3, items: [approval] }])
    const projected = projectActivity(timeline)
    expect(projected.approvals).toEqual([{ item: approval, agent: undefined }])
    expect(projected.segments[0].items).toMatchObject([{ type: 'agent', items: [] }])
    timeline.items[0] = { ...approval, status: 'allowed' }
    expect(projectActivity(timeline).approvals).toHaveLength(0)
    expect(activityState(timeline).kind).not.toBe('approval')
  })
  it('keeps stable segment identities around steering and classifies public text once', () => {
    const timeline = turn([model, { id: 'steer:1', type: 'steer', steerId: '1', content: 'Mi instrucción', status: 'pending', activitySeq: 2, occurredAt: 2 }, tool('a', 3)])
    expect(projectActivity(timeline).provisional).toBe(model)
    const progress = projectActivity({ ...timeline, items: [{ ...model, outputKind: 'progress' }, ...timeline.items.slice(1)] })
    expect(progress.segments.map(s => s.id)).toEqual(['initial', 'steer:1'])
    expect(progress.segments[0].items).toHaveLength(1)
    expect(progress.segments[1].steer?.content).toBe('Mi instrucción')
    const final = projectActivity(turn([{ ...model, outputKind: 'final' }], 'completed'))
    expect(final.final?.content).toBe(model.content)
    expect(final.segments[0].items).toEqual([])
    expect(final.provisional).toBeUndefined()
  })
  it('recovers live events and duplicate deltas without inflated counts', () => {
    let state = createInitialTimelineState()
    const event = (name: string, fields: Record<string, unknown>) => engineEventAction({ type: 'event', event: name, payload: { session_id: 's', turn_id: 't', ...fields } }, 1000)!
    state = turnTimelineReducer(state, event('turn.started', {}))
    const start = event('tool.started', { tool_call_id: 'a', tool: 'shell.exec', activity_seq: 1 })
    state = turnTimelineReducer(turnTimelineReducer(state, start), start)
    expect(projectActivity(state.timelines.t).actions).toBe(1)
    state = turnTimelineReducer(state, event('turn.completed', {}))
    state = turnTimelineReducer(state, start)
    expect(activityState(state.timelines.t).kind).toBe('completed')
  })
  it('reports valid elapsed durations without inventing a missing terminal timestamp', () => {
    expect(turnDuration(turn([]), 2500)).toBe(1500)
    expect(turnDuration(turn([], 'completed'), 9000)).toBeNull()
    expect(turnDuration({ ...turn([]), startedAt: NaN }, 9000)).toBeNull()
    expect(turnDuration({ ...turn([], 'completed'), completedAt: 900 })).toBeNull()
    expect(elapsedLabel(3661000)).toBe('1h 1m 1s')
  })
})
