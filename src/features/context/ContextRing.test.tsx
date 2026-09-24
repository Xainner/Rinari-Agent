// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { engineApi, onEngineEvent, type EngineEventMsg } from '../../services/engine'
import ContextRing, { ringFigures } from './ContextRing'

let emit: (event: EngineEventMsg) => void = () => {}
vi.mock('../../services/engine', () => ({
  engineApi: { contextStatus: vi.fn() },
  onEngineEvent: vi.fn(async (listener: (event: EngineEventMsg) => void) => { emit = listener; return () => {} }),
}))

const measured = (input: number) => ({
  window_tokens: 131072,
  window_source: 'provider',
  window_estimated: false,
  compact_at_percent: 80,
  compaction_enabled: true,
  last_request: { input_tokens: input, measurement: 'reported', at: '2026-09-23T00:00:00Z' },
}) as Record<string, unknown> as never

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })

const ring = (sessionId = 'ses_a') => render(<I18nProvider lang="es"><ContextRing sessionId={sessionId} /></I18nProvider>)
const flush = async () => { await act(async () => { await vi.runOnlyPendingTimersAsync() }) }

it('shows nothing until the provider has measured a request of this session', async () => {
  vi.mocked(engineApi.contextStatus).mockResolvedValue({ ...(measured(0) as object), last_request: null } as never)
  ring()
  await flush()
  expect(screen.queryByRole('img')).toBeNull()
})

it('shows the used context over the window and says it for assistive technology', async () => {
  vi.mocked(engineApi.contextStatus).mockResolvedValue(measured(42300))
  ring()
  await flush()
  const img = screen.getByRole('img')
  // Spanish separates the percent sign with a no-break space.
  expect(img.getAttribute('aria-label')).toBe('Contexto: 42.300 de 131.072 tokens (32 %)')
  expect(img.getAttribute('data-near')).toBeNull()
  expect(engineApi.contextStatus).toHaveBeenCalledWith({ session_id: 'ses_a' })
})

it('follows the session as it grows, in one call per burst, and ignores other sessions', async () => {
  vi.mocked(engineApi.contextStatus).mockResolvedValue(measured(42300))
  ring()
  await flush()
  expect(onEngineEvent).toHaveBeenCalledOnce()
  vi.mocked(engineApi.contextStatus).mockResolvedValue(measured(110000))
  act(() => {
    emit({ type: 'event', event: 'usage.updated', payload: { session_id: 'ses_b' } })
  })
  await flush()
  expect(engineApi.contextStatus).toHaveBeenCalledTimes(1)
  act(() => {
    for (let i = 0; i < 5; i++) emit({ type: 'event', event: 'usage.updated', payload: { session_id: 'ses_a' } })
  })
  await flush()
  expect(engineApi.contextStatus).toHaveBeenCalledTimes(2)
  // Past the compaction threshold the ring says so, not only by color.
  expect(screen.getByRole('img').getAttribute('data-near')).toBe('true')
})

it('computes its figures only from a reported measurement', () => {
  expect(ringFigures(null)).toBeNull()
  expect(ringFigures({ ...(measured(10) as object), window_tokens: 0 } as never)).toBeNull()
  expect(ringFigures(measured(131072 * 2))?.ratio).toBe(1)
  expect(ringFigures({ ...(measured(120000) as object), compaction_enabled: false } as never)?.near).toBe(false)
})
