// @vitest-environment jsdom
// La tarjeta de un provider servido por un CLI externo. La UI no ejecuta el
// binario ni juzga la autenticación: pinta lo que el Engine derivó, y nada que
// no sea `connected` ofrece seguir adelante.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  // The Engine builds both for this machine; the UI never guesses one.
  login_command: 'claude auth login --claudeai',
  install_command: 'irm https://claude.ai/install.ps1 | iex',
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

it('CLAUDE-UI-02: it names the stripped variables, and counts the rest', async () => {
  mount({
    ...connected,
    sanitized_env: ['ANTHROPIC_API_KEY', 'CLAUDECODE', 'CLAUDE_CODE_MESSAGING_TOKEN', 'CLAUDE_EFFORT', 'CLAUDE_PID'],
  })
  await screen.findByRole('status')
  // El barrido puede retirar decenas de variables: la tarjeta nombra unas
  // pocas y cuenta el resto en vez de volverse un volcado del entorno.
  const cell = screen.getByText(/ANTHROPIC_API_KEY/)
  expect(cell.textContent).toBe('ANTHROPIC_API_KEY, CLAUDECODE, CLAUDE_CODE_MESSAGING_TOKEN +2')
  expect(cell.getAttribute('title')).toContain('CLAUDE_PID')
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
    install_command: 'irm https://claude.ai/install.ps1 | iex',
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
  expect(screen.getAllByText(/bills the API/i).length).toBeGreaterThan(0)
  // No hay atajo para continuar igual: cambiar de fuente cambiaría la factura.
  // La guía explica cómo volver a la suscripción, pero ningún botón conecta.
  expect(screen.queryByRole('button', { name: /^connect/i })).toBeNull()
  expect(within(screen.getByTestId('claude-connect-guide')).getByText('claude auth login --claudeai')).toBeTruthy()
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

// -- guía para conectar la cuenta ---------------------------------------------

const offPath = '& "C:\\Users\\x\\.local\\bin\\claude.exe" auth login --claudeai'

it('CLAUDE-UI-12: signed out, the guide walks through the login with the exact command', async () => {
  // El caso real del dueño: CLI fuera del PATH en Windows. El comando lleva
  // la ruta completa y el `&` de PowerShell; sin ellos falló la primera vez.
  mount({ ...connected, state: 'logged_out', login_command: offPath, auth: { ...connected.auth, logged_in: false } })
  const guide = await screen.findByTestId('claude-connect-guide')
  const steps = within(guide).getAllByRole('listitem')
  expect(within(guide).getByText(offPath)).toBeTruthy()
  expect(guide.textContent).toContain('Open a terminal')
  expect(guide.textContent).toContain('Login successful')
  expect(guide.textContent).toContain('Check again')
  expect(guide.textContent).toContain('leading & is required')
  expect(guide.textContent).toContain('Do not use --console')
  expect(steps.length).toBeGreaterThanOrEqual(4)
})

it('CLAUDE-UI-13: the copy button copies the command exactly', async () => {
  const bridge = mount({ ...connected, state: 'logged_out', login_command: offPath, auth: { ...connected.auth, logged_in: false } })
  const guide = await screen.findByTestId('claude-connect-guide')
  fireEvent.click(within(guide).getByRole('button', { name: /copy/i }))
  await waitFor(() => expect(bridge.copiedTexts).toEqual([offPath]))
  expect(await within(guide).findByText('Command copied')).toBeTruthy()
})

it('CLAUDE-UI-14: with claude on PATH the command is bare and the PowerShell note is not shown', async () => {
  mount({ ...connected, state: 'logged_out', login_command: 'claude auth login --claudeai', auth: { ...connected.auth, logged_in: false } })
  const guide = await screen.findByTestId('claude-connect-guide')
  expect(within(guide).getByText('claude auth login --claudeai')).toBeTruthy()
  expect(guide.textContent).not.toContain('leading & is required')
})

it('CLAUDE-UI-15: not installed, the guide gives the install command to copy, not a login', async () => {
  const bridge = mount({
    transport: 'claude-cli',
    experimental: true,
    installed: false,
    path: null,
    discovered_via: null,
    sanitized_env: [],
    state: 'missing_cli',
    hint: 'Run: irm https://claude.ai/install.ps1 | iex',
    install_command: 'irm https://claude.ai/install.ps1 | iex',
  })
  const guide = await screen.findByTestId('claude-connect-guide')
  expect(within(guide).getByText('irm https://claude.ai/install.ps1 | iex')).toBeTruthy()
  expect(guide.textContent).not.toContain('auth login')
  fireEvent.click(within(guide).getByRole('button', { name: /copy/i }))
  await waitFor(() => expect(bridge.copiedTexts).toEqual(['irm https://claude.ai/install.ps1 | iex']))
})

it('CLAUDE-UI-16: without a command from the Engine, the guide shows none rather than a guess', async () => {
  // A guessed `claude ...` fails on a machine where the CLI is not on PATH,
  // which is exactly the case the Engine's full-path command exists for.
  const { login_command: _login, install_command: _install, ...older } = connected
  mount({ ...older, state: 'logged_out', auth: { ...connected.auth, logged_in: false } })
  const guide = await screen.findByTestId('claude-connect-guide')
  expect(within(guide).queryByText(/claude auth login/)).toBeNull()
})

it('CLAUDE-UI-18: checking again on a saved provider runs the probe, which lifts a billing block', async () => {
  // The Engine blocks the provider after a run picked a non-subscription
  // credential; only provider.runtime.probe lifts it. Diagnostics alone would
  // show "Connected" while every turn kept being refused.
  const bridge = mount(connected, 'claude-sub')
  await screen.findByRole('status')
  fireEvent.click(screen.getByRole('button', { name: /check again/i }))
  await waitFor(() => {
    expect(bridge.calls.filter((call) => call.name === 'provider_runtime_probe')).toHaveLength(1)
    expect(bridge.calls.filter((call) => call.name === 'provider_diagnostics_get')).toHaveLength(2)
  })
})

it('CLAUDE-UI-17: once connected, there is no guide', async () => {
  mount(connected)
  await screen.findByRole('status')
  expect(screen.queryByTestId('claude-connect-guide')).toBeNull()
})

