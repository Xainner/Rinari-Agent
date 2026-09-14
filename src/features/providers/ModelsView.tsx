import { useI18n } from '../../i18n'
import type { ProviderSummary } from '../../services/engine'
import { Section } from '../../components/settings/parts'
import ProviderLogo from '../../components/ProviderLogo'
import ModelCatalog from './ModelCatalog'

/** Ajustes > Modelos: catálogo por proveedor (descubrir, guardar con alias, usar). */
export default function ModelsView({
  providers,
  onChanged,
  onAddProvider,
}: {
  providers: ProviderSummary[]
  onChanged: () => void
  onAddProvider: () => void
}) {
  const { t } = useI18n()

  if (providers.length === 0) {
    return (
      <div className="space-y-4">
        <Section title={t('providers.models')}>
          <p className="text-sm text-[var(--text-subtle)]">{t('wizard.welcome')}</p>
          <button
            type="button"
            onClick={onAddProvider}
            className="rounded-xl bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-white transition-all hover:brightness-110"
          >
            {t('providers.add')}
          </button>
        </Section>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {providers.map((provider) => (
        <Section
          key={provider.id}
          title={
            <span className="flex items-center gap-2.5">
              <ProviderLogo alias={provider.alias} endpoint={provider.endpoint} size={22} />
              <span>{provider.alias}</span>
            </span>
          }
        >
          <ModelCatalog providerAlias={provider.alias} onChanged={onChanged} />
        </Section>
      ))}
    </div>
  )
}
