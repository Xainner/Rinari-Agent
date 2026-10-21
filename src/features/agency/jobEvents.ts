import { useCallback, useEffect, useRef } from 'react'
import { onEngineEvent } from '../../services/engine'

export class JobTimeoutError extends Error {
  constructor() {
    super('job timed out')
    this.name = 'JobTimeoutError'
  }
}

/**
 * La señal de un componente para sus trabajos: se aborta al desmontarlo, y
 * un trabajo pendiente deja de escuchar y no toca nada de él.
 */
export function useJobSignal(): () => AbortSignal | undefined {
  const controller = useRef<AbortController | null>(null)
  useEffect(() => {
    controller.current = new AbortController()
    return () => controller.current?.abort()
  }, [])
  return useCallback(() => controller.current?.signal, [])
}

/** El componente que esperaba el trabajo se fue: nada que mostrar. */
export class JobCancelledError extends Error {
  constructor() {
    super('job cancelled')
    this.name = 'JobCancelledError'
  }
}

/**
 * Un trabajo del Engine que responde con un `job_id` y avisa con un evento
 * (`schedule.rehearsed`, `agency.draft.*`). La suscripción va **antes** de
 * pedirlo: el Engine puede emitir el evento antes de que el comando
 * responda, y entonces se perdía y el botón quedaba en «Probando…». Lo que
 * llega mientras tanto se guarda y se mira al saber el `job_id`. Si no llega
 * nada en `timeoutMs` (aunque el comando aún no haya respondido), se rechaza
 * con `JobTimeoutError`; con `signal` abortada (el componente se desmontó),
 * con `JobCancelledError`. En los dos casos se deja de escuchar enseguida.
 */
export async function runJob<T>(
  start: () => Promise<{ job_id: string }>,
  match: (event: { event: string; payload: Record<string, unknown> }) => T | null,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) throw new JobCancelledError()
  const seen: { event: string; payload: Record<string, unknown> }[] = []
  let jobId: string | null = null
  let settle: ((value: T) => void) | null = null
  const check = (item: { event: string; payload: Record<string, unknown> }) => {
    if (jobId === null || item.payload?.job_id !== jobId) return false
    const value = match(item)
    if (value === null) return false
    settle?.(value)
    return true
  }
  const unlisten = await onEngineEvent((event) => {
    const item = { event: event.event, payload: (event.payload ?? {}) as Record<string, unknown> }
    if (jobId === null) seen.push(item)
    else check(item)
  })
  // Solo rechaza: el tiempo límite o la cancelación, también mientras se espera
  // la respuesta del comando.
  let fail: (error: Error) => void = () => {}
  const stopped = new Promise<never>((_resolve, reject) => { fail = reject })
  stopped.catch(() => {})
  const timer = window.setTimeout(() => fail(new JobTimeoutError()), timeoutMs)
  const onAbort = () => fail(new JobCancelledError())
  signal?.addEventListener('abort', onAbort)
  try {
    const result = new Promise<T>((resolve) => { settle = resolve })
    const starting = start()
    starting.catch(() => {})
    const started = await Promise.race([starting, stopped])
    jobId = started.job_id
    for (const item of seen.splice(0)) if (check(item)) break
    return await Promise.race([result, stopped])
  } finally {
    window.clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
    unlisten()
  }
}
