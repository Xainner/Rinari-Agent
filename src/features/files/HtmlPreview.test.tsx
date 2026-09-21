// @vitest-environment jsdom
import { installMockPlatform } from '../../test/mockPlatform'
const { openUrl } = installMockPlatform()
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import HtmlPreview, { isolatedPreviewUrl } from './HtmlPreview'
import { desktopApi } from '../../services/desktop'

const file = {
  path: 'C:/my repo/snake.html',
  name: 'snake.html',
  language: 'html',
  content: '<h1>Snake</h1>',
  size: 14,
}
const preview = {
  preview_id: 'p1',
  session_id: 's1',
  url: 'http://0123456789abcdef0123456789abcdef.localhost:1234/snake.html',
  kind: 'static' as const,
  ready: true,
  revision: 0,
}
vi.mock('../../services/desktop', () => ({
  desktopApi: {
    startPreview: vi.fn(),
    previewStatus: vi.fn(),
    stopPreview: vi.fn(),
    readFile: vi.fn(),
  },
}))
vi.mock('../../lib/highlight', () => ({
  highlightToHtml: vi.fn().mockResolvedValue(null),
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it('opens an isolated live frame, toggles source, reloads, opens externally and stops', async () => {
  vi.mocked(desktopApi.startPreview).mockResolvedValue(preview)
  vi.mocked(desktopApi.previewStatus).mockResolvedValue(preview)
  vi.mocked(desktopApi.stopPreview).mockResolvedValue({ stopped: true })
  vi.mocked(desktopApi.readFile).mockResolvedValue(file)
  const rendered = render(
    <HtmlPreview sessionId="s1" turnId="old-turn" file={file} />,
  )
  const frame = await screen.findByTitle('Vista previa de snake.html')
  expect(frame.getAttribute('src')).toBe(preview.url)
  expect(frame.getAttribute('sandbox')).toBe(
    'allow-scripts allow-same-origin allow-forms',
  )
  expect(desktopApi.startPreview).toHaveBeenCalledWith(
    's1',
    file.path,
    'old-turn',
    false,
    undefined,
  )
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Código' }))
  expect(await screen.findByText('<h1>Snake</h1>')).toBeTruthy()
  await user.click(
    screen.getByRole('button', { name: /^Vista previa$/ }),
  )
  await user.click(
    screen.getByRole('button', { name: 'Recargar vista previa' }),
  )
  expect(screen.getByTitle('Vista previa de snake.html')).not.toBe(frame)
  await user.click(screen.getByRole('button', { name: 'Abrir en navegador' }))
  expect(openUrl).toHaveBeenCalledWith(preview.url)
  rendered.unmount()
  expect(desktopApi.stopPreview).toHaveBeenCalledWith('s1', 'p1')
})

it('asks before starting the project dev script and releases a late response', async () => {
  vi.mocked(desktopApi.startPreview).mockRejectedValueOnce({
    code: 'PREVIEW_DEV_REQUIRED',
    message: 'Vite project',
  })
  let finish!: (value: typeof preview) => void
  vi.mocked(desktopApi.startPreview).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const rendered = render(<HtmlPreview sessionId="s1" file={file} />)
  const button = await screen.findByRole('button', {
    name: 'Iniciar servidor de desarrollo',
  })
  expect(desktopApi.startPreview).toHaveBeenCalledTimes(1)
  await userEvent.click(button)
  expect(desktopApi.startPreview).toHaveBeenLastCalledWith(
    's1',
    file.path,
    undefined,
    true,
    undefined,
  )
  rendered.unmount()
  finish(preview)
  await waitFor(() =>
    expect(desktopApi.stopPreview).toHaveBeenCalledWith('s1', 'p1'),
  )
})

it('rejects the desktop origin and non-local preview URLs', () => {
  expect(isolatedPreviewUrl(window.location.origin + '/snake.html')).toBe(false)
  expect(isolatedPreviewUrl('https://example.com/snake.html')).toBe(false)
  expect(isolatedPreviewUrl(preview.url)).toBe(true)
})

it('refreshes the frame and source when the engine reports a file change', async () => {
  vi.mocked(desktopApi.startPreview).mockResolvedValue(preview)
  vi.mocked(desktopApi.previewStatus).mockResolvedValue({
    ...preview,
    revision: 1,
  })
  vi.mocked(desktopApi.readFile).mockResolvedValue({
    ...file,
    content: '<h1>Updated</h1>',
  })
  render(<HtmlPreview sessionId="s1" file={file} />)
  const initial = await screen.findByTitle('Vista previa de snake.html')
  await waitFor(
    () =>
      expect(screen.getByTitle('Vista previa de snake.html')).not.toBe(initial),
    { timeout: 2500 },
  )
  await userEvent.click(screen.getByRole('button', { name: 'Código' }))
  expect(await screen.findByText('<h1>Updated</h1>')).toBeTruthy()
})
