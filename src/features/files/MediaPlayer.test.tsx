// @vitest-environment jsdom
// Audio y video en el chat y en el panel de artefactos (Mejoras 2026-10-04):
// el enlace lleva su reproductor, que no carga nada hasta pulsarlo; un audio
// guardado como artefacto se reproduce en vez de leerse como texto.
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { setPlatformForTests } from '../../platform'
import { createTestBridge, type TestBridge } from '../../platform/testBridge'
import { I18nProvider } from '../../i18n'
import Markdown from '../../components/Markdown'
import ArtifactsPanel from '../workspace/ArtifactsPanel'
import { FileTurnContext, FileWorkspaceProvider } from './FileWorkspace'
import { mediaCandidate } from './MediaPlayer'

vi.mock('../../services/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/engine')>()
  return {
    ...actual,
    engineApi: { ...actual.engineApi, artifactList: vi.fn(), artifactRead: vi.fn() },
    onEngineEvent: vi.fn(async () => () => {}),
  }
})
import { engineApi } from '../../services/engine'

let bridge: TestBridge
let restore: () => void
beforeEach(() => {
  bridge = createTestBridge()
  bridge.engineStatus.capabilities.artifact_resolve_v1 = true
  restore = setPlatformForTests(bridge)
})
afterEach(() => { cleanup(); restore(); vi.clearAllMocks() })

it('recognizes audio and video links as candidates only', () => {
  expect(mediaCandidate('promo/audio/vo/aerisita-sample.mp3')).toBe('audio')
  expect(mediaCandidate('out/clip.MP4')).toBe('video')
  expect(mediaCandidate('notes.md')).toBeNull()
})

it('a link to an audio in a reply plays it after a click, with the Engine-approved file', async () => {
  bridge.mediaKinds['promo/audio/vo/aerisita-sample.mp3'] = 'audio'
  const media = vi.spyOn(bridge.files, 'media')
  render(
    <I18nProvider lang="es">
      <FileWorkspaceProvider sessionId="ses_1">
        <FileTurnContext.Provider value="turn_1">
          <Markdown>{'Listo: [la voz](promo/audio/vo/aerisita-sample.mp3) y [el plan](plan.md)'}</Markdown>
        </FileTurnContext.Provider>
      </FileWorkspaceProvider>
    </I18nProvider>,
  )
  // Nothing loads just because it is on screen.
  expect(media).not.toHaveBeenCalled()
  expect(document.querySelectorAll('[data-inline-media]')).toHaveLength(1)
  await userEvent.setup().click(screen.getByRole('button', { name: 'Reproducir aerisita-sample.mp3' }))
  const audio = await screen.findByLabelText('aerisita-sample.mp3')
  expect(audio.tagName).toBe('AUDIO')
  expect(audio.getAttribute('src')).toBe('app://rinari/__media/test-aerisita-sample.mp3')
  expect(media).toHaveBeenCalledWith({ session_id: 'ses_1', path: 'promo/audio/vo/aerisita-sample.mp3', turn_id: 'turn_1' })
})

it('a link the Engine says is not media offers to open it outside', async () => {
  bridge.mediaKinds['out/fake.mp4'] = 'binary'
  render(
    <I18nProvider lang="es">
      <FileWorkspaceProvider sessionId="ses_1"><Markdown>{'[video](out/fake.mp4)'}</Markdown></FileWorkspaceProvider>
    </I18nProvider>,
  )
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Ver fake.mp4' }))
  await user.click(await screen.findByRole('button', { name: 'Abrir externamente' }))
  expect(bridge.openedFiles).toEqual([{ session_id: 'ses_1', path: 'out/fake.mp4', turn_id: undefined }])
})

it('an audio artifact plays in the artifacts panel instead of being read as text', async () => {
  const uri = 'artifact://ses_1/media/voz.mp3'
  bridge.mediaKinds[uri] = 'audio'
  vi.mocked(engineApi.artifactList).mockResolvedValue({ artifacts: [
    { uri, namespace: 'media', name: 'voz.mp3', content_type: 'audio/mpeg', byte_count: 600_000 },
  ] } as never)
  render(<I18nProvider lang="es"><ArtifactsPanel sessionId="ses_1" /></I18nProvider>)
  await userEvent.setup().click(await screen.findByRole('button', { name: /media\/voz\.mp3/ }))
  expect((await screen.findByLabelText('voz.mp3')).tagName).toBe('AUDIO')
  expect(engineApi.artifactRead).not.toHaveBeenCalled()
})
