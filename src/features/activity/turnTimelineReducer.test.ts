import { describe, expect, it } from 'vitest'
import { buildChatStream } from './buildChatStream'
import { createInitialTimelineState, engineEventAction, turnTimelineReducer } from './turnTimelineReducer'

const NOW = 1_700_000_000_000
const event = (name: string, payload: Record<string, unknown>) => engineEventAction({ type: 'event', event: name, payload }, NOW)!

describe('narrative activity timeline', () => {
  it('updates one compaction identity and preserves failure', () => {
    const ids = { turn_id: 'compact', session_id: 'session', compaction_id: 'operation' }
    let state = turnTimelineReducer(createInitialTimelineState(), event('turn.started', ids))
    state = turnTimelineReducer(state, event('governor.compact', { ...ids, status: 'started', activity_seq: 1 }))
    state = turnTimelineReducer(state, event('governor.compact', { ...ids, status: 'failed', activity_seq: 2 }))
    expect(state.timelines.compact.items).toHaveLength(1)
    expect(state.timelines.compact.items[0]).toMatchObject({ type: 'context', status: 'failed' })
  })
  it('does not resurrect a completed turn when its agent reports a late failure', () => {
    let state = createInitialTimelineState()
    const ids = { turn_id: 't1', session_id: 's1' }
    state = turnTimelineReducer(state, event('turn.started', ids))
    state = turnTimelineReducer(state, event('agent.started', { ...ids, agent_id: 'a1' }))
    state = turnTimelineReducer(state, event('turn.completed', ids))
    state = turnTimelineReducer(state, event('agent.failed', { ...ids, agent_id: 'a1' }))
    expect(state.timelines.t1.status).toBe('completed')
    expect(state.busySessions.has('s1')).toBe(false)
    state = turnTimelineReducer(state, event('turn.started', { turn_id: 't2', session_id: 's1' }))
    state = turnTimelineReducer(state, event('agent.failed', { ...ids, agent_id: 'a1' }))
    expect(state.busySessions.has('s1')).toBe(true)
  })
  it('retains the mode of the turn independently of later session changes', () => {
    let state = turnTimelineReducer(createInitialTimelineState(), event('turn.started', { turn_id: 'plan', session_id: 's1', mode: 'plan' }))
    state = turnTimelineReducer(state, event('turn.completed', { turn_id: 'plan', session_id: 's1' }))
    state = turnTimelineReducer(state, event('turn.started', { turn_id: 'build', session_id: 's1', mode: 'build' }))
    expect(state.timelines.plan.mode).toBe('plan')
    expect(state.timelines.build.mode).toBe('build')
  })
  it('merges model deltas and completion into one logical call', () => {
    let state = createInitialTimelineState()
    state = turnTimelineReducer(state, event('turn.started', { turn_id: 't1', session_id: 's1' }))
    state = turnTimelineReducer(state, event('model.started', { turn_id: 't1', session_id: 's1', model_call_id: 'm1', activity_seq: 1 }))
    state = turnTimelineReducer(state, event('model.content.delta', { turn_id: 't1', session_id: 's1', model_call_id: 'm1', activity_seq: 1, delta: 'Ho' }))
    state = turnTimelineReducer(state, event('model.content.completed', { turn_id: 't1', session_id: 's1', model_call_id: 'm1', activity_seq: 1, content: 'Hola', output_kind: 'final' }))
    expect(state.timelines.t1.items).toHaveLength(1)
    expect(state.timelines.t1.items[0]).toMatchObject({ type: 'model', content: 'Hola', outputKind: 'final' })
  })

  it('keeps separate tool calls ordered and settles the turn', () => {
    let state = createInitialTimelineState()
    state = turnTimelineReducer(state, event('turn.started', { turn_id: 't1', session_id: 's1' }))
    state = turnTimelineReducer(state, event('tool.started', { turn_id: 't1', session_id: 's1', tool_call_id: 'b', tool: 'shell.exec', activity_seq: 3 }))
    state = turnTimelineReducer(state, event('tool.completed', { turn_id: 't1', session_id: 's1', tool_call_id: 'a', tool: 'file.read', activity_seq: 2 }))
    state = turnTimelineReducer(state, event('turn.completed', { turn_id: 't1', session_id: 's1' }))
    expect(state.timelines.t1.items.map((item) => item.id)).toEqual(['tool:a', 'tool:b'])
    expect(state.timelines.t1.status).toBe('completed')
    expect(state.busySessions.has('s1')).toBe(false)
  })

  it('updates approval in place and disables it after resolution', () => {
    let state = createInitialTimelineState()
    state = turnTimelineReducer(state, event('approval.requested', { turn_id: 't1', session_id: 's1', approval_id: 'p1', activity_seq: 1, capability: 'shell.exec' }))
    state = turnTimelineReducer(state, event('approval.resolved', { turn_id: 't1', session_id: 's1', approval_id: 'p1', activity_seq: 1, decision: 'allow_once' }))
    expect(state.timelines.t1.items).toHaveLength(1)
    expect(state.timelines.t1.items[0]).toMatchObject({ type: 'approval', status: 'allowed' })
    expect(state.approvals).toHaveLength(0)
  })

  it('preserves non-reusable approval choices from the engine', () => {
    const state = turnTimelineReducer(createInitialTimelineState(), event('approval.requested', {
      turn_id: 't1', session_id: 's1', approval_id: 'p1', activity_seq: 1,
      capability: 'fs.write', choices: ['deny', 'allow_once'],
      rule_id: 'sensitive_file_write', reusable: false,
    }))
    expect(state.timelines.t1.items[0]).toMatchObject({
      type: 'approval', choices: ['deny', 'allow_once'],
      ruleId: 'sensitive_file_write', reusable: false,
    })
  })

  it('deduplicates changeset lifecycle and retains its persisted files', () => {
    let state = createInitialTimelineState()
    state = turnTimelineReducer(state, event('turn.changes.completed', {
      turn_id: 't1', session_id: 's1', id: 'chg1', activity_seq: 4,
      additions: 2, deletions: 1, undoable: true, attribution_complete: true,
      warnings: [], files: [{ path: 'a.ts', absolute_path: '/repo/a.ts', kind: 'modified', ownership: 'agent', confidence: 'exact', binary: false, sensitive: false, diff: '+x', diff_truncated: false, undoable: true }],
    }))
    state = turnTimelineReducer(state, event('turn.changes.undo.completed', {
      turn_id: 't1', session_id: 's1', changeset_id: 'chg1', activity_seq: 8,
      status: 'undone', applied: ['a.ts'], skipped: [], conflicts: [],
    }))
    expect(state.timelines.t1.items).toHaveLength(1)
    expect(state.timelines.t1.items[0]).toMatchObject({
      type: 'changeset', changesetId: 'chg1', status: 'undone',
      additions: 2, files: [{ path: 'a.ts' }],
    })
  })

  it('deduplicates history messages covered by a timeline', () => {
    const timeline = { turnId: 't1', sessionId: 's1', status: 'completed' as const, startedAt: NOW, completedAt: NOW + 1, userMessage: 'Hola', items: [] }
    const rows = buildChatStream([
      { id: 'u', role: 'user', content: 'Hola', createdAt: NOW, turnId: 't1' },
      { id: 'a', role: 'assistant', content: 'Hola', createdAt: NOW + 1, turnId: 't1' },
    ], { t1: timeline }, 's1')
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('timeline')
  })

  it('reconciles a snapshot into the live model row without repeating content', () => {
    let state = createInitialTimelineState()
    state = turnTimelineReducer(state, event('model.content.delta', { turn_id: 't1', session_id: 's1', model_call_id: 'm1', activity_seq: 1, delta: 'Hola' }))
    state = turnTimelineReducer(state, {
      type: 'snapshot/restored',
      now: NOW + 1,
      snapshot: { active_turns: [{ turn_id: 't1', session_id: 's1', started_at: NOW, items: [{ event: 'model.content.delta', turn_id: 't1', session_id: 's1', model_call_id: 'm1', activity_seq: 1, content: 'Hola', delta: 'Hola' }] }] },
    })
    expect(state.timelines.t1.items).toHaveLength(1)
    expect(state.timelines.t1.items[0]).toMatchObject({ content: 'Hola' })
  })

  it('lets persisted terminal history settle a live timeline', () => {
    let state = createInitialTimelineState()
    state = turnTimelineReducer(state, event('turn.started', { turn_id: 't1', session_id: 's1' }))
    state = turnTimelineReducer(state, { type: 'timeline/loaded', sessionId: 's1', turns: [{ turn_id: 't1', session_id: 's1', turn_index: 0, status: 'completed', started_at: new Date(NOW).toISOString(), completed_at: new Date(NOW + 2).toISOString(), user_message: 'Hola', items: [], final_response: 'Hola' }] })
    expect(state.timelines.t1.status).toBe('completed')
    expect(state.timelines.t1.items).toHaveLength(1)
  })
})


