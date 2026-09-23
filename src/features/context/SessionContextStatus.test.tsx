// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { engineApi } from '../../services/engine'
import SessionContextStatus from './SessionContextStatus'
import CompactionDetails from './CompactionDetails'
import { createInitialTimelineState, engineEventAction, turnTimelineReducer } from '../activity/turnTimelineReducer'

vi.mock('../../services/engine', () => ({
  engineApi: { contextStatus: vi.fn(), contextCompact: vi.fn() },
  commandMessage: (error: unknown) => String(error),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

const status = {
  window_tokens: 200000,
  window_source: 'provider',
  window_estimated: false,
  usable_input_tokens: 192000,
  compact_at_tokens: 153600,
  compaction_enabled: true,
  last_request: { input_tokens: 96000, measurement: 'reported', at: '2026-09-23T10:00:00Z' },
  last_compaction: {
    status: 'completed',
    used_tokens: 91000,
    after_tokens: 40000,
    duration_ms: 1200,
    checks: { structure: 'passed', records: 'repaired', reduction: 'passed' },
  },
}
const view = () => render(<I18nProvider lang="es"><SessionContextStatus sessionId="ses" /></I18nProvider>)

it('shows usable input, the reported use against it, and what the last compaction checked', async () => {
  vi.mocked(engineApi.contextStatus).mockResolvedValue(status as never)
  view()
  const panel = within(await screen.findByTestId('session-context'))
  expect(engineApi.contextStatus).toHaveBeenCalledWith({ session_id: 'ses' })
  expect(panel.getByText('192.000 tokens')).toBeTruthy()
  expect(panel.getByText('96.000 tokens · 50%')).toBeTruthy()
  expect(panel.getByText('informado por el proveedor')).toBeTruthy()
  expect(panel.getByText('153.600 tokens')).toBeTruthy()
  expect(panel.getByText(/91\.000 → 40\.000 tokens · 1,2 s/)).toBeTruthy()
  const checks = within(panel.getByLabelText('Comprobaciones'))
  expect(checks.getByText('reparada')).toBeTruthy()
  expect(panel.getByText('Comprobaciones deterministas: no miden la fidelidad del resumen.')).toBeTruthy()
})

it('says there is no reported use yet instead of inventing one', async () => {
  vi.mocked(engineApi.contextStatus).mockResolvedValue({ ...status, last_request: null, last_compaction: null } as never)
  view()
  expect(await screen.findByText('Aún sin uso informado por el proveedor.')).toBeTruthy()
  expect(screen.getByText('Todavía no se ha compactado esta sesión.')).toBeTruthy()
})

it('renders nothing against an engine without session status', async () => {
  vi.mocked(engineApi.contextStatus).mockRejectedValue(new Error('INVALID_PARAMS'))
  const { container } = view()
  await waitFor(() => expect(container.textContent).toBe(''))
})

it('compacts on request and reloads the status', async () => {
  vi.mocked(engineApi.contextStatus).mockResolvedValue(status as never)
  vi.mocked(engineApi.contextCompact).mockResolvedValue({} as never)
  view()
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Compactar ahora' }))
  expect(engineApi.contextCompact).toHaveBeenCalledWith('ses')
  await waitFor(() => expect(engineApi.contextStatus).toHaveBeenCalledTimes(2))
})

it('shows a compaction activity legibly from its event', () => {
  const state = turnTimelineReducer(createInitialTimelineState(), engineEventAction({
    type: 'event',
    event: 'governor.compact',
    payload: { session_id: 's', turn_id: 't', compaction_id: 'c', reason: 'automatic', status: 'completed', window_tokens: 192000, window_source: 'catalog', used_tokens: 91000, after_tokens: 40000, duration_ms: 1200, checks: { structure: 'passed', records: 'repaired', reduction: 'passed' } },
  }, 1000)!)
  const item = state.timelines.t.items.find((entry) => entry.type === 'context')!
  render(<I18nProvider lang="es"><CompactionDetails details={item.type === 'context' ? item.contextDetails : undefined} /></I18nProvider>)
  const details = within(screen.getByTestId('compaction-details'))
  expect(details.getByText(/91\.000 → 40\.000 tokens · 1,2 s/)).toBeTruthy()
  expect(details.getByText(/192\.000 tokens · Catálogo de modelos/)).toBeTruthy()
  expect(details.getByText('reparada')).toBeTruthy()
})
