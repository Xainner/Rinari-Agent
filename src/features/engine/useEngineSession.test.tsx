// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))

import { invoke } from '@tauri-apps/api/core'
import { I18nProvider } from '../../i18n'
import type { ModelSummary, SessionSummary } from '../../services/engine'
import { useComposerStore } from '../../stores/composer'
import { useSessionUiStore } from '../../stores/sessionUi'
import { useEngineSession } from './useEngineSession'

const session = (id: string, extra: Partial<SessionSummary> = {}): SessionSummary => ({
  id,
  kind: 'CHAT',
  title: id,
  mode: 'build',
  state: 'active',
  updated_at: '2026-09-15T00:00:00Z',
  project_id: null,
  project_root: null,
  current_cwd: null,
  git_branch: null,
  last_active_at: '2026-09-15T00:00:00Z',
  provider_id: 'p1',
  model_id: 'm-global',
  permission_profile: 'workspace',
  effective_permission_profile: 'workspace',
  ...extra,
})

const models: ModelSummary[] = [
  { id: 'm-global', alias: 'Global', provider: 'anthropic', provider_model_id: 'g', active: true } as ModelSummary,
  { id: 'm-local', alias: 'Local', provider: 'ollama', provider_model_id: 'qwen', active: false } as ModelSummary,
]

const calls: Array<[string, Record<string, unknown> | undefined]> = []
const ready = { state: 'ready', capabilities: { activity_timeline_v1: true }, detail: null }

function installInvoke(sessions: SessionSummary[]) {
  vi.mocked(invoke).mockImplementation(async (command: string, rawArgs?: unknown) => {
    const args = (rawArgs ?? undefined) as Record<string, unknown> | undefined
    calls.push([command, args])
    switch (command) {
      case 'engine_status':
      case 'engine_start':
        return ready
      case 'session_list':
        return { sessions }
      case 'session_history':
        return { messages: [], total: 0, has_more: false }
      case 'session_timeline':
        return { turns: [] }
      case 'session_open':
        return { session: sessions.find((row) => row.id === args?.reference) ?? sessions[0], created: false, warnings: [] }
      case 'session_get':
        return { session: sessions.find((row) => row.id === args?.reference) ?? sessions[0] }
      case 'session_create':
        return { session: session('ses_new') }
      case 'snapshot_get':
        return { snapshot: { active_turns: [], pending_approvals: [] } }
      case 'provider_list':
        return { providers: [], active_alias: null }
      case 'model_list':
        return { models }
      case 'project_list_recent':
      case 'project_list':
        return { projects: [] }
      case 'turn_start':
        return { turn_id: `turn-${String(args?.session_id)}`, session_id: args?.session_id }
      case 'session_model_set':
        return { session: session(String(args?.reference), { model_id: String(args?.model) }), model: models[1] }
      case 'model_use':
        return { model: models[1], provider: 'ollama', switched_provider: false }
      case 'session_mode_set':
        return { session: session(String(args?.reference)) }
      default:
        return {}
    }
  })
}

const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider lang="es">{children}</I18nProvider>

async function mount(sessions: SessionSummary[]) {
  installInvoke(sessions)
  const hook = renderHook(() => useEngineSession(), { wrapper })
  await act(async () => {
    await hook.result.current.startEngine()
  })
  await waitFor(() => expect(hook.result.current.sessionsLoaded).toBe(true))
  return hook
}

const commandsNamed = (name: string) => calls.filter(([command]) => command === name)

beforeEach(() => {
  calls.length = 0
  window.localStorage.clear()
  useComposerStore.setState({ sessionKey: 'draft', text: '', attachments: [], draftsBySession: {} })
  useSessionUiStore.setState({ bySession: {} })
})

