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

it('adds a local ComfyUI with a workflow, an MCP server mapped by operation and OpenRouter through the provider (block 29)', async () => {
  vi.spyOn(engineApi, 'imagesSettingsGet').mockResolvedValue({
    ...empty,
    openrouter_providers: [{ provider_id: 'prov_or', name: 'OpenRouter' }],
    mcp_servers: ['visual-lab'],
  })
  const set = vi.spyOn(engineApi, 'imagesSettingsSet').mockImplementation(async (value) => ({ ...empty, openrouter_providers: [{ provider_id: 'prov_or', name: 'OpenRouter' }], mcp_servers: ['visual-lab'], ...value }))
  mount()
  const user = userEvent.setup()

  await user.click(await screen.findByRole('button', { name: /ComfyUI \(local\)/ }))
  let form = screen.getByTestId('image-connector-form')
  expect(within(form).getByRole('button', { name: 'Agregar' })).toHaveProperty('disabled', true)
  expect(form.textContent).toContain('«{{prompt}}»')
  const workflow = new File([JSON.stringify({ '3': { inputs: { text: '{{prompt}}' } } })], 'upscale.json', { type: 'application/json' })
  await user.upload(within(form).getByLabelText('Workflow para Ampliar'), workflow)
  await waitFor(() => expect(within(form).getByRole('button', { name: 'Agregar' })).toHaveProperty('disabled', false))
  await user.click(within(form).getByRole('button', { name: 'Agregar' }))
  await waitFor(() => expect(set).toHaveBeenCalledTimes(1))
  expect(set.mock.calls[0][0].connectors[0]).toMatchObject({ kind: 'comfyui', endpoint: 'http://127.0.0.1:8188', workflows: { upscale: { '3': { inputs: { text: '{{prompt}}' } } } } })

  // With a list, the tool is picked from it (C3); the list is read when the picker opens.
  const toolsList = vi.spyOn(engineApi, 'mcpToolsList').mockResolvedValue({ server: { name: 'visual-lab', scope: 'global', status: 'connected', default: null, tools: [
    { name: 'make_image', tool: 'mcp.visual-lab.make_image', title: 'Make image', description: 'Creates an image', listed: true, annotations: {}, kind: 'write', sends_out: true, setting: null, decision: null, decision_source: 'mode', by_mode: {} },
  ] } })
  await user.click(screen.getByRole('button', { name: /Servidor MCP/ }))
  form = screen.getByTestId('image-connector-form')
  expect(within(form).queryByRole('textbox', { name: 'Crear' })).toBeNull()
  await user.click(await within(form).findByRole('button', { name: /^Crear/ }))
  await user.click(await screen.findByRole('menuitem', { name: /make_image/ }))
  expect(toolsList).toHaveBeenCalledWith('visual-lab')
  await user.click(within(form).getByRole('button', { name: 'Agregar' }))
  await waitFor(() => expect(set).toHaveBeenCalledTimes(2))
  expect(set.mock.calls[1][0].connectors.at(-1)).toMatchObject({ kind: 'mcp', server: 'visual-lab', tools: { generate: { tool: 'make_image', prompt_arg: 'prompt' } } })

  await user.click(screen.getByRole('button', { name: /^OpenRouter$/ }))
  form = screen.getByTestId('image-connector-form')
  await user.click(within(form).getByRole('button', { name: 'Agregar' }))
  await waitFor(() => expect(set).toHaveBeenCalledTimes(3))
  expect(set.mock.calls[2][0].connectors.at(-1)).toMatchObject({ kind: 'openrouter', provider_id: 'prov_or' })
  expect(set.mock.calls[2][0].connectors.at(-1)).not.toHaveProperty('api_key')
})

it('reads the MCP tools only when asked, lets the owner type them when there is no list and keeps a saved name', async () => {
  vi.spyOn(engineApi, 'imagesSettingsGet').mockResolvedValue({ ...empty, mcp_servers: ['visual-lab'] })
  const set = vi.spyOn(engineApi, 'imagesSettingsSet').mockImplementation(async (value) => ({ ...empty, mcp_servers: ['visual-lab'], ...value }))
  const toolsList = vi.spyOn(engineApi, 'mcpToolsList').mockRejectedValueOnce({ code: 'METHOD_NOT_FOUND', message: 'unknown method' })
  const test = vi.spyOn(engineApi, 'mcpTest')
  mount()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: /Servidor MCP/ }))
  const form = screen.getByTestId('image-connector-form')
  await new Promise((resolve) => setTimeout(resolve, 20))
  // Mounting the section starts nothing.
  expect(toolsList).not.toHaveBeenCalled()
  expect(test).not.toHaveBeenCalled()

  // The list fails (an older Rinari): each operation is typed by hand.
  await user.click(within(form).getByRole('button', { name: /^Crear/ }))
  await user.keyboard('{Escape}')
  const typed = await within(form).findByRole('textbox', { name: 'Crear' })
  expect(test).not.toHaveBeenCalled()
  await user.type(typed, 'draw')

  // Read again: the server lists other tools, and the typed name stays chosen.
  toolsList.mockResolvedValueOnce({ server: { name: 'visual-lab', scope: 'global', status: 'connected', default: null, tools: [
    { name: 'make_image', tool: 'mcp.visual-lab.make_image', title: 'Make image', description: '', listed: true, annotations: {}, kind: 'write', sends_out: true, setting: null, decision: null, decision_source: 'mode', by_mode: {} },
  ] } })
  await user.click(within(form).getByRole('button', { name: 'Leer de nuevo' }))
  await waitFor(() => expect(within(form).getByTestId('image-mcp-tool-generate').getAttribute('data-value')).toBe('draw'))
  expect(test).not.toHaveBeenCalled()
  await user.click(within(form).getByRole('button', { name: 'Agregar' }))
  await waitFor(() => expect(set).toHaveBeenCalledTimes(1))
  expect(set.mock.calls[0][0].connectors.at(-1)).toMatchObject({ kind: 'mcp', server: 'visual-lab', tools: { generate: { tool: 'draw' } } })
})
