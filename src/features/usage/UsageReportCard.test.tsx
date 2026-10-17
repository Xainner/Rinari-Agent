// @vitest-environment jsdom
// `/usage` (#78): la tarjeta pinta lo que trae el informe y lo copia como texto.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import type { UsageReport } from './usageReport'

const copied: string[] = []
vi.mock('../../lib/clipboard', () => ({ copyText: vi.fn(async (text: string) => { copied.push(text); return true }) }))
vi.mock('../../services/engine', () => ({
  engineApi: {
    providerUsage: vi.fn(async () => ({ provider_id: 'p1', product_id: 'x', status: 'available', windows: [{ id: 'w5h', label: '5 h', scope: 's', used_percent: 42, remaining_percent: 58, resets_at: '2026-10-17T20:00:00Z', duration_seconds: 18000 }], balances: [], fetched_at: null, source: null, detail: '', retry_at: null })),
    contextStatus: vi.fn(async () => ({ window_tokens: 200_000, window_source: 'provider', window_estimated: false, last_request: { input_tokens: 50_000 } })),
    contextCompact: vi.fn(async () => ({})),
  },
  commandMessage: String,
}))

import { UsageReportCard } from './UsageReportCard'

afterEach(() => { cleanup(); copied.length = 0 })

const REPORT: UsageReport = {
  scope: 'session', ref: 'ses_a', generated_at: '2026-10-17T15:00:00Z',
  models: [{ model_id: 'm1', model_name: 'Sonnet', provider_id: 'p1', provider_alias: 'anthropic', calls: 3, input_tokens: 30_000, output_tokens: 900, cache_read_tokens: 20_000, cache_write_tokens: 1_000, reasoning_tokens: 0, cache_percent: 67, cost: null }],
  totals: { calls: 3, input_tokens: 30_000, output_tokens: 900, cache_read_tokens: 20_000, cache_write_tokens: 1_000, reasoning_tokens: 0, cost: null },
  tools: { total: 4, ok: 3, failed: 1, top: [{ tool: 'fs.read', count: 3 }] },
  compactions: 1,
  warnings: [{ kind: 'image_resent', count: 1, max: 4 }],
  time: { first_at: null, last_at: null, active_ms: 42_000 },
}

it('shows limits, context, models, tools and warnings, and copies the report as text', async () => {
  render(<I18nProvider lang="es"><UsageReportCard report={REPORT} sessionId="ses_a" /></I18nProvider>)
  const card = screen.getByTestId('usage-report')
  expect(card.textContent).toContain('Sonnet')
  expect(card.textContent).toContain('4 en total')
  expect(card.textContent).toContain('4 veces')
  await waitFor(() => expect(card.textContent).toContain('42 %'))
  await waitFor(() => expect(card.textContent).toContain('1 compactaciones'))
  await userEvent.click(screen.getByRole('button', { name: /Copiar/ }))
  expect(copied[0]).toContain('Sonnet: 3 calls')
  expect(screen.getByRole('button', { name: /Copiado/ })).toBeTruthy()
})

it('a 0.4.0 snapshot paints its own limits of every provider, context and client, with no live calls', async () => {
  const { engineApi } = await import('../../services/engine')
  vi.mocked(engineApi.providerUsage).mockClear()
  vi.mocked(engineApi.contextStatus).mockClear()
  const snapshot: UsageReport = {
    ...REPORT,
    client: { app_version: '0.4.0', engine_version: '0.4.0', profile: 'Trabajo', provider: 'claude-sub', model: 'sonnet' },
    context: { window_tokens: 200_000, used_tokens: 30_000, compact_at_tokens: 160_000, last_compaction_at: null },
    limits: [
      { provider_id: 'p1', provider_alias: 'claude-sub', product_id: 'claude-subscription', status: 'unsupported', windows: [], balances: [], detail: 'they show after the next one', fetched_at: null, conversation: true },
      { provider_id: 'p2', provider_alias: 'opencode', product_id: 'opencode-go', status: 'available', windows: [{ id: 'rolling', label: '5h', scope: 'account', used_percent: 64, remaining_percent: 36, resets_at: '2026-10-17T20:00:00Z', duration_seconds: null }], balances: [], detail: '', fetched_at: null, conversation: false },
    ],
  }
  render(<I18nProvider lang="es"><UsageReportCard report={snapshot} sessionId="ses_a" /></I18nProvider>)
  const card = screen.getByTestId('usage-report')
  expect(screen.getByTestId('usage-report-client').textContent).toBe('Rinari Agent 0.4.0 · Engine 0.4.0 · Trabajo · claude-sub / sonnet')
  const limits = card.querySelector('[data-block="limits"]')!
  // In the owner's language, not the Engine's English detail.
  expect(limits.querySelector('[data-provider="p1"]')!.textContent).toContain('aparecen después de la próxima')
  expect(limits.querySelector('[data-provider="p2"]')!.textContent).toContain('64 %')
  expect(card.querySelector('[data-block="context"]')!.textContent).toContain('30')
  expect(engineApi.providerUsage).not.toHaveBeenCalled()
  expect(engineApi.contextStatus).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: /Copiar/ }))
  expect(copied[0]).toContain('Plan limits:\n  claude-sub: not reported (they show after the next one)\n  opencode · 5h: 64% used')
  expect(copied[0]).toContain('Context:\n  30,000 of 200,000 tokens (15%)')
})

it('each warning has its one-tap fix: compact, or see the models', async () => {
  const { engineApi } = await import('../../services/engine')
  const { useUIStore } = await import('../../stores/ui')
  const goSettings = vi.spyOn(useUIStore.getState(), 'goSettings').mockImplementation(() => {})
  const warned: UsageReport = { ...REPORT, warnings: [{ kind: 'large_outputs', count: 2, max: 40_000 }, { kind: 'no_cache', count: 6, model: 'Sonnet' }] }
  render(<I18nProvider lang="es"><UsageReportCard report={warned} sessionId="ses_a" /></I18nProvider>)
  const card = screen.getByTestId('usage-report')
  expect(card.textContent).toContain('Hay 2 salidas grandes que siguen en el contexto')
  await userEvent.click(within(card.querySelector('[data-warning="large_outputs"]') as HTMLElement).getByRole('button', { name: 'Compactar ahora' }))
  expect(engineApi.contextCompact).toHaveBeenCalledWith('ses_a')
  await userEvent.click(within(card.querySelector('[data-warning="no_cache"]') as HTMLElement).getByRole('button', { name: 'Ver modelos' }))
  expect(goSettings).toHaveBeenCalledWith('models')
})
