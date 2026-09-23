// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  FileLink,
  FileTurnContext,
  FileViewer,
  FileWorkspaceProvider,
  fileUrlTransform,
  localFileTarget,
} from './FileWorkspace'
import type { ReactNode } from 'react'
import { desktopApi } from '../../services/desktop'
import { setPlatformForTests } from '../../platform'
import { createTestBridge, type TestBridge } from '../../platform/testBridge'

vi.mock('../../services/desktop', () => ({
  desktopApi: {
    watchFile: vi.fn().mockResolvedValue({
      watch_id: 'watch-1',
      preview: {
        path: 'C:/repo/plan.md',
        name: 'plan.md',
        language: 'md',
        content: '# Planning document',
        size: 19,
      },
    }),
    unwatchFile: vi.fn().mockResolvedValue({}),
    readFile: vi
      .fn()
      .mockResolvedValue({
        path: 'C:/repo/plan.md',
        name: 'plan.md',
        language: 'md',
        content: '# Planning document',
        size: 19,
      }),
  },
}))
vi.mock('../../lib/highlight', () => ({ highlightToHtml: vi.fn().mockResolvedValue(null) }))
let bridge: TestBridge
let restore: () => void
beforeEach(() => {
  bridge = createTestBridge()
  bridge.engineStatus.capabilities.workspace_file_watch_v1 = true
  restore = setPlatformForTests(bridge)
})
afterEach(() => {
  cleanup()
  restore()
  vi.clearAllMocks()
})

it('handles Windows paths, spaces, line suffixes and file URIs', () => {
  expect(localFileTarget('C:/my%20repo/plan.md:12')).toBe('C:/my repo/plan.md')
  expect(localFileTarget('file:///C:/my%20repo/plan.md')).toBe('C:/my repo/plan.md')
  expect(localFileTarget('file:///home/user/plan.md')).toBe('/home/user/plan.md')
  expect(localFileTarget('https://example.com/file.md')).toBe(null)
  expect(fileUrlTransform('javascript:alert(1)')).toBe('')
  expect(fileUrlTransform('data:text/html,test')).toBe('')
})

/** Controlador + visor, como los monta la superficie Archivos del dock. */
function Files({ children }: { children: ReactNode }) {
  return (
    <FileWorkspaceProvider sessionId="session">
      {children}
      <FileViewer />
    </FileWorkspaceProvider>
  )
}

it('opens the engine preview with turn provenance and deduplicates tabs', async () => {
  const user = userEvent.setup()
  render(
    <Files>
      <FileTurnContext.Provider value="old-turn">
        <FileLink href="plan.md">Open plan</FileLink>
      </FileTurnContext.Provider>
    </Files>,
  )
  await user.click(screen.getByText('Open plan'))
  expect(await screen.findByRole('heading', { name: 'Planning document' })).toBeTruthy()
  expect(desktopApi.watchFile).toHaveBeenCalledWith('session', 'plan.md', 'old-turn')
  await user.click(screen.getByText('Open plan'))
  expect(screen.getAllByRole('tab')).toHaveLength(1)
  await user.click(screen.getByText('Ver fuente'))
  expect(await screen.findByText('# Planning document')).toBeTruthy()
  await user.click(screen.getByLabelText('Cerrar plan.md'))
  expect(screen.queryAllByRole('tab')).toHaveLength(0)
  expect(desktopApi.unwatchFile).toHaveBeenCalledWith('session', 'watch-1')
})

it('shows missing file errors without replacing the conversation', async () => {
  vi.mocked(desktopApi.watchFile).mockRejectedValueOnce(new Error('File no longer exists'))
  const user = userEvent.setup()
  render(
    <Files>
      <FileLink href="missing.md">Original conversation</FileLink>
    </Files>,
  )
  await user.click(screen.getByText('Original conversation'))
  expect((await screen.findByRole('alert')).textContent).toContain('File no longer exists')
  expect(screen.getByText('Original conversation')).toBeTruthy()
})

