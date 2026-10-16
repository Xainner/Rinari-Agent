// @vitest-environment jsdom
// #33 y #64: avisos de cualquier conversación, no solo de Boards.
import { installMockPlatform } from '../../test/mockPlatform'
const platform = installMockPlatform()
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const toastCalls: Array<{ text: string; options: Record<string, unknown> | undefined }> = []
vi.mock('sonner', () => {
  const fn = (text: string, options?: Record<string, unknown>) => { toastCalls.push({ text, options }) }
  return { toast: Object.assign(fn, { info: fn, success: fn, warning: fn, error: fn }) }
})
vi.mock('../../services/desktop', () => ({
  desktopApi: { questions: vi.fn(async () => ({ questions: [] })), readFile: vi.fn(), answer: vi.fn() },
}))

import { I18nProvider } from '../../i18n'
import { engineEventAction } from '../activity/turnTimelineReducer'
import { createRuntimeStore } from '../engine/runtimeStore'
import { useBoardStore, defaultBoard } from '../../stores/board'
import { useBoardAttentionStore } from '../../stores/boardAttention'
import { useUIStore } from '../../stores/ui'
import { resetNotificationPrefsForTests, useNotificationPrefs } from '../../stores/notificationPrefs'
import { useBoardNotifications, type ConversationTarget } from '../board/useBoardNotifications'
import { NOTIFICATION_GROUP_WINDOW_MS } from '../../services/notificationPolicy'
import { notificationSupport } from '../../services/notifications'
import { refreshWindowAttentionForTests } from '../../hooks/useWindowAttention'
import { APP_NAME } from '../../lib/channel'
import { applyResumeEvent } from '../resume/resumeStore'

const NOW = 1_700_000_000_000
const event = (name: string, payload: Record<string, unknown>) => engineEventAction({ type: 'event', event: name, payload }, NOW)!
const opened: ConversationTarget[] = []

function Harness({ runtime }: { runtime: ReturnType<typeof createRuntimeStore> }) {
  useBoardNotifications({
    runtime,
    labelFor: (id) => (id === 'ses_n' ? 'Logo nuevo' : null),
    projectFor: (id) => (id === 'ses_n' ? 'rinari-web' : null),
    activeSessionId: 'ses_other',
    systemPermission: 'granted',
    memberKey: 'ses_n',
    watchedSessionIds: ['ses_n'],
    openConversation: (target) => opened.push(target),
  })
  return null
}

function finish(runtime: ReturnType<typeof createRuntimeStore>, turnId: string, content: string, mode?: string) {
  act(() => {
    runtime.getState().dispatch(event('turn.started', { turn_id: turnId, session_id: 'ses_n', ...(mode ? { mode } : {}) }))
    runtime.getState().dispatch(event('turn.completed', { turn_id: turnId, session_id: 'ses_n', content }))
    useBoardAttentionStore.getState().observeTerminal('ses_n', turnId, 'completed', 'live', NOW)
    vi.advanceTimersByTime(NOTIFICATION_GROUP_WINDOW_MS + 10)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  toastCalls.length = 0
  opened.length = 0
  platform.bridge.sentNotifications.length = 0
  window.localStorage.clear()
  useBoardStore.getState().hydrate({ ...defaultBoard(), boardId: 'board_1' })
  useBoardAttentionStore.getState().hydrate({})
  useBoardAttentionStore.getState().initializeSessionAttention('ses_n', [])
  useUIStore.setState({ view: 'chat' })
  resetNotificationPrefsForTests()
  Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true })
  refreshWindowAttentionForTests()
  notificationSupport.canSend = false
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('a conversation outside Boards that finishes while you look at another one toasts, and «Ir» opens it at that turn', () => {
  const runtime = createRuntimeStore()
  render(<I18nProvider lang="es"><Harness runtime={runtime} /></I18nProvider>)
  finish(runtime, 't1', 'Listo, el logo quedó en `public/logo.svg`.')
  expect(toastCalls.map((call) => call.text)).toEqual(['«Logo nuevo» terminó.'])
  const action = toastCalls[0].options?.action as { label: string; onClick: () => void }
  expect(action.label).toBe('Ir')
  action.onClick()
  expect(opened).toEqual([{ sessionId: 'ses_n', turnId: 't1' }])
})

it('a finished plan has its own text and «Revisar plan»; the preference turns it back into a plain notice', () => {
  const runtime = createRuntimeStore()
  render(<I18nProvider lang="es"><Harness runtime={runtime} /></I18nProvider>)
  finish(runtime, 't1', '# Migrar la base\n\n1. Copiar\n2. Probar', 'plan')
  expect(toastCalls[0].text).toBe('El plan de «Logo nuevo» está listo para revisar.')
  expect((toastCalls[0].options?.action as { label: string }).label).toBe('Revisar plan')
  useNotificationPrefs.getState().set({ planReady: false })
  finish(runtime, 't2', '# Otro plan', 'plan')
  expect(toastCalls[1].text).toBe('«Logo nuevo» terminó.')
})

it('what was already unread when the app opened does not notify again', () => {
  useBoardAttentionStore.getState().observeTerminal('ses_n', 't0', 'completed', 'live', NOW)
  const runtime = createRuntimeStore()
  render(<I18nProvider lang="es"><Harness runtime={runtime} /></I18nProvider>)
  act(() => { vi.advanceTimersByTime(NOTIFICATION_GROUP_WINDOW_MS + 10) })
  expect(toastCalls).toHaveLength(0)
})

it('#64: with the window in the background, the system notification carries the conversation and the first lines', async () => {
  notificationSupport.canSend = true
  Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => false })
  refreshWindowAttentionForTests()
  const runtime = createRuntimeStore()
  render(<I18nProvider lang="es"><Harness runtime={runtime} /></I18nProvider>)
  finish(runtime, 't1', '**Listo.** El logo quedó en `public/logo.svg`.\n\n```svg\n<svg/>\n```')
  await act(async () => { await Promise.resolve() })
  expect(toastCalls).toHaveLength(0)
  expect(platform.bridge.sentNotifications.at(-1)).toMatchObject({
    title: 'Logo nuevo · rinari-web',
    body: 'Listo. El logo quedó en public/logo.svg.',
    target: { sessionId: 'ses_n', turnId: 't1' },
  })
  useNotificationPrefs.getState().set({ showContent: false })
  finish(runtime, 't2', 'Secreto')
  await act(async () => { await Promise.resolve() })
  expect(platform.bridge.sentNotifications.at(-1)).toMatchObject({ title: APP_NAME, body: '«Logo nuevo» terminó.' })
})

it('#24: when Rinari picks a conversation back up by itself, the notice names it; not while you look at it', () => {
  const runtime = createRuntimeStore()
  render(<I18nProvider lang="es"><Harness runtime={runtime} /></I18nProvider>)
  const resumed = (sessionId: string, revision: number) => applyResumeEvent({
    session_id: sessionId,
    continued: true,
    resume: { session_id: sessionId, state: 'resuming', mode: 'at', attempts: 1, revision },
  })
  act(() => { resumed('ses_n', 1) })
  expect(toastCalls.map((call) => call.text)).toEqual(['Rinari retomó «Logo nuevo».'])
  const action = toastCalls[0].options?.action as { onClick: () => void }
  action.onClick()
  expect(opened).toEqual([{ sessionId: 'ses_n', turnId: undefined }])
  // La conversación abierta en Normal es «ses_other»: ahí no hace falta avisar.
  act(() => { resumed('ses_other', 1) })
  expect(toastCalls).toHaveLength(1)
})