describe('useEngineSession per-session primitives', () => {
  it('sendTo starts a turn on the named session even when another one is active', async () => {
    const hook = await mount([session('s1'), session('s2')])
    expect(hook.result.current.activeSession).toBe('s1')
    let ok = false
    await act(async () => {
      ok = await hook.result.current.sendTo('s2', 'hola s2')
    })
    expect(ok).toBe(true)
    const starts = commandsNamed('turn_start')
    expect(starts).toHaveLength(1)
    expect(starts[0][1]).toMatchObject({ session_id: 's2', message: 'hola s2' })
    expect(hook.result.current.activeSession).toBe('s1')
    expect(hook.result.current.runtime.getState().busySessions.has('s2')).toBe(true)
    expect(hook.result.current.runtime.getState().busySessions.has('s1')).toBe(false)
    expect(hook.result.current.runtime.getState().threads.s2?.[0]).toMatchObject({ role: 'user', content: 'hola s2' })
  })

  it('sendTo admits one turn per session while a request is in flight', async () => {
    const hook = await mount([session('s1')])
    await act(async () => {
      await Promise.all([hook.result.current.sendTo('s1', 'uno'), hook.result.current.sendTo('s1', 'dos')])
    })
    expect(commandsNamed('turn_start')).toHaveLength(1)
  })

  it('sendTo uses the per-session reasoning preference', async () => {
    const hook = await mount([session('s1'), session('s2')])
    useSessionUiStore.getState().setReasoningFor('s2', 'high')
    await act(async () => {
      await hook.result.current.sendTo('s2', 'piensa')
      await hook.result.current.sendTo('s1', 'rápido')
    })
    const [first, second] = commandsNamed('turn_start')
    expect(first[1]).toMatchObject({ session_id: 's2', reasoning_effort: 'high' })
    expect(second[1]).toMatchObject({ session_id: 's1', reasoning_effort: null })
  })

  it('useModelFor changes only the session model and never the global default', async () => {
    const hook = await mount([session('s1'), session('s2')])
    await act(async () => {
      await hook.result.current.useModelFor('s2', models[1])
    })
    expect(commandsNamed('model_use')).toHaveLength(0)
    const sets = commandsNamed('session_model_set')
    expect(sets).toHaveLength(1)
    expect(sets[0][1]).toMatchObject({ reference: 's2', model: 'm-local', provider: 'ollama' })
  })

  it('useModel (Normal) keeps the legacy behaviour: global default plus active session', async () => {
    const hook = await mount([session('s1'), session('s2')])
    await act(async () => {
      await hook.result.current.useModel(models[1])
    })
    expect(commandsNamed('model_use')).toHaveLength(1)
    expect(commandsNamed('session_model_set')[0][1]).toMatchObject({ reference: 's1', model: 'm-local' })
  })

  it('createSession with activate:false does not move the Normal selection', async () => {
    const hook = await mount([session('s1')])
    let created: string | null = null
    await act(async () => {
      created = await hook.result.current.createSession(undefined, { activate: false })
    })
    expect(created).toBe('ses_new')
    expect(hook.result.current.activeSession).toBe('s1')
    expect(hook.result.current.sessionsById.ses_new).toBeTruthy()
  })

  it('prepareSession resolves a session outside the recent list without changing selection', async () => {
    const hook = await mount([session('s1')])
    installInvoke([session('s1'), session('old')])
    let result: Awaited<ReturnType<typeof hook.result.current.prepareSession>> | null = null
    await act(async () => {
      result = await hook.result.current.prepareSession('old')
    })
    expect(result).toMatchObject({ ok: true })
    expect(hook.result.current.activeSession).toBe('s1')
    expect(commandsNamed('session_get')[0][1]).toMatchObject({ reference: 'old' })
    expect(commandsNamed('session_history').some(([, args]) => args?.reference === 'old')).toBe(true)
  })

  it('prepareSession reports closed sessions instead of reopening them', async () => {
    const hook = await mount([session('s1')])
    installInvoke([session('s1'), session('gone', { state: 'closed' })])
    let result: Awaited<ReturnType<typeof hook.result.current.prepareSession>> | null = null
    await act(async () => {
      result = await hook.result.current.prepareSession('gone')
    })
    expect(result).toMatchObject({ ok: false, reason: 'closed' })
    expect(commandsNamed('session_open').some(([, args]) => args?.reference === 'gone')).toBe(false)
  })

  it('implementPlanFor switches the named session to BUILD and sends there', async () => {
    const hook = await mount([session('s1'), session('s2', { mode: 'plan' })])
    await act(async () => {
      await hook.result.current.implementPlanFor('s2')
    })
    expect(commandsNamed('session_mode_set')[0][1]).toMatchObject({ reference: 's2', mode: 'build' })
    expect(commandsNamed('turn_start')[0][1]).toMatchObject({ session_id: 's2' })
  })
})
