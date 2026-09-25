import { useI18n } from '../../i18n'
import { useUIStore } from '../../stores/ui'
import { Switch } from '../ui/switch'
import type { ModelSummary, ProviderSummary } from '../../services/engine'
import ExecutionSettings from './ExecutionSettings'

export default function AdvancedSettings({ models = [], providers = [] }: { models?: ModelSummary[]; providers?: ProviderSummary[] }) {
  const { t } = useI18n()
  const enabled = useUIStore((state) => state.showTechnicalActivityNames)
  const setEnabled = useUIStore((state) => state.setShowTechnicalActivityNames)
  return (
    <section aria-labelledby="advanced-heading" className="space-y-5">
      <div>
        <h2 id="advanced-heading" className="text-lg font-semibold text-[var(--text)]">{t('settings.nav.advanced')}</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{t('settings.advanced.description')}</p>
      </div>
      <div className="flex items-center justify-between gap-6 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
        <div>
          <div className="text-sm font-medium text-[var(--text)]">{t('settings.advanced.technicalActivity')}</div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">{t('settings.advanced.technicalActivityHint')}</div>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} aria-label={t('settings.advanced.technicalActivity')} />
      </div>
      <ExecutionSettings models={models} providers={providers} />
    </section>
  )
}
