// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'

type Listener = (event: { event: string; payload: unknown }) => void
const listeners = new Set<Listener>()
vi.mock('../../services/engine', () => ({
  onEngineEvent: vi.fn(async (listener: Listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }),
}))

import { JobCancelledError, JobTimeoutError, runJob } from './jobEvents'

const never = () => new Promise<{ job_id: string }>(() => {})
const match = () => null

afterEach(() => {
  vi.useRealTimers()
  listeners.clear()
})

it('times out while the command has not answered yet, and stops listening', async () => {
  vi.useFakeTimers()
  const job = runJob(never, match, 1000)
  const caught = job.catch((error: unknown) => error)
  await vi.advanceTimersByTimeAsync(1000)
  expect(await caught).toBeInstanceOf(JobTimeoutError)
  expect(listeners.size).toBe(0)
})

it('a component that goes away cancels its job: no timer, no listener left', async () => {
  const controller = new AbortController()
  const job = runJob(async () => ({ job_id: 'j1' }), match, 60_000, controller.signal)
  const caught = job.catch((error: unknown) => error)
  await vi.waitFor(() => expect(listeners.size).toBe(1))
  controller.abort()
  expect(await caught).toBeInstanceOf(JobCancelledError)
  expect(listeners.size).toBe(0)
})
