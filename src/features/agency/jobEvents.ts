import { onEngineEvent } from '../../services/engine'

export class JobTimeoutError extends Error {
  constructor() {
    super('job timed out')
    this.name = 'JobTimeoutError'
  }
}

/**
 * Un trabajo del Engine que responde con un `job_id` y avisa con un evento
 * (`schedule.rehearsed`, `agency.draft.*`). La suscripción va **antes** de
 * pedirlo: el Engine puede emitir el evento antes de que el comando
 * responda, y entonces se perdía y el botón quedaba en «Probando…». Lo que
 * llega mientras tanto se guarda y se mira al saber el `job_id`. Si no llega
 * nada en `timeoutMs`, se rechaza con `JobTimeoutError`.
 */
export async function runJob<T>(
  start: () => Promise<{ job_id: string }>,
  match: (event: { event: string; payload: Record<string, unknown> }) => T | null,
  timeoutMs: number,
): Promise<T> {
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
  let timer: number | undefined
  try {
    const result = new Promise<T>((resolve, reject) => {
      settle = resolve
      timer = window.setTimeout(() => reject(new JobTimeoutError()), timeoutMs)
    })
    const started = await start()
    jobId = started.job_id
    for (const item of seen.splice(0)) if (check(item)) break
    return await result
  } finally {
    window.clearTimeout(timer)
    unlisten()
  }
}
