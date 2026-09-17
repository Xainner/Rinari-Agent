// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SHORTCUT_BINDINGS, useUIStore } from './ui'

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
