// @vitest-environment jsdom
// Panel lateral por sesión (plan 0.4.0 #47): hasta cuatro vistas en mosaico,
// namespaced por Engine home; nunca se persiste ejecución, los layouts de
// versiones futuras se conservan y los del schema 1 se convierten.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  DOCK_MIN_WIDTH,
  MAX_VIEWS,
  SESSION_DOCK_STORAGE_KEY,
  dockNamespaceKey,
  mosaicShape,
  normalizeDockLayout,
  resetSessionDockForTests,
  useSessionDockStore,
  viewForSurface,
} from './sessionDock'

const dock = () => useSessionDockStore.getState()
const views = (sessionId = 'ses_a') => dock().layoutFor(sessionId).views

beforeEach(() => {
  window.localStorage.clear()
  resetSessionDockForTests()
})

describe('session dock layout', () => {
  it('starts hidden and empty, clamps widths only by the minimum, and persists only the layout contract', () => {
    expect(dock().layoutFor('ses_a')).toMatchObject({ schemaVersion: 2, visible: false, views: [], amp: null })
    dock().setWidth('ses_a', 10)
    expect(dock().layoutFor('ses_a').widthPx).toBe(DOCK_MIN_WIDTH)
    // Sin el tope de 800 px (#44a): lo limita el chat en pantalla, no el modelo.
    dock().setWidth('ses_a', 1400)
    expect(dock().layoutFor('ses_a').widthPx).toBe(1400)
    dock().reveal('ses_a', 'files')
    const stored = JSON.parse(window.localStorage.getItem(SESSION_DOCK_STORAGE_KEY) ?? '{}') as Record<string, Record<string, unknown>>
    expect(Object.keys(stored)).toEqual([dockNamespaceKey(null, 'ses_a')])
    expect(stored[dockNamespaceKey(null, 'ses_a')]).toMatchObject({ schemaVersion: 2, visible: true, views: ['files'], widthPx: 1400, lastView: 'files' })
  })

  it('namespaces layouts by the stable Engine home identity, never by session alone', () => {
    dock().setHomeId('home-a')
    dock().reveal('ses_a', 'browser')
    expect(views()).toEqual(['browser'])
    dock().setHomeId('home-b')
    expect(dock().layoutFor('ses_a')).toMatchObject({ visible: false, views: [] })
    dock().setHomeId('home-a')
    expect(views()).toEqual(['browser'])
  })

  it('converts schema 1 layouts and keeps entries of a future schema untouched', () => {
    expect(normalizeDockLayout({ schemaVersion: 1, visible: true, activeSurface: 'workspace', widthPx: 300, workspaceTab: 'tasks' })).toMatchObject({ visible: true, views: ['tasks'], widthPx: 300 })
    expect(normalizeDockLayout({ schemaVersion: 1, visible: true, activeSurface: 'workspace', widthPx: 300, workspaceTab: 'checkpoints' })).toMatchObject({ views: ['changes'] })
    expect(normalizeDockLayout({ schemaVersion: 1, visible: false, activeSurface: 'browser' })).toMatchObject({ visible: false, views: [], lastView: 'browser' })
    expect(normalizeDockLayout({ schemaVersion: 2, visible: 'yes', views: ['nope', 'files', 'files', 'browser', 'agents', 'changes', 'flow'], widthPx: 'x' })).toMatchObject({ visible: true, views: ['files', 'browser', 'agents', 'changes'] })
    window.localStorage.setItem(SESSION_DOCK_STORAGE_KEY, JSON.stringify({ 'default::ses_future': { schemaVersion: 7, unknown: true } }))
    useSessionDockStore.setState({ foreign: { 'default::ses_future': { schemaVersion: 7, unknown: true } } })
    dock().reveal('ses_old', 'files')
    const rewritten = JSON.parse(window.localStorage.getItem(SESSION_DOCK_STORAGE_KEY) ?? '{}') as Record<string, unknown>
    expect(rewritten['default::ses_future']).toEqual({ schemaVersion: 7, unknown: true })
    expect(rewritten['default::ses_old']).toMatchObject({ views: ['files'] })
  })

  it('reindexa al home real lo guardado antes del hello, sin pisar un layout existente', () => {
    dock().reveal('ses_a', 'files')
    dock().reveal('ses_b', 'browser')
    useSessionDockStore.setState({
      layouts: { ...dock().layouts, 'home_1::ses_b': normalizeDockLayout({ schemaVersion: 2, visible: true, views: ['tasks'], widthPx: 500 })! },
    })
    dock().setHomeId('home_1')
    const layouts = dock().layouts
    expect(Object.keys(layouts).filter((key) => key.startsWith('default::'))).toEqual([])
    expect(layouts['home_1::ses_a']).toMatchObject({ visible: true, views: ['files'] })
    expect(layouts['home_1::ses_b']).toMatchObject({ widthPx: 500, views: ['tasks'] })
  })

  it('adoptIfAbsent never overrides a layout the user already has; forget removes it', () => {
    dock().adoptIfAbsent('ses_a', { visible: true, surface: 'workspace' })
    expect(dock().layoutFor('ses_a')).toMatchObject({ visible: true, views: ['changes'] })
    dock().reveal('ses_a', 'browser')
    dock().adoptIfAbsent('ses_a', { visible: false, surface: 'files' })
    expect(views()).toEqual(['changes', 'browser'])
    dock().forget('ses_a')
    expect(dock().layoutFor('ses_a').visible).toBe(false)
    expect(JSON.parse(window.localStorage.getItem(SESSION_DOCK_STORAGE_KEY) ?? '{}')).toEqual({})
  })
})

