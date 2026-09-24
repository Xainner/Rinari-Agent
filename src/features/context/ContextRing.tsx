import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
import { engineApi, onEngineEvent } from '../../services/engine'
import type { ContextStatus } from '../../types/protocol.generated'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip'
import { lastRequest } from './contextStatus'

/** Events after which the session's context may have grown or shrunk. */
const REFRESH_EVENTS = new Set(['usage.updated', 'turn.completed', 'turn.failed', 'turn.cancelled', 'governor.compact'])
/** Bursts of `usage.updated` collapse into one `context.status`. */
const SETTLE_MS = 600

export interface RingFigures {
  used: number
  total: number
  ratio: number
  /** At or past the compaction threshold, when compaction is on. */
  near: boolean
}

/**
 * What the ring shows: what the provider measured for the last request of
 * this projection over the model's window. Nothing when it has not measured
 * it (a provider that reports no usage, or a session with no call yet).
 */
export function ringFigures(status: ContextStatus | null | undefined): RingFigures | null {
  const used = lastRequest(status ?? undefined)?.input_tokens
  const total = status?.window_tokens
  if (used === undefined || !total) return null
  const ratio = Math.min(1, used / total)
  const threshold = status?.compaction_enabled === false ? undefined : status?.compact_at_percent
  return { used, total, ratio, near: threshold !== undefined && ratio * 100 >= threshold }
}

/** How full this session's context is, next to the model picker. */
export default function ContextRing({ sessionId, modelId }: { sessionId?: string | null; modelId?: string | null }) {
  const { t, lang } = useI18n()
  const [status, setStatus] = useState<ContextStatus | null>(null)

  useEffect(() => {
    setStatus(null)
    if (!sessionId) return
    let alive = true
    let timer: number | undefined
    let stop: (() => void) | undefined
    const load = () => {
      void engineApi.contextStatus({ session_id: sessionId })
        .then((next) => { if (alive) setStatus(next) })
        .catch(() => { if (alive) setStatus(null) })
    }
    load()
    void onEngineEvent((event) => {
      if (!REFRESH_EVENTS.has(event.event)) return
      const owner = event.payload?.session_id
      if (typeof owner === 'string' && owner !== sessionId) return
      window.clearTimeout(timer)
      timer = window.setTimeout(load, SETTLE_MS)
    }).then((unsubscribe) => { if (alive) stop = unsubscribe; else unsubscribe() })
    return () => { alive = false; window.clearTimeout(timer); stop?.() }
  }, [sessionId, modelId])

  const figures = ringFigures(status)
  if (!figures) return null
  const count = (value: number) => new Intl.NumberFormat(lang).format(value)
  const percent = new Intl.NumberFormat(lang, { style: 'percent' }).format(figures.ratio)
  const radius = 6
  const circumference = 2 * Math.PI * radius
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="context-ring"
            tabIndex={0}
            role="img"
            aria-label={t('context.ring', { used: count(figures.used), total: count(figures.total), percent })}
            data-near={figures.near || undefined}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r={radius} fill="none" stroke="var(--border-strong)" strokeWidth="2" />
              <circle
                cx="8" cy="8" r={radius} fill="none" strokeWidth="2" strokeLinecap="round"
                stroke={figures.near ? 'var(--warning)' : 'var(--accent-2)'}
                strokeDasharray={`${circumference * figures.ratio} ${circumference}`}
                transform="rotate(-90 8 8)"
              />
            </svg>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <span className="tabular-nums">{count(figures.used)} / {count(figures.total)}</span>
          <span className="ml-1.5 text-[var(--text-subtle)]">{percent}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