it('keeps child commands and answers inside one agent card through live updates and reload', () => {
  const base = { turn_id: 't', session_id: 's', agent_id: 'a', agent: 'explore', occurred_at: new Date(NOW).toISOString() }
  const rows = [
    { ...base, event: 'agent.started', activity_seq: 1, objective: 'Inspect SSH' },
    { ...base, event: 'agent.activity', child_event: 'tool.started', activity_seq: 2, tool_call_id: 'tc', tool: 'shell.exec' },
    { ...base, event: 'agent.activity', child_event: 'tool.completed', activity_seq: 2, tool_call_id: 'tc', tool: 'shell.exec', presentation: { kind: 'command', status: 'success', stdout: 'Máquina lista\n', stderr: '' } },
    { ...base, event: 'agent.activity', child_event: 'model.content.completed', activity_seq: 3, model_call_id: 'm', content: 'Child answer', output_kind: 'final' },
    { ...base, event: 'agent.completed', activity_seq: 4, summary: 'Child answer' },
  ]
  let state = createInitialTimelineState()
  for (const row of rows) state = turnTimelineReducer(state, event(row.event, row))
  expect(state.timelines.t.items).toHaveLength(1)
  expect(state.timelines.t.items[0]).toMatchObject({ type: 'agent', status: 'completed', items: [
    { type: 'tool', status: 'completed', presentation: { stdout: 'Máquina lista\n' } },
    { type: 'model', content: 'Child answer' },
  ] })
  const restored = turnTimelineReducer(createInitialTimelineState(), { type: 'timeline/loaded', sessionId: 's', turns: [{
    turn_id: 't', session_id: 's', turn_index: 1, status: 'completed', started_at: '2026-09-11', completed_at: '2026-09-11', user_message: 'Inspect', items: rows, final_response: 'Parent answer',
  }] })
  expect(restored.timelines.t.items.filter(item => item.type === 'agent')).toEqual(state.timelines.t.items)
  expect(restored.timelines.t.items.filter(item => item.type === 'model')).toMatchObject([{ content: 'Parent answer' }])
})


