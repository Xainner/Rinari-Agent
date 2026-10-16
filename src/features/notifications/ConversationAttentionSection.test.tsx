// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { defaultBoard, useBoardStore } from '../../stores/board'
import { useBoardAttentionStore } from '../../stores/boardAttention'
import ConversationAttentionSection from './ConversationAttentionSection'
import { useSessionPendingStore } from './attentionIndicators'

beforeEach(() => {
  window.localStorage.clear()
  useBoardStore.getState().hydrate({ ...defaultBoard(), boardId: 'board_1' })
  useBoardAttentionStore.getState().hydrate({})
  useBoardAttentionStore.getState().initializeSessionAttention('ses_b', [])
  useBoardAttentionStore.getState().observeTerminal('ses_b', 't7', 'completed', 'live', 1)
  useSessionPendingStore.setState({
    bySession: {
      ses_a: { sessionId: 'ses_a', needsYou: true, unread: [], unreadPeers: 0, working: true },
      ses_b: { sessionId: 'ses_b', needsYou: false, unread: ['completed'], unreadPeers: 0, working: false },
      ses_board: { sessionId: 'ses_board', needsYou: false, unread: ['failed'], unreadPeers: 0, working: false },
    },
  })
  useBoardStore.getState().addPane('ses_board')
})
afterEach(cleanup)

it('lists each pending conversation by name and project, the urgent first, without the Boards ones', () => {
  const onOpen = vi.fn()
  const titles: Record<string, string> = { ses_a: 'Migrar la base', ses_b: 'Logo nuevo', ses_board: 'En el board' }
  render(
    <I18nProvider lang="es">
      <ConversationAttentionSection labelFor={(id) => titles[id]} projectFor={(id) => (id === 'ses_a' ? 'api' : null)} onOpen={onOpen} />
    </I18nProvider>,
  )
  const rows = screen.getAllByRole('button')
  expect(rows.map((row) => row.getAttribute('data-signal'))).toEqual(['needs_you', 'unread'])
  expect(rows[0].textContent).toContain('Migrar la base')
  expect(rows[0].textContent).toContain('api')
  expect(screen.queryByText('En el board')).toBeNull()
  fireEvent.click(rows[1])
  expect(onOpen).toHaveBeenCalledWith('ses_b', 't7')
})
