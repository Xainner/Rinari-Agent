import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useI18n, type I18nKey } from '../../i18n'
import { providerBrand } from '../../lib/providerBrand'
import ProviderLogo from '../../components/ProviderLogo'
import type { ProviderPreset } from './presets'
import { PRODUCT_GROUPS, productDescription, productGroup } from './productInfo'
import { SearchClearButton } from '../../components/ui/SearchField'

/**
 * Paso 1 de «Agregar proveedor» (#97 C), el mismo en el asistente inicial y en
 * Ajustes: una cuadrícula con logo, agrupada en suscripciones, por API y
 * local, con búsqueda y una línea de qué es cada uno.
 */
export default function ProviderTypePicker({ presets, onPick }: { presets: ProviderPreset[]; onPick: (preset: ProviderPreset) => void }) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const name = (preset: ProviderPreset) => preset.name ?? t(preset.nameKey)
  const line = (preset: ProviderPreset) => {
    const described = productDescription(preset)
    if (described) return t(described)
    return preset.endpoint ? preset.endpoint.replace(/^https?:\/\//, '') : t(preset.descKey)
  }
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const visible = needle
      ? presets.filter((preset) => `${preset.id} ${name(preset)} ${line(preset)}`.toLowerCase().includes(needle))
      : presets
    return PRODUCT_GROUPS
      .map((group) => ({ group, items: visible.filter((preset) => productGroup(preset) === group) }))
      .filter((entry) => entry.items.length > 0)
    // `name` y `line` dependen solo del idioma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presets, query, t])

  return (
    <div className="provider-picker" data-testid="provider-type-picker">
      <label className="provider-picker-search">
        <Search size={14} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('providers.pick.search')}
          aria-label={t('providers.pick.search')}
          autoComplete="off"
          spellCheck={false}
        />
        <SearchClearButton value={query} onClear={() => setQuery('')} />
      </label>
      {groups.length === 0 && <p className="provider-picker-empty">{t('providers.pick.none', { query: query.trim() })}</p>}
      {groups.map(({ group, items }) => (
        <section key={group} className="provider-picker-group" aria-label={t(`providers.group.${group}` as I18nKey)}>
          <h3 className="provider-picker-title">{t(`providers.group.${group}` as I18nKey)}</h3>
          <div className="provider-picker-grid">
            {items.map((preset) => (
              <button key={preset.id} type="button" className="provider-picker-card" data-preset={preset.id} onClick={() => onPick(preset)}>
                <span className="provider-picker-logo">
                  <ProviderLogo brand={providerBrand(preset.brand)} size={26} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="provider-picker-name">
                    {name(preset)}
                    {preset.experimental && <span className="r-chip provider-chip" data-tone="warning" title={t('providers.experimental')}>{t('providers.experimentalShort')}</span>}
                  </span>
                  <span className="provider-picker-line">{line(preset)}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
