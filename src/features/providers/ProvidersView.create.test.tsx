// @vitest-environment jsdom
// El alta desde «Agregar proveedor». Cuando el asistente inicial y el modal de
// Ajustes armaban sus settings cada uno por su cuenta, el modal se olvidó del
// transporte: el Engine rechazaba el provider con «Unsupported external CLI
// provider». Ahora los dos son el mismo asistente (#97 C); esta prueba cubre el
// camino real desde Ajustes: la cuadrícula, los campos y «Probar y guardar».
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { createTestBridge } from '../../platform/testBridge'
import { setPlatformForTests } from '../../platform'
import { I18nProvider } from '../../i18n'
import ProvidersView from './ProvidersView'

let restore: (() => void) | undefined
afterEach(() => {
  cleanup()
  restore?.()
})

function mount() {
  const bridge = createTestBridge()
  restore = setPlatformForTests(bridge)
  // El catálogo real del Engine: la UI se arma desde aquí, no desde la lista
  // local, así que el test recorre el mismo camino que producción.
  bridge.mockCommand('provider_catalog_get', () => ({
    version: '1',
    presets: [
      {
        id: 'openai',
        name: 'OpenAI',
        provider_type: 'openai',
        endpoint: 'https://api.openai.com/v1',
        auth_methods: ['api-key'],
        experimental: false,
        enabled: true,
        local: false,
        runtime: 'http',
        requires_external_binary: null,
      },
      {
        id: 'claude-subscription',
        name: 'Claude Subscription',
        provider_type: 'custom',
        endpoint: 'process://claude',
        auth_methods: ['external-cli'],
        experimental: true,
        enabled: true,
        local: false,
        runtime: 'claude-cli',
        requires_external_binary: 'claude',
      },
    ],
  }))
  bridge.mockCommand('provider_create', () => ({ provider: { alias: 'claude-subscription' } }))
  render(
    <I18nProvider lang="en">
      <ProvidersView providers={[]} onChanged={() => {}} />
    </I18nProvider>,
  )
  return bridge
}

async function addWithPreset(
  bridge: ReturnType<typeof createTestBridge>,
  label: RegExp,
  apiKey?: string,
) {
  fireEvent.click(screen.getAllByRole('button', { name: /Add provider/ })[0])
  const picker = await screen.findByTestId('provider-type-picker')
  const card = [...picker.querySelectorAll<HTMLButtonElement>('.provider-picker-card')].find((item) => label.test(item.textContent ?? ''))
  expect(card, `preset ${label}`).toBeTruthy()
  fireEvent.click(card!)
  fireEvent.change(await screen.findByLabelText(/alias/i), { target: { value: 'probe' } })
  if (apiKey !== undefined) {
    fireEvent.change(screen.getByPlaceholderText(/^sk-/), { target: { value: apiKey } })
  }
  // Con clave: «Test and save»; con un CLI la conexión se resuelve en el paso siguiente.
  fireEvent.click(screen.getByRole('button', { name: apiKey !== undefined ? 'Test and save' : 'Continue' }))
  await waitFor(() => expect(bridge.calls.some((c) => c.name === 'provider_create')).toBe(true))
  return bridge.calls.find((c) => c.name === 'provider_create')!.args as Record<string, unknown>
}

it('CLAUDE-UI-10: adding Claude Subscription sends the three signals the Engine requires', async () => {
  const bridge = mount()
  const args = await addWithPreset(bridge, /Claude Subscription/)
  expect(args.endpoint).toBe('process://claude')
  expect(args.auth_method).toBe('external-cli')
  expect(args.settings).toEqual({
    product_id: 'claude-subscription',
    transport: 'claude-cli',
  })
  // Rinari nunca manda una credencial para este producto.
  expect(args.secret ?? null).toBeNull()
  expect(args.secret_env ?? null).toBeNull()
})

it('CLAUDE-UI-11: an HTTP provider does not gain a transport it does not have', async () => {
  const bridge = mount()
  const args = await addWithPreset(bridge, /^OpenAI/, 'sk-probe')
  expect(args.settings).toEqual({ product_id: 'openai' })
})
