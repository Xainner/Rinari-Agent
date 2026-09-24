import { useEffect, useMemo, useState } from 'react'
import { engineApi, commandMessage, type ModelSummary, type ProviderSummary } from '../../services/engine'
import type { ContextSettings as Config } from '../../types/protocol.generated'
import { useI18n } from '../../i18n'
import { Switch } from '../ui/switch'
import { inputClass, Row, Section } from './parts'

type Draft = { enabled: boolean; threshold: string; model_id: string | null }

const toDraft = (config: Config): Draft => ({
  enabled: config.enabled,
  threshold: String(config.compact_at_percent),
  model_id: config.model_id ?? null,
})
const wholeNumber = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN)
const validThreshold = (value: string) => { const n = wholeNumber(value); return n >= 1 && n <= 100 }

/**
 * Context settings: only how compaction behaves. What each model can hold
 * comes from its provider (refreshed from the model picker), so there is
 * nothing to set per model here; opening the screen runs no inference.
 */
export default function ContextSettings({ models, providers }: { models: ModelSummary[]; providers: ProviderSummary[] }) {
  const { t } = useI18n()
  const [config, setConfig] = useState<Config>()
  const [draft, setDraft] = useState<Draft>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const saveable = models.filter((model) => model.saved !== false)

  useEffect(() => {
    void engineApi.contextSettingsGet().then((value) => { setConfig(value); setDraft(toDraft(value)) }).catch((e) => setError(commandMessage(e)))
  }, [])

  const dirty = useMemo(() => Boolean(config && draft && JSON.stringify(toDraft(config)) !== JSON.stringify(draft)), [config, draft])
  const valid = Boolean(draft && validThreshold(draft.threshold))
  const change = (update: Partial<Draft>) => { setSaved(false); setDraft((current) => current && { ...current, ...update }) }

  async function save() {
    if (!config || !draft || !valid) return
    setBusy(true); setError('')
    try {
      const next = await engineApi.contextSettingsSet({
        enabled: draft.enabled,
        compact_at_percent: wholeNumber(draft.threshold),
        model_id: draft.model_id,
        // Not edited here: a capacity fixed from the CLI stays as it is.
        model_windows: config.model_windows ?? {},
      })
      setConfig(next); setDraft(toDraft(next)); setSaved(true)
    } catch (e) {
      setError(commandMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return <div className="max-w-3xl space-y-6">
    <h2 className="text-xl font-semibold text-[var(--text)]">{t('context.title')}</h2>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

    {draft && <Section title={t('context.behavior')} desc={t('context.behavior.desc')}>
      <Row title={t('context.auto')} desc={t('context.auto.desc')} control={
        <Switch checked={draft.enabled} onCheckedChange={(enabled) => change({ enabled })} aria-label={t('context.auto')} />
      } />
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

    {draft && <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={busy || !dirty || !valid} onClick={() => void save()} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? t('context.saving') : t('context.save')}</button>
      {dirty && <button type="button" disabled={busy} onClick={() => { if (config) { setDraft(toDraft(config)); setSaved(false) } }} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">{t('context.discard')}</button>}
      {dirty && <span className="text-xs text-[var(--text-subtle)]">{t('context.pending')}</span>}
      {saved && !dirty && <span role="status" className="text-sm text-[var(--text-muted)]">{t('context.saved')}</span>}
    </div>}
  </div>
}
