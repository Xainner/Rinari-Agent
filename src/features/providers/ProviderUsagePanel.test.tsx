// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { engineApi } from '../../services/engine'
import { I18nProvider } from '../../i18n'
import ProviderUsagePanel from './ProviderUsagePanel'
import type { ProviderUsageSnapshot } from '../../types/protocol.generated'

vi.mock('../../services/engine', () => ({ engineApi: { providerUsage: vi.fn() }, commandMessage: String }))
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })
const snapshot: ProviderUsageSnapshot = {
  provider_id: 'go', product_id: 'opencode-go', status: 'available',
  windows: [{ id: 'monthly', label: 'monthly', scope: 'account', used_percent: 63, remaining_percent: 37, resets_at: '2026-10-01T00:00:00Z', duration_seconds: null }],
  balances: [], fetched_at: '2026-09-22T00:00:00Z', source: 'https://opencode.ai/zen/go/v1/usage', detail: '', retry_at: null,
}
it('shows remaining quota and preserves stale values on query errors', async () => {
  vi.mocked(engineApi.providerUsage).mockResolvedValue({ ...snapshot, status: 'stale', detail: 'HTTP 429' })
  render(<I18nProvider lang="en"><ProviderUsagePanel providerAlias="go" /></I18nProvider>)
  await screen.findByRole('progressbar')
  expect((screen.getByRole('progressbar') as HTMLProgressElement).value).toBe(37)
  expect(screen.getByRole('status').textContent).toContain('stale')
  expect(screen.getByText('HTTP 429')).toBeTruthy()
})
it('does not invent zero or a monthly allowance when windows are unknown', async () => {
  vi.mocked(engineApi.providerUsage).mockResolvedValue({ ...snapshot, status: 'partial', windows: [{ ...snapshot.windows[0], id: 'review', label: 'Code review', used_percent: null, remaining_percent: null }] })
  render(<I18nProvider lang="en"><ProviderUsagePanel providerAlias="chatgpt" /></I18nProvider>)
  await screen.findByText('Code review')
  expect(screen.queryByRole('progressbar')).toBeNull()
  expect(screen.queryByText('Monthly')).toBeNull()
  expect(screen.getByText(/—/)).toBeTruthy()
})
it('polls while mounted, pauses when hidden, and stops after unmount', async () => {
  vi.useFakeTimers()
  vi.mocked(engineApi.providerUsage).mockResolvedValue(snapshot)
  let visibility = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility as DocumentVisibilityState)
  const view = render(<ProviderUsagePanel providerAlias="go" />)
  await act(async () => { await Promise.resolve() })
  expect(engineApi.providerUsage).toHaveBeenCalledTimes(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
  expect(engineApi.providerUsage).toHaveBeenCalledTimes(2)
  visibility = 'hidden'
  await act(async () => { await vi.advanceTimersByTimeAsync(120_000) })
  expect(engineApi.providerUsage).toHaveBeenCalledTimes(2)
  view.unmount()
  await act(async () => { await vi.advanceTimersByTimeAsync(120_000) })
  expect(engineApi.providerUsage).toHaveBeenCalledTimes(2)
  vi.restoreAllMocks()
})
it('discards a late response from the previous account', async () => {
  let finish!: (value: ProviderUsageSnapshot) => void
  vi.mocked(engineApi.providerUsage).mockImplementation(alias => alias === 'old' ? new Promise(resolve => { finish = resolve }) : Promise.resolve({ ...snapshot, windows: [], status: 'unsupported' }))
  const view = render(<ProviderUsagePanel providerAlias="old" />)
  view.rerender(<ProviderUsagePanel providerAlias="new" />)
  await waitFor(() => expect(engineApi.providerUsage).toHaveBeenCalledWith('new', false))
  await act(async () => { finish(snapshot) })
  expect(screen.queryByRole('progressbar')).toBeNull()
})
