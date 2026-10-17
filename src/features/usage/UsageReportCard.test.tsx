// @vitest-environment jsdom
// `/usage` (#78): la tarjeta pinta lo que trae el informe y lo copia como texto.
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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
