// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
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

vi.mock('../../services/desktop', () => ({
  desktopApi: {
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
afterEach(() => {
  cleanup()
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
  expect(desktopApi.readFile).toHaveBeenCalledWith('session', 'plan.md', 'old-turn')
  await user.click(screen.getByText('Open plan'))
  expect(screen.getAllByRole('tab')).toHaveLength(1)
  await user.click(screen.getByText('Ver fuente'))
  expect(await screen.findByText('# Planning document')).toBeTruthy()
  await user.click(screen.getByLabelText('Cerrar plan.md'))
  expect(screen.queryAllByRole('tab')).toHaveLength(0)
})

it('shows missing file errors without replacing the conversation', async () => {
  vi.mocked(desktopApi.readFile).mockRejectedValueOnce(new Error('File no longer exists'))
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
