import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { engineApi, commandMessage } from '../../services/engine'
import type { ProviderUsageSnapshot } from '../../types/protocol.generated'
import { useI18n } from '../../i18n'
import { platform } from '../../platform'

export default function ProviderUsagePanel({ providerAlias, compact = false }: { providerAlias: string; compact?: boolean }) {
  const { t } = useI18n()
  const [snapshot, setSnapshot] = useState<ProviderUsageSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const inFlight = useRef(false)
  const refresh = useCallback(async (explicit = false) => {
    if (inFlight.current) return
    const version = generation.current
    inFlight.current = true; setBusy(true)
    try {
      const next = await engineApi.providerUsage(providerAlias, explicit)
      if (version === generation.current) { setSnapshot(next); setError('') }
    } catch (err) { if (version === generation.current) setError(commandMessage(err)) }
    finally { if (version === generation.current) { setBusy(false); inFlight.current = false } }
  }, [providerAlias])
  useEffect(() => {
    generation.current++; inFlight.current = false; setSnapshot(null)
    const visibleRefresh = () => { if (document.visibilityState !== 'hidden') void refresh() }
    visibleRefresh()
    const timer = compact ? undefined : setInterval(visibleRefresh, 60_000)
    if (!compact) document.addEventListener('visibilitychange', visibleRefresh)
    return () => { generation.current++; clearInterval(timer); document.removeEventListener('visibilitychange', visibleRefresh) }
  }, [refresh, compact])
  const date = (value: string) => new Date(value).toLocaleString()
  if (compact) return snapshot?.fetched_at ? <p className="text-xs text-[var(--text-muted)]" title={t('providers.updatedAt', { date: date(snapshot.fetched_at) })}>
    {snapshot.windows.map(window => `${window.id === 'rolling' ? '5h' : window.id === 'weekly' ? t('providers.windowWeekly') : window.id === 'monthly' ? t('providers.windowMonthly') : window.label}: ${window.remaining_percent === null ? '—' : `${window.remaining_percent}%`}`).join(' · ')}
    {snapshot.windows.length > 0 && ` ${t('providers.remaining')}`}
    {snapshot.balances.filter(balance => balance.scope === 'account').map(balance => `${balance.remaining ?? '—'} ${balance.currency}`).join(' · ')}
    {snapshot.status !== 'available' && ` · ${t(`providers.usageState.${snapshot.status}`)}`}
  </p> : null
  return <div className="space-y-4" aria-busy={busy}>
    <div className="flex items-start justify-between gap-3">
      <div><h3 className="text-sm font-semibold">{t('providers.accountUsage')}</h3><p className="mt-1 text-xs text-[var(--text-muted)]">{t('providers.accountUsageHint')}</p></div>
      <button type="button" disabled={busy} onClick={() => void refresh(true)} className="shrink-0 rounded-lg border border-[var(--border)] p-2 hover:bg-[var(--bg-hover)] disabled:opacity-40" aria-label={t('providers.refreshUsage')}><RefreshCw size={15} className={busy ? 'animate-spin motion-reduce:animate-none' : ''} /></button>
    </div>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    {!snapshot && busy && <p role="status" className="text-sm text-[var(--text-muted)]">{t('providers.loading')}</p>}
    {snapshot && <>
      <p role="status" className="text-xs text-[var(--text-muted)]">{t(`providers.usageState.${snapshot.status}`)}</p>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
        {snapshot.windows.map(window => <div key={window.id} className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3">
          <div className="break-words text-xs text-[var(--text-muted)]">{window.id === 'rolling' ? t('providers.windowRolling') : window.id === 'weekly' ? t('providers.windowWeekly') : window.id === 'monthly' ? t('providers.windowMonthly') : window.label}</div>
          <p className="my-2 text-xl font-semibold tabular-nums">{window.remaining_percent === null ? '—' : `${window.remaining_percent.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`} <span className="text-xs font-normal text-[var(--text-muted)]">{t('providers.remaining')}</span></p>
          {window.remaining_percent !== null && <progress aria-label={`${window.label}: ${t('providers.remaining')}`} className="block h-1.5 w-full overflow-hidden rounded-full accent-[var(--accent)]" max={100} value={window.remaining_percent} />}
          {window.duration_seconds !== null && window.id !== 'rolling' && <p className="mt-2 text-xs text-[var(--text-muted)]">{t('providers.windowHours', { n: window.duration_seconds / 3600 })}</p>}
          <p className="mt-2 text-xs text-[var(--text-subtle)]">{window.resets_at ? t('providers.resetsAt', { date: date(window.resets_at) }) : t('providers.resetUnknown')}</p>
        </div>)}
      </div>
      {snapshot.balances.map((balance, index) => <div key={`${balance.scope}-${balance.currency}-${index}`} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-[var(--border)] p-3">
        <span className="text-sm">{balance.label} <span className="text-xs text-[var(--text-muted)]">({balance.scope})</span></span>
        <span className="font-mono text-lg">{balance.unlimited ? t('providers.keyUnlimited') : balance.remaining ?? '—'} {!balance.unlimited && balance.currency}</span>
        {(balance.granted != null || balance.topped_up != null) && <p className="w-full text-xs text-[var(--text-muted)]">{t('providers.balanceSources', { granted: balance.granted ?? '—', topped: balance.topped_up ?? '—' })}</p>}
      </div>)}
      {snapshot.detail && <p className="text-xs text-[var(--text-muted)]">{snapshot.detail}</p>}
      {snapshot.fetched_at && <p className="text-xs text-[var(--text-subtle)]">{t('providers.updatedAt', { date: date(snapshot.fetched_at) })}</p>}
      {snapshot.source && <p className="break-all text-[11px] text-[var(--text-subtle)]">{snapshot.source}</p>}
      {snapshot.dashboard_url && <button className="text-xs text-[var(--accent)] underline" onClick={() => void platform().opener.openUrl(snapshot.dashboard_url!)}>{t('providers.openDashboard')}</button>}
      {snapshot.local_usage && <section className="space-y-2 border-t border-[var(--border)] pt-3">
        <h3 className="text-sm font-semibold">{t('providers.localUsage')}</h3>
        <p className="text-xs text-[var(--text-muted)]">{t('providers.localUsageHint')}</p>
        <p className="text-sm tabular-nums">{t('providers.localUsageCounts', { calls: snapshot.local_usage.calls, input: snapshot.local_usage.input_tokens ?? '—', output: snapshot.local_usage.output_tokens ?? '—' })}</p>
      </section>}
    </>}
  </div>
}
