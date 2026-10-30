// @vitest-environment jsdom
// Activar y desactivar un proveedor (plan 0.4.0 #97): el interruptor de la
// tarjeta, el diálogo que dice qué depende de él y el reemplazo.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { createTestBridge } from '../../platform/testBridge'
import { setPlatformForTests } from '../../platform'
import { I18nProvider } from '../../i18n'
import ProvidersView from './ProvidersView'
import { dependenciesOf } from './providerDependencies'

let restore: (() => void) | undefined
afterEach(() => {
  cleanup()
  restore?.()
})

const provider = (alias: string, active: boolean, enabled = true) => ({
  id: `prv_${alias}`,
  alias,
  type: 'openai',
  endpoint: 'https://api.openai.com/v1',
  auth_method: 'api-key',
  active,
  enabled,
  model_count: 1,
  has_credential: true,
}) as never

const model = (id: string, alias: string, providerAlias: string) => ({
  id,
  alias,
  provider_id: `prv_${providerAlias}`,
  provider: providerAlias,
  provider_model_id: alias,
  capabilities: null,
  availability: 'available',
  settings: {},
  active: false,
})

function mount(providers: never[]) {
  const bridge = createTestBridge()
  restore = setPlatformForTests(bridge)
  const calls: Array<[string, unknown]> = []
  const record = (name: string, result: unknown) => (args: unknown) => {
    calls.push([name, args])
    return result
  }
  bridge.mockCommand('provider_catalog_get', () => ({ version: '1', presets: [] }))
  bridge.mockCommand('model_list', (args: unknown) => {
    const { provider: only } = (args ?? {}) as { provider?: string | null }
    const all = [model('mdl_main', 'gpt-main', 'main'), model('mdl_spare', 'claude-spare', 'spare')]
    return { models: only ? all.filter((m) => m.provider === only) : all.filter((m) => m.provider !== 'main') }
  })
  bridge.mockCommand('models_roles_get', () => ({ roles: { fallback: 'mdl_main', auxiliary: null, auxiliary_compaction: false } }))
  bridge.mockCommand('agent_list', () => ({
    agents: [
      { name: 'reviewer', assignment: { model: 'gpt-main', fallback: null, enabled: true } },
      { name: 'writer', assignment: { model: null, fallback: null, enabled: true } },
    ],
  }))
  bridge.mockCommand('model_use', record('model_use', { model: {}, provider: {}, switched_provider: true }))
  bridge.mockCommand('models_roles_set', record('models_roles_set', { roles: {} }))
  bridge.mockCommand('agent_config_set', record('agent_config_set', { agent: {} }))
  bridge.mockCommand('provider_update', record('provider_update', { provider: {} }))
  render(
    <I18nProvider lang="es">
      <ProvidersView providers={providers} onChanged={() => {}} />
    </I18nProvider>,
  )
  return calls
}

it('turning off the active provider names what depends on it and moves it to the replacement', async () => {
  const calls = mount([provider('main', true), provider('spare', false)])
  fireEvent.click(screen.getAllByTestId('provider-enabled')[0])
  const dialog = await screen.findByTestId('disable-provider-dialog')
  const deps = await within(dialog).findByTestId('disable-provider-deps')
  expect(deps.textContent).toContain('Es el proveedor activo.')
  expect(deps.textContent).toContain('Es el modelo de respaldo.')
  expect(deps.textContent).toContain('Lo usan 1 agentes: reviewer.')
  expect(within(dialog).getByLabelText('Usar en su lugar').getAttribute('data-value')).toBe('mdl_spare')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Desactivar' }))
  await waitFor(() => expect(calls.map(([name]) => name)).toContain('provider_update'))
  expect(calls).toEqual([
    ['model_use', expect.objectContaining({ reference: 'mdl_spare' })],
    ['models_roles_set', expect.objectContaining({ fallback: 'mdl_spare' })],
    ['agent_config_set', expect.objectContaining({ agent: 'reviewer', model: 'mdl_spare' })],
    ['provider_update', expect.objectContaining({ reference: 'main', enabled: false })],
  ])
})

it('a turned-off provider goes last, dimmed, and the switch turns it back on', async () => {
  const calls = mount([provider('spare', false, false), provider('main', true)])
  const switches = screen.getAllByTestId('provider-enabled')
  expect(switches[0].getAttribute('aria-checked')).toBe('true')
  expect(switches[1].getAttribute('aria-checked')).toBe('false')
  expect(screen.getByText('spare')).toBeTruthy()
  expect(screen.getByText('Desactivado')).toBeTruthy()
  fireEvent.click(switches[1])
  await waitFor(() => expect(calls).toEqual([
    ['provider_update', expect.objectContaining({ reference: 'spare', enabled: true })],
  ]))
})

it('dependencies match a model by id or by alias, and only that provider\'s models', () => {
  const deps = dependenciesOf(
    provider('main', false) as never,
    [model('mdl_main', 'gpt-main', 'main')] as never,
    { fallback: null, auxiliary: 'gpt-main', auxiliary_compaction: true },
    [{ name: 'a', assignment: { model: 'mdl_main' } }, { name: 'b', assignment: { model: 'other' } }] as never,
  )
  expect(deps).toEqual({ active: false, fallback: false, auxiliary: true, agents: ['a'] })
})
