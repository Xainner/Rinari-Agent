import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { engineApi, commandMessage, type ModelSummary, type ProviderSummary } from '../../services/engine'
import type { ContextSettings as Config } from '../../types/protocol.generated'
import { useI18n } from '../../i18n'
import { Switch } from '../ui/switch'
import { inputClass, Row, Section } from './parts'
import { formatTokens, sourceLabel, type ModelContext } from '../../features/context/contextStatus'

type Draft = { enabled: boolean; threshold: string; model_id: string | null; windows: Record<string, string> }

const toDraft = (config: Config): Draft => ({
  enabled: config.enabled,
  threshold: String(config.compact_at_percent),
  model_id: config.model_id ?? null,
  windows: Object.fromEntries(Object.entries(config.model_windows ?? {}).map(([id, value]) => [id, String(value)])),
})
const wholeNumber = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN)
const validThreshold = (value: string) => { const n = wholeNumber(value); return n >= 1 && n <= 100 }
const validWindow = (value: string) => wholeNumber(value) >= 1

/**
 * Context settings: what compaction does, what each model can hold, and the
 * overrides. Capacities come from `context.models` in one call and are shown
 * with their source; opening the screen runs no inference.
 */
export default function ContextSettings({ models, providers }: { models: ModelSummary[]; providers: ProviderSummary[] }) {
  const { t, lang } = useI18n()
  const [config, setConfig] = useState<Config>()
  const [draft, setDraft] = useState<Draft>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [capacity, setCapacity] = useState<ModelContext[] | 'loading' | { error: string }>('loading')
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState('')
  const saveable = models.filter((model) => model.saved !== false)

  const loadCapacity = useCallback(async (refresh = false) => {
    try {
      setCapacity((await engineApi.contextModels(refresh)).models)
    } catch (e) {
      setCapacity({ error: commandMessage(e) })
    }
  }, [])

  useEffect(() => {
    void engineApi.contextSettingsGet().then((value) => { setConfig(value); setDraft(toDraft(value)) }).catch((e) => setError(commandMessage(e)))
    void loadCapacity()
  }, [loadCapacity])

  const dirty = useMemo(() => Boolean(config && draft && JSON.stringify(toDraft(config)) !== JSON.stringify(draft)), [config, draft])
  const invalidWindows = draft ? Object.entries(draft.windows).filter(([, value]) => value !== '' && !validWindow(value)).map(([id]) => id) : []
  const valid = Boolean(draft && validThreshold(draft.threshold) && invalidWindows.length === 0)
  const change = (update: Partial<Draft>) => { setSaved(false); setDraft((current) => current && { ...current, ...update }) }
  const setWindow = (id: string, value: string) => {
    if (!draft) return
    const windows = { ...draft.windows }
    if (value === '') delete windows[id]; else windows[id] = value
    change({ windows })
  }

  async function save() {
    if (!draft || !valid) return
    setBusy(true); setError('')
    try {
      const next = await engineApi.contextSettingsSet({
        enabled: draft.enabled,
        compact_at_percent: wholeNumber(draft.threshold),
        model_id: draft.model_id,
        model_windows: Object.fromEntries(Object.entries(draft.windows).map(([id, value]) => [id, wholeNumber(value)])),
      })
      setConfig(next); setDraft(toDraft(next)); setSaved(true)
      void loadCapacity()
    } catch (e) {
      setError(commandMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const rows = Array.isArray(capacity)
    ? capacity.filter((row) => !filter.trim() || `${row.model_alias ?? ''} ${row.provider_alias ?? ''}`.toLowerCase().includes(filter.trim().toLowerCase()))
    : []
  const detected = (id: string) => (Array.isArray(capacity) ? capacity.find((row) => row.model_id === id) : undefined)

  return <div className="max-w-3xl space-y-6">
    <h2 className="text-xl font-semibold text-[var(--text)]">{t('context.title')}</h2>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

    {draft && <Section title={t('context.behavior')} desc={t('context.behavior.desc')}>
      <Row title={t('context.auto')} desc={t('context.auto.desc')} control={
        <Switch checked={draft.enabled} onCheckedChange={(enabled) => change({ enabled })} aria-label={t('context.auto')} />
      } />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--text)]">{t('context.summarizer')}</span>
        <select className={inputClass} value={draft.model_id ?? ''} onChange={(e) => change({ model_id: e.target.value || null })}>
          <option value="">{t('context.summarizer.conversation')}</option>
          {providers.map((provider) => <optgroup key={provider.id} label={provider.alias}>
            {saveable.filter((model) => model.provider_id === provider.id).map((model) => <option key={model.id} value={model.id}>{model.alias}</option>)}
          </optgroup>)}
        </select>
      </label>
    </Section>}

    <Section title={t('context.models')} desc={t('context.models.desc')}>
      <div className="flex flex-wrap items-center gap-2">
        {Array.isArray(capacity) && capacity.length > 6 && <input className={`${inputClass} max-w-xs`} type="search" aria-label={t('context.filter')} placeholder={t('context.filter')} value={filter} onChange={(e) => setFilter(e.target.value)} />}
        <button type="button" disabled={refreshing || capacity === 'loading'} onClick={async () => { setRefreshing(true); await loadCapacity(true); setRefreshing(false) }}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-hover)] disabled:opacity-50">
          <RefreshCw size={14} aria-hidden="true" className={refreshing ? 'animate-spin motion-reduce:animate-none' : ''} />{refreshing ? t('context.refreshing') : t('context.refresh')}
        </button>
      </div>
      {capacity === 'loading' && <p role="status" className="text-sm text-[var(--text-subtle)]">{t('context.loading')}</p>}
      {!Array.isArray(capacity) && capacity !== 'loading' && <p role="alert" className="text-sm text-red-400">{capacity.error}</p>}
      {Array.isArray(capacity) && capacity.length === 0 && <p className="text-sm text-[var(--text-subtle)]">{t('context.empty')}</p>}
      {Array.isArray(capacity) && capacity.length > 0 && rows.length === 0 && <p className="text-sm text-[var(--text-subtle)]">{t('context.noMatch')}</p>}
      {rows.length > 0 && <ul className="divide-y divide-[var(--border)] text-sm" aria-label={t('context.models')}>
        {rows.map((row) => {
          const label = sourceLabel(row.window_source, row.metadata_updated_at, lang)
          return <li key={row.model_id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2" data-testid={`capacity-${row.model_id}`}>
            <span className="min-w-0"><span className="font-medium text-[var(--text)]">{row.model_alias ?? row.model_id}</span>{row.provider_alias && <span className="ml-2 text-xs text-[var(--text-subtle)]">{row.provider_alias}</span>}</span>
            {row.error
              ? <span className="text-xs text-red-400">{t('context.modelError', { error: row.error })}</span>
              : <span className="text-right"><span className="font-mono text-xs text-[var(--text)]">{t('context.tokens', { n: formatTokens(row.window_tokens ?? 0, lang) })}</span>
                <span className={`ml-2 text-xs ${row.window_estimated ? 'text-amber-400' : 'text-[var(--text-muted)]'}`}>{t(label.key, label.values)}</span></span>}
          </li>
        })}
      </ul>}
    </Section>

    {draft && <details className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5" open={Object.keys(draft.windows).length > 0 || !valid}>
      <summary className="cursor-pointer font-display text-lg font-bold text-[var(--text)]">{t('context.advanced')}</summary>
      <div className="mt-4 space-y-4">
        <div className="max-w-xs">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[var(--text)]">{t('context.threshold')}</span>
            <input className={inputClass} type="number" min={1} max={100} inputMode="numeric" value={draft.threshold} aria-invalid={!validThreshold(draft.threshold)}
              aria-describedby="context-threshold-help" onChange={(e) => change({ threshold: e.target.value })} />
          </label>
          <p id="context-threshold-help" className={`mt-1 text-xs ${validThreshold(draft.threshold) ? 'text-[var(--text-subtle)]' : 'text-red-400'}`}>
            {validThreshold(draft.threshold) ? t('context.threshold.desc') : t('context.threshold.invalid')}
          </p>
        </div>
        {saveable.map((model) => {
          const value = draft.windows[model.id] ?? ''
          const automatic = detected(model.id)
          const bad = invalidWindows.includes(model.id)
          const auto = automatic && automatic.window_source !== 'manual' && automatic.window_tokens
            ? `${t('context.manual.placeholder')} · ${formatTokens(automatic.window_tokens, lang)}`
            : t('context.manual.placeholder')
          return <div key={model.id} className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <label className="block">
                <span className="mb-1.5 block text-sm text-[var(--text)]">{t('context.manual', { model: model.alias })}</span>
                <input className={inputClass} type="number" min={1} inputMode="numeric" placeholder={auto} value={value} aria-invalid={bad}
                  aria-describedby={bad ? `context-window-${model.id}` : undefined} onChange={(e) => setWindow(model.id, e.target.value)} />
              </label>
              {bad && <p id={`context-window-${model.id}`} className="mt-1 text-xs text-red-400">{t('context.manual.invalid')}</p>}
            </div>
            {value !== '' && <button type="button" className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-hover)]" onClick={() => setWindow(model.id, '')}>{t('context.automatic')}</button>}
          </div>
        })}
      </div>
    </details>}

    {draft && <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={busy || !dirty || !valid} onClick={() => void save()} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? t('context.saving') : t('context.save')}</button>
      {dirty && <button type="button" disabled={busy} onClick={() => { if (config) { setDraft(toDraft(config)); setSaved(false) } }} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">{t('context.discard')}</button>}
      {dirty && <span className="text-xs text-[var(--text-subtle)]">{t('context.pending')}</span>}
      {saved && !dirty && <span role="status" className="text-sm text-[var(--text-muted)]">{t('context.saved')}</span>}
    </div>}
  </div>
}
