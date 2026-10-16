import { useEffect, useState } from 'react'
import { Clock, Play, X } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { commandMessage, engineApi } from '../../services/engine'
import type { SessionResume } from '../../types/protocol.generated'
import { useResumeStore } from './resumeStore'

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
  const [now, setNow] = useState(() => Date.now())

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
  useEffect(() => {
    if (!waiting) return
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [waiting])

  const run = async (action: () => Promise<{ resume: SessionResume | null }>) => {
    try {
      const result = await action()
      apply(sessionId, result.resume ?? null)
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  const time = (iso: string) => new Date(iso).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })
  if (waiting && resume) {
    const minutes = Math.max(0, Math.round((Date.parse(resume.resume_at) - now) / 60_000))
    return (
      <div data-testid="auto-resume" data-state="waiting" className="resume-card">
        <p className="resume-card-line">
          <span className="resume-card-clock" aria-hidden="true"><Clock size={12} /></span>
          {resume.mode === 'poll'
            ? t('resume.waitingBalance')
            : t('resume.waitingAt', { time: time(resume.resume_at), minutes })}
        </p>
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
