// @vitest-environment jsdom
// #77: sin la barra «Leer imágenes como»; sin visión, la imagen va como texto
// y el chip lo dice; el menú del chip cambia el modo de esa imagen.
import userEvent from '@testing-library/user-event'
import { installMockPlatform } from '../../test/mockPlatform'
installMockPlatform()
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { engineApi } from '../../services/engine'
import { useComposerStore } from '../../stores/composer'
import { readModeFields, readModeOf, useImageReadPrefs } from '../../stores/imageReadPrefs'
import Composer from './Composer'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
beforeEach(() => {
  localStorage.clear()
  useImageReadPrefs.setState({ mode: 'image' })
  useComposerStore.setState({ sessionKey: 'draft', text: '', attachments: [], draftsBySession: {} })
  useComposerStore.getState().addAttachmentFor('a', { id: 'att_1', path: 'C:/fotos/logo.png', name: 'logo.png', source: 'native', kind: 'image', status: 'ready' })
})

function support(available: boolean) {
  return vi.spyOn(engineApi, 'sessionImageSupport').mockResolvedValue({
    vision: available, known: true, confirmed_for_session: false, available, reason: available ? '' : 'Sin visión',
    model_id: undefined, destination_model_id: null, destination_model: null, destination_provider: null, route: available ? 'conversation' : 'unavailable',
  } as never)
}

function composer() {
  return render(<I18nProvider lang="es"><Composer placement="bottom" sessionId="a" primary={false} acceptsGlobalFocus={false}
    onSend={async () => true} isStreaming={false} onStop={vi.fn()} models={[]} activeAlias=""
    onUseModel={vi.fn()} onDiscoverModels={vi.fn()} onOpenProviders={vi.fn()}
    sessionMode="build" onModeChange={vi.fn()} reasoningEffort="off" onReasoningChange={vi.fn()}
    permissionProfile="workspace" effectivePermissionProfile="workspace" permissionProfilesV2
    onPermissionChange={vi.fn()} onSearchFiles={async () => ({ root: '/', files: [] })} /></I18nProvider>)
}

const attachment = () => useComposerStore.getState().getDraft('a').attachments[0]

it('there is no «Leer imágenes como» bar', async () => {
  support(true)
  composer()
  await act(async () => { await Promise.resolve() })
  expect(screen.queryByRole('radiogroup', { name: 'Leer imágenes como' })).toBeNull()
  expect(attachment().ocr).toBeFalsy()
})

it('with a model that cannot see, the image goes as text by itself and the chip says «Texto»', async () => {
  support(false)
  composer()
  await waitFor(() => expect(attachment().ocr).toBe(true))
  expect(attachment().ocrAuto).toBe(true)
  const badge = await screen.findByTestId('attach-read-badge')
  expect(badge.textContent).toBe('Texto')
  // El dueño lo cambia desde el chip, y el composer ya no lo toca.
  // El menú canónico del chip (#77): se abre y se elige.
  await userEvent.click(screen.getByTestId('attach-read-menu'))
  await userEvent.click(await screen.findByRole('menuitemradio', { name: /Enviar como imagen/ }))
  await waitFor(() => expect(attachment().ocr).toBe(false))
  expect(attachment().readChosen).toBe(true)
  expect(attachment().ocrAuto).toBeUndefined()
})

it('the default modes map to the attachment fields and back', () => {
  for (const mode of ['image', 'text', 'both'] as const) expect(readModeOf(readModeFields(mode))).toBe(mode)
})
