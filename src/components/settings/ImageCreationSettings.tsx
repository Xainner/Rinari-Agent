import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, LoaderCircle, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { engineApi, commandMessage } from '../../services/engine'
import type { ImageConnector, ImageCreationSettings as Config } from '../../types/protocol.generated'
import { useI18n } from '../../i18n'
import { inputClass, Section } from './parts'

type Kind = ImageConnector['kind']

/** Un id corto y libre a partir del tipo: `chatgpt`, `chatgpt-2`, `openai`… */
function nextId(kind: Kind, taken: ReadonlyArray<ImageConnector>): string {
  const ids = new Set(taken.map((item) => item.id))
  if (!ids.has(kind)) return kind
  for (let n = 2; ; n += 1) if (!ids.has(`${kind}-${n}`)) return `${kind}-${n}`
}

/**
 * Ajustes → Visión e imágenes → Creación de imágenes (plan 0.4.0 #28): con
 * qué servicio crea y edita imágenes Rinari. Sin conector, Rinari lo dice y
 * no improvisa (decisión del dueño). Las claves nunca vuelven del Engine:
 * solo `has_key`.
 */
export default function ImageCreationSettings() {
  const { t } = useI18n()
  const [config, setConfig] = useState<Config>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState<Kind | null>(null)
  const [draft, setDraft] = useState({ provider_id: '', api_key: '', model: '' })
  const [tests, setTests] = useState<Record<string, { ok: boolean; message?: string; running?: boolean }>>({})
  const [budget, setBudget] = useState('')

  useEffect(() => {
    void engineApi.imagesSettingsGet().then((value) => {
      setConfig(value)
      setBudget(value.session_budget_usd == null ? '' : String(value.session_budget_usd))
    }).catch((e) => setError(commandMessage(e)))
  }, [])

  const save = async (next: Partial<Config> & { connectors?: Array<ImageConnector & { api_key?: string }> }) => {
    if (!config) return false
    setBusy(true)
    setError('')
    try {
      const saved = await engineApi.imagesSettingsSet({
        connectors: next.connectors ?? config.connectors,
        default_connector: next.default_connector === undefined ? config.default_connector : next.default_connector,
        edit_connector: next.edit_connector === undefined ? config.edit_connector : next.edit_connector,
        session_budget_usd: next.session_budget_usd === undefined ? config.session_budget_usd : next.session_budget_usd,
      })
      setConfig(saved)
      toast.success(t('images.saved'))
      return true
    } catch (e) {
      setError(commandMessage(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  if (!config) return error ? <p role="alert" className="text-sm text-[var(--danger)]">{error}</p> : null

  // El generador no tipa objetos anidados sin nombre: aquí sí se sabe su forma.
  const subscriptions = (config.subscriptions ?? []) as Array<{ provider_id: string; name: string }>
  const label = (kind: Kind) => (kind === 'chatgpt' ? t('images.kind.chatgpt') : t('images.kind.openai'))

  const add = async () => {
    if (!adding) return
    const id = nextId(adding, config.connectors)
    const connector: ImageConnector & { api_key?: string } = adding === 'chatgpt'
      ? { id, kind: 'chatgpt', label: label('chatgpt'), provider_id: draft.provider_id || subscriptions[0]?.provider_id, model: draft.model }
      : { id, kind: 'openai', label: label('openai'), api_key: draft.api_key.trim(), model: draft.model || 'gpt-image-1' }
    const connectors = [...config.connectors, connector]
    // El primero queda como el de por defecto: si no, las herramientas no tendrían con qué.
    const ok = await save({ connectors, default_connector: config.default_connector ?? id })
    if (ok) {
      setAdding(null)
      setDraft({ provider_id: '', api_key: '', model: '' })
    }
  }

  const remove = (id: string) => void save({
    connectors: config.connectors.filter((item) => item.id !== id),
    default_connector: config.default_connector === id ? null : config.default_connector,
    edit_connector: config.edit_connector === id ? null : config.edit_connector,
  })

  const test = async (id: string) => {
    setTests((current) => ({ ...current, [id]: { ok: false, running: true } }))
    try {
      const result = await engineApi.imagesConnectorTest(id)
      setTests((current) => ({ ...current, [id]: { ok: result.ok === true, message: result.ok ? result.model : result.message } }))
    } catch (e) {
      setTests((current) => ({ ...current, [id]: { ok: false, message: commandMessage(e) } }))
    }
  }

  const saveBudget = () => {
    const value = budget.trim() === '' ? null : Number(budget.replace(',', '.'))
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      setError(t('images.budgetInvalid'))
      return
    }
    if (value === config.session_budget_usd) return
    void save({ session_budget_usd: value })
  }

  const canAdd = adding === 'chatgpt' ? subscriptions.length > 0 : adding === 'openai' ? draft.api_key.trim().length > 0 : false

  return (
    <Section title={t('images.title')} desc={t('images.intro')}>
      <div className="space-y-4" data-testid="image-creation-settings">
        {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
        {config.connectors.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-3 text-sm text-[var(--text-muted)]">{t('images.none')}</p>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-[var(--border)]" aria-label={t('images.connectors')}>
            {config.connectors.map((item) => {
              const status = tests[item.id]
              return (
                <li key={item.id} className="flex min-h-14 flex-wrap items-center gap-3 border-b border-[var(--border)] px-3 py-2 last:border-b-0" data-connector={item.id}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-[var(--text)]">{item.label}</span>
                    <span className="block text-xs text-[var(--text-subtle)]">
                      {item.kind === 'chatgpt' ? t('images.cost.included') : t('images.cost.perImage')}
                      {item.model ? ` · ${item.model}` : ''}
                      {item.kind === 'openai' && item.has_key === false ? ` · ${t('images.noKey')}` : ''}
                    </span>
                  </span>
                  {status && !status.running && (
                    <span className={status.ok ? 'inline-flex items-center gap-1 text-xs text-[var(--success)]' : 'inline-flex items-center gap-1 text-xs text-[var(--danger)]'} role="status">
                      {status.ok ? <Check size={12} aria-hidden="true" /> : <TriangleAlert size={12} aria-hidden="true" />}
                      {status.ok ? t('images.testOk') : status.message}
                    </span>
                  )}
                  <button type="button" className="btn btn-quiet btn-sm" disabled={status?.running} onClick={() => void test(item.id)}>
                    {status?.running ? <LoaderCircle size={13} className="motion-safe:animate-spin" aria-hidden="true" /> : null}
                    {t('images.test')}
                  </button>
                  <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => remove(item.id)} aria-label={t('images.remove', { name: item.label })}>
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {adding ? (
          <div className="space-y-3 rounded-xl border border-[var(--border)] p-3" data-testid="image-connector-form">
            <p className="text-sm font-medium text-[var(--text)]">{label(adding)}</p>
            {adding === 'chatgpt' ? (
              subscriptions.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">{t('images.chatgptMissing')}</p>
              ) : (
                <label className="block text-xs text-[var(--text-muted)]">
                  {t('images.subscription')}
                  <select className={inputClass} value={draft.provider_id || subscriptions[0].provider_id} onChange={(event) => setDraft({ ...draft, provider_id: event.target.value })}>
                    {subscriptions.map((item) => <option key={item.provider_id} value={item.provider_id}>{item.name}</option>)}
                  </select>
                </label>
              )
            ) : (
              <>
                <label className="block text-xs text-[var(--text-muted)]">
                  {t('images.apiKey')}
                  <input type="password" autoComplete="off" spellCheck={false} className={inputClass} value={draft.api_key} onChange={(event) => setDraft({ ...draft, api_key: event.target.value })} />
                </label>
                <label className="block text-xs text-[var(--text-muted)]">
                  {t('images.model')}
                  <input className={inputClass} placeholder="gpt-image-1" value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} />
                </label>
                <p className="text-xs text-[var(--text-subtle)]">{t('images.cost.perImageHint')}</p>
              </>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setAdding(null)}>{t('common.cancel')}</button>
              <button type="button" className="btn btn-primary btn-sm" disabled={!canAdd || busy} onClick={() => void add()}>{t('images.add')}</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(['chatgpt', 'openai'] as const).map((kind) => (
              <button key={kind} type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding(kind)}>
                <Plus size={13} aria-hidden="true" /> {label(kind)}
              </button>
            ))}
          </div>
        )}

        {config.connectors.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-[var(--text-muted)]">
              {t('images.default')}
              <select aria-label={t('images.default')} className={inputClass} disabled={busy} value={config.default_connector ?? ''} onChange={(event) => void save({ default_connector: event.target.value || null })}>
                <option value="">{t('images.noDefault')}</option>
                {config.connectors.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className="block text-xs text-[var(--text-muted)]">
              {t('images.edit')}
              <select aria-label={t('images.edit')} className={inputClass} disabled={busy} value={config.edit_connector ?? ''} onChange={(event) => void save({ edit_connector: event.target.value || null })}>
                <option value="">{t('images.sameAsDefault')}</option>
                {config.connectors.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className="block text-xs text-[var(--text-muted)] sm:col-span-2">
              {t('images.budget')}
              <input aria-label={t('images.budget')} inputMode="decimal" className={inputClass} placeholder={t('images.noBudget')} value={budget} onChange={(event) => setBudget(event.target.value)} onBlur={saveBudget} onKeyDown={(event) => { if (event.key === 'Enter') saveBudget() }} />
              <span className="mt-1 block text-[var(--text-subtle)]">{t('images.budgetHint')}</span>
            </label>
          </div>
        )}
      </div>
    </Section>
  )
}
