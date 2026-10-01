import { useI18n } from '../../i18n'
import { Section } from './parts'
import { version } from '../../../package.json'

/** Marcador para secciones que llegan en fases posteriores. */
export default function SoonSettings() {
  const { t } = useI18n()
  return (
    <div className="space-y-6">
      <Section title={t('settings.soon.title')} desc={t('settings.soon.body')}>
        <p className="text-sm text-[var(--text-subtle)]">Rinari Agent v{version} · Engine Protocol v1</p>
      </Section>
    </div>
  )
}
