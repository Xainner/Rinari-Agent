// @vitest-environment jsdom
import { installMockPlatform } from '../../test/mockPlatform'
const host = installMockPlatform()
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { SESSION_REFRESH_DEBOUNCE_MS, SESSION_REFRESH_MAX_WAIT_MS, useTurnRuntime } from './useTurnRuntime'

function emit(event: string, payload: Record<string, unknown>) {
  host.bridge.emitEngineEvent({ type: 'event', event, payload })
}

beforeEach(() => {
  vi.useFakeTimers()
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
  emit('turn.completed', { turn_id: 'after-unmount', session_id: 'A' })
  expect(onSessionsChanged).not.toHaveBeenCalled()
})

it('puts what a stopped turn did not read back in its draft, ahead of what you typed', async () => {
  cleanup() // Earlier hooks are still mounted; the app has one runtime.
  const { useComposerStore } = await import('../../stores/composer')
  useComposerStore.getState().setTextFor('S', 'lo que escribía')
  renderHook(() => useTurnRuntime({ onSessionsChanged: vi.fn() }))
  await act(async () => {
    await Promise.resolve()
  })
  act(() => {
    emit('steer.returned', { turn_id: 't', session_id: 'S', messages: ['uno', 'dos'], reason: 'cancelled' })
  })
  expect(useComposerStore.getState().getDraft('S').text).toBe('uno\n\ndos\n\nlo que escribía')
})
