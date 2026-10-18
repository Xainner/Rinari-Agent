// @vitest-environment jsdom
import { installMockPlatform } from '../../test/mockPlatform'
installMockPlatform()
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { engineApi } from '../../services/engine'
import type { ImageCreationSettings } from '../../types/protocol.generated'
import ImageCreationSettingsView from './ImageCreationSettings'
import VisionSettings from './VisionSettings'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const empty: ImageCreationSettings = {
  connectors: [], default_connector: null, edit_connector: null, session_budget_usd: null,
  kinds: ['chatgpt', 'openai'], subscriptions: [{ provider_id: 'prov_chatgpt', name: 'ChatGPT Plus' }],
}

function mount() {
  return render(<I18nProvider lang="es"><ImageCreationSettingsView /></I18nProvider>)
}

it('starts with no service, adds the subscription as the default and never shows a key back (plan 0.4.0 #28)', async () => {
  vi.spyOn(engineApi, 'imagesSettingsGet').mockResolvedValue(empty)
  const set = vi.spyOn(engineApi, 'imagesSettingsSet').mockImplementation(async (value) => ({
    ...empty, ...value, connectors: value.connectors.map(({ api_key: _key, ...item }: { api_key?: string } & typeof value.connectors[number]) => ({ ...item, has_key: item.kind === 'openai' ? true : undefined })),
  }))
  mount()
  expect(await screen.findByText(/Todavía no hay ningún servicio/)).toBeTruthy()
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /Suscripción de ChatGPT \(Codex\)/ }))
  await user.click(within(screen.getByTestId('image-connector-form')).getByRole('button', { name: 'Agregar' }))
  await waitFor(() => expect(set).toHaveBeenCalledTimes(1))
  expect(set.mock.calls[0][0]).toMatchObject({
    connectors: [{ id: 'chatgpt', kind: 'chatgpt', provider_id: 'prov_chatgpt' }],
    default_connector: 'chatgpt',
  })
  expect(await screen.findByText('Incluido en tu suscripción')).toBeTruthy()

  // An OpenAI key goes once to the Engine; the page keeps nothing of it.
  await user.click(screen.getByRole('button', { name: /OpenAI \(API\)/ }))
  const form = screen.getByTestId('image-connector-form')
  expect(within(form).getByRole('button', { name: 'Agregar' })).toHaveProperty('disabled', true)
  await user.type(within(form).getByLabelText('Clave de API'), 'sk-test-123')
  await user.click(within(form).getByRole('button', { name: 'Agregar' }))
  await waitFor(() => expect(set).toHaveBeenCalledTimes(2))
  expect(set.mock.calls[1][0].connectors[1]).toMatchObject({ id: 'openai', kind: 'openai', api_key: 'sk-test-123', model: 'gpt-image-1' })
  expect(set.mock.calls[1][0].default_connector).toBe('chatgpt')
  expect(document.body.innerHTML).not.toContain('sk-test-123')
  expect(await screen.findByText(/Se paga por imagen/)).toBeTruthy()
})

it('tests a connector and saves the spend cap on blur', async () => {
  vi.spyOn(engineApi, 'imagesSettingsGet').mockResolvedValue({ ...empty, connectors: [{ id: 'openai', kind: 'openai', label: 'OpenAI (API)', model: 'gpt-image-1', has_key: true }], default_connector: 'openai' })
  const set = vi.spyOn(engineApi, 'imagesSettingsSet').mockImplementation(async (value) => ({ ...empty, ...value }))
  vi.spyOn(engineApi, 'imagesConnectorTest').mockResolvedValue({ connector_id: 'openai', ok: false, code: 'AUTH_REQUIRED', message: 'OpenAI rejected the credentials (401).' })
  mount()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Probar' }))
  expect(await screen.findByText('OpenAI rejected the credentials (401).')).toBeTruthy()
  const cap = screen.getByLabelText('Tope de gasto por conversación (USD)')
  await user.type(cap, '1,5')
  await user.tab()
  await waitFor(() => expect(set).toHaveBeenCalledWith(expect.objectContaining({ session_budget_usd: 1.5 })))
})

it('appears in Visión e imágenes only when the Engine announces it', async () => {
  vi.spyOn(engineApi, 'visionSettingsGet').mockResolvedValue({ mode: 'automatic', model_id: null } as never)
  const get = vi.spyOn(engineApi, 'imagesSettingsGet').mockResolvedValue(empty)
  const { unmount } = render(<I18nProvider lang="es"><VisionSettings models={[]} providers={[]} /></I18nProvider>)
  await screen.findByText('Visión e imágenes').catch(() => undefined)
  expect(screen.queryByTestId('image-creation-settings')).toBeNull()
  expect(get).not.toHaveBeenCalled()
  unmount()
  render(<I18nProvider lang="es"><VisionSettings models={[]} providers={[]} imageCreation /></I18nProvider>)
  expect(await screen.findByTestId('image-creation-settings')).toBeTruthy()
})
