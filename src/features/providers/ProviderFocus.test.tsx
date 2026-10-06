// @vitest-environment jsdom
// «Revisar uso y límites» desde un error abre la tarjeta del proveedor que
// falló, en la pestaña de uso, aunque otro proveedor esté activo; si ese
// proveedor ya no existe lo dice y no abre otro en su lugar.
import { installMockPlatform } from '../../test/mockPlatform'
installMockPlatform()
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('../../services/engine', () => ({
  engineApi: {
    providerUsage: vi.fn(async () => ({ provider_id: 'prv_go', product_id: 'opencode-go', status: 'available', windows: [], balances: [], fetched_at: null, source: '', detail: '', retry_at: null })),
    providerDiagnostics: vi.fn(async () => ({})),
    modelList: vi.fn(async () => []),
    modelRefresh: vi.fn(),
  },
  commandMessage: String,
}))

import { I18nProvider } from '../../i18n'
import { useUIStore } from '../../stores/ui'
import type { ProviderSummary } from '../../services/engine'
import ProvidersView from './ProvidersView'
import TurnResult from '../activity/TurnResult'
import type { TurnTimeline } from '../activity/types'

const provider = (id: string, alias: string, active: boolean): ProviderSummary => ({
  id, alias, type: 'openai', auth_method: 'api-key', account_hint: null, endpoint: null, settings: {},
  status_connected: true, status_checked_at: null, default_model_id: null, last_used_model_id: null, active,
  has_credential: true, created_at: '', updated_at: 'u1',
} as unknown as ProviderSummary)

const providers = [provider('prv_main', 'openai', true), provider('prv_go', 'go', false)]
const capabilities = { provider_catalog_v1: true, provider_usage_v1: true }

beforeEach(() => {
  useUIStore.setState({ view: 'board', lastWorkspaceView: 'board', providerFocus: null })
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => cleanup())

it('a quota failure leads to that provider\'s usage tab, then back to Boards', async () => {
  const timeline: TurnTimeline = {
    turnId: 't1', sessionId: 'ses_a', status: 'failed', startedAt: 1, userMessage: 'hola', items: [],
    error: 'Provider returned HTTP 429 for https://x.test: no credits',
    errorCode: 'PROVIDER_MODEL_FAILURE',
    errorRetryable: false,
    errorDetails: { provider_error_code: 'QUOTA_EXHAUSTED', limit_kind: 'quota', provider_id: 'prv_go', provider_alias: 'go', model: 'glm-5', http_status: 429 },
  }
  render(<I18nProvider lang="es"><TurnResult timeline={timeline} /></I18nProvider>)
  expect(screen.getByRole('alert').textContent).toContain('go no tiene cuota ni créditos para seguir con glm-5.')
  expect(screen.getByRole('alert').textContent).toContain('no credits')
  await userEvent.setup().click(screen.getByRole('button', { name: 'Revisar uso y límites' }))
  expect(useUIStore.getState()).toMatchObject({ view: 'settings', settingsSection: 'providers', providerFocus: { providerId: 'prv_go', tab: 'usage' } })
  cleanup()

  render(<I18nProvider lang="es"><ProvidersView providers={providers} onChanged={() => {}} engineCapabilities={capabilities} /></I18nProvider>)
  await act(async () => {})
  const usageTab = screen.getByRole('tab', { selected: true })
  expect(usageTab.closest('[data-anchor]')?.getAttribute('data-anchor')).toBe('provider:prv_go')
  expect(usageTab.textContent).toBe('Uso y límites')
  expect(useUIStore.getState().providerFocus).toBeNull()
  // Opening the screen changes nothing: the active provider is still openai.
  expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(1)

  useUIStore.getState().goBackToWork()
  expect(useUIStore.getState().view).toBe('board')
})

it('a provider that no longer exists is said, not replaced', async () => {
  useUIStore.setState({ providerFocus: { providerId: 'prv_gone', alias: 'viejo', tab: 'usage' } })
  render(<I18nProvider lang="es"><ProvidersView providers={providers} onChanged={() => {}} engineCapabilities={capabilities} /></I18nProvider>)
  await act(async () => {})
  expect(screen.getByRole('status').textContent).toContain('viejo ya no está configurado')
  expect(screen.queryByRole('tab', { selected: true })).toBeNull()
})

it('an unknown cause keeps only the received message', () => {
  const timeline: TurnTimeline = { turnId: 't2', sessionId: 'ses_a', status: 'failed', startedAt: 1, userMessage: 'x', items: [], error: 'boom', errorDetails: { code: 'E1' } }
  render(<I18nProvider lang="es"><TurnResult timeline={timeline} /></I18nProvider>)
  expect(screen.getByRole('alert').textContent).toBe('boom')
  expect(screen.queryByRole('button')).toBeNull()
})
