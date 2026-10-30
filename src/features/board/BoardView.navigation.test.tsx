// @vitest-environment jsdom
import { installMockPlatform } from '../../test/mockPlatform'
installMockPlatform()
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../services/desktop', () => ({
  desktopApi: { questions: vi.fn(async () => ({ questions: [] })), readFile: vi.fn(), answer: vi.fn() },
}))
vi.mock('../workspace/WorkspaceView', () => ({
  default: ({ session }: { session: { id: string } | null }) => <div data-testid={`workspace-${session?.id ?? 'none'}`} />,
}))
const toastInfo = vi.fn()
vi.mock('sonner', async (original) => {
  const actual = await original<typeof import('sonner')>()
  return { ...actual, toast: Object.assign(vi.fn(), actual.toast, { info: (...args: unknown[]) => toastInfo(...args) }) }
})
import { engineEventAction } from '../activity/turnTimelineReducer'
import { useBoardStore, defaultBoard } from '../../stores/board'
import { useBoardAttentionStore } from '../../stores/boardAttention'
import { useBoardStatusStore } from '../../stores/boardStatus'
import { useComposerStore } from '../../stores/composer'
import { resetSessionDockForTests } from '../../stores/sessionDock'
import { resetPendingQuestionsForTests } from '../questions/usePendingQuestions'
import { dispatchAction } from '../../services/actions'
import { FOCUS_COMPOSER_EVENT } from '../../components/composer/focusComposer'
import BoardActivityController from './BoardActivityController'
import BoardView from './BoardView'
import { BoardHarness, engineFixture, sessionFixture } from './testUtils'
import { SESSION_DRAG_TYPE, dropIndex } from './boardDrag'
import { PANE_PEEK_EVENT } from './useBoardNavigation'

const NOW = 1_700_000_000_000
const event = (name: string, payload: Record<string, unknown>) => engineEventAction({ type: 'event', event: name, payload }, NOW)!

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  ;(window as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub
  Element.prototype.scrollTo = vi.fn() as unknown as Element['scrollTo']
  window.localStorage.clear()
  resetSessionDockForTests()
  resetPendingQuestionsForTests()
  useBoardStore.getState().hydrate({ ...defaultBoard(), boardId: 'board_1' })
  useBoardAttentionStore.getState().hydrate({})
  useBoardStatusStore.getState().publish({})
  useComposerStore.setState({ sessionKey: 'draft', text: '', attachments: [], draftsBySession: {} })
  toastInfo.mockClear()
})
afterEach(cleanup)

const sessions = [sessionFixture('ses_a', 'Backend API', 'proj_a'), sessionFixture('ses_b', 'Docs'), sessionFixture('ses_c', 'Infra'), sessionFixture('ses_d', 'Pagos')]

function mount() {
  const engine = engineFixture({ sessions, historyInfo: Object.fromEntries(sessions.map((row) => [row.id, { total: 0, hasMore: false }])) })
  for (const row of sessions.slice(0, 3)) useBoardStore.getState().addPane(row.id)
  render(<BoardHarness engine={engine}><BoardActivityController /><BoardView /></BoardHarness>)
  return engine
}

describe('Ctrl+1…9 (plan-boards B.4.1)', () => {
  it('focuses pane N and its composer; a collapsed one gets focus and its peek, not unfolded', async () => {
    mount()
    const panes = useBoardStore.getState().panes
    const focus = vi.fn()
    window.addEventListener(FOCUS_COMPOSER_EVENT, focus)
    fireEvent.keyDown(window, { key: '2', ctrlKey: true })
    expect(useBoardStore.getState().focusedPaneId).toBe(panes[1].paneId)
    expect((focus.mock.calls[0][0] as CustomEvent).detail).toEqual({ sessionId: 'ses_b' })
    window.removeEventListener(FOCUS_COMPOSER_EVENT, focus)

    act(() => useBoardStore.getState().setCollapsed(panes[2].paneId, true))
    const peek = vi.fn()
    window.addEventListener(PANE_PEEK_EVENT, peek)
    fireEvent.keyDown(window, { key: '3', ctrlKey: true })
    expect(useBoardStore.getState().focusedPaneId).toBe(panes[2].paneId)
    expect(useBoardStore.getState().panes[2].collapsed).toBe(true)
    expect((peek.mock.calls[0][0] as CustomEvent).detail).toEqual({ paneId: panes[2].paneId })
    window.removeEventListener(PANE_PEEK_EVENT, peek)

    // No pane 9: nothing happens.
    fireEvent.keyDown(window, { key: '9', ctrlKey: true })
    expect(useBoardStore.getState().focusedPaneId).toBe(panes[2].paneId)
  })
})

