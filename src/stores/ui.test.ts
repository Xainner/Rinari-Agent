// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_FLOW_HOME, DEFAULT_SHORTCUT_BINDINGS, readFlowScopes, useUIStore } from './ui'

beforeEach(() => {
  window.localStorage.clear()
  useUIStore.setState({ view: 'chat', lastWorkspaceView: 'chat', projectRoot: null, sidebarOpen: true })
})

describe('Normal / Boards navigation', () => {
  it('selects views idempotently and remembers the last workspace view', () => {
    useUIStore.getState().goBoard()
    expect(useUIStore.getState().view).toBe('board')
    expect(useUIStore.getState().lastWorkspaceView).toBe('board')
    expect(useUIStore.getState().sidebarOpen).toBe(false)
    useUIStore.getState().goBoard()
    expect(useUIStore.getState().view).toBe('board')
    useUIStore.getState().goNormal()
    expect(useUIStore.getState().view).toBe('chat')
    expect(useUIStore.getState().lastWorkspaceView).toBe('chat')
  })

  it('toggles between Normal and Boards once per call', () => {
    useUIStore.getState().toggleBoards()
    expect(useUIStore.getState().view).toBe('board')
    useUIStore.getState().toggleBoards()
    expect(useUIStore.getState().view).toBe('chat')
  })

  it('keeps the last workspace view while in auxiliary views and toggles to its alternative', () => {
    useUIStore.getState().goBoard()
    useUIStore.getState().goSettings('providers')
    expect(useUIStore.getState().view).toBe('settings')
    expect(useUIStore.getState().lastWorkspaceView).toBe('board')
    useUIStore.getState().toggleBoards()
    expect(useUIStore.getState().view).toBe('chat')
    useUIStore.getState().goEngine()
    useUIStore.getState().toggleBoards()
    expect(useUIStore.getState().view).toBe('board')
  })

  it('ships a Boards binding and merges it into stored bindings', () => {
    expect(DEFAULT_SHORTCUT_BINDINGS.boards).toBe('Ctrl+Shift+B')
    expect(useUIStore.getState().shortcutBindings.boards).toBe('Ctrl+Shift+B')
    useUIStore.getState().setShortcutBinding('boards', 'Ctrl+Alt+B')
    const stored = JSON.parse(window.localStorage.getItem('rinari.shortcutBindings') ?? '{}') as Record<string, string>
    expect(stored.boards).toBe('Ctrl+Alt+B')
  })
})

describe('alcance de Flujos por Engine home', () => {
  beforeEach(() => {
    useUIStore.setState({
      flowHomeId: DEFAULT_FLOW_HOME,
      flowScopes: {},
      flowScope: null,
      flowScopeExplicit: false,
    })
  })

  it('guarda el alcance bajo el home actual y no lo comparte con otro', () => {
    // Un id de proyecto sólo significa algo dentro del home que lo emitió: dos
    // homes distintos pueden tener ids que coincidan y ser cosas distintas.
    useUIStore.getState().setFlowHomeId('home-a')
    useUIStore.getState().setFlowScope({ kind: 'project', id: 'proj_1' })
    useUIStore.getState().setFlowHomeId('home-b')
    expect(useUIStore.getState().flowScope).toBeNull()
    useUIStore.getState().setFlowScope({ kind: 'session', id: 'ses_9' })
    useUIStore.getState().setFlowHomeId('home-a')
    expect(useUIStore.getState().flowScope).toEqual({ kind: 'project', id: 'proj_1' })
    const stored = JSON.parse(window.localStorage.getItem('rinari.flowScope') ?? '{}') as Record<string, unknown>
    expect(Object.keys(stored).sort()).toEqual(['home-a', 'home-b'])
  })

  it('adopta al home real lo elegido antes del hello, sin pisar lo que ese home ya tuviera', () => {
    useUIStore.getState().setFlowScope({ kind: 'project', id: 'proj_pre' })
    useUIStore.getState().setFlowHomeId('home-a')
    expect(useUIStore.getState().flowScope).toEqual({ kind: 'project', id: 'proj_pre' })
    expect(useUIStore.getState().flowScopes[DEFAULT_FLOW_HOME]).toBeUndefined()

    // El home ya tenía uno propio: ese manda y el del namespace por defecto se retira.
    useUIStore.setState({ flowHomeId: DEFAULT_FLOW_HOME, flowScopes: { [DEFAULT_FLOW_HOME]: { kind: 'project', id: 'proj_pre' }, 'home-b': { kind: 'project', id: 'proj_suyo' } } })
    useUIStore.getState().setFlowHomeId('home-b')
    expect(useUIStore.getState().flowScope).toEqual({ kind: 'project', id: 'proj_suyo' })
  })

  it('lee la forma antigua —un solo alcance sin home— como del namespace por defecto', () => {
    window.localStorage.setItem('rinari.flowScope', JSON.stringify({ kind: 'project', id: 'proj_viejo' }))
    expect(readFlowScopes()).toEqual({ [DEFAULT_FLOW_HOME]: { kind: 'project', id: 'proj_viejo' } })
  })

  it('el alcance que resuelve la propia vista no cuenta como elección explícita', () => {
    useUIStore.getState().setFlowScope({ kind: 'project', id: 'proj_auto' }, false)
    expect(useUIStore.getState().flowScopeExplicit).toBe(false)
    useUIStore.getState().setFlowScope({ kind: 'project', id: 'proj_mano' })
    expect(useUIStore.getState().flowScopeExplicit).toBe(true)
    // «Ver flujo» también es una elección de una persona.
    useUIStore.setState({ flowScopeExplicit: false })
    useUIStore.getState().goFlows({ kind: 'session', id: 'ses_1' })
    expect(useUIStore.getState().flowScopeExplicit).toBe(true)
  })
})
