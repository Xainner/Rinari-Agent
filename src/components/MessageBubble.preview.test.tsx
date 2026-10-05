// @vitest-environment jsdom
import { installMockPlatform } from '../test/mockPlatform'
installMockPlatform()
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { engineApi } from '../services/engine'
import { selectOverlayDepth, useOverlayStore } from '../stores/overlay'
import MessageBubble from './MessageBubble'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('opens a window-level image modal, traps focus and restores the opener after Escape', async () => {
  const user = userEvent.setup()
  const { container } = render(<I18nProvider lang="es"><MessageBubble message={{
    id: 'm1', role: 'user', content: 'Revisa esta imagen', createdAt: 0,
    attachments: [{ id: 'a1', path: 'prueba.png', name: 'prueba.png', source: 'native', kind: 'image', previewUrl: 'data:image/png;base64,AA==' }],
  }} /></I18nProvider>)
  const opener = screen.getByRole('button', { name: /prueba.png/ })
  await user.click(opener)
  const dialog = screen.getByRole('dialog', { name: /prueba.png/ })
  expect(container.contains(dialog)).toBe(false)
  expect(document.body.contains(dialog)).toBe(true)
  expect(selectOverlayDepth(useOverlayStore.getState())).toBe(1)
  for (let i = 0; i < 4; i++) {
    await user.tab()
    expect(dialog.contains(document.activeElement)).toBe(true)
  }
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(selectOverlayDepth(useOverlayStore.getState())).toBe(0)
  await waitFor(() => expect(document.activeElement).toBe(opener))
  await user.click(opener)
  await user.click(screen.getByRole('button', { name: 'Cerrar' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})

it('keeps text attachments readable in the same modal', async () => {
  vi.spyOn(engineApi, 'attachmentPreview').mockResolvedValue({ text: 'Contenido del adjunto' })
  render(<I18nProvider lang="es"><MessageBubble message={{
    id: 'm2', role: 'user', content: 'Revisa el archivo', createdAt: 0,
    attachments: [{ id: 'a2', path: 'nota.txt', name: 'nota.txt', source: 'native', kind: 'text', uri: 'artifact://s/nota.txt' }],
  }} /></I18nProvider>)
  await userEvent.click(screen.getByRole('button', { name: 'nota.txt' }))
  expect(await screen.findByText('Contenido del adjunto')).toBeTruthy()
  expect(engineApi.attachmentPreview).toHaveBeenCalledWith('artifact://s/nota.txt', 512 * 1024)
})
