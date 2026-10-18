// @vitest-environment jsdom
import { installMockPlatform } from '../test/mockPlatform'
installMockPlatform()
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'


import { I18nProvider } from '../i18n'
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
  // History only: peer messaging was retired, there is no pane to go to.
  expect(screen.queryByRole('button', { name: /Ir al panel/ })).toBeNull()
})

it('marks a user forward with its quoted source and keeps the user alignment', () => {
  render(
    <I18nProvider lang="es">
      <MessageBubble message={{ ...peerMessage, origin: { kind: 'user', quoted_source: { session_id: 'ses_a', turn_id: 't0' } } }} />
    </I18nProvider>,
  )
  expect(screen.queryByTestId('peer-bubble')).toBeNull()
  expect(screen.getByText('Reenviado desde «ses_a»')).toBeTruthy()
  expect(screen.getByText('¿Qué archivos cambiaste hoy?')).toBeTruthy()
})

it('«Exportar desde aquí» also on a message of the turn still running, from its turn (#79)', async () => {
  const { TurnSessionContext } = await import('../features/activity/turnSession')
  const { useReviewExport } = await import('../features/review/ReviewExportDialog')
  render(
    <I18nProvider lang="es">
      <TurnSessionContext.Provider value="ses_live">
        <MessageBubble message={{ id: 'local-123', role: 'user', content: 'Entrega ya', createdAt: 1, turnId: 'turn-live' }} />
      </TurnSessionContext.Provider>
    </I18nProvider>,
  )
  await userEvent.click(screen.getByTestId('export-from-message'))
  expect(useReviewExport.getState().target).toEqual({ sessionId: 'ses_live', fromSeq: undefined, fromTurnId: 'turn-live' })
  useReviewExport.getState().close()
})
