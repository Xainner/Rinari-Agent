// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const toastCalls: Array<{ text: string; options: Record<string, unknown> | undefined }> = []
vi.mock('sonner', () => {
  const fn = (text: string, options?: Record<string, unknown>) => { toastCalls.push({ text, options }) }
  return { toast: Object.assign(fn, { info: fn, success: fn, warning: fn, error: fn }) }
})
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue({}) }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))
vi.mock('../../services/desktop', () => ({
  desktopApi: { questions: vi.fn(async () => ({ questions: [] })), readFile: vi.fn(), answer: vi.fn() },
}))

import { I18nProvider } from '../../i18n'
import { engineEventAction } from '../activity/turnTimelineReducer'
import { createRuntimeStore } from '../engine/runtimeStore'
import { useBoardStore, defaultBoard } from '../../stores/board'
import { useBoardAttentionStore } from '../../stores/boardAttention'
import { useUIStore } from '../../stores/ui'
import { useBoardNotifications } from './useBoardNotifications'
import { NOTIFICATION_GROUP_WINDOW_MS } from '../../services/notificationPolicy'
import { refreshWindowAttentionForTests } from '../../hooks/useWindowAttention'

const NOW = 1_700_000_000_000
const event = (name: string, payload: Record<string, unknown>) => engineEventAction({ type: 'event', event: name, payload }, NOW)!

function Harness({ runtime, memberKey }: { runtime: ReturnType<typeof createRuntimeStore>; memberKey: string }) {
  useBoardNotifications({
    runtime,
    labelFor: (id) => (id === 'ses_a' ? 'Backend API' : id === 'ses_b' ? 'Docs' : null),
    activeSessionId: '',
    systemPermission: 'unsupported',
    memberKey,
  })
  return null
}

beforeEach(() => {
  vi.useFakeTimers()
  toastCalls.length = 0
  window.localStorage.clear()
  useBoardStore.getState().hydrate({ ...defaultBoard(), boardId: 'board_1' })
  useBoardAttentionStore.getState().hydrate({})
  useUIStore.setState({ view: 'chat' })
  useBoardStore.getState().addPane('ses_a')
  useBoardStore.getState().addPane('ses_b')
  useBoardAttentionStore.getState().initializeSessionAttention('ses_a', [])
  useBoardAttentionStore.getState().initializeSessionAttention('ses_b', [])
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('toasts a live unread result once, with a "go to pane" action, and never twice for the same turn', () => {
  const runtime = createRuntimeStore()
  render(<I18nProvider lang="es"><Harness runtime={runtime} memberKey="a|b" /></I18nProvider>)
  act(() => {
    useBoardAttentionStore.getState().observeTerminal('ses_a', 't1', 'completed', 'live')
    vi.advanceTimersByTime(NOTIFICATION_GROUP_WINDOW_MS + 10)
  })
  expect(toastCalls).toHaveLength(1)
  expect(toastCalls[0].text).toBe('«Backend API» finalizó.')
  expect((toastCalls[0].options?.action as { label: string }).label).toBe('Ir al panel')
  // Remount / re-scan: the receipt already carries the notification key.
  act(() => {
    useBoardAttentionStore.getState().markTurnSeen('ses_a', 't1')
    useBoardAttentionStore.getState().observeTerminal('ses_a', 't1', 'completed', 'live')
    vi.advanceTimersByTime(NOTIFICATION_GROUP_WINDOW_MS + 10)
  })
  expect(toastCalls).toHaveLength(1)
})

it('groups a burst of terminals into one toast and ignores baseline history', () => {
  const runtime = createRuntimeStore()
  render(<I18nProvider lang="es"><Harness runtime={runtime} memberKey="a|b" /></I18nProvider>)
  act(() => {
    useBoardAttentionStore.getState().observeTerminal('ses_a', 't1', 'failed', 'live')
    useBoardAttentionStore.getState().observeTerminal('ses_b', 't2', 'completed', 'live')
    useBoardAttentionStore.getState().observeTerminal('ses_b', 't3', 'completed', 'history')
    vi.advanceTimersByTime(NOTIFICATION_GROUP_WINDOW_MS + 10)
  })
  expect(toastCalls).toHaveLength(1)
  expect(toastCalls[0].text).toBe('2 paneles finalizaron.')
})

it('suppresses the toast when the user is attending that session, and respects the toasts preference', () => {
  const runtime = createRuntimeStore()
  render(<I18nProvider lang="es"><Harness runtime={runtime} memberKey="a|b" /></I18nProvider>)
  useUIStore.setState({ view: 'board' })
  useBoardStore.getState().focusPane(useBoardStore.getState().panes[0].paneId)
  document.hasFocus = () => true
  refreshWindowAttentionForTests()
  act(() => {
    useBoardAttentionStore.getState().observeTerminal('ses_a', 't1', 'completed', 'live')
    vi.advanceTimersByTime(NOTIFICATION_GROUP_WINDOW_MS + 10)
  })
  expect(toastCalls).toHaveLength(0)
  useBoardStore.getState().setNotifications({ toasts: false })
  act(() => {
    useBoardAttentionStore.getState().observeTerminal('ses_b', 't2', 'completed', 'live')
    vi.advanceTimersByTime(NOTIFICATION_GROUP_WINDOW_MS + 10)
  })
  expect(toastCalls).toHaveLength(0)
})

it('notifies new interventions by request id, once, and only for board members', () => {
  const runtime = createRuntimeStore()
  render(<I18nProvider lang="es"><Harness runtime={runtime} memberKey="a|b" /></I18nProvider>)
  act(() => {
    runtime.getState().dispatch(event('turn.started', { turn_id: 't1', session_id: 'ses_b' }))
    runtime.getState().dispatch(event('approval.requested', { turn_id: 't1', session_id: 'ses_b', approval_id: 'apr_1', capability: 'shell.exec', target: 'ls', risk: 'medium', description: 'run', choices: ['deny', 'allow_once'] }))
    runtime.getState().dispatch(event('approval.requested', { turn_id: 't1', session_id: 'ses_b', approval_id: 'apr_1', capability: 'shell.exec', target: 'ls', risk: 'medium', description: 'run', choices: ['deny', 'allow_once'] }))
    runtime.getState().dispatch(event('turn.started', { turn_id: 't9', session_id: 'ses_zzz' }))
    runtime.getState().dispatch(event('approval.requested', { turn_id: 't9', session_id: 'ses_zzz', approval_id: 'apr_9', capability: 'shell.exec', target: 'ls', risk: 'medium', description: 'run', choices: ['deny'] }))
  })
  expect(toastCalls.map((call) => call.text)).toEqual(['«Docs» necesita tu intervención.'])
  useBoardStore.getState().setNotifications({ needsYou: false })
  act(() => {
    runtime.getState().dispatch(event('approval.requested', { turn_id: 't1', session_id: 'ses_b', approval_id: 'apr_2', capability: 'shell.exec', target: 'ls', risk: 'medium', description: 'run', choices: ['deny'] }))
  })
  expect(toastCalls).toHaveLength(1)
})
