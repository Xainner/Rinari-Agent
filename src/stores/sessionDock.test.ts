// @vitest-environment jsdom
// Doc 01 §5.3: modelo persistido del dock por sesión, namespaced por Engine
// home; nunca se persiste ejecución y los layouts de versiones futuras se
// conservan intactos.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  DOCK_MAX_WIDTH,
  DOCK_MIN_WIDTH,
  SESSION_DOCK_STORAGE_KEY,
  dockNamespaceKey,
  normalizeDockLayout,
  resetSessionDockForTests,
  useSessionDockStore,
} from './sessionDock'

beforeEach(() => {
  window.localStorage.clear()
  resetSessionDockForTests()
})

describe('session dock layout', () => {
  it('starts hidden, clamps widths and persists only the layout contract', () => {
    const store = useSessionDockStore.getState()
    expect(store.layoutFor('ses_a')).toMatchObject({ schemaVersion: 1, visible: false, activeSurface: 'workspace', workspaceTab: 'changes' })
    store.setWidth('ses_a', 10)
    expect(store.layoutFor('ses_a').widthPx).toBe(DOCK_MIN_WIDTH)
    store.setWidth('ses_a', 99_999)
    expect(store.layoutFor('ses_a').widthPx).toBe(DOCK_MAX_WIDTH)
    store.reveal('ses_a', 'files')
    store.setWorkspaceTab('ses_a', 'tasks')
    const stored = JSON.parse(window.localStorage.getItem(SESSION_DOCK_STORAGE_KEY) ?? '{}') as Record<string, Record<string, unknown>>
    expect(Object.keys(stored)).toEqual([dockNamespaceKey(null, 'ses_a')])
    expect(stored[dockNamespaceKey(null, 'ses_a')]).toEqual({ schemaVersion: 1, visible: true, activeSurface: 'files', widthPx: DOCK_MAX_WIDTH, workspaceTab: 'tasks' })
  })

  it('namespaces layouts by the stable Engine home identity, never by session alone', () => {
    const store = useSessionDockStore.getState()
    store.setHomeId('home-a')
    store.reveal('ses_a', 'browser')
    expect(useSessionDockStore.getState().layoutFor('ses_a').activeSurface).toBe('browser')
    useSessionDockStore.getState().setHomeId('home-b')
    expect(useSessionDockStore.getState().layoutFor('ses_a')).toMatchObject({ visible: false, activeSurface: 'workspace' })
    useSessionDockStore.getState().setHomeId('home-a')
    expect(useSessionDockStore.getState().layoutFor('ses_a').activeSurface).toBe('browser')
  })

  it('keeps entries of a future schema untouched when rewriting the file', () => {
    window.localStorage.setItem(SESSION_DOCK_STORAGE_KEY, JSON.stringify({
      'default::ses_future': { schemaVersion: 7, unknown: true },
      'default::ses_old': { schemaVersion: 1, visible: true, activeSurface: 'files', widthPx: 300, workspaceTab: 'changes' },
      'default::ses_bad': { schemaVersion: 1, visible: 'yes', activeSurface: 'nope', widthPx: 'x' },
    }))
    // Recarga desde disco, como en un arranque.
    resetSessionDockForTests()
    const { load } = { load: () => JSON.parse(window.localStorage.getItem(SESSION_DOCK_STORAGE_KEY) ?? '{}') as Record<string, unknown> }
    // El store se hidrata al importar; emulamos su lectura con el normalizador público.
    expect(normalizeDockLayout(load()['default::ses_bad'])).toEqual({ schemaVersion: 1, visible: false, activeSurface: 'workspace', widthPx: 360, workspaceTab: 'changes' })
    useSessionDockStore.setState({ homeId: null, layouts: { 'default::ses_old': normalizeDockLayout(load()['default::ses_old'])! }, foreign: { 'default::ses_future': load()['default::ses_future'] } })
    useSessionDockStore.getState().setVisible('ses_old', false)
    const rewritten = load()
    expect(rewritten['default::ses_future']).toEqual({ schemaVersion: 7, unknown: true })
    expect(rewritten['default::ses_old']).toMatchObject({ visible: false })
  })

  it('adoptIfAbsent never overrides a layout the user already has; forget removes it', () => {
    const store = useSessionDockStore.getState()
    store.adoptIfAbsent('ses_a', { visible: true, surface: 'workspace' })
    expect(useSessionDockStore.getState().layoutFor('ses_a')).toMatchObject({ visible: true, activeSurface: 'workspace' })
    useSessionDockStore.getState().reveal('ses_a', 'browser')
    useSessionDockStore.getState().adoptIfAbsent('ses_a', { visible: false, surface: 'files' })
    expect(useSessionDockStore.getState().layoutFor('ses_a')).toMatchObject({ visible: true, activeSurface: 'browser' })
    useSessionDockStore.getState().forget('ses_a')
    expect(useSessionDockStore.getState().layoutFor('ses_a').visible).toBe(false)
    expect(JSON.parse(window.localStorage.getItem(SESSION_DOCK_STORAGE_KEY) ?? '{}')).toEqual({})
  })
})
