import {
  engineApi,
  onEngineEvent,
  type SkillJobAction,
  type SkillJobError,
} from '../../services/engine'

export type SkillJobOutcome<T> = { ok: true; result: T } | { ok: false; error: SkillJobError }

const POLL_MS = 2000
const TIMEOUT_MS = 180_000

/**
 * Inicia un job de skills (inspeccionar, instalar, actualizar) y espera su
 * final. El Engine lo anuncia con `skill.job.completed`/`failed`; por si el
 * evento llegó antes de suscribirse, también se consulta `skill_job_get`.
 */
export async function runSkillJob<T>(input: {
  action: SkillJobAction
  source?: string
  name?: string
  expectedHash?: string
  force?: boolean
}): Promise<SkillJobOutcome<T>> {
  const started = await engineApi.skillJobStart(input)
  return new Promise((resolve) => {
    let done = false
    let stop: (() => void) | undefined
    const finish = (outcome: SkillJobOutcome<T>) => {
      if (done) return
      done = true
      stop?.()
      clearInterval(poll)
      clearTimeout(timeout)
      resolve(outcome)
    }
    void onEngineEvent((event) => {
      if (event.payload?.job_id !== started.job_id) return
      if (event.event === 'skill.job.completed') finish({ ok: true, result: event.payload.result as T })
      if (event.event === 'skill.job.failed') finish({ ok: false, error: event.payload.error as SkillJobError })
    }).then((unsubscribe) => {
      if (done) unsubscribe()
      else stop = unsubscribe
    })
    const poll = setInterval(() => {
      void engineApi.skillJobGet(started.job_id).then(({ job }) => {
        if (job.status === 'completed') finish({ ok: true, result: job.result as T })
        else if (job.status === 'failed' && job.error) finish({ ok: false, error: job.error })
      }).catch(() => undefined)
    }, POLL_MS)
    const timeout = setTimeout(
      () => finish({ ok: false, error: { code: 'SKILL_JOB_TIMEOUT', message: 'El Engine no terminó a tiempo.', details: {} } }),
      TIMEOUT_MS,
    )
  })
}
