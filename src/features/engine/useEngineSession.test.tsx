// @vitest-environment jsdom
import { installMockPlatform } from '../../test/mockPlatform'
const { invoke } = installMockPlatform()
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const toastWarning = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { warning: toastWarning, error: vi.fn(), success: vi.fn(), info: vi.fn() }) }))

import { I18nProvider } from '../../i18n'
import type { ModelSummary, SessionSummary } from '../../services/engine'
import { useComposerStore } from '../../stores/composer'
import { useSessionUiStore } from '../../stores/sessionUi'
import { useEngineSession } from './useEngineSession'
import { resetConversationDraftsForTests, useConversationDraftStore } from '../../stores/conversationDraft'

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
      case 'session_open': {
        const row = sessions.find((item) => item.id === args?.reference) ?? sessions[0]
        return { session: row, created: false, warnings: row.project_root ? ['[trust] project is not trusted'] : [] }
      }
      case 'session_get':
        return { session: sessions.find((row) => row.id === args?.reference) ?? sessions[0] }
      case 'session_create': {
        // Like the Engine: a created session is in the next listing.
        const created = session('ses_new')
        if (!sessions.some((row) => row.id === created.id)) sessions = [created, ...sessions]
        return { session: created }
      }
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

  it('waits for the trust dialog before warning that a new folder is untrusted', async () => {
    const project = session('p1', { kind: 'PROJECT', project_root: 'C:/Nueva' })
    const hook = await mount([session('s1'), project])
    toastWarning.mockClear()
    const release = hook.result.current.deferTrustWarning('C:/Nueva')
    await act(async () => {
      await hook.result.current.selectSession('p1')
    })
    expect(toastWarning).not.toHaveBeenCalled()
    release()
    await act(async () => {
      await hook.result.current.selectSession('s1')
      await hook.result.current.selectSession('p1')
    })
    await waitFor(() => expect(toastWarning).toHaveBeenCalled())
  })

  it('forgets a deleted session, from here or from the Engine command', async () => {
    const hook = await mount([session('s1'), session('s2'), session('s3')])
    expect(hook.result.current.sessionsById.s2).toBeTruthy()
    installInvoke([session('s1'), session('s3')])
    await act(async () => {
      await hook.result.current.deleteSession('s2', false)
    })
    expect(hook.result.current.sessionsById.s2).toBeUndefined()
    // Deleted outside the app (`rinari sessions delete`): the next listing drops it.
    installInvoke([session('s1')])
    await act(async () => {
      await hook.result.current.refreshSessions()
    })
    expect(hook.result.current.sessionsById.s3).toBeUndefined()
    expect(commandsNamed('session_list').at(-1)?.[1]).toMatchObject({ limit: 500 })
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

describe('new conversations are drafts until their first message', () => {
  beforeEach(() => resetConversationDraftsForTests())

  it('opening a project draft many times creates nothing; the first send creates one session for that project with the draft settings', async () => {
    const hook = await mount([session('s1')])
    act(() => {
      for (let i = 0; i < 5; i += 1) hook.result.current.openDraft('proj_a')
    })
    expect(hook.result.current.activeSession).toBe('')
    expect(commandsNamed('session_create')).toHaveLength(0)
    await act(async () => {
      await hook.result.current.setMode('plan')
      await hook.result.current.setPermission('read-only')
    })
    useSessionUiStore.getState().setReasoningFor('draft:project:proj_a', 'high')
    let ok = false
    await act(async () => {
      ok = await hook.result.current.send('Revisa el login')
    })
    expect(ok).toBe(true)
    const creates = commandsNamed('session_create')
    expect(creates).toHaveLength(1)
    expect(creates[0][1]).toMatchObject({ project_id: 'proj_a', mode: 'plan', permission_profile: 'read-only' })
    expect(commandsNamed('turn_start')[0][1]).toMatchObject({ session_id: 'ses_new', reasoning_effort: 'high' })
    expect(hook.result.current.activeSession).toBe('ses_new')
    expect(useConversationDraftStore.getState().normal).toBeNull()
  })

  it('a general draft stays general even after a project conversation was open', async () => {
    const hook = await mount([session('s1', { kind: 'PROJECT', project_id: 'proj_a', project_root: '/repo/a' })])
    act(() => hook.result.current.openDraft())
    await act(async () => { await hook.result.current.send('Hola') })
    expect(commandsNamed('session_create')[0][1]).toMatchObject({ chat: true })
    expect(commandsNamed('session_create')[0][1]?.project_id).toBeFalsy()
  })

  it('two concurrent first sends share one creation', async () => {
    const hook = await mount([session('s1')])
    act(() => hook.result.current.openDraft('proj_a'))
    await act(async () => {
      await Promise.all([hook.result.current.send('uno'), hook.result.current.send('dos')])
    })
    expect(commandsNamed('session_create')).toHaveLength(1)
  })

  it('a failed first turn keeps the draft and the retry reuses the created session', async () => {
    const hook = await mount([session('s1')])
    const base = vi.mocked(invoke).getMockImplementation()!
    let failTurns = true
    vi.mocked(invoke).mockImplementation(async (command: string, args?: unknown) => {
      if (command === 'turn_start' && failTurns) {
        calls.push([command, args as Record<string, unknown>])
        throw new Error('provider down')
      }
      return base(command, args)
    })
    act(() => hook.result.current.openDraft('proj_a'))
    let ok = true
    await act(async () => { ok = await hook.result.current.send('Primero') })
    expect(ok).toBe(false)
    expect(hook.result.current.activeSession).toBe('')
    expect(useConversationDraftStore.getState().normal?.sessionId).toBe('ses_new')
    failTurns = false
    await act(async () => { ok = await hook.result.current.send('Otra vez') })
    expect(ok).toBe(true)
    expect(commandsNamed('session_create')).toHaveLength(1)
    expect(hook.result.current.activeSession).toBe('ses_new')
  })

  it('adding files to a draft prepares nothing and creates nothing', async () => {
    const hook = await mount([session('s1')])
    act(() => hook.result.current.openDraft())
    const files = [{ id: 'a1', path: 'C:/doc.pdf', name: 'doc.pdf' }] as never[]
    let prepared: unknown
    await act(async () => { prepared = await hook.result.current.prepareAttachments(files) })
    expect(prepared).toBe(files)
    expect(commandsNamed('session_create')).toHaveLength(0)
  })
})
