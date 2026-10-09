import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
import { engineApi, onEngineEvent } from '../../services/engine'
import type { ContextStatus, ProviderUsageSnapshot } from '../../types/protocol.generated'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover'
import { useSessionDockStore } from '../../stores/sessionDock'
import { lastCompaction, lastRequest } from './contextStatus'

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
  /** Not measured yet: what the last compaction left, until the next call. */
  estimated: boolean
}

/**
 * What the ring shows: what the provider measured for the last request of
 * this projection over the model's window. Right after a compaction nothing
 * has measured the new projection yet, and the ring used to vanish until the
 * next call; it shows what the compaction left instead, marked as estimated.
 * Nothing when neither exists (a provider that reports no usage, or a
 * session with no call yet).
 */
export function ringFigures(status: ContextStatus | null | undefined): RingFigures | null {
  const measured = lastRequest(status ?? undefined)?.input_tokens
  const compacted = lastCompaction(status ?? undefined)
  const after = compacted?.status === 'completed' && (status?.projection_revision ?? 0) > 0
    ? compacted.after_tokens
    : undefined
  const used = measured ?? after
  const total = status?.window_tokens
  if (used === undefined || !total) return null
  const ratio = Math.min(1, used / total)
  const threshold = status?.compaction_enabled === false ? undefined : status?.compact_at_percent
  return {
    used,
    total,
    ratio,
    near: threshold !== undefined && ratio * 100 >= threshold,
    estimated: measured === undefined,
  }
}

/**
 * How full this session's context is, next to the model picker. Clicking it
 * opens what the Engine knows: the window, the compaction threshold, the
 * provider's own limits when it reports them, and a way to the full detail.
 * A figure nobody measured is never shown as zero.
 */
export default function ContextRing({ sessionId, modelId, providerAlias }: { sessionId?: string | null; modelId?: string | null; providerAlias?: string | null }) {
  const { t, lang } = useI18n()
  const [status, setStatus] = useState<ContextStatus | null>(null)
  const [open, setOpen] = useState(false)
  const [usage, setUsage] = useState<ProviderUsageSnapshot | null>(null)
  const [compacting, setCompacting] = useState(false)

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

  // The provider's limits are read only when the panel opens: no polling.
  useEffect(() => {
    if (!open || !providerAlias || !engineApi.providerUsage) return
    let alive = true
    void engineApi.providerUsage(providerAlias).then((next) => { if (alive) setUsage(next) }).catch(() => { if (alive) setUsage(null) })
    return () => { alive = false }
  }, [open, providerAlias])

  const figures = ringFigures(status)
  if (!figures) return null
  const count = (value: number) => new Intl.NumberFormat(lang).format(value)
  const compact = (value: number) => new Intl.NumberFormat(lang, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
  const percent = new Intl.NumberFormat(lang, { style: 'percent' }).format(figures.ratio)
  const radius = 6
  const circumference = 2 * Math.PI * radius
  const threshold = status?.compaction_enabled === false ? null : status?.compact_at_percent ?? null
  const compaction = lastCompaction(status ?? undefined)
  const windows = usage && ['available', 'partial', 'stale'].includes(usage.status) ? usage.windows.filter(window => window.used_percent !== null || window.remaining_percent !== null) : []
  const balances = usage && ['available', 'partial', 'stale'].includes(usage.status) ? usage.balances : []
  const when = (value: string) => new Date(value).toLocaleString(lang, { weekday: 'short', hour: '2-digit', minute: '2-digit' })

  async function compactNow() {
    if (!sessionId) return
    setCompacting(true)
    try { await engineApi.contextCompact(sessionId) } catch { /* the turn timeline reports the failure */ } finally { setCompacting(false); setOpen(false) }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="context-ring-button" aria-label={t('context.open')} title={t('context.open')}>
          <span
            className="context-ring"
            role="img"
            aria-label={t(figures.estimated ? 'context.ringEstimated' : 'context.ring', { used: count(figures.used), total: count(figures.total), percent })}
            data-near={figures.near || undefined}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r={radius} fill="none" stroke="var(--line-2)" strokeWidth="2" />
              <circle
                cx="8" cy="8" r={radius} fill="none" strokeWidth="2" strokeLinecap="round"
                stroke={figures.near ? 'var(--warning)' : 'var(--violet-400)'}
                strokeDasharray={`${circumference * figures.ratio} ${circumference}`}
                transform="rotate(-90 8 8)"
                style={{ transition: 'stroke-dasharray 0.6s var(--ease-out)' }}
              />
            </svg>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="context-pop w-[22rem] p-4">
        <div className="flex gap-4">
          <div className="context-pop-ring" style={{ ['--p' as string]: `${Math.round(figures.ratio * 100)}%` }} data-near={figures.near || undefined}>
            <span><b className="font-display">{percent}</b><small>{t('context.label')}</small></span>
          </div>
          <div className="min-w-0 flex-1 space-y-1.5 text-[12.5px] text-[var(--text-muted)]">
            <p className="text-[13px] text-[var(--text)]"><b className="tabular-nums">{figures.estimated ? '≈ ' : ''}{compact(figures.used)}</b> {t('context.ofTokens', { total: compact(figures.total) })}</p>
            {figures.estimated && <p>{t('context.ringAfterCompaction')}</p>}
            <p>{threshold === null ? t('context.autoOff') : t('context.autoAt', { n: threshold })}</p>
            {compaction?.at && compaction.status === 'completed' && <p>{t('context.lastCompacted', { date: when(compaction.at) })}</p>}
          </div>
        </div>
        {(windows.length > 0 || balances.length > 0) && <div className="mt-4 space-y-2.5 border-t border-[var(--line-1)] pt-3">
          <p className="text-[12px] font-semibold text-[var(--text)]">{t('context.providerLimits', { provider: providerAlias ?? '' })} <span className="font-normal text-[var(--text-subtle)]">· {t('context.reportedByProvider')}</span></p>
          {windows.map(window => {
            const used = window.used_percent ?? (window.remaining_percent === null ? null : 100 - window.remaining_percent)
            return <div key={window.id}>
              <div className="mb-1 flex justify-between gap-2 text-[11.5px] text-[var(--text-muted)]">
                <span>{window.id === 'rolling' ? t('providers.windowRolling') : window.id === 'weekly' ? t('providers.windowWeekly') : window.id === 'monthly' ? t('providers.windowMonthly') : window.label}</span>
                <span className="tabular-nums">{used === null ? '—' : t('context.usedPercent', { n: Math.round(used) })}{window.resets_at ? ` · ${t('context.resets', { date: when(window.resets_at) })}` : ''}</span>
              </div>
              {used !== null && <div className="context-limit"><i style={{ width: `${Math.min(100, Math.max(0, used))}%` }} data-high={used >= 85 || undefined} /></div>}
            </div>
          })}
          {balances.map((balance, index) => <p key={index} className="flex justify-between text-[11.5px] text-[var(--text-muted)]"><span>{balance.label}</span><span className="font-mono">{balance.unlimited ? t('providers.keyUnlimited') : `${balance.remaining ?? '—'} ${balance.currency}`}</span></p>)}
        </div>}
        <div className="mt-4 flex flex-wrap gap-2">
          {sessionId && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setOpen(false); useSessionDockStore.getState().reveal(sessionId, 'workspace', { workspaceTab: 'insight' }) }}>{t('context.details')}</button>}
          {sessionId && <button type="button" className="btn btn-quiet btn-sm" disabled={compacting} onClick={() => void compactNow()}>{t('context.compactNow')}</button>}
        </div>
      </PopoverContent>
    </Popover>
  )
}
