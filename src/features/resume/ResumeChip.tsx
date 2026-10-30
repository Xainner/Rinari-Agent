import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'
import type { SessionResume } from '../../types/protocol.generated'
import { useResumeStore } from './resumeStore'

/** The resume of a conversation while it waits to continue by itself (#24); null otherwise. */
export function useWaitingResume(sessionId: string | null | undefined): SessionResume | null {
  return useResumeStore((state) => {
    const resume = sessionId ? state.bySession[sessionId] : null
    return resume && resume.state === 'waiting' ? resume : null
  })
}

/**
 * The time left until `resumeAt`, ticking every second during the last hour
 * and every 30 s before that. `null` while there is nothing to count.
 */
export function useCountdown(resumeAt: string | null | undefined): number | null {
  const target = resumeAt ? Date.parse(resumeAt) : Number.NaN
  const [now, setNow] = useState(() => Date.now())
  const valid = Number.isFinite(target)
  const left = valid ? Math.max(0, target - now) : null
  const fast = left !== null && left < 3_600_000
  useEffect(() => {
    if (!valid) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), fast ? 1000 : 30_000)
    return () => window.clearInterval(timer)
  }, [valid, fast, target])
  return left
}

/** «12:34» in the last hour, «1 h 05 min» before that. */
export function formatLeft(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')} min`
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export const clockTime = (iso: string, lang: string) => new Date(iso).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })

/**
 * «Reanuda 17:40» while a conversation waits to continue after a provider
 * limit (#24): in the title bar with the countdown, and in the sidebar as a
 * compact clock. Waiting for balance (`poll`) has no time to show.
 */
export function ResumeChip({ sessionId, compact = false, className }: { sessionId: string | null | undefined; compact?: boolean; className?: string }) {
  const { t, lang } = useI18n()
  const resume = useWaitingResume(sessionId)
  if (!resume) return null
  const label = resume.mode === 'poll' ? t('resume.chipBalance') : t('resume.chip', { time: clockTime(resume.resume_at, lang) })
  return (
    <span
      role="status"
      className={cn('r-chip resume-chip', compact && 'is-compact', className)}
      data-tone="accent"
      data-testid="resume-chip"
      title={label}
      aria-label={label}
    >
      <Clock size={compact ? 10 : 11} aria-hidden="true" />
      {!(compact && resume.mode === 'poll') && <span aria-hidden="true">{compact ? clockTime(resume.resume_at, lang) : label}</span>}
      {!compact && resume.mode !== 'poll' && <ResumeLeft resumeAt={resume.resume_at} />}
    </span>
  )
}

function ResumeLeft({ resumeAt }: { resumeAt: string }) {
  const left = useCountdown(resumeAt)
  if (left === null) return null
  return <span className="resume-chip-left" aria-hidden="true">{formatLeft(left)}</span>
}
