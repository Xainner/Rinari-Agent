import { ShieldAlert } from 'lucide-react'
import { useI18n } from '../../i18n'
import { coverageDetailKeys } from './changeSetPresentation'

/** `text-amber-400` is the themed `--warning` token; the fixed amber-300 was
 * unreadable on the light theme's white background. */
export function CoverageWarning({ warnings }: { warnings: string[] }) {
  const { t } = useI18n()
  const details = coverageDetailKeys(warnings)
  return <div data-testid="coverage-warning" className="my-2 flex gap-2 text-xs text-amber-400">
    <ShieldAlert size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
    <div><p>{t('changes.coverage.empty')}</p><p>{t('changes.coverage.partial')}</p>
      {details.length > 0 && <details className="mt-1"><summary className="cursor-pointer">{t('changes.coverage.details')}</summary>
        <ul className="mt-1 list-inside list-disc">{details.map(key => <li key={key}>{t(key)}</li>)}</ul>
      </details>}
    </div>
  </div>
}