describe('las vistas del panel lateral (#47)', () => {
  it('un botón abre su vista en el siguiente lugar, y la cierra si ya se ve', () => {
    expect(dock().toggleView('ses_a', 'browser')).toBe('opened')
    expect(dock().toggleView('ses_a', 'terminal')).toBe('opened')
    expect(views()).toEqual(['browser', 'terminal'])
    expect(dock().toggleView('ses_a', 'browser')).toBe('closed')
    expect(views()).toEqual(['terminal'])
    expect(dock().toggleView('ses_a', 'terminal')).toBe('closed')
    // Sin vistas, el panel se oculta y recuerda la última.
    expect(dock().layoutFor('ses_a')).toMatchObject({ visible: false, views: [], lastView: 'terminal' })
  })

  it('hasta cuatro, también las de «Más»; la quinta pide reemplazar y ocupa el sitio de la elegida', () => {
    for (const view of ['browser', 'terminal', 'tasks', 'changes'] as const) dock().toggleView('ses_a', view)
    expect(views()).toHaveLength(MAX_VIEWS)
    expect(dock().toggleView('ses_a', 'agents')).toBe('full')
    expect(views()).toEqual(['browser', 'terminal', 'tasks', 'changes'])
    dock().openView('ses_a', 'agents', { replace: 'terminal' })
    expect(views()).toEqual(['browser', 'agents', 'tasks', 'changes'])
    // Sin decir cuál (un enlace, un atajo), ocupa el último sitio.
    dock().openView('ses_a', 'files')
    expect(views()).toEqual(['browser', 'agents', 'tasks', 'files'])
  })

  it('Ctrl+B oculta y vuelve a mostrar el panel con la misma disposición; sin vistas abre la última', () => {
    dock().toggleView('ses_a', 'browser')
    dock().toggleView('ses_a', 'changes')
    dock().toggleVisible('ses_a')
    expect(dock().layoutFor('ses_a')).toMatchObject({ visible: false, views: ['browser', 'changes'] })
    // Con el panel oculto, el botón de una vista abierta lo vuelve a mostrar sin cerrarla.
    expect(dock().toggleView('ses_a', 'changes')).toBe('shown')
    expect(dock().layoutFor('ses_a')).toMatchObject({ visible: true, views: ['browser', 'changes'] })
    dock().closeView('ses_a', 'browser')
    dock().closeView('ses_a', 'changes')
    dock().toggleVisible('ses_a')
    expect(dock().layoutFor('ses_a')).toMatchObject({ visible: true, views: ['changes'] })
    // Nunca abierto: el Navegador.
    dock().toggleVisible('ses_new')
    expect(views('ses_new')).toEqual(['browser'])
  })

  it('las superficies de antes llevan a su vista nueva, con la sección a la vista', () => {
    expect(viewForSurface('workspace', 'checkpoints')).toEqual({ view: 'changes', section: 'checkpoints' })
    expect(viewForSurface('workspace', 'artifacts')).toEqual({ view: 'files', section: 'artifacts' })
    expect(viewForSurface('workspace', 'insight')).toEqual({ view: 'insight' })
    expect(viewForSurface('workspace')).toEqual({ view: 'changes' })
    dock().reveal('ses_a', 'workspace', { workspaceTab: 'artifacts' })
    expect(views()).toEqual(['files'])
    expect(Object.values(dock().sections)[0]).toMatchObject({ view: 'files', section: 'artifacts' })
  })

  it('cambiar dos vistas de sitio, ampliar y las proporciones se guardan por sesión', () => {
    for (const view of ['browser', 'terminal', 'changes'] as const) dock().toggleView('ses_a', view)
    dock().swapViews('ses_a', 'browser', 'changes')
    expect(views()).toEqual(['changes', 'terminal', 'browser'])
    dock().setAmp('ses_a', 'terminal')
    expect(dock().layoutFor('ses_a').amp).toBe('terminal')
    dock().setAmp('ses_a', 'agents')
    expect(dock().layoutFor('ses_a').amp).toBeNull()
    dock().setAmp('ses_a', 'all')
    expect(dock().layoutFor('ses_a').amp).toBe('all')
    dock().setSplit('ses_a', { col: 0.99, left: 0.3 })
    expect(dock().layoutFor('ses_a').split).toMatchObject({ col: 0.85, left: 0.3 })
    expect(views('ses_b')).toEqual([])
  })
})

describe('mosaico', () => {
  const big = { width: 900, height: 900 }
  it('1 ocupa todo; 2 una arriba y otra abajo; 3 dos a la izquierda y una alta; 4 una cuadrícula', () => {
    expect(mosaicShape(['browser'], big)).toEqual([['browser']])
    expect(mosaicShape(['browser', 'terminal'], big)).toEqual([['browser', 'terminal']])
    expect(mosaicShape(['browser', 'terminal', 'changes'], big)).toEqual([['browser', 'terminal'], ['changes']])
    expect(mosaicShape(['browser', 'terminal', 'changes', 'files'], big)).toEqual([['browser', 'terminal'], ['changes', 'files']])
  })
  it('dos lado a lado si el panel es muy ancho y bajo; un panel angosto, una sola columna', () => {
    expect(mosaicShape(['browser', 'terminal'], { width: 1400, height: 600 })).toEqual([['browser'], ['terminal']])
    expect(mosaicShape(['browser', 'terminal', 'changes', 'files'], { width: 500, height: 900 })).toEqual([['browser', 'terminal', 'changes', 'files']])
  })
})
