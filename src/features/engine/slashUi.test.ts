import { beforeEach, describe, expect, it, vi } from 'vitest'

const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
const projectInitStart = vi.hoisted(() => vi.fn(async () => ({ status: 'started', turn_id: 't1', session_id: 's1' })))
const goalSet = vi.hoisted(() => vi.fn(async (sessionId: string, objective: string) => ({ goal: { session_id: sessionId, objective, state: 'active' } })))
vi.mock('../../services/engine', async (original) => ({
  ...(await original<typeof import('../../services/engine')>()),
  engineApi: { projectInitStart, goalSet },
}))

import { runUiCommand, type UiCommandDeps } from './slashUi'

const deps = (patch: Partial<UiCommandDeps> = {}): UiCommandDeps => ({
  sessionId: 's1',
  reveal: vi.fn(),
  fork: vi.fn(),
  rename: vi.fn(),
  hasProject: true,
  ...patch,
})

describe('/init (#81)', () => {
  beforeEach(() => {
    projectInitStart.mockClear()
    toast.mockClear()
  })

  it('starts the read-only turn of the conversation', async () => {
    expect(await runUiCommand('init', '', deps())).toBe(true)
    expect(projectInitStart).toHaveBeenCalledWith('s1')
  })

  it('a new conversation is created first', async () => {
    const ensureSession = vi.fn(async () => 's_new')
    await runUiCommand('init', '', deps({ sessionId: '', ensureSession }))
    expect(ensureSession).toHaveBeenCalled()
    expect(projectInitStart).toHaveBeenCalledWith('s_new')
  })

  it('without a project it says why and starts nothing', async () => {
    await runUiCommand('init', '', deps({ hasProject: false }))
    expect(projectInitStart).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledTimes(1)
  })

  it('a conversation that could not be created says so', async () => {
    await runUiCommand('init', '', deps({ sessionId: '', ensureSession: async () => null }))
    expect(projectInitStart).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledTimes(1)
  })
})

describe('/goal in a new conversation', () => {
  beforeEach(() => {
    goalSet.mockClear()
    toast.mockClear()
  })

  it('an objective creates the conversation first, then the goal', async () => {
    const ensureSession = vi.fn(async () => 's_new')
    expect(await runUiCommand('goal', 'ship the menu', deps({ sessionId: '', ensureSession }))).toBe(true)
    expect(goalSet).toHaveBeenCalledWith('s_new', 'ship the menu')
  })

  it('when the conversation cannot be created it says so and gives the text back', async () => {
    expect(await runUiCommand('goal', 'ship the menu', deps({ sessionId: '', ensureSession: async () => null }))).toBe(false)
    expect(goalSet).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledTimes(1)
  })

  it('a failed command gives its text back', async () => {
    goalSet.mockRejectedValueOnce(new Error('boom'))
    expect(await runUiCommand('goal', 'ship the menu', deps())).toBe(false)
  })
})
