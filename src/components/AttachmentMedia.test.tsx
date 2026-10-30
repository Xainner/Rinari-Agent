// @vitest-environment jsdom
// Plan 0.4.0 #57: un audio o un video adjunto suena donde está, en la burbuja
// del historial, con la copia que Rinari guardó (artifact://…).
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { setPlatformForTests } from '../platform'
import { createTestBridge, type TestBridge } from '../platform/testBridge'
import { FileWorkspaceProvider } from '../features/files/FileWorkspace'
import MessageBubble from './MessageBubble'

let bridge: TestBridge
let restore: () => void
beforeEach(() => { bridge = createTestBridge(); restore = setPlatformForTests(bridge) })
afterEach(() => { cleanup(); restore(); vi.restoreAllMocks() })

it('el audio de un mensaje se reproduce en la burbuja y se cierra', async () => {
  bridge.mediaKinds['artifact://att/nota.mp3'] = 'audio'
  const media = vi.spyOn(bridge.files, 'media')
  render(
    <I18nProvider lang="es">
      <FileWorkspaceProvider sessionId="ses_a">
        <MessageBubble message={{
          id: 'm1', role: 'user', content: 'Escucha esto', createdAt: 0,
          attachments: [{ id: 'a1', path: 'artifact://att/nota.mp3', uri: 'artifact://att/nota.mp3', name: 'nota.mp3', source: 'workspace', kind: 'audio', status: 'ready' }],
        }} />
      </FileWorkspaceProvider>
    </I18nProvider>,
  )
  expect(media).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Reproducir nota.mp3' }))
  await waitFor(() => expect(screen.getByTestId('attachment-player').querySelector('audio')).toBeTruthy())
  expect(media).toHaveBeenCalledWith({ session_id: 'ses_a', path: 'artifact://att/nota.mp3' })
  await userEvent.click(screen.getByRole('button', { name: 'Cerrar el reproductor de nota.mp3' }))
  expect(screen.queryByTestId('attachment-player')).toBeNull()
})
