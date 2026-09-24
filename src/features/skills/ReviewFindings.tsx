import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { SkillReview } from '../../services/engine'
import { cn } from '../../lib/utils'
import { findingKey } from './skillsModel'

/** Lo que encontró la revisión estática, con archivo y línea. Nunca decide por el dueño. */
export default function ReviewFindings({ review, compact = false }: { review: SkillReview; compact?: boolean }) {
  const { t } = useI18n()
  const danger = review.verdict === 'danger'
  if (review.findings.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-[var(--text-subtle)]">
        <ShieldCheck size={13} aria-hidden="true" className="text-emerald-400" />
        {t('skills.review.clean')}
      </p>
    )
  }
  const shown = compact ? review.findings.slice(0, 3) : review.findings
  return (
    <div
      role="group"
      aria-label={t('skills.review.title')}
      className={cn(
        'space-y-1.5 rounded-xl border p-3 text-xs',
        danger ? 'border-red-500/40 bg-red-500/5' : 'border-amber-500/40 bg-amber-500/5',
      )}
    >
      <p className={cn('flex items-center gap-1.5 font-semibold', danger ? 'text-red-400' : 'text-amber-400')}>
        <ShieldAlert size={13} aria-hidden="true" />
        {t(danger ? 'skills.review.danger' : 'skills.review.warning', { n: review.findings.length })}
      </p>
      <ul className="space-y-1">
        {shown.map((finding, index) => (
          <li key={`${finding.file}:${finding.line ?? ''}:${index}`} className="min-w-0">
            <span className="font-mono text-[var(--text-muted)]">
              {finding.file}{finding.line ? `:${finding.line}` : ''}
            </span>{' '}
            <span className="text-[var(--text-subtle)]">· {(() => { const key = findingKey(finding.code); return key ? t(key) : finding.code })()}</span>
            <pre className="mt-0.5 truncate font-mono text-[11px] text-[var(--text-subtle)]">{finding.excerpt}</pre>
          </li>
        ))}
      </ul>
      {shown.length < review.findings.length && (
        <p className="text-[var(--text-subtle)]">{t('skills.review.more', { n: review.findings.length - shown.length })}</p>
      )}
    </div>
  )
}
