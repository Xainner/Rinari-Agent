// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installMockPlatform } from '../../test/mockPlatform'
import { I18nProvider } from '../../i18n'
import Composer from '../../components/composer/Composer'
import { useComposerStore } from '../../stores/composer'
import { buildChatStream } from './buildChatStream'
import { createInitialTimelineState, engineEventAction, turnTimelineReducer } from './turnTimelineReducer'
import TurnTimelineView from './TurnTimelineView'

installMockPlatform()
afterEach(() => {
  cleanup()
  useComposerStore.getState().setTextFor('s1', '')
})

const NOW = 1_700_000_000_000
const event = (name: string, payload: Record<string, unknown>) => engineEventAction({ type: 'event', event: name, payload }, NOW)!
const ids = { turn_id: 't1', session_id: 's1' }

describe('steering the running turn', () => {
  it('shows the message pending, then where Rinari read it', () => {
    let state = turnTimelineReducer(createInitialTimelineState(), event('turn.started', ids))
    state = turnTimelineReducer(state, event('tool.started', { ...ids, tool_call_id: 'c1', tool: 'fs.list', activity_seq: 1 }))
    state = turnTimelineReducer(state, { type: 'steer/sent', sessionId: 's1', turnId: 't1', steerId: 't1:steer_1', content: 'solo .py', now: NOW })
    expect(state.timelines.t1.items.at(-1)).toMatchObject({ type: 'steer', status: 'pending' })
    state = turnTimelineReducer(state, event('tool.completed', { ...ids, tool_call_id: 'c1', tool: 'fs.list', activity_seq: 1 }))
    state = turnTimelineReducer(state, event('steer.applied', { ...ids, steer_id: 't1:steer_1', content: 'solo .py', activity_seq: 2 }))
    state = turnTimelineReducer(state, event('model.started', { ...ids, model_call_id: 'm2', activity_seq: 3 }))
    const items = state.timelines.t1.items
    expect(items.map((item) => item.type)).toEqual(['tool', 'steer', 'model'])
    expect(items[1]).toMatchObject({ status: 'applied', content: 'solo .py' })
    // The reply to the command may arrive after the event: no duplicate.
    state = turnTimelineReducer(state, { type: 'steer/sent', sessionId: 's1', turnId: 't1', steerId: 't1:steer_1', content: 'solo .py', now: NOW })
    expect(state.timelines.t1.items.filter((item) => item.type === 'steer')).toHaveLength(1)
  })

  it('drops what the turn did not read when it comes back', () => {
    let state = turnTimelineReducer(createInitialTimelineState(), event('turn.started', ids))
    state = turnTimelineReducer(state, { type: 'steer/sent', sessionId: 's1', turnId: 't1', steerId: 't1:steer_1', content: 'x', now: NOW })
    state = turnTimelineReducer(state, event('turn.cancelled', ids))
    state = turnTimelineReducer(state, event('steer.returned', { ...ids, messages: ['x'], reason: 'cancelled' }))
    expect(state.timelines.t1.items.some((item) => item.type === 'steer')).toBe(false)
  })

  it('a steering row from history is not taken as the message that started the turn', () => {
    let state = turnTimelineReducer(createInitialTimelineState(), event('turn.started', ids))
    state = turnTimelineReducer(state, event('turn.completed', ids))
    const stream = buildChatStream([
      { id: 'h1', role: 'user', content: 'revisa', createdAt: NOW, turnId: 't1' },
      { id: 'h2', role: 'user', content: 'solo .py', createdAt: NOW + 5, turnId: 't1', origin: { kind: 'user', steer_id: 't1:steer_1' } },
    ], state.timelines, 's1')
    expect(stream).toHaveLength(1)
    expect(stream[0]).toMatchObject({ kind: 'timeline', user: { content: 'revisa' } })
  })

  it('renders the message inside the turn', () => {
    let state = turnTimelineReducer(createInitialTimelineState(), event('turn.started', ids))
    state = turnTimelineReducer(state, { type: 'steer/sent', sessionId: 's1', turnId: 't1', steerId: 't1:steer_1', content: 'más corto', now: NOW })
    render(<I18nProvider lang="es"><TurnTimelineView timeline={state.timelines.t1} now={NOW} onResolveApproval={vi.fn()} /></I18nProvider>)
    const bubble = screen.getByTestId('steer-message')
    expect(bubble.textContent).toContain('más corto')
    expect(bubble.textContent).toContain('Lo leerá al terminar el paso actual')
  })
})

describe('composer while Rinari works', () => {
  const renderComposer = (props: { onSteer?: (text: string) => Promise<boolean>; onQueue?: (text: string) => Promise<boolean> }) =>
    render(<I18nProvider lang="es"><Composer placement="bottom" sessionId="s1" onSend={vi.fn()} isStreaming onStop={vi.fn()} {...props} models={[]} activeAlias="" onUseModel={vi.fn()} onDiscoverModels={vi.fn()} onOpenProviders={vi.fn()} sessionMode="build" onModeChange={vi.fn()} reasoningEffort="off" onReasoningChange={vi.fn()} permissionProfile="workspace" effectivePermissionProfile="workspace" permissionProfilesV2 onPermissionChange={vi.fn()} onSearchFiles={async () => ({ root: '/', files: [] })} /></I18nProvider>)

  it('Enter steers the running turn and Tab leaves it for later', async () => {
    const onSteer = vi.fn(async () => true)
    const onQueue = vi.fn(async () => true)
    renderComposer({ onSteer, onQueue })
    const box = screen.getByRole('textbox', { name: /mensaje/i })
    fireEvent.change(box, { target: { value: 'solo los .py' } })
    expect(screen.getByRole('button', { name: 'Enviar ahora, sin detenerla' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Detener generación' })).toBeTruthy()
    fireEvent.keyDown(box, { key: 'Enter' })
    await vi.waitFor(() => expect(onSteer).toHaveBeenCalledWith('solo los .py'))
    expect(useComposerStore.getState().getDraft('s1').text).toBe('')
    fireEvent.change(box, { target: { value: 'luego los tests' } })
    fireEvent.keyDown(box, { key: 'Tab' })
    await vi.waitFor(() => expect(onQueue).toHaveBeenCalledWith('luego los tests'))
  })

  it('keeps the text when the Engine refuses it', async () => {
    const onSteer = vi.fn(async () => false)
    renderComposer({ onSteer })
    const box = screen.getByRole('textbox', { name: /mensaje/i })
    fireEvent.change(box, { target: { value: 'no se pierde' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    await vi.waitFor(() => expect(onSteer).toHaveBeenCalled())
    await vi.waitFor(() => expect(useComposerStore.getState().getDraft('s1').text).toBe('no se pierde'))
  })

  it('without steering support it only offers Stop', () => {
    renderComposer({})
    expect(screen.queryByRole('button', { name: 'Enviar ahora, sin detenerla' })).toBeNull()
    expect(screen.getByRole('textbox', { name: /mensaje/i }).getAttribute('placeholder')).toBe('Generando respuesta…')
  })
})