it('refreshes watched files and preserves the last content when the refresh fails', async () => {
  const user = userEvent.setup()
  render(<Files><FileLink href="plan.md">Open plan</FileLink></Files>)
  await user.click(screen.getByText('Open plan'))
  expect(await screen.findByRole('heading', { name: 'Planning document' })).toBeTruthy()

  vi.mocked(desktopApi.readFile).mockResolvedValueOnce({
    path: 'C:/repo/plan.md', name: 'plan.md', language: 'md', content: '# Updated', size: 9,
  })
  bridge.emitEngineEvent({
    type: 'event', event: 'workspace.file.changed',
    payload: { watch_id: 'watch-1', session_id: 'session', path: 'C:/repo/plan.md', revision: 1, state: 'changed' },
  })
  expect(await screen.findByRole('heading', { name: 'Updated' })).toBeTruthy()

  vi.mocked(desktopApi.readFile).mockRejectedValueOnce(new Error('PERMISSION_DENIED'))
  bridge.emitEngineEvent({
    type: 'event', event: 'workspace.file.changed',
    payload: { watch_id: 'watch-1', session_id: 'session', path: 'C:/repo/plan.md', revision: 2, state: 'recreated' },
  })
  expect(await screen.findByText(/PERMISSION_DENIED/)).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Updated' })).toBeTruthy()
})

const preview = (title: string) => ({ path: 'C:/repo/plan.md', name: 'plan.md', language: 'md', content: `# ${title}`, size: title.length + 2 })
function changed(revision: number, state = 'changed') {
  bridge.emitEngineEvent({ type: 'event', event: 'workspace.file.changed',
    payload: { watch_id: 'watch-1', session_id: 'session', revision, state } })
}

it('keeps a deleted preview until a valid recreation and ignores older revisions', async () => {
  const user = userEvent.setup()
  render(<Files><FileLink href="plan.md">Open plan</FileLink></Files>)
  await user.click(screen.getByText('Open plan'))
  await screen.findByRole('heading', { name: 'Planning document' })
  act(() => changed(1, 'deleted'))
  expect(screen.getByRole('heading', { name: 'Planning document' })).toBeTruthy()
  expect(screen.getByText('El archivo fue eliminado.')).toBeTruthy()
  vi.mocked(desktopApi.readFile).mockResolvedValueOnce(preview('Recreated'))
  act(() => changed(2, 'recreated'))
  await screen.findByRole('heading', { name: 'Recreated' })
  act(() => changed(1, 'deleted'))
  expect(screen.queryByText('El archivo fue eliminado.')).toBeNull()
})

it('does not let a slow manual refresh overwrite a newer deletion', async () => {
  const user = userEvent.setup()
  render(<Files><FileLink href="plan.md">Open plan</FileLink></Files>)
  await user.click(screen.getByText('Open plan'))
  await screen.findByRole('heading', { name: 'Planning document' })
  let resolve!: (file: ReturnType<typeof preview>) => void
  vi.mocked(desktopApi.readFile).mockReturnValueOnce(new Promise(r => { resolve = r }))
  await user.click(screen.getByLabelText('Recargar archivo'))
  act(() => changed(1, 'deleted'))
  await act(async () => resolve(preview('Obsolete')))
  expect(screen.queryByRole('heading', { name: 'Obsolete' })).toBeNull()
  expect(screen.getByText('El archivo fue eliminado.')).toBeTruthy()
})

it('releases a watch returned after its tab was closed and reopened', async () => {
  const user = userEvent.setup()
  let resolve!: (value: { watch_id: string; preview: ReturnType<typeof preview> }) => void
  vi.mocked(desktopApi.watchFile).mockReturnValueOnce(new Promise(r => { resolve = r }))
  render(<Files><FileLink href="plan.md">Open plan</FileLink></Files>)
  await user.click(screen.getByText('Open plan'))
  await waitFor(() => expect(desktopApi.watchFile).toHaveBeenCalledTimes(1))
  await user.click(screen.getByLabelText('Cerrar plan.md'))
  await user.click(screen.getByText('Open plan'))
  await screen.findByRole('heading', { name: 'Planning document' })
  await act(async () => resolve({ watch_id: 'stale-watch', preview: preview('Obsolete') }))
  expect(desktopApi.unwatchFile).toHaveBeenCalledWith('session', 'stale-watch')
  expect(screen.queryByRole('heading', { name: 'Obsolete' })).toBeNull()
})

