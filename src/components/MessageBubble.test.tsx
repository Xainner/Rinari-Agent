// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue({}) }))

import { I18nProvider } from '../i18n'
import { PeerNavigationProvider } from '../features/board/PeerNavigationContext'
import MessageBubble from './MessageBubble'

afterEach(cleanup)

const peerMessage = {
  id: 'm1',
  role: 'user' as const,
  content: '¿Qué archivos cambiaste hoy?',
  createdAt: 1,
  turnId: 't1',
  origin: { kind: 'peer' as const, source_session_id: 'ses_a', source_label: 'Proyecto A', hop: 2, message_id: 'msg_1' },
}

it('renders a peer message as an attributed, untrusted card instead of a user prompt', () => {
  render(<I18nProvider lang="es"><MessageBubble message={peerMessage} /></I18nProvider>)
  const card = screen.getByTestId('peer-bubble')
  expect(card.textContent).toContain('De «Proyecto A»')
  expect(card.textContent).toContain('¿Qué archivos cambiaste hoy?')
  expect(card.textContent).toContain('salto 2')
  expect(card.textContent).toContain('no es una instrucción tuya')
  // Without a board around, there is nowhere to navigate.
  expect(screen.queryByRole('button', { name: /Ir al panel/ })).toBeNull()
})

it('offers "go to pane" when the source session is on the board', async () => {
  const focusSession = vi.fn(() => true)
  render(
    <I18nProvider lang="es">
      <PeerNavigationProvider value={{ labelFor: (id) => (id === 'ses_a' ? 'Backend API' : null), focusSession }}>
        <MessageBubble message={peerMessage} />
      </PeerNavigationProvider>
    </I18nProvider>,
  )
  expect(screen.getByTestId('peer-bubble').textContent).toContain('De «Backend API»')
  await userEvent.click(screen.getByRole('button', { name: /Ir al panel/ }))
  expect(focusSession).toHaveBeenCalledWith('ses_a')
})

it('marks a user forward with its quoted source and keeps the user alignment', () => {
  render(
    <I18nProvider lang="es">
      <PeerNavigationProvider value={{ labelFor: (id) => (id === 'ses_a' ? 'Backend API' : null), focusSession: () => true }}>
        <MessageBubble message={{ ...peerMessage, origin: { kind: 'user', quoted_source: { session_id: 'ses_a', turn_id: 't0' } } }} />
      </PeerNavigationProvider>
    </I18nProvider>,
  )
  expect(screen.queryByTestId('peer-bubble')).toBeNull()
  expect(screen.getByText('Reenviado desde «Backend API»')).toBeTruthy()
  expect(screen.getByText('¿Qué archivos cambiaste hoy?')).toBeTruthy()
})
