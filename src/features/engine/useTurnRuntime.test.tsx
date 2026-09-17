// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

type Listener = (wrapper: { payload: { type: string; event: string; payload: Record<string, unknown> } }) => void
const listeners: Listener[] = []
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue({}) }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_name: string, callback: Listener) => {
    listeners.push(callback)
    return () => {
      const index = listeners.indexOf(callback)
      if (index >= 0) listeners.splice(index, 1)
    }
  }),
}))

import { SESSION_REFRESH_DEBOUNCE_MS, SESSION_REFRESH_MAX_WAIT_MS, useTurnRuntime } from './useTurnRuntime'

function emit(event: string, payload: Record<string, unknown>) {
  for (const listener of [...listeners]) listener({ payload: { type: 'event', event, payload } })
}

beforeEach(() => {
  vi.useFakeTimers()
  listeners.length = 0
})
afterEach(() => {
  vi.useRealTimers()
})

it('coalesces session-list refreshes from a burst of events into one call', async () => {
  const onSessionsChanged = vi.fn()
  const hook = renderHook(() => useTurnRuntime({ onSessionsChanged }))
  await act(async () => {
    await Promise.resolve()
  })
  expect(listeners).toHaveLength(1)

  act(() => {
    for (const session of ['A', 'B', 'C']) {
      emit('turn.started', { turn_id: `t-${session}`, session_id: session })
      emit('turn.completed', { turn_id: `t-${session}`, session_id: session })
    }
  })
  expect(onSessionsChanged).not.toHaveBeenCalled()
  act(() => {
    vi.advanceTimersByTime(SESSION_REFRESH_DEBOUNCE_MS)
  })
  expect(onSessionsChanged).toHaveBeenCalledTimes(1)
  // The reducer still applied every event immediately.
  expect(hook.result.current.store.getState().timelines['t-C']?.status).toBe('completed')
})

it('never waits longer than the maximum window while events keep arriving', () => {
  const onSessionsChanged = vi.fn()
  renderHook(() => useTurnRuntime({ onSessionsChanged }))
  act(() => {
    vi.runOnlyPendingTimers()
  })
  const step = SESSION_REFRESH_DEBOUNCE_MS - 10
  let elapsed = 0
  act(() => {
    while (elapsed <= SESSION_REFRESH_MAX_WAIT_MS + step) {
      emit('turn.completed', { turn_id: `t-${elapsed}`, session_id: 'A' })
      vi.advanceTimersByTime(step)
      elapsed += step
    }
  })
  expect(onSessionsChanged.mock.calls.length).toBeGreaterThanOrEqual(1)
  expect(onSessionsChanged.mock.calls.length).toBeLessThanOrEqual(2)
})

it('stops the listener and pending timers on unmount', async () => {
  const onSessionsChanged = vi.fn()
  const hook = renderHook(() => useTurnRuntime({ onSessionsChanged }))
  await act(async () => {
    await Promise.resolve()
  })
  act(() => {
    emit('turn.completed', { turn_id: 't', session_id: 'A' })
  })
  hook.unmount()
  act(() => {
    vi.advanceTimersByTime(SESSION_REFRESH_MAX_WAIT_MS)
  })
  expect(onSessionsChanged).not.toHaveBeenCalled()
  expect(listeners).toHaveLength(0)
})
