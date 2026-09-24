// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { engineApi } from '../../services/engine'
import Markdown from '../../components/Markdown'
import ArtifactsPanel from '../workspace/ArtifactsPanel'
import { isArtifactImage } from './artifactImage'

vi.mock('../../services/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/engine')>()
  return {
    ...actual,
    engineApi: { ...actual.engineApi, attachmentPreview: vi.fn(), artifactList: vi.fn(), artifactRead: vi.fn() },
  }
})

afterEach(() => { cleanup(); vi.clearAllMocks() })

const PNG = 'artifact://ses_1/media/abc-alya_kawaii.png'
const preview = { data_url: 'data:image/jpeg;base64,AAAA', mime_type: 'image/jpeg', base64: 'AAAA' }

it('renders an image artifact the agent put in its message instead of a broken image', async () => {
  vi.mocked(engineApi.attachmentPreview).mockResolvedValue(preview)
  render(<I18nProvider lang="es"><Markdown>{`![Alya kawaii](${PNG})`}</Markdown></I18nProvider>)
  const image = await screen.findByRole('img', { name: 'Alya kawaii' })
  expect(image.getAttribute('src')).toBe(preview.data_url)
  expect(image.className).toContain('artifact-image')
  expect(engineApi.attachmentPreview).toHaveBeenCalledWith(PNG, 512 * 1024, 2048)
})

it('keeps a link to the artifact when it cannot be previewed', async () => {
  vi.mocked(engineApi.attachmentPreview).mockRejectedValue(new Error('image could not be decoded'))
  render(<I18nProvider lang="es"><Markdown>{'![Dañada](artifact://ses_1/media/abc-broken.png)'}</Markdown></I18nProvider>)
  expect(await screen.findByRole('link', { name: 'Dañada' })).toBeTruthy()
  expect(screen.queryByRole('img')).toBeNull()
})

it('previews an image artifact as an image in the artifacts panel, and text as text', async () => {
  vi.mocked(engineApi.attachmentPreview).mockResolvedValue(preview)
  vi.mocked(engineApi.artifactRead).mockResolvedValue({ text: 'notes', truncated: false } as never)
  vi.mocked(engineApi.artifactList).mockResolvedValue({ artifacts: [
    { uri: PNG, namespace: 'media', name: 'abc-alya_kawaii.png', content_type: 'image/png', byte_count: 2048 },
    { uri: 'artifact://ses_1/derived/notes.txt', namespace: 'derived', name: 'notes.txt', content_type: 'text/plain', byte_count: 5 },
  ] } as never)
  render(<I18nProvider lang="es"><ArtifactsPanel sessionId="ses_1" /></I18nProvider>)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: /media\/abc-alya_kawaii\.png/ }))
  expect((await screen.findByRole('img', { name: 'abc-alya_kawaii.png' })).getAttribute('src')).toBe(preview.data_url)
  expect(engineApi.artifactRead).not.toHaveBeenCalled()

  await user.click(screen.getByRole('button', { name: /derived\/notes\.txt/ }))
  await waitFor(() => expect(screen.getByText('notes')).toBeTruthy())
})

it('only treats previewable image artifacts as images', () => {
  expect(isArtifactImage(PNG)).toBe(true)
  expect(isArtifactImage('artifact://s/media/a.JPG')).toBe(true)
  expect(isArtifactImage('artifact://s/media/a.gif')).toBe(false)
  expect(isArtifactImage('C:\\img.png')).toBe(false)
  expect(isArtifactImage('artifact://s/media/blob', 'image/webp')).toBe(true)
  expect(isArtifactImage(PNG, 'text/plain')).toBe(false)
})
