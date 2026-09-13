// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { engineApi } from '../../services/engine'
import { ImageActivity } from './ImageActivity'
import { createInitialTimelineState, engineEventAction, turnTimelineReducer } from './turnTimelineReducer'
import TurnTimelineView from './TurnTimelineView'

const image = { uri: 'artifact://s1/media/image.png', name: 'imagen ñ.png', path: 'C:\\Mis imágenes\\imagen ñ.png', width: 1800, height: 1000 }
afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('replays a viewed image, enlarges the stored copy and closes with Escape', async () => {
  const preview = vi.spyOn(engineApi, 'attachmentPreview').mockResolvedValue({ data_url: 'data:image/jpeg;base64,aGVsbG8=' })
  let state = createInitialTimelineState()
  state = turnTimelineReducer(state, engineEventAction({ type: 'event', event: 'tool.completed', payload: {
    session_id: 's1', turn_id: 't1', tool_call_id: 'i1', tool: 'fs.read_image', activity_seq: 1,
    presentation: { kind: 'image', image },
  } }, 1000)!)
  render(<I18nProvider lang="es"><TurnTimelineView timeline={state.timelines.t1} now={1000} onResolveApproval={vi.fn()} onContinue={vi.fn()} /></I18nProvider>)
  expect(screen.getByText('Cargó una imagen')).toBeTruthy()
  await waitFor(() => expect(preview).toHaveBeenCalledWith(image.uri, 524288, 512))
  await userEvent.click(screen.getByRole('button', { name: 'Ampliar imagen: imagen ñ.png' }))
  await waitFor(() => expect(preview).toHaveBeenCalledWith(image.uri, 524288, 2048))
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(screen.getByRole('img', { name: image.name }).getAttribute('src')).toMatch(/^data:image\/jpeg/)
  await userEvent.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})

it('shows preview errors and allows retry without running another model tool', async () => {
  const preview = vi.spyOn(engineApi, 'attachmentPreview').mockRejectedValue(new Error('Archivo ausente'))
  render(<I18nProvider lang="es"><ImageActivity image={image} /></I18nProvider>)
  await screen.findByRole('alert')
  await userEvent.click(screen.getByRole('button', { name: /Ampliar imagen/ }))
  await screen.findByRole('button', { name: 'Reintentar' })
  preview.mockResolvedValue({ data_url: 'data:image/jpeg;base64,aGVsbG8=' })
  await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  await screen.findByRole('img', { name: image.name })
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
})