it('uses manual reads when the Engine does not advertise watches', async () => {
  bridge.engineStatus.capabilities.workspace_file_watch_v1 = false
  const user = userEvent.setup()
  render(<Files><FileLink href="plan.md">Open plan</FileLink></Files>)
  await user.click(screen.getByText('Open plan'))
  await screen.findByRole('heading', { name: 'Planning document' })
  expect(desktopApi.watchFile).not.toHaveBeenCalled()
  await user.click(screen.getByLabelText('Recargar archivo'))
  expect(desktopApi.readFile).toHaveBeenCalledTimes(2)
})

it('discards session tabs and releases watches on a session switch', async () => {
  const user = userEvent.setup()
  const content = (id: string) => <FileWorkspaceProvider sessionId={id}><FileLink href="plan.md">Open plan</FileLink><FileViewer /></FileWorkspaceProvider>
  const view = render(content('session'))
  await user.click(screen.getByText('Open plan'))
  await screen.findByRole('heading', { name: 'Planning document' })
  view.rerender(content('other'))
  // Cada watch se retira con la sesión que lo abrió, no con la nueva.
  expect(desktopApi.unwatchFile).toHaveBeenCalledWith('session', 'watch-1')
  view.rerender(content('session'))
  expect(screen.queryAllByRole('tab')).toHaveLength(0)
})

it('re-registers open watches when the Engine restarts', async () => {
  // El registro de watches vive en el proceso del Engine. Tras reiniciarlo, la
  // pestaña seguía abierta pero ya no se sincronizaba, sin decirlo.
  const user = userEvent.setup()
  const content = (generation: number) => (
    <FileWorkspaceProvider sessionId="session" engineGeneration={generation}>
      <FileLink href="plan.md">Open plan</FileLink>
      <FileViewer />
    </FileWorkspaceProvider>
  )
  const view = render(content(1))
  await user.click(screen.getByText('Open plan'))
  await screen.findByRole('heading', { name: 'Planning document' })
  expect(desktopApi.watchFile).toHaveBeenCalledTimes(1)
  // El watch viejo llega a la revisión 3 antes del reinicio.
  vi.mocked(desktopApi.readFile).mockResolvedValueOnce(preview('Before restart'))
  act(() => changed(3))
  await screen.findByRole('heading', { name: 'Before restart' })

  vi.mocked(desktopApi.watchFile).mockResolvedValueOnce({ watch_id: 'watch-2', preview: preview('Rewatched') })
  view.rerender(content(2))
  await screen.findByRole('heading', { name: 'Rewatched' })
  expect(desktopApi.watchFile).toHaveBeenCalledTimes(2)
  expect(desktopApi.watchFile).toHaveBeenLastCalledWith('session', 'plan.md', undefined)

  // Un evento del watch viejo ya no significa nada.
  act(() => changed(5, 'deleted'))
  expect(screen.queryByText('El archivo fue eliminado.')).toBeNull()
  // El nuevo empieza sus revisiones en 1 y se atiende: la monotonía se reinició.
  vi.mocked(desktopApi.readFile).mockResolvedValueOnce(preview('After restart'))
  act(() => bridge.emitEngineEvent({ type: 'event', event: 'workspace.file.changed',
    payload: { watch_id: 'watch-2', session_id: 'session', revision: 1, state: 'changed' } }))
  await screen.findByRole('heading', { name: 'After restart' })

  // La misma generación no vuelve a inscribir nada.
  view.rerender(content(2))
  expect(desktopApi.watchFile).toHaveBeenCalledTimes(2)
})

it('falls back to manual reads when the restarted Engine has no watches', async () => {
  const user = userEvent.setup()
  const content = (generation: number) => (
    <FileWorkspaceProvider sessionId="session" engineGeneration={generation}>
      <FileLink href="plan.md">Open plan</FileLink>
      <FileViewer />
    </FileWorkspaceProvider>
  )
  const view = render(content(1))
  await user.click(screen.getByText('Open plan'))
  await screen.findByRole('heading', { name: 'Planning document' })
  vi.mocked(desktopApi.watchFile).mockRejectedValueOnce(
    Object.assign(new Error('unknown method'), { code: 'UNKNOWN_METHOD' }),
  )
  vi.mocked(desktopApi.readFile).mockResolvedValueOnce(preview('Read manually'))
  view.rerender(content(2))
  await screen.findByRole('heading', { name: 'Read manually' })
  expect(screen.queryByRole('alert')).toBeNull()
})
