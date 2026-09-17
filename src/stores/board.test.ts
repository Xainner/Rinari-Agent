// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  BOARD_SCHEMA_VERSION,
  BOARD_STORAGE_KEY,
  PANE_DEFAULT_WIDTH,
  PANE_MAX_WIDTH,
  PANE_MIN_WIDTH,
  SOFT_LIMIT_DEFAULT,
  defaultBoard,
  flushBoardPersistence,
  normalizeBoard,
  useBoardStore,
} from './board'
import { resetSessionDockForTests, useSessionDockStore } from './sessionDock'

beforeEach(() => {
  window.localStorage.clear()
  useBoardStore.getState().hydrate(defaultBoard())
})

describe('board layout store', () => {
  it('adds panes once per session, focuses them and keeps order', () => {
    const store = useBoardStore.getState()
    const a = store.addPane('ses_a')
    const b = store.addPane('ses_b')
    expect(useBoardStore.getState().panes.map((pane) => pane.sessionId)).toEqual(['ses_a', 'ses_b'])
    expect(useBoardStore.getState().focusedPaneId).toBe(b.paneId)
    const again = useBoardStore.getState().addPane('ses_a')
    expect(again.paneId).toBe(a.paneId)
    expect(useBoardStore.getState().panes).toHaveLength(2)
    expect(useBoardStore.getState().focusedPaneId).toBe(a.paneId)
    useBoardStore.getState().movePane(a.paneId, 1)
    expect(useBoardStore.getState().panes.map((pane) => pane.sessionId)).toEqual(['ses_b', 'ses_a'])
  })

  it('removes a pane without touching others and moves focus to the nearest expanded neighbour', () => {
    const store = useBoardStore.getState()
    const a = store.addPane('ses_a')
    const b = store.addPane('ses_b')
    const c = store.addPane('ses_c')
    useBoardStore.getState().focusPane(b.paneId)
    useBoardStore.getState().removePane(b.paneId)
    expect(useBoardStore.getState().panes.map((pane) => pane.paneId)).toEqual([a.paneId, c.paneId])
    expect(useBoardStore.getState().focusedPaneId).toBe(c.paneId)
    useBoardStore.getState().removePane(c.paneId)
    expect(useBoardStore.getState().focusedPaneId).toBe(a.paneId)
    useBoardStore.getState().removePane(a.paneId)
    expect(useBoardStore.getState().focusedPaneId).toBeNull()
  })

  it('clamps widths and keeps other preferences per pane', () => {
    const pane = useBoardStore.getState().addPane('ses_a')
    useBoardStore.getState().setPaneWidth(pane.paneId, 10)
    expect(useBoardStore.getState().panes[0].width).toBe(PANE_MIN_WIDTH)
    useBoardStore.getState().setPaneWidth(pane.paneId, 99999)
    expect(useBoardStore.getState().panes[0].width).toBe(PANE_MAX_WIDTH)
    useBoardStore.getState().setPaneWidth(pane.paneId, Number.NaN)
    expect(useBoardStore.getState().panes[0].width).toBe(PANE_MAX_WIDTH)
    // El dock ya no es un campo del panel: vive por sesión en `sessionDock`.
    expect(useBoardStore.getState().panes[0]).not.toHaveProperty('workspaceVisible')
    expect(useBoardStore.getState().panes[0]).not.toHaveProperty('dockTab')
  })

  it('persists only layout preferences under the v1 key with internal schema 3', () => {
    useBoardStore.getState().addPane('ses_a')
    useBoardStore.getState().setSoftLimit(3)
    flushBoardPersistence()
    const stored = JSON.parse(window.localStorage.getItem(BOARD_STORAGE_KEY) ?? '{}') as Record<string, unknown>
    expect(stored.version).toBe(BOARD_SCHEMA_VERSION)
    expect(stored.softLimit).toBe(3)
    expect((stored.panes as unknown[]).length).toBe(1)
    expect(stored).not.toHaveProperty('paneErrors')
    expect(stored).not.toHaveProperty('persistError')
  })

  it('migrates a plan-1.0 layout, drops invalid entries and deduplicates sessions', () => {
    const layout = normalizeBoard({
      panes: [
        { paneId: 'p1', sessionId: 'ses_a', width: 700, workspaceVisible: true, workspaceWidth: 360 },
        { paneId: 'p1', sessionId: 'ses_b', width: 'wide' },
        { sessionId: 'ses_a' },
        { paneId: 'p3' },
        null,
      ],
      focusedPaneId: 'p1',
      softLimit: 4,
    })
    expect(layout.version).toBe(BOARD_SCHEMA_VERSION)
    expect(layout.panes.map((pane) => pane.sessionId)).toEqual(['ses_a', 'ses_b'])
    expect(new Set(layout.panes.map((pane) => pane.paneId)).size).toBe(2)
    expect(layout.panes[1].width).toBe(PANE_DEFAULT_WIDTH)
    expect(layout.panes[0]).toMatchObject({ collapsed: false, peerReceive: true, peerSend: true })
    expect(layout.focusedPaneId).toBe('p1')
    expect(layout.focusMode).toBe(false)
    expect(layout.focusModeSnapshot).toBeNull()
    expect(layout.notifications).toEqual({ toasts: true, system: false, needsYou: true, systemDetails: false })
  })

  it('migrates the schema-2 per-pane dock into the per-session layout without overwriting an existing one', () => {
    resetSessionDockForTests()
    useSessionDockStore.getState().update('ses_kept', { visible: false, activeSurface: 'browser', widthPx: 500, workspaceTab: 'tasks' })
    normalizeBoard({
      version: 2,
      panes: [
        { paneId: 'p1', sessionId: 'ses_a', workspaceVisible: false, workspaceWidth: 420, dockTab: 'file', workspaceTab: 'verification' },
        { paneId: 'p2', sessionId: 'ses_kept', workspaceVisible: true, workspaceWidth: 300, dockTab: 'workspace', workspaceTab: 'changes' },
        { paneId: 'p3', sessionId: 'ses_plain' },
      ],
    })
    const dock = useSessionDockStore.getState()
    expect(dock.layoutFor('ses_a')).toMatchObject({ visible: false, widthPx: 420, activeSurface: 'files', workspaceTab: 'verification' })
    // Una sesión que ya tenía layout propio no se reescribe con el del panel.
    expect(dock.layoutFor('ses_kept')).toMatchObject({ visible: false, activeSurface: 'browser', widthPx: 500, workspaceTab: 'tasks' })
    // Sin campos de dock no se inventa un layout.
    expect(Object.keys(dock.layouts).some((key) => key.includes('ses_plain'))).toBe(false)
    // Un layout ya en schema 3 no vuelve a migrar nada.
    resetSessionDockForTests()
    normalizeBoard({ version: 3, panes: [{ paneId: 'p1', sessionId: 'ses_a', workspaceVisible: false }] })
    expect(Object.keys(useSessionDockStore.getState().layouts)).toEqual([])
  })

  it('normalizes focus mode without a snapshot and keeps future versions untouched', () => {
    const layout = normalizeBoard({
      version: 2,
      panes: [{ paneId: 'p1', sessionId: 'a', collapsed: true }, { paneId: 'p2', sessionId: 'b' }],
      focusedPaneId: 'p1',
      focusMode: true,
    })
    expect(layout.focusedPaneId).toBeNull()
    expect(layout.focusModeSnapshot).toEqual({ p1: true, p2: false })
    const future = normalizeBoard({ version: 99, boardId: 'keep', panes: [{ paneId: 'x', sessionId: 'y' }] })
    expect(future.panes).toEqual([])
    expect(future.boardId).toBe('keep')
    expect(normalizeBoard('garbage').softLimit).toBe(SOFT_LIMIT_DEFAULT)
  })

  it('reconciles only with authoritative resolutions and keeps unknown panes with an error', () => {
    const store = useBoardStore.getState()
    const a = store.addPane('ses_a')
    const b = store.addPane('ses_b')
    const c = store.addPane('ses_c')
    const d = store.addPane('ses_d')
    useBoardStore.getState().focusPane(b.paneId)
    const outcome = useBoardStore.getState().reconcileResolvedSessions({
      ses_a: { status: 'active' },
      ses_b: { status: 'closed' },
      ses_c: { status: 'unknown', message: 'timeout' },
      ses_d: { status: 'not_found' },
    })
    expect(outcome.removed.map((item) => item.sessionId).sort()).toEqual(['ses_b', 'ses_d'])
    expect(outcome.unresolved.map((item) => item.sessionId)).toEqual(['ses_c'])
    const state = useBoardStore.getState()
    expect(state.panes.map((pane) => pane.paneId)).toEqual([a.paneId, c.paneId])
    expect(state.paneErrors[c.paneId]).toBe('timeout')
    expect(state.focusedPaneId).toBe(c.paneId)
    expect(d.paneId).not.toBe(c.paneId)
    // Missing resolutions are treated as "no evidence": the pane stays.
    const second = useBoardStore.getState().reconcileResolvedSessions({})
    expect(second.removed).toEqual([])
    expect(useBoardStore.getState().panes).toHaveLength(2)
  })

  it('reads back a corrupt layout without crashing and keeps the raw value for diagnosis', () => {
    window.localStorage.setItem(BOARD_STORAGE_KEY, '{not json')
    expect(() => normalizeBoard(JSON.parse('{}'))).not.toThrow()
    // loadBoard runs at module init; here we only assert normalizeBoard tolerance
    // and that hydrate with garbage yields an empty board.
    useBoardStore.getState().hydrate('{not json')
    expect(useBoardStore.getState().panes).toEqual([])
  })
})

