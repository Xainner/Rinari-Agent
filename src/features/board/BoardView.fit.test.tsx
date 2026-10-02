// @vitest-environment jsdom
import { installMockPlatform } from '../../test/mockPlatform'
installMockPlatform()
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../services/desktop', () => ({ desktopApi: { questions: vi.fn(async () => ({ questions: [] })), readFile: vi.fn(), answer: vi.fn() } }))
vi.mock('../workspace/WorkspaceView', () => ({ default: () => <div /> }))
import { defaultBoard, useBoardStore } from '../../stores/board'
import { resetPendingQuestionsForTests } from '../questions/usePendingQuestions'
import BoardView from './BoardView'
import { BoardHarness, engineFixture, sessionFixture } from './testUtils'

beforeEach(() => {
  window.localStorage.clear()
  resetPendingQuestionsForTests()
  useBoardStore.getState().hydrate(defaultBoard())
})
afterEach(cleanup)

it('toggles through the accessible toolbar without remounting composers or changing widths', async () => {
  const sessions = [sessionFixture('ses_a', 'A'), sessionFixture('ses_b', 'B')]
  const engine = engineFixture({ sessions, historyInfo: Object.fromEntries(sessions.map(({ id }) => [id, { total: 0, hasMore: false }])) })
  const a = useBoardStore.getState().addPane('ses_a')
  useBoardStore.getState().addPane('ses_b')
  useBoardStore.getState().setPaneWidth(a.paneId, 650)
  const { container } = render(<BoardHarness engine={engine}><BoardView /></BoardHarness>)
  const user = userEvent.setup()
  const composer = within(screen.getByRole('region', { name: 'A' })).getByRole('textbox', { name: 'Mensaje' })
  await user.type(composer, 'Borrador conservado')
  const widths = useBoardStore.getState().panes.map((pane) => pane.width)
  expect(container.querySelectorAll('.board-pane-resizer')).toHaveLength(2)
  const toggle = screen.getByRole('button', { name: 'Ajustar a la vista' })
  await user.click(toggle)
  expect(toggle.getAttribute('aria-pressed')).toBe('true')
  expect(container.querySelectorAll('.board-pane-resizer')).toHaveLength(0)
  expect(container.querySelector('.board-root')?.classList.contains('is-fit-to-view')).toBe(true)
  expect(within(screen.getByRole('region', { name: 'A' })).getByRole('textbox', { name: 'Mensaje' })).toBe(composer)
  expect((composer as HTMLTextAreaElement).value).toBe('Borrador conservado')
  act(() => useBoardStore.getState().collapseAll())
  expect(container.querySelectorAll('[data-collapsed]')).toHaveLength(2)
  expect(container.querySelector('.board-add-column button')).toBeTruthy()
  expect(useBoardStore.getState().fitToView).toBe(true)
  act(() => useBoardStore.getState().expandAll())
  await user.click(toggle)
  expect(toggle.getAttribute('aria-pressed')).toBe('false')
  expect(container.querySelectorAll('.board-pane-resizer')).toHaveLength(2)
  expect(useBoardStore.getState().panes.map((pane) => pane.width)).toEqual(widths)
})