it('merges visual analysis without inventing tool calls and restores history', () => {
  const payload = { session_id: 's1', turn_id: 'v1', vision_id: 'image-query', activity_seq: 1,
    route: 'dedicated', model_id: 'visual', question: '¿Qué ves?',
    images: [{ uri: 'artifact://s1/media/a.png', name: 'a.png', path: 'a.png', width: 30, height: 20 }] }
  let state = turnTimelineReducer(createInitialTimelineState(), event('vision.started', payload))
  state = turnTimelineReducer(state, event('vision.completed', { ...payload, analysis: 'Una imagen', cached: false }))
  state = turnTimelineReducer(state, event('vision.completed', { ...payload, analysis: 'Una imagen', cached: false }))
  expect(state.timelines.v1.items).toHaveLength(1)
  expect(state.timelines.v1.items[0]).toMatchObject({ type: 'vision', status: 'completed', analysis: 'Una imagen' })
  expect(state.timelines.v1.items.filter(item => item.type === 'tool')).toHaveLength(0)
  const restored = turnTimelineReducer(createInitialTimelineState(), { type: 'timeline/loaded', sessionId: 's1', turns: [{
    turn_id: 'v1', session_id: 's1', status: 'completed', started_at: '2026-09-12T00:00:00Z',
    items: [{ ...payload, event: 'vision.completed', analysis: 'Una imagen' }],
  } as never] })
  expect(restored.timelines.v1.items[0]).toMatchObject({ type: 'vision', analysis: 'Una imagen' })
})

describe('peer provenance', () => {
  const origin = { kind: 'peer' as const, source_session_id: 'ses_a', source_label: 'Proyecto A', hop: 1, message_id: 'msg_1' }
  it('keeps the origin of a peer-started turn and exposes it to the chat stream', () => {
    let state = turnTimelineReducer(createInitialTimelineState(), event('turn.started', { turn_id: 't1', session_id: 'ses_b', message: '¿qué cambió?', origin }))
    expect(state.timelines.t1.origin).toMatchObject({ kind: 'peer', source_session_id: 'ses_a' })
    state = turnTimelineReducer(state, event('turn.completed', { turn_id: 't1', session_id: 'ses_b' }))
    expect(state.timelines.t1.origin?.kind).toBe('peer')
    const rows = buildChatStream([], state.timelines, 'ses_b')
    expect(rows).toHaveLength(1)
    expect(rows[0].kind === 'timeline' && rows[0].timeline.origin?.source_label).toBe('Proyecto A')
  })
  it('restores the origin from a persisted timeline turn and ignores malformed values', () => {
    const state = turnTimelineReducer(createInitialTimelineState(), {
      type: 'timeline/loaded',
      sessionId: 'ses_b',
      turns: [
        { turn_id: 't1', session_id: 'ses_b', turn_index: 1, status: 'completed', started_at: '2026-09-15T10:00:00Z', completed_at: '2026-09-15T10:00:05Z', user_message: 'hola', items: [], final_response: 'ok', origin },
        { turn_id: 't2', session_id: 'ses_b', turn_index: 2, status: 'completed', started_at: '2026-09-15T10:01:00Z', completed_at: null, user_message: 'propio', items: [], final_response: '', origin: { kind: 'bogus' } as never },
      ],
    })
    expect(state.timelines.t1.origin?.kind).toBe('peer')
    expect(state.timelines.t2.origin).toBeUndefined()
  })
})
