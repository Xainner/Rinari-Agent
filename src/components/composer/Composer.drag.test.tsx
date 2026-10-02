// @vitest-environment jsdom
import { installMockPlatform } from '../../test/mockPlatform'
installMockPlatform()
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { AttachmentRef } from '../../types'
import { I18nProvider } from '../../i18n'
import { useComposerStore } from '../../stores/composer'
import Composer from './Composer'
import { ChatFileDropZone } from './ChatFileDropZone'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
beforeEach(() => {
  localStorage.clear()
  useComposerStore.setState({ sessionKey: 'draft', text: '', attachments: [], draftsBySession: {} })
})
function pane(sessionId = 'a', props: Partial<ComponentProps<typeof Composer>> = {}) {
  return <ChatFileDropZone draftKey={sessionId}><div data-testid="transcript">Historial del chat</div><Composer placement="bottom" sessionId={sessionId} primary={false} acceptsGlobalFocus={false}
    onSend={async () => true} isStreaming={false} onStop={vi.fn()} models={[]} activeAlias=""
    onUseModel={vi.fn()} onDiscoverModels={vi.fn()} onOpenProviders={vi.fn()}
    sessionMode="build" onModeChange={vi.fn()} reasoningEffort="off" onReasoningChange={vi.fn()}
    permissionProfile="workspace" effectivePermissionProfile="workspace" permissionProfilesV2
    onPermissionChange={vi.fn()} onSearchFiles={async () => ({ root: '/', files: [] })} {...props} /></ChatFileDropZone>
}
const ui = (children = pane()) => <I18nProvider lang="es">{children}</I18nProvider>
const surface = () => document.querySelector('.chat-file-drop-zone')!
const highlighted = (el = surface()) => el.hasAttribute('data-file-drag')
const protectedFiles = () => ({ types: ['Files'], items: [{ kind: 'file' }], files: [], dropEffect: 'none' })
const file = (name: string) => new File(['attachment contents'], name, { type: 'text/plain' })
function drop(el: Element, files: File[]) {
  fireEvent.dragEnter(el, { dataTransfer: protectedFiles() })
  fireEvent.drop(el, { dataTransfer: { ...protectedFiles(), files } })
}

it('recognizes protected file drags, requests copy, and stays stable across nested children', () => {
  render(ui())
  const dataTransfer = protectedFiles()
  fireEvent.dragEnter(surface(), { dataTransfer })
  expect(highlighted()).toBe(true)
  expect(screen.getByRole('status').textContent).toBe('Suelta los archivos aquí')
  const textarea = screen.getByRole('textbox', { name: 'Mensaje' })
  fireEvent.dragEnter(textarea, { dataTransfer })
  fireEvent.dragLeave(surface(), { dataTransfer, relatedTarget: textarea })
  expect(highlighted()).toBe(true)
  fireEvent.dragOver(textarea, { dataTransfer })
  expect(dataTransfer.dropEffect).toBe('copy')
  fireEvent.dragLeave(textarea, { dataTransfer })
  expect(highlighted()).toBe(false)
})

it('ignores text and URLs; accepts item-kind detection without Files in types', () => {
  render(ui())
  const text = { types: ['text/plain', 'text/uri-list'], items: [{ kind: 'string' }], files: [] }
  fireEvent.dragEnter(surface(), { dataTransfer: text })
  fireEvent.dragOver(surface(), { dataTransfer: text })
  expect(highlighted()).toBe(false)
  fireEvent.dragOver(surface(), { dataTransfer: { ...protectedFiles(), types: [] } })
  expect(highlighted()).toBe(true)
})

it('clears repeated native entries when cancellation leaves the current child with no relatedTarget', () => {
  render(ui())
  const textarea = screen.getByRole('textbox', { name: 'Mensaje' })
  const dataTransfer = protectedFiles()
  fireEvent.dragEnter(surface(), { dataTransfer })
  fireEvent.dragEnter(textarea, { dataTransfer })
  fireEvent.dragEnter(textarea, { dataTransfer })
  fireEvent.dragOver(textarea, { dataTransfer })
  fireEvent.dragLeave(textarea, { dataTransfer, relatedTarget: null })
  expect(highlighted()).toBe(false)
})

it.each(['escape', 'blur', 'dragend', 'window-leave', 'outside', 'drop', 'hidden'])('clears on %s without reading files', (reason) => {
  render(ui())
  const read = vi.spyOn(FileReader.prototype, 'readAsDataURL')
  fireEvent.dragEnter(surface(), { dataTransfer: protectedFiles() })
  if (reason === 'escape') fireEvent.keyDown(window, { key: 'Escape' })
  if (reason === 'blur') fireEvent.blur(window)
  if (reason === 'dragend') fireEvent.dragEnd(window)
  if (reason === 'window-leave') fireEvent.dragLeave(document.documentElement)
  if (reason === 'outside') fireEvent.dragOver(document.body, { dataTransfer: protectedFiles() })
  if (reason === 'drop') fireEvent.drop(document.body, { dataTransfer: protectedFiles() })
  if (reason === 'hidden') {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    fireEvent(document, new Event('visibilitychange'))
  }
  expect(highlighted()).toBe(false)
  expect(read).not.toHaveBeenCalled()
})

