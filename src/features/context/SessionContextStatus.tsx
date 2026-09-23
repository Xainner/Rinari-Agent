import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { commandMessage, engineApi } from '../../services/engine'
import type { ContextStatus } from '../../types/protocol.generated'
import { useI18n } from '../../i18n'
import { CHECKS, formatSeconds, formatTokens, lastCompaction, lastRequest, sourceLabel } from './contextStatus'

function Line({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex items-baseline justify-between gap-3"><span className="text-[var(--text-muted)]">{label}</span><span className="text-right font-mono text-xs text-[var(--text)]">{children}</span></div>
}

/**
 * How full this session's context is and what the last compaction did, as
 * the engine persisted it. `context.status {session_id}` rebuilds it after a
 * reload, so nothing here depends on having seen the events.
 */
export default function SessionContextStatus({ sessionId }: { sessionId: string }) {
  const { t, lang } = useI18n()
  const [status, setStatus] = useState<ContextStatus | null | 'unavailable'>(null)
  const [compacting, setCompacting] = useState(false)

  const reload = useCallback(async () => {
    try {
      setStatus(await engineApi.contextStatus({ session_id: sessionId }))
    } catch {
      // An engine without `context_status_v2` answers only per model.
      setStatus('unavailable')
    }
  }, [sessionId])

  useEffect(() => { setStatus(null); void reload() }, [reload])

  if (status === 'unavailable') return null
  if (!status) return <p className="text-sm text-[var(--text-subtle)]">{t('insight.loading')}</p>

  const tokens = (n: number) => t('context.tokens', { n: formatTokens(n, lang) })
  const request = lastRequest(status)
  const compaction = lastCompaction(status)
  const source = sourceLabel(status.window_source, status.metadata_updated_at, lang)
  const usable = status.usable_input_tokens ?? status.window_tokens
  const share = request && usable ? Math.min(100, Math.round((request.input_tokens / usable) * 100)) : null

  return <div className="space-y-3 text-sm" data-testid="session-context">
    <div className="space-y-1">
      <Line label={t('context.usable')}>{tokens(usable)}</Line>
      <p className={`text-right text-[11px] ${status.window_estimated ? 'text-amber-400' : 'text-[var(--text-subtle)]'}`}>{t(source.key, source.values)}</p>
      <Line label={t('context.lastRequest')}>{request ? `${tokens(request.input_tokens)}${share !== null ? ` · ${share}%` : ''}` : '—'}</Line>
      <p className="text-right text-[11px] text-[var(--text-subtle)]">{request ? t('context.lastRequest.reported') : t('context.noRequest')}</p>
      {status.compaction_enabled === false
        ? <p className="text-[11px] text-[var(--text-subtle)]">{t('context.disabled')}</p>
        : status.compact_at_tokens !== undefined && <Line label={t('context.compactAt')}>{tokens(status.compact_at_tokens)}</Line>}
    </div>
    <div className="space-y-1 border-t border-[var(--border)] pt-2">
      <p className="font-medium text-[var(--text)]">{t('context.lastCompaction')}</p>
      {!compaction && <p className="text-xs text-[var(--text-subtle)]">{t('context.noCompaction')}</p>}
      {compaction && <>
        <Line label={t(`context.state.${compaction.status}`)}>
          {compaction.used_tokens !== undefined && compaction.after_tokens !== undefined
            ? t('context.beforeAfter', { before: formatTokens(compaction.used_tokens, lang), after: formatTokens(compaction.after_tokens, lang) })
            : ''}
          {compaction.duration_ms !== undefined && ` · ${t('context.duration', { seconds: formatSeconds(compaction.duration_ms, lang) })}`}
        </Line>
        {compaction.error && <p className="whitespace-pre-wrap text-xs text-red-400">{compaction.error}</p>}
        {Object.keys(compaction.checks).length > 0 && <div aria-label={t('context.checks')}>
          <ul className="space-y-0.5 text-xs">
            {CHECKS.flatMap((name) => {
              const outcome = compaction.checks[name]
              return outcome ? [<li key={name} className="flex justify-between gap-3">
                <span className="text-[var(--text-muted)]">{t(`context.check.${name}`)}</span>
                <span className={outcome === 'failed' ? 'text-red-400' : outcome === 'repaired' ? 'text-amber-400' : 'text-[var(--text)]'}>{t(`context.check.${outcome}`)}</span>
              </li>] : []
            })}
          </ul>
          <p className="mt-1 text-[11px] text-[var(--text-subtle)]">{t('context.checks.note')}</p>
        </div>}
      </>}
    </div>
    <button type="button" disabled={compacting} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-hover)] disabled:opacity-50" onClick={async () => {
      setCompacting(true)
      try { await engineApi.contextCompact(sessionId) } catch (e) { toast.error(commandMessage(e)) } finally { setCompacting(false); void reload() }
    }}>{compacting ? t('context.compacting') : t('context.compactNow')}</button>
  </div>
}
