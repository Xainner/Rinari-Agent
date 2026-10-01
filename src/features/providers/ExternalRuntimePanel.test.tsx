// @vitest-environment jsdom
// La tarjeta de un provider servido por un CLI externo. La UI no ejecuta el
// binario ni juzga la autenticación: pinta lo que el Engine derivó, y nada que
// no sea `connected` ofrece seguir adelante.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createTestBridge } from '../../platform/testBridge'
import { setPlatformForTests } from '../../platform'
import { I18nProvider } from '../../i18n'
import ExternalRuntimePanel from './ExternalRuntimePanel'

let restore: (() => void) | undefined
afterEach(() => {
  cleanup()
  restore?.()
})

const connected = {
  transport: 'claude-cli',
  experimental: true,
  installed: true,
  path: 'C:/Users/x/.local/bin/claude.exe',
  discovered_via: 'well-known',
  sanitized_env: ['ANTHROPIC_API_KEY'],
  version: '2.1.286 (Claude Code)',
  supported: true,
  state: 'connected',
  auth: {
    logged_in: true,
    auth_method: 'claude.ai',
    api_provider: 'firstParty',
    subscription_type: 'pro',
    safe_for_subscription: true,
  },
}

function mount(runtime: Record<string, unknown>, providerRef?: string) {
  const bridge = createTestBridge()
  restore = setPlatformForTests(bridge)
  bridge.mockCommand('provider_runtime_probe', () => ({ runtime }))
  bridge.mockCommand('provider_diagnostics_get', () => ({ runtime }))
  render(
    <I18nProvider lang="en">
      <ExternalRuntimePanel runtime="claude-cli" providerRef={providerRef} />
    </I18nProvider>,
  )
  return bridge
}

it('CLAUDE-UI-01: a connected subscription shows the plan, version and the usage disclosure', async () => {
  mount(connected)
  expect((await screen.findByRole('status')).textContent).toContain('Connected')
  expect(screen.getByText('2.1.286 (Claude Code)')).toBeTruthy()
  expect(screen.getByText('pro')).toBeTruthy()
  expect(screen.getByText(/counts against the limits/i)).toBeTruthy()
})

it('CLAUDE-UI-02: it says which billing variables were stripped', async () => {
  mount(connected)
  await screen.findByRole('status')
  expect(screen.getByText('ANTHROPIC_API_KEY')).toBeTruthy()
})

it('CLAUDE-UI-03: a missing CLI shows the install command, not a credential field', async () => {
  mount({
    transport: 'claude-cli',
    experimental: true,
    installed: false,
    path: null,
    discovered_via: null,
    sanitized_env: [],
    state: 'missing_cli',
    hint: 'Run: irm https://claude.ai/install.ps1 | iex',
  })
  expect((await screen.findByRole('status')).textContent).toContain('not installed')
  expect(screen.getByText(/install\.ps1/)).toBeTruthy()
  expect(screen.queryByLabelText(/api key/i)).toBeNull()
})

it('CLAUDE-UI-04: a logged-out CLI shows the official login command', async () => {
  mount({ ...connected, state: 'logged_out', auth: { ...connected.auth, logged_in: false } })
  expect((await screen.findByRole('status')).textContent).toContain('not signed in')
  expect(screen.getByText('claude auth login --claudeai')).toBeTruthy()
})

it('CLAUDE-UI-05: a non-subscription source is refused and explained', async () => {
  mount({
    ...connected,
    state: 'non_subscription_auth',
    detail: 'Claude Code is authenticated with a non-subscription source (console).',
    auth: { ...connected.auth, auth_method: 'console', safe_for_subscription: false },
  })
  const status = await screen.findByRole('status')
  expect(status.textContent).toContain('Unsupported authentication source')
  expect(screen.getByText(/bills the API/i)).toBeTruthy()
  // No hay atajo para continuar igual: cambiar de fuente cambiaría la factura.
  expect(screen.queryByText(/connect/i)).toBeNull()
})

it('CLAUDE-UI-06: "check again" re-reads the state instead of caching it', async () => {
  const bridge = createTestBridge()
  restore = setPlatformForTests(bridge)
  let calls = 0
  bridge.mockCommand('provider_runtime_probe', () => ({
    runtime: ++calls === 1 ? { ...connected, state: 'logged_out' } : connected,
  }))
  render(
    <I18nProvider lang="en">
      <ExternalRuntimePanel runtime="claude-cli" />
    </I18nProvider>,
  )
  expect((await screen.findByRole('status')).textContent).toContain('not signed in')
  fireEvent.click(screen.getByText('Check again'))
  expect((await screen.findByRole('status')).textContent).toContain('Connected')
  expect(calls).toBe(2)
})

it('CLAUDE-UI-07: a saved provider reads its diagnostics, not the generic probe', async () => {
  const bridge = mount(connected, 'claude-sub')
  await screen.findByRole('status')
  const probed = bridge.calls.filter((call) => call.name === 'provider_runtime_probe')
  const diagnosed = bridge.calls.filter((call) => call.name === 'provider_diagnostics_get')
  expect(probed).toHaveLength(0)
  expect(diagnosed).toHaveLength(1)
})

it('CLAUDE-UI-08: an engine error is reported, never shown as connected', async () => {
  const bridge = createTestBridge()
  restore = setPlatformForTests(bridge)
  bridge.mockCommand('provider_runtime_probe', () => {
    throw new Error('engine unavailable')
  })
  render(
    <I18nProvider lang="en">
      <ExternalRuntimePanel runtime="claude-cli" />
    </I18nProvider>,
  )
  expect((await screen.findByRole('alert')).textContent).toContain('engine unavailable')
  expect(screen.queryByRole('status')).toBeNull()
})

it('CLAUDE-UI-09: the state reaches the caller so the wizard can gate on it', async () => {
  const bridge = createTestBridge()
  restore = setPlatformForTests(bridge)
  bridge.mockCommand('provider_runtime_probe', () => ({ runtime: connected }))
  const seen = vi.fn()
  render(
    <I18nProvider lang="en">
      <ExternalRuntimePanel runtime="claude-cli" onStateChange={seen} />
    </I18nProvider>,
  )
  await screen.findByRole('status')
  expect(seen).toHaveBeenCalledWith(expect.objectContaining({ state: 'connected' }))
})
