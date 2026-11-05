// @vitest-environment jsdom
// «Agregar proveedor» (plan 0.4.0 #97 C): la cuadrícula agrupada con
// búsqueda, solo los campos del tipo y, si la prueba falla, el motivo junto
// al campo que lo causa.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { createTestBridge } from '../../platform/testBridge'
import { setPlatformForTests } from '../../platform'
import { I18nProvider } from '../../i18n'
import ProviderWizard, { fieldForFailure } from './ProviderWizard'

let restore: (() => void) | undefined
afterEach(() => { cleanup(); restore?.() })

const preset = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, provider_type: 'custom', endpoint: `https://${id}.test/v1`, auth_methods: ['api-key'],
  experimental: false, enabled: true, local: false, runtime: 'http', requires_external_binary: null, ...extra,
})

function mount() {
  const bridge = createTestBridge()
  restore = setPlatformForTests(bridge)
  bridge.mockCommand('provider_catalog_get', () => ({
    version: '1',
    presets: [
      preset('openai', 'OpenAI', { provider_type: 'openai' }),
      preset('chatgpt', 'ChatGPT', { auth_methods: ['oauth'] }),
      preset('ollama', 'Ollama (local)', { endpoint: 'http://localhost:11434/v1', auth_methods: ['none'], local: true }),
      preset('custom', 'Custom endpoint', { endpoint: '' }),
    ],
  }))
  bridge.mockCommand('provider_list', () => ({ providers: [], active_alias: null }))
  bridge.mockCommand('provider_create', () => ({ provider: { alias: 'openai' } }))
  bridge.mockCommand('provider_update', () => ({ provider: { alias: 'openai' } }))
  bridge.mockCommand('provider_test', () => ({ connected: false, detail: 'HTTP 401 Unauthorized: invalid api key', models_discovered: 0, models: [] }))
  render(<I18nProvider lang="es"><ProviderWizard open mode="add" onClose={() => {}} /></I18nProvider>)
  return bridge
}

it('agrupa por suscripción, API y local, y la búsqueda filtra', async () => {
  mount()
  const picker = await screen.findByTestId('provider-type-picker')
  await waitFor(() => expect(within(picker).getByRole('region', { name: 'Suscripciones' }).textContent).toContain('ChatGPT'))
  expect(within(picker).getByRole('region', { name: 'Por API' }).textContent).toContain('GPT por API, con tu clave')
  const local = within(picker).getByRole('region', { name: 'En este equipo o tu servidor' })
  expect(local.textContent).toContain('Ollama')
  expect(local.textContent).toContain('Custom endpoint')
  fireEvent.change(within(picker).getByRole('searchbox'), { target: { value: 'olla' } })
  expect(picker.querySelectorAll('.provider-picker-card')).toHaveLength(1)
  fireEvent.change(within(picker).getByRole('searchbox'), { target: { value: 'zzz' } })
  expect(picker.textContent).toContain('Nada coincide con «zzz».')
})

it('una clave que no sirve vuelve al formulario con el motivo bajo la clave', async () => {
  mount()
  const picker = await screen.findByTestId('provider-type-picker')
  fireEvent.click(await within(picker).findByRole('button', { name: /^OpenAI/ }))
  // Solo los campos del tipo: sin endpoint a la vista y con «¿Dónde la consigo?».
  expect(screen.queryByLabelText('Endpoint (base URL)')).toBeNull()
  expect(screen.getByRole('button', { name: /¿Dónde la consigo\?/ })).toBeTruthy()
  fireEvent.change(screen.getByPlaceholderText(/^sk-/), { target: { value: 'sk-mala' } })
  fireEvent.click(screen.getByRole('button', { name: 'Probar y guardar' }))
  const error = await screen.findByText('HTTP 401 Unauthorized: invalid api key')
  expect(error.id).toBe('provider-secret-error')
  expect(screen.getByPlaceholderText(/^sk-/).getAttribute('aria-invalid')).toBe('true')
})

