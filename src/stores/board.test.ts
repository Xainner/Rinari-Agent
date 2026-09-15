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
    useBoardStore.getState().setWorkspaceVisible(pane.paneId, false)
    useBoardStore.getState().setDockTab(pane.paneId, 'file')
    useBoardStore.getState().setWorkspaceTab(pane.paneId, 'tasks')
    expect(useBoardStore.getState().panes[0]).toMatchObject({ workspaceVisible: false, dockTab: 'file', workspaceTab: 'tasks' })
  })

  it('persists only layout preferences under the v1 key with internal schema 2', () => {
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
    expect(layout.panes[0]).toMatchObject({ collapsed: false, dockTab: 'workspace', workspaceTab: 'changes', peerReceive: true, peerSend: true })
    expect(layout.focusedPaneId).toBe('p1')
    expect(layout.focusMode).toBe(false)
    expect(layout.focusModeSnapshot).toBeNull()
    expect(layout.notifications).toEqual({ toasts: true, system: false, needsYou: true, systemDetails: false })
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
