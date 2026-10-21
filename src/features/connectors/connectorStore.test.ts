import { afterEach, describe, expect, it } from 'vitest'
import { resetConnectorEvents, useConnectorEvents } from './connectorStore'

afterEach(() => resetConnectorEvents())

const apply = (event: string, payload: Record<string, unknown>) => useConnectorEvents.getState().apply({ type: 'event', event, payload })

describe('connector events', () => {
  it('keeps the live status per server and logs it', () => {
    apply('mcp.status.changed', { name: 'notion', status: 'connecting', connection: { tools: 0, resources: false, attempts: 1, changed_at: '2026-10-20T10:00:00Z' } })
    apply('mcp.status.changed', { name: 'notion', status: 'error', connection: { code: 'MCP_UNREACHABLE', hint: 'check_url_or_network', message: 'refused', tools: 0, resources: false, attempts: 2 } })
    const state = useConnectorEvents.getState()
    expect(state.live.notion.status).toBe('error')
    expect(state.log.map((entry) => entry.value)).toEqual(['error', 'connecting'])
    expect(state.log[0]).toMatchObject({ server: 'notion', kind: 'status', hint: 'check_url_or_network', message: 'refused' })
    expect(state.tick).toBe(2)
  })

  it('follows a sign-in from its stages to its outcome', () => {
    useConnectorEvents.getState().startFlow('linear', 'flow-1')
    apply('mcp.auth.progress', { name: 'linear', flow_id: 'flow-1', stage: 'waiting_for_browser' })
    expect(useConnectorEvents.getState().auth.linear).toMatchObject({ flowId: 'flow-1', stage: 'waiting_for_browser', outcome: null })
    apply('mcp.auth.finished', { name: 'linear', flow_id: 'flow-1', outcome: 'failed', error: { code: 'OAUTH_DENIED', message: 'access_denied' } })
    expect(useConnectorEvents.getState().auth.linear).toMatchObject({ outcome: 'failed', error: { code: 'OAUTH_DENIED' } })
    expect(useConnectorEvents.getState().log[0]).toMatchObject({ kind: 'auth', value: 'failed', hint: 'OAUTH_DENIED' })
  })

  it('ignores events without a server name', () => {
    apply('mcp.status.changed', { status: 'connected' })
    expect(useConnectorEvents.getState().log).toEqual([])
  })
})

it('keeps the outcome of a sign-in that finished before mcp.auth.start returned', () => {
  apply('mcp.auth.finished', { name: 'fast', flow_id: 'f9', outcome: 'signed_in' })
  useConnectorEvents.getState().startFlow('fast', 'f9')
  expect(useConnectorEvents.getState().auth.fast).toMatchObject({ flowId: 'f9', outcome: 'signed_in' })
  useConnectorEvents.getState().startFlow('fast', 'f10')
  expect(useConnectorEvents.getState().auth.fast).toMatchObject({ flowId: 'f10', outcome: null })
})

it('forgets the live status of a removed server and of one the list no longer has', () => {
  apply('mcp.status.changed', { name: 'gone', status: 'connected' })
  apply('mcp.status.changed', { name: 'old', status: 'error' })
  apply('mcp.status.changed', { name: 'kept', status: 'connected' })
  useConnectorEvents.getState().forget('gone')
  expect(Object.keys(useConnectorEvents.getState().live).sort()).toEqual(['kept', 'old'])
  useConnectorEvents.getState().prune(['kept', 'new'])
  expect(Object.keys(useConnectorEvents.getState().live)).toEqual(['kept'])
})
