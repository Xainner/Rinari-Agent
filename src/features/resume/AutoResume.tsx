import { useEffect } from 'react'
import { Clock, Play, X } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { commandMessage, engineApi } from '../../services/engine'
import type { SessionResume } from '../../types/protocol.generated'
import { useResumeStore } from './resumeStore'
import { clockTime, formatLeft, useCountdown } from './ResumeChip'

const WAITING_STATES = new Set(['waiting'])

/**
 * On a turn stopped by a provider limit: «Continuar automáticamente cuando se
 * restablezca» (plan 0.4.0 #24), and once armed, when it continues with
 * «Reanudar ahora» and «Cancelar». The Engine continues the conversation; the
 * app must stay open (the tray is enough).
 */
export function AutoResume({ sessionId, resetsAt, failedAt }: { sessionId: string; resetsAt?: string; failedAt?: number }) {
  const { t, lang } = useI18n()
  const resume = useResumeStore((state) => state.bySession[sessionId])
  const apply = useResumeStore((state) => state.apply)

  useEffect(() => {
    if (resume !== undefined) return
    let alive = true
    // Through a promise: an Engine (or a test double) without it simply offers nothing.
    Promise.resolve().then(() => engineApi.sessionResume(sessionId))
      .then((result) => { if (alive) apply(sessionId, result.resume ?? null) })
      .catch(() => { /* an older Engine: nothing to offer */ })
    return () => { alive = false }
  }, [sessionId, resume, apply])

  const waiting = resume && WAITING_STATES.has(resume.state)
  const left = useCountdown(waiting && resume?.mode === 'at' ? resume.resume_at : null)

  const run = async (action: () => Promise<{ resume: SessionResume | null }>) => {
    try {
      const result = await action()
      apply(sessionId, result.resume ?? null)
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  const time = (iso: string) => clockTime(iso, lang)
  if (waiting && resume) {
    // Armed: the bar fills from when it was armed until the reset.
    const armedAt = Date.parse(resume.updated_at)
    const span = Date.parse(resume.resume_at) - armedAt
    const progress = left !== null && span > 0 ? Math.min(1, Math.max(0, 1 - left / span)) : null
    return (
      <div data-testid="auto-resume" data-state="waiting" className="resume-card">
        <p className="resume-card-line">
          <span className="resume-card-clock" aria-hidden="true"><Clock size={12} /></span>
          <span className="min-w-0 flex-1">
            {resume.mode === 'poll'
              ? t('resume.waitingBalance')
              : t('resume.waitingAt', { time: time(resume.resume_at) })}
          </span>
          {left !== null && <span className="resume-card-left" role="timer" aria-label={t('resume.left', { left: formatLeft(left) })}>{formatLeft(left)}</span>}
        </p>
        {progress !== null && (
          <div className="resume-card-track" aria-hidden="true"><span style={{ transform: `scaleX(${progress})` }} /></div>
        )}
        <div className="resume-card-actions">
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => void run(() => engineApi.resumeNow(sessionId))}>
            <Play size={11} aria-hidden="true" />{t('resume.now')}
          </button>
          <button type="button" className="btn btn-quiet btn-xs" onClick={() => void run(() => engineApi.resumeCancel(sessionId))}>
            <X size={11} aria-hidden="true" />{t('resume.cancel')}
          </button>
        </div>
        <p className="resume-card-hint">{t('resume.keepOpen')}</p>
      </div>
    )
  }
  // A resume that already ran after this failure is not offered again here.
  const settledAfter = resume && failedAt !== undefined && Date.parse(resume.updated_at) >= failedAt
  if (settledAfter) return null
  return (
    <div data-testid="auto-resume" data-state="offer">
      <button
        type="button"
        className="btn btn-secondary btn-xs"
        onClick={() => void run(() => engineApi.resumeArm(sessionId, resetsAt))}
      >
        <Clock size={11} aria-hidden="true" />
        {resetsAt ? t('resume.offerAt', { time: time(resetsAt) }) : t('resume.offer')}
      </button>
    </div>
  )
}
