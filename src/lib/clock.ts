import { useEffect, useReducer, useState } from 'react'

/**
 * The current time, refreshed every `intervalMs` while `enabled`. Call it in
 * the smallest component that shows the time: each tick re-renders only that
 * component.
 */
export function useNow(intervalMs: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs, enabled])
  return now
}

/**
 * Whether the clock has reached `at`. Re-renders once, when it does, instead
 * of ticking until then.
 */
export function useTimeReached(at: number, enabled = true): boolean {
  const [, wake] = useReducer((count: number) => count + 1, 0)
  const reached = Date.now() >= at
  useEffect(() => {
    if (!enabled || reached) return
    const timer = window.setTimeout(wake, Math.max(0, at - Date.now()) + 1)
    return () => window.clearTimeout(timer)
  }, [at, enabled, reached])
  return reached
}
