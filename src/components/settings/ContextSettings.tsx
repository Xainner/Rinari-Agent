import { useEffect, useMemo, useState } from 'react'
import { engineApi, commandMessage, type ModelSummary, type ProviderSummary } from '../../services/engine'
import type { ContextSettings as Config } from '../../types/protocol.generated'
import { useI18n } from '../../i18n'
import { Switch } from '../ui/switch'
import { Select } from '../ui/select'
import { Row, Section } from './parts'

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

  const summarizers = [
    { value: '', label: t('context.summarizer.conversation') },
    ...providers.flatMap((provider) => saveable.filter((model) => model.provider_id === provider.id).map((model) => ({ value: model.id, label: model.alias, detail: provider.alias }))),
  ]
  const percent = validThreshold(draft?.threshold ?? '') ? wholeNumber(draft?.threshold ?? '') : null

  return <div className="space-y-4">
    <div>
      <h2 className="font-display text-lg font-bold text-[var(--text)]">{t('context.title')}</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{t('context.intro')}</p>
    </div>
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
    {!draft && !error && <div className="settings-card h-40 motion-safe:animate-pulse" aria-busy="true" />}

    {draft && <Section title={t('context.behavior')} desc={t('context.behavior.desc')}>
      <Row title={t('context.auto')} desc={t('context.auto.desc')} control={
        <Switch checked={draft.enabled} onCheckedChange={(enabled) => change({ enabled })} aria-label={t('context.auto')} />
      } />
      <div className="context-threshold">
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-[var(--text)]">{t('context.threshold')}</span>
          <span className="font-display text-lg font-bold text-[var(--text)]" aria-hidden="true">{percent ?? '—'} %</span>
        </label>
        <input type="range" min={50} max={95} step={1} className="context-slider" value={percent ?? 80}
          aria-label={t('context.threshold')} aria-valuetext={`${percent ?? 80} %`} aria-describedby="context-threshold-help"
          onChange={(e) => change({ threshold: e.target.value })} />
        <p id="context-threshold-help" className="mt-1 text-xs text-[var(--text-subtle)]">
          {percent !== null ? t('context.threshold.phrase', { n: percent }) : t('context.threshold.invalid')}
        </p>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--text)]">{t('context.summarizer')}</span>
        <Select value={draft.model_id ?? ''} options={summarizers} label={t('context.summarizer')} onChange={(value) => change({ model_id: value || null })} />
      </label>
    </Section>}

    {draft && <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={busy || !dirty || !valid} onClick={() => void save()} className="btn btn-primary">{busy ? t('context.saving') : t('context.save')}</button>
      {dirty && <button type="button" disabled={busy} onClick={() => { if (config) { setDraft(toDraft(config)); setSaved(false) } }} className="btn btn-ghost">{t('context.discard')}</button>}
      {dirty && <span className="text-xs text-[var(--text-subtle)]">{t('context.pending')}</span>}
      {saved && !dirty && <span role="status" className="text-sm text-[var(--text-muted)]">{t('context.saved')}</span>}
    </div>}
  </div>
}