it('clears on draft change and cleans global listeners on unmount', () => {
  const remove = vi.spyOn(window, 'removeEventListener')
  const view = render(ui())
  fireEvent.dragEnter(surface(), { dataTransfer: protectedFiles() })
  view.rerender(ui(pane('b')))
  expect(highlighted()).toBe(false)
  view.unmount()
  for (const event of ['dragover', 'dragleave', 'drop', 'dragend', 'blur', 'keydown'])
    expect(remove).toHaveBeenCalledWith(event, expect.any(Function))
})

it('moves the cue from focused A to unfocused B and attaches only to B during streaming', async () => {
  const send = vi.fn(async () => true)
  render(ui(<>{pane('a', { acceptsGlobalFocus: true })}{pane('b', { isStreaming: true, onSend: send })}</>))
  const [a, b] = document.querySelectorAll('.chat-file-drop-zone')
  fireEvent.dragEnter(a, { dataTransfer: protectedFiles() })
  fireEvent.dragEnter(b, { dataTransfer: protectedFiles() })
  fireEvent.dragOver(b, { dataTransfer: protectedFiles() })
  expect(highlighted(a)).toBe(false)
  expect(highlighted(b)).toBe(true)
  drop(b, [file('one.txt'), file('two.txt')])
  expect(highlighted(b)).toBe(false)
  await waitFor(() => expect(useComposerStore.getState().getDraft('b').attachments).toHaveLength(2))
  expect(useComposerStore.getState().getDraft('a').attachments).toHaveLength(0)
  expect(send).not.toHaveBeenCalled()
})

it('clears immediately on rejected drops and never prepares beyond eight files', async () => {
  const prepare = vi.fn(async (items) => items)
  render(ui(pane('a', { placement: 'centered', onPrepareAttachments: prepare })))
  const huge = file('too-large.txt')
  Object.defineProperty(huge, 'size', { value: 26 * 1024 * 1024 })
  drop(surface(), [huge])
  expect(highlighted()).toBe(false)
  expect(prepare).not.toHaveBeenCalled()
  drop(surface(), Array.from({ length: 10 }, (_, i) => file(i + '.txt')))
  await waitFor(() => expect(prepare).toHaveBeenCalledTimes(8))
  await waitFor(() => expect(screen.getByText('Puedes adjuntar hasta ocho archivos por envío.')).toBeTruthy())
  expect(useComposerStore.getState().getDraft('a').attachments).toHaveLength(8)
})

it('keeps delayed file reads and preparation results in the original draft after switching', async () => {
  const readers: FileReader[] = []
  vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) { readers.push(this) })
  let finish!: (items: AttachmentRef[]) => void
  const prepare = vi.fn(() => new Promise<AttachmentRef[]>(resolve => { finish = resolve }))
  const view = render(ui(pane('a', { onPrepareAttachments: prepare })))
  drop(surface(), [file('delayed.txt')])
  view.rerender(ui(pane('b')))
  await act(async () => {
    Object.defineProperty(readers[0], 'result', { value: 'data:text/plain;base64,YQ==' })
    readers[0].dispatchEvent(new ProgressEvent('load'))
  })
  expect(useComposerStore.getState().getDraft('a').attachments[0].status).toBe('preparing')
  const pending = useComposerStore.getState().getDraft('a').attachments[0]
  await act(async () => finish([{ ...pending, status: 'ready' }]))
  expect(useComposerStore.getState().getDraft('a').attachments[0].status).toBe('ready')
  expect(useComposerStore.getState().getDraft('b').attachments).toHaveLength(0)
})

it('clears the cue even when attachment preparation fails', async () => {
  render(ui(pane('a', { onPrepareAttachments: async () => { throw new Error('Unsupported format') } })))
  drop(surface(), [file('unsupported.txt')])
  expect(highlighted()).toBe(false)
  await waitFor(() => expect(useComposerStore.getState().getDraft('a').attachments[0]?.status).toBe('error'))
})

it('accepts a drop on the transcript and processes a composer drop only once', async () => {
  const prepare = vi.fn(async (items: AttachmentRef[]) => items.map(item => ({ ...item, status: 'ready' as const })))
  render(ui(pane('a', { onPrepareAttachments: prepare })))
  drop(screen.getByTestId('transcript'), [file('from-history.txt')])
  await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1))
  drop(screen.getByRole('textbox', { name: 'Mensaje' }), [file('from-composer.txt')])
  await waitFor(() => expect(prepare).toHaveBeenCalledTimes(2))
  expect(useComposerStore.getState().getDraft('a').attachments.map(item => item.name)).toEqual(['from-history.txt', 'from-composer.txt'])
  expect(highlighted()).toBe(false)
})

it('does not advertise or consume files when the chat has no composer', () => {
  const view = render(ui(<ChatFileDropZone draftKey="a" enabled={false}><div>Loading</div></ChatFileDropZone>))
  fireEvent.dragEnter(surface(), { dataTransfer: protectedFiles() })
  expect(highlighted()).toBe(false)
  view.rerender(ui(pane()))
  fireEvent.dragEnter(surface(), { dataTransfer: protectedFiles() })
  expect(highlighted()).toBe(true)
  view.rerender(ui(<ChatFileDropZone draftKey="a" enabled={false}><div>Error</div></ChatFileDropZone>))
  expect(highlighted()).toBe(false)
})