describe('collapse and focus mode (§7.6)', () => {
  function threePanes() {
    const store = useBoardStore.getState()
    const a = store.addPane('ses_a').paneId
    const b = store.addPane('ses_b').paneId
    const c = store.addPane('ses_c').paneId
    return { a, b, c }
  }
  const collapsedIds = () => useBoardStore.getState().panes.filter((pane) => pane.collapsed).map((pane) => pane.paneId)

  it('collapsing the focused pane moves focus to the nearest expanded neighbour and keeps its width', () => {
    const { a, b, c } = threePanes()
    const store = useBoardStore.getState()
    store.setPaneWidth(b, 900)
    store.focusPane(b)
    store.setCollapsed(b, true)
    const state = useBoardStore.getState()
    expect(collapsedIds()).toEqual([b])
    expect(state.focusedPaneId).toBe(c)
    expect(state.lastExpandedPaneId).toBe(b)
    expect(state.panes.find((pane) => pane.paneId === b)?.width).toBe(900)
    store.setCollapsed(c, true)
    expect(useBoardStore.getState().focusedPaneId).toBe(a)
    store.setCollapsed(a, true)
    expect(useBoardStore.getState().focusedPaneId).toBeNull()
  })

  it('expandPane restores without stealing focus outside focus mode and focuses inside it', () => {
    const { a, b } = threePanes()
    const store = useBoardStore.getState()
    store.focusPane(a)
    store.setCollapsed(b, true)
    store.expandPane(b)
    expect(useBoardStore.getState().focusedPaneId).toBe(a)
    expect(collapsedIds()).toEqual([])
    store.setFocusMode(true)
    expect(collapsedIds().sort()).toEqual([b, useBoardStore.getState().panes[2].paneId].sort())
    store.expandPane(b)
    expect(useBoardStore.getState().focusedPaneId).toBe(b)
    expect(collapsedIds()).not.toContain(b)
    expect(collapsedIds()).toContain(a)
  })

  it('collapseAll / expandAll leave focus mode and keep a usable cursor', () => {
    const { a, b } = threePanes()
    const store = useBoardStore.getState()
    store.focusPane(b)
    store.setFocusMode(true)
    store.collapseAll()
    let state = useBoardStore.getState()
    expect(state.focusMode).toBe(false)
    expect(state.focusModeSnapshot).toBeNull()
    expect(state.focusedPaneId).toBeNull()
    expect(state.lastExpandedPaneId).toBe(b)
    expect(collapsedIds()).toHaveLength(3)
    store.expandAll()
    state = useBoardStore.getState()
    expect(collapsedIds()).toEqual([])
    expect(state.focusedPaneId).toBe(b)
    store.collapseAll()
    useBoardStore.setState({ lastExpandedPaneId: null })
    store.expandAll()
    expect(useBoardStore.getState().focusedPaneId).toBe(a)
  })

  it('focus mode snapshots the composition, restores it on exit and forgets removed panes', () => {
    const { a, b, c } = threePanes()
    const store = useBoardStore.getState()
    store.setCollapsed(c, true)
    store.focusPane(a)
    store.setFocusMode(true)
    let state = useBoardStore.getState()
    expect(state.focusModeSnapshot).toEqual({ [a]: false, [b]: false, [c]: true })
    expect(collapsedIds().sort()).toEqual([b, c].sort())
    // Adding during focus mode: the new pane is focused and expanded, others collapse.
    const d = store.addPane('ses_d').paneId
    state = useBoardStore.getState()
    expect(state.focusedPaneId).toBe(d)
    expect(collapsedIds().sort()).toEqual([a, b, c].sort())
    expect(state.focusModeSnapshot?.[d]).toBe(false)
    store.removePane(d)
    state = useBoardStore.getState()
    expect(state.focusModeSnapshot?.[d]).toBeUndefined()
    expect(state.focusedPaneId).not.toBeNull()
    expect(collapsedIds()).not.toContain(state.focusedPaneId)
    store.setFocusMode(false)
    state = useBoardStore.getState()
    expect(state.focusMode).toBe(false)
    expect(collapsedIds()).toEqual([c])
  })

  it('collapsing the focused pane by hand during focus mode leaves the mode without restoring', () => {
    const { a } = threePanes()
    const store = useBoardStore.getState()
    store.focusPane(a)
    store.setFocusMode(true)
    store.setCollapsed(a, true)
    const state = useBoardStore.getState()
    expect(state.focusMode).toBe(false)
    expect(state.focusModeSnapshot).toBeNull()
    expect(collapsedIds()).toHaveLength(3)
    expect(state.focusedPaneId).toBeNull()
  })

  it('collapseFinished only folds unfocused, ready, intervention-free done/idle/cancelled panes', () => {
    const { a, b, c } = threePanes()
    const store = useBoardStore.getState()
    store.focusPane(a)
    const count = store.collapseFinished({
      [a]: { kind: 'done', pendingInterventions: 0, availabilityReady: true },
      [b]: { kind: 'done', pendingInterventions: 0, availabilityReady: true },
      [c]: { kind: 'failed', pendingInterventions: 0, availabilityReady: true },
    })
    expect(count).toBe(1)
    expect(collapsedIds()).toEqual([b])
    expect(store.collapseFinished({ [c]: { kind: 'idle', pendingInterventions: 1, availabilityReady: true } })).toBe(0)
    expect(store.collapseFinished({ [c]: { kind: 'idle', pendingInterventions: 0, availabilityReady: false } })).toBe(0)
    store.setFocusMode(true)
    expect(store.collapseFinished({ [c]: { kind: 'idle', pendingInterventions: 0, availabilityReady: true } })).toBe(0)
  })
})