it('sin clave no se envía nada y lo dice en su campo', async () => {
  const bridge = mount()
  fireEvent.click(await screen.findByRole('button', { name: /^OpenAI/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Probar y guardar' }))
  expect(screen.getByRole('alert').id).toBe('provider-secret-error')
  expect(bridge.calls.some((call) => call.name === 'provider_create')).toBe(false)
})

it('reconoce el campo de un fallo por lo que dijo el proveedor', () => {
  const key = { auth: 'api-key' as const, credentialSource: 'literal' as const }
  expect(fieldForFailure('HTTP 401 Unauthorized', key)).toBe('secret')
  expect(fieldForFailure('connect ECONNREFUSED 127.0.0.1:11434', key)).toBe('endpoint')
  expect(fieldForFailure('HTTP 401', { auth: 'none', credentialSource: 'literal' })).toBeNull()
  expect(fieldForFailure('rate limited', key)).toBeNull()
})

function mountConnected(models: string[]) {
  localStorage.clear()
  const bridge = createTestBridge()
  restore = setPlatformForTests(bridge)
  bridge.mockCommand('provider_catalog_get', () => ({ version: '1', presets: [preset('openai', 'OpenAI', { provider_type: 'openai' })] }))
  bridge.mockCommand('provider_list', () => ({ providers: [], active_alias: null }))
  bridge.mockCommand('provider_create', () => ({ provider: { alias: 'openai' } }))
  bridge.mockCommand('provider_test', () => ({ connected: true, detail: 'ok', models_discovered: models.length, models }))
  bridge.mockCommand('model_refresh', () => ({ providers: { openai: { added: [], error: null } } }))
  bridge.mockCommand('model_list', () => ({ models: models.map((alias) => ({ id: `mdl_${alias}`, alias, provider: 'openai', provider_model_id: alias, active: false, capabilities: {} })) }))
  bridge.mockCommand('model_hidden_list', () => ({ hidden: [] }))
  bridge.mockCommand('model_use', () => ({ model: {} }))
  render(<I18nProvider lang="es"><ProviderWizard open mode="onboarding" onClose={() => {}} /></I18nProvider>)
  return bridge
}

async function reachModels() {
  fireEvent.click(await screen.findByRole('button', { name: /^OpenAI/ }))
  fireEvent.change(screen.getByPlaceholderText(/^sk-/), { target: { value: 'sk-buena' } })
  fireEvent.click(screen.getByRole('button', { name: 'Probar y guardar' }))
  await screen.findByTestId('provider-wizard-connected')
  return screen.findAllByTestId('model-row')
}

it('primer uso: sin modelo, «Continuar» está desactivado y dice por qué; el elegido va primero y la lista se pliega', async () => {
  const bridge = mountConnected(['gpt-a', 'gpt-b', 'gpt-c'])
  await reachModels()
  const next = screen.getByTestId('provider-wizard-continue') as HTMLButtonElement
  expect(next.disabled).toBe(true)
  expect(screen.getByTestId('provider-wizard-why').textContent).toBe('Selecciona un modelo para continuar.')
  expect(next.getAttribute('aria-describedby')).toBe(screen.getByTestId('provider-wizard-why').id)
  // La lista se desplaza dentro; el pie queda fuera de ella.
  expect(screen.getByTestId('model-catalog').closest('.provider-wizard-models-body')).toBeTruthy()
  expect(next.closest('.provider-wizard-models-body')).toBeNull()

  fireEvent.click(screen.getAllByRole('button', { name: 'Usar' })[1])
  await waitFor(() => expect(next.disabled).toBe(false))
  expect(screen.queryByTestId('provider-wizard-why')).toBeNull()
  const rows = screen.getAllByTestId('model-row')
  expect(rows).toHaveLength(1)
  expect(rows[0].textContent).toContain('gpt-b')
  fireEvent.click(screen.getByTestId('model-catalog-more'))
  expect(screen.getAllByTestId('model-row').map((row) => row.textContent?.match(/gpt-\w/)?.[0])).toEqual(['gpt-b', 'gpt-a', 'gpt-c'])
  fireEvent.click(next)
  await waitFor(() => expect(bridge.calls.some((call) => call.name === 'model_use' && call.args.reference === 'gpt-b')).toBe(true))
})

it('primer uso: con un solo modelo queda elegido solo', async () => {
  mountConnected(['solo'])
  await reachModels()
  await waitFor(() => expect((screen.getByTestId('provider-wizard-continue') as HTMLButtonElement).disabled).toBe(false))
  expect(screen.queryByTestId('model-catalog-more')).toBeNull()
})