describe('Ctrl+J', () => {
  it('goes to the panes that need you in order of arrival, and says so when none does', async () => {
    const engine = mount()
    const panes = useBoardStore.getState().panes
    act(() => dispatchAction('board-next-needs-you'))
    expect(toastInfo).toHaveBeenCalledWith('Nada te necesita', expect.anything())

    const dispatch = engine.runtime.getState().dispatch
    act(() => {
      dispatch(event('turn.started', { turn_id: 'tc', session_id: 'ses_c' }))
      dispatch(event('approval.requested', { turn_id: 'tc', session_id: 'ses_c', approval_id: 'apr_c', capability: 'shell.exec', target: 'ls', risk: 'medium', description: 'run', choices: ['deny', 'allow_once'] }))
    })
    await waitFor(() => expect(useBoardStatusStore.getState().byPane[panes[2].paneId]?.kind).toBe('needs_you'))
    act(() => {
      dispatch(event('turn.started', { turn_id: 'ta', session_id: 'ses_a' }))
      dispatch(event('turn.failed', { turn_id: 'ta', session_id: 'ses_a', error: 'boom' }))
    })
    await waitFor(() => expect(useBoardStatusStore.getState().byPane[panes[0].paneId]?.kind).toBe('failed'))
    act(() => useBoardStore.getState().focusPane(panes[1].paneId))
    act(() => dispatchAction('board-next-needs-you'))
    // ses_c asked first.
    expect(useBoardStore.getState().focusedPaneId).toBe(panes[2].paneId)
    act(() => dispatchAction('board-next-needs-you'))
    expect(useBoardStore.getState().focusedPaneId).toBe(panes[0].paneId)
    act(() => dispatchAction('board-next-needs-you'))
    expect(useBoardStore.getState().focusedPaneId).toBe(panes[2].paneId)
  })
})

describe('dragging a conversation from the sidebar (B.4.2)', () => {
  it('drops between two panes, at the end, or moves one already on the board', () => {
    expect(dropIndex(50, [{ left: 0, width: 300 }, { left: 300, width: 300 }])).toBe(0)
    expect(dropIndex(400, [{ left: 0, width: 300 }, { left: 300, width: 300 }])).toBe(1)
    expect(dropIndex(500, [{ left: 0, width: 300 }, { left: 300, width: 300 }])).toBe(2)

    mount()
    const canvas = screen.getByRole('region', { name: 'Boards' })
    const nodes = [...canvas.querySelectorAll<HTMLElement>('.board-pane-row > [data-pane-id]')]
    nodes.forEach((node, index) => {
      node.getBoundingClientRect = () => ({ left: index * 300, right: index * 300 + 300, width: 300, top: 0, bottom: 600, height: 600, x: index * 300, y: 0, toJSON: () => ({}) })
    })
    const data = (sessionId: string) => ({ types: [SESSION_DRAG_TYPE], getData: (type: string) => (type === SESSION_DRAG_TYPE ? sessionId : ''), dropEffect: 'none' })
    // jsdom's DragEvent drops clientX: set it on the event itself.
    const drag = (kind: 'dragOver' | 'drop', clientX: number, dataTransfer: unknown) => {
      const dragEvent = createEvent[kind](canvas, { dataTransfer })
      Object.defineProperty(dragEvent, 'clientX', { value: clientX })
      fireEvent(canvas, dragEvent)
    }
    drag('dragOver', 320, data('ses_d'))
    expect(screen.getByTestId('board-drop-guide')).toBeTruthy()
    drag('drop', 320, data('ses_d'))
    expect(screen.queryByTestId('board-drop-guide')).toBeNull()
    expect(useBoardStore.getState().panes.map((pane) => pane.sessionId)).toEqual(['ses_a', 'ses_d', 'ses_b', 'ses_c'])
    expect(useBoardStore.getState().focusedPaneId).toBe(useBoardStore.getState().panes[1].paneId)

    // Already on the board: it moves there instead of adding another.
    drag('drop', 10, data('ses_c'))
    expect(useBoardStore.getState().panes.map((pane) => pane.sessionId)).toEqual(['ses_c', 'ses_a', 'ses_d', 'ses_b'])

    // Files are not a conversation: no guide, nothing added.
    drag('dragOver', 10, { types: ['Files'], getData: () => '' })
    expect(screen.queryByTestId('board-drop-guide')).toBeNull()
  })
})
