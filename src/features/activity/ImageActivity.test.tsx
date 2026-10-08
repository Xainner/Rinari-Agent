// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { engineApi } from '../../services/engine'
import { ActivityImageProvider, ImageActivity } from './ImageActivity'
import { createInitialTimelineState, engineEventAction, turnTimelineReducer } from './turnTimelineReducer'
import TurnTimelineView from './TurnTimelineView'
import { useActivityDisclosure } from '../../stores/activityDisclosure'

const image = { uri: 'artifact://s1/media/image.png', name: 'imagen ñ.png', path: 'C:\\Mis imágenes\\imagen ñ.png', width: 1800, height: 1000 }
afterEach(() => { cleanup(); useActivityDisclosure.getState().reset(); vi.restoreAllMocks() })

it('replays a viewed image, enlarges the stored copy and closes with Escape', async () => {
  const preview = vi.spyOn(engineApi, 'attachmentPreview').mockResolvedValue({ data_url: 'data:image/jpeg;base64,aGVsbG8=' })
  let state = createInitialTimelineState()
  state = turnTimelineReducer(state, engineEventAction({ type: 'event', event: 'tool.completed', payload: {
    session_id: 's1', turn_id: 't1', tool_call_id: 'i1', tool: 'fs.read_image', activity_seq: 1,
    presentation: { kind: 'image', image },
  } }, 1000)!)
  render(<I18nProvider lang="es"><TurnTimelineView timeline={state.timelines.t1} now={1000} onResolveApproval={vi.fn()} onContinue={vi.fn()} /></I18nProvider>)
  expect(preview).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('Cargó una imagen'))
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



// The viewer is owned by the conversation, not by an operation that may unmount.
it('keeps an inspected image open through completion and virtualization', async () => {
  vi.spyOn(engineApi, 'attachmentPreview').mockResolvedValue({ data_url: 'data:image/jpeg;base64,aGVsbG8=' })
  const tool = { id: 'tool:i', type: 'tool' as const, toolCallId: 'i', activitySeq: 1, occurredAt: 1000, tool: 'fs.read_image', status: 'completed' as const, presentation: { kind: 'image' as const, image } }
  const content = (status: 'running' | 'completed', mounted = true) => <I18nProvider lang="es"><ActivityImageProvider>
    {mounted && <TurnTimelineView timeline={{ turnId: 't', sessionId: 's', status, startedAt: 1000, completedAt: status === 'completed' ? 2000 : undefined, userMessage: 'Mira', items: [tool] }} now={2000} onResolveApproval={vi.fn()} />}
  </ActivityImageProvider></I18nProvider>
  const rendered = render(content('running'))
  fireEvent.click(screen.getByText('Cargó una imagen'))
  await userEvent.click(screen.getByRole('button', { name: /Ampliar imagen/ }))
  expect(screen.getByRole('dialog')).toBeTruthy()
  rendered.rerender(content('completed'))
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(rendered.container.querySelector('[data-operation-group]')).toBeNull()
  rendered.rerender(content('completed', false))
  expect(screen.getByRole('dialog')).toBeTruthy()
  await userEvent.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})
