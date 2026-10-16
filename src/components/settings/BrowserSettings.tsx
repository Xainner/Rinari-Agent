import { Globe } from 'lucide-react'
import { useI18n } from '../../i18n'
import { SEARCH_ENGINES, useBrowserPrefs, type SearchEngine } from '../../stores/browserPrefs'
import { inputClass, Row, Section } from './parts'

/**
 * Ajustes → Navegador (plan 0.4.0 #46): con qué buscador se busca lo que
 * escribes en la barra o en la página de inicio. DuckDuckGo por defecto
 * (decisión del dueño, 2026-10-12).
 */
export default function BrowserSettings() {
  const { t } = useI18n()
  const engine = useBrowserPrefs((state) => state.engine)
  const setEngine = useBrowserPrefs((state) => state.setEngine)

  return (
    <section className="space-y-6" data-testid="browser-settings">
      <div>
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-[var(--text)]">
          <Globe size={17} aria-hidden="true" /> {t('settings.nav.browser')}
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{t('settings.browser.desc')}</p>
      </div>
      <Section title={t('settings.browser.search')}>
        <Row
          title={t('settings.browser.engine')}
          desc={t('settings.browser.engineHint')}
          control={
            <select
              className={inputClass}
              aria-label={t('settings.browser.engine')}
              data-testid="browser-search-engine"
              value={engine}
              onChange={(event) => setEngine(event.target.value as SearchEngine)}
            >
              {(Object.keys(SEARCH_ENGINES) as SearchEngine[]).map((id) => (
                <option key={id} value={id}>{SEARCH_ENGINES[id].label}</option>
              ))}
            </select>
          }
        />
      </Section>
    </section>
  )
}
