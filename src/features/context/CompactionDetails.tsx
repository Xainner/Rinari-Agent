import { useI18n } from '../../i18n'
import { CHECKS, checksOf, formatSeconds, formatTokens, sourceLabel, type ContextSource } from './contextStatus'

const count = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const SOURCES: readonly ContextSource[] = ['manual', 'override', 'provider', 'catalog', 'fallback']

/** What one compaction did, from its `governor.compact` event: legible, not a raw dump. */
export default function CompactionDetails({ details }: { details: Record<string, unknown> | undefined }) {
  const { t, lang } = useI18n()
  if (!details) return null
  const checks = checksOf(details.checks)
  const source = SOURCES.find((known) => known === details.source)
  const label = source ? sourceLabel(source, undefined, lang) : null
  return <div className="mt-1 space-y-1 text-xs text-[var(--text-muted)]" data-testid="compaction-details">
    {count(details.used) && count(details.after) && <p>
      {t('context.beforeAfter', { before: formatTokens(details.used, lang), after: formatTokens(details.after, lang) })}
      {count(details.duration) && ` · ${t('context.duration', { seconds: formatSeconds(details.duration, lang) })}`}
    </p>}
    {count(details.window) && <p>{t('context.window')}: {t('context.tokens', { n: formatTokens(details.window, lang) })}{label && ` · ${t(label.key, label.values)}`}</p>}
    {Object.keys(checks).length > 0 && <ul aria-label={t('context.checks')} className="space-y-0.5">
      {CHECKS.flatMap((name) => {
        const outcome = checks[name]
        return outcome ? [<li key={name}>{t(`context.check.${name}`)}: <span className={outcome === 'failed' ? 'text-red-400' : outcome === 'repaired' ? 'text-amber-400' : 'text-[var(--text)]'}>{t(`context.check.${outcome}`)}</span></li>] : []
      })}
    </ul>}
    {Object.keys(checks).length > 0 && <p className="text-[11px] text-[var(--text-subtle)]">{t('context.checks.note')}</p>}
  </div>
}
