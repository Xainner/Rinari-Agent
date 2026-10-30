// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { createInitialTimelineState, engineEventAction, turnTimelineReducer } from '../activity/turnTimelineReducer'
import type { AgentTimelineItem, TurnTimeline } from '../activity/types'
import { useAgentFocusStore } from '../../stores/agentFocus'

const NOW = 1_000
const event = (name: string, payload: Record<string, unknown>) => engineEventAction({ type: 'event', event: name, payload }, NOW)!
const base = { session_id: 's1', turn_id: 't1' }
const agent = { agent_id: 'agt_001', agent: 'explore', nickname: 'Vega' }

function timelineWith(events: Array<[string, Record<string, unknown>]>): Record<string, TurnTimeline> {
  let state = createInitialTimelineState()
  for (const [name, payload] of events) state = turnTimelineReducer(state, event(name, { ...base, ...payload }))
  return state.timelines
}

const instructions = timelineWith([
  ['turn.started', { activity_seq: 1 }],
  ['agent.started', { ...agent, activity_seq: 2, objective: 'map the api' }],
  // Older sessions: no steer_id. Each instruction must survive (#25).
  ['agent.activity', { ...agent, activity_seq: 3, child_event: 'steer.applied', content: 'admite postId como canónico' }],
  ['agent.activity', { ...agent, activity_seq: 4, child_event: 'tool.completed', tool_call_id: 'c1', tool: 'fs.read', arguments: '{"path":"a.ts"}' }],
  ['agent.activity', { ...agent, activity_seq: 5, child_event: 'steer.applied', content: 'revisa también el upload' }],
  ['agent.activity', { ...agent, activity_seq: 6, child_event: 'steer.applied', content: 'y el logo' }],
  ['agent.completed', { ...agent, activity_seq: 7, summary: 'listo' }],
  ['agent.activity', { ...agent, activity_seq: 8, child_event: 'steer.applied', steer_id: 'call_9', content: 'ahora sus pruebas', source: 'coordinator', follow_up: true }],
])

let timelines = instructions
vi.mock('../engine/EngineContext', () => ({ useOptionalRuntimeStore: () => ({}) }))
vi.mock('../engine/sessionSelectors', () => ({ useSessionTimelines: () => timelines }))

import AgentsPanel from './AgentsPanel'

afterEach(() => {
  cleanup()
  useAgentFocusStore.setState({ bySession: {} })
})

describe('reducer: instructions to a subagent (#25)', () => {
  it('three instructions without steer_id stay three, in order, with the follow-up marked', () => {
    const item = instructions.t1.items.find((entry) => entry.type === 'agent') as AgentTimelineItem
    const steers = (item.items ?? []).filter((child) => child.type === 'steer')
    expect(steers.map((child) => child.type === 'steer' && child.content)).toEqual(['admite postId como canónico', 'revisa también el upload', 'y el logo', 'ahora sus pruebas'])
    expect(steers.at(-1)).toMatchObject({ followUp: true, source: 'coordinator' })
    expect(item.nickname).toBe('Vega')
  })
})

describe('AgentsPanel (#25, #73)', () => {
  const mount = () => render(<I18nProvider lang="es"><AgentsPanel sessionId="s1" /></I18nProvider>)

  it('lists the subagent by nickname and type, with its instructions count', () => {
    mount()
    expect(screen.getByTestId('agent-name').textContent).toBe('Vega · explorador')
    expect(screen.getByText('4 instrucciones')).toBeTruthy()
  })

  it('the detail shows every instruction among the steps, and the follow-up separator', async () => {
    mount()
    await userEvent.click(screen.getByTestId('agent-name'))
    const steps = screen.getAllByTestId('agent-step-instruction')
    expect(steps).toHaveLength(4)
    expect(steps.map((step) => step.textContent)).toEqual([
      expect.stringContaining('admite postId'),
      expect.stringContaining('revisa también el upload'),
      expect.stringContaining('y el logo'),
      expect.stringContaining('Seguimiento'),
    ])
    expect(screen.getAllByText('Instrucción de Rinari')).toHaveLength(4)
  })

  it('an agent from an older session, without nickname, shows its type', () => {
    timelines = timelineWith([
      ['turn.started', { activity_seq: 1 }],
      ['agent.started', { agent_id: 'agt_002', agent: 'reviewer', activity_seq: 2 }],
    ])
    mount()
    expect(screen.getByTestId('agent-name').textContent).toBe('revisor')
    timelines = instructions
  })
})
