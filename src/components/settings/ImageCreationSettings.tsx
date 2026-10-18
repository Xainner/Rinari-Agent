import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, LoaderCircle, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { engineApi, commandMessage } from '../../services/engine'
import type { ImageConnector, ImageCreationSettings as Config } from '../../types/protocol.generated'
import { useI18n, type I18nKey } from '../../i18n'
import { inputClass, Section } from './parts'

type Kind = ImageConnector['kind']
type Operation = 'generate' | 'edit' | 'variations' | 'upscale' | 'remove_background'
type Draft = {
  provider_id: string
  api_key: string
  model: string
  endpoint: string
  server: string
  /** ComfyUI: un workflow (formato API) por operación. */
  workflows: Partial<Record<Operation, Record<string, unknown>>>
  /** MCP: la herramienta de cada operación. */
  tools: Partial<Record<Operation, string>>
  prompt_arg: string
  image_arg: string
}

const KINDS: readonly Kind[] = ['chatgpt', 'openai', 'fal', 'google', 'openrouter', 'comfyui', 'mcp']
const OPERATIONS: readonly Operation[] = ['generate', 'edit', 'variations', 'upscale', 'remove_background']
const KEYED: ReadonlySet<Kind> = new Set<Kind>(['openai', 'fal', 'google', 'openrouter'])
const KIND_LABEL: Record<Kind, I18nKey> = {
  chatgpt: 'images.kind.chatgpt',
  openai: 'images.kind.openai',
  fal: 'images.kind.fal',
  google: 'images.kind.google',
  openrouter: 'images.kind.openrouter',
  comfyui: 'images.kind.comfyui',
  mcp: 'images.kind.mcp',
}
const KIND_COST: Record<Kind, I18nKey> = {
  chatgpt: 'images.cost.included',
  openai: 'images.cost.perImage',
  fal: 'images.cost.perImage',
  google: 'images.cost.perImage',
  openrouter: 'images.cost.byModel',
  comfyui: 'images.cost.local',
  mcp: 'images.cost.byServer',
}
const OPERATION_LABEL: Record<Operation, I18nKey> = {
  generate: 'images.op.generate',
  edit: 'images.op.edit',
  variations: 'images.op.variations',
  upscale: 'images.op.upscale',
  remove_background: 'images.op.remove_background',
}
const EMPTY_DRAFT: Draft = { provider_id: '', api_key: '', model: '', endpoint: '', server: '', workflows: {}, tools: {}, prompt_arg: 'prompt', image_arg: 'image' }

/** Un id corto y libre a partir del tipo: `chatgpt`, `chatgpt-2`, `openai`… */
function nextId(kind: Kind, taken: ReadonlyArray<ImageConnector>): string {
  const ids = new Set(taken.map((item) => item.id))
  if (!ids.has(kind)) return kind
  for (let n = 2; ; n += 1) if (!ids.has(`${kind}-${n}`)) return `${kind}-${n}`
}

/**
 * Ajustes → Visión e imágenes → Creación de imágenes (plan 0.4.0 #28 y bloque
 * 29): con qué servicio crea y edita imágenes Rinari. Sin conector, Rinari lo
 * dice y no improvisa (decisión del dueño). Las claves nunca vuelven del
 * Engine: solo `has_key`.
 */
export default function ImageCreationSettings() {
  const { t } = useI18n()
  const [config, setConfig] = useState<Config>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState<Kind | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
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
  const routers = (config.openrouter_providers ?? []) as Array<{ provider_id: string; name: string }>
  const servers = config.mcp_servers ?? []
  const label = (kind: Kind) => t(KIND_LABEL[kind])
  const mcpTools = Object.entries(draft.tools).filter(([, tool]) => tool && tool.trim())

  const connectorFromDraft = (kind: Kind, id: string): ImageConnector & { api_key?: string } => {
    const base = { id, kind, label: label(kind) }
    switch (kind) {
      case 'chatgpt':
        return { ...base, provider_id: draft.provider_id || subscriptions[0]?.provider_id, model: draft.model }
      case 'openai':
        return { ...base, api_key: draft.api_key.trim(), model: draft.model || 'gpt-image-1' }
      case 'fal':
      case 'google':
        return { ...base, api_key: draft.api_key.trim(), model: draft.model.trim() }
      case 'openrouter':
        return draft.api_key.trim()
          ? { ...base, api_key: draft.api_key.trim(), model: draft.model.trim() }
          : { ...base, provider_id: draft.provider_id || routers[0]?.provider_id, model: draft.model.trim() }
      case 'comfyui':
        return { ...base, endpoint: draft.endpoint.trim() || 'http://127.0.0.1:8188', workflows: draft.workflows as Record<string, Record<string, unknown>> }
      case 'mcp':
        return {
          ...base,
          label: `${label('mcp')} · ${draft.server || servers[0]}`,
          server: draft.server || servers[0],
          tools: Object.fromEntries(mcpTools.map(([op, tool]) => [op, {
            tool: tool!.trim(),
            ...(draft.prompt_arg.trim() ? { prompt_arg: draft.prompt_arg.trim() } : {}),
            ...(op !== 'generate' && draft.image_arg.trim() ? { image_arg: draft.image_arg.trim() } : {}),
          }])),
        }
    }
  }

  const add = async () => {
    if (!adding) return
    const id = nextId(adding, config.connectors)
    const connectors = [...config.connectors, connectorFromDraft(adding, id)]
    // El primero queda como el de por defecto: si no, las herramientas no tendrían con qué.
    const ok = await save({ connectors, default_connector: config.default_connector ?? id })
    if (ok) {
      setAdding(null)
      setDraft(EMPTY_DRAFT)
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

  const loadWorkflow = async (op: Operation, file: File | undefined) => {
    if (!file) return
    try {
      const graph = JSON.parse(await file.text()) as unknown
      if (!graph || typeof graph !== 'object' || Array.isArray(graph)) throw new Error('not an object')
      setDraft((current) => ({ ...current, workflows: { ...current.workflows, [op]: graph as Record<string, unknown> } }))
      setError('')
    } catch {
      setError(t('images.workflowInvalid', { name: file.name }))
    }
  }

  const canAdd = (() => {
    switch (adding) {
      case 'chatgpt': return subscriptions.length > 0
      case 'openai': case 'fal': case 'google': return draft.api_key.trim().length > 0
      case 'openrouter': return draft.api_key.trim().length > 0 || routers.length > 0
      case 'comfyui': return Object.keys(draft.workflows).length > 0
      case 'mcp': return servers.length > 0 && mcpTools.length > 0
      default: return false
    }
  })()

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
                      {t(KIND_COST[item.kind])}
                      {item.model ? ` · ${item.model}` : ''}
                      {KEYED.has(item.kind) && !item.provider_id && item.has_key === false ? ` · ${t('images.noKey')}` : ''}
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
          <div className="space-y-3 rounded-xl border border-[var(--border)] p-3" data-testid="image-connector-form" data-kind={adding}>
            <p className="text-sm font-medium text-[var(--text)]">{label(adding)}</p>
            {adding === 'chatgpt' && (subscriptions.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">{t('images.chatgptMissing')}</p>
            ) : (
              <label className="block text-xs text-[var(--text-muted)]">
                {t('images.subscription')}
                <select className={inputClass} value={draft.provider_id || subscriptions[0].provider_id} onChange={(event) => setDraft({ ...draft, provider_id: event.target.value })}>
                  {subscriptions.map((item) => <option key={item.provider_id} value={item.provider_id}>{item.name}</option>)}
                </select>
              </label>
            ))}
            {adding === 'openrouter' && routers.length > 0 && !draft.api_key.trim() && (
              <label className="block text-xs text-[var(--text-muted)]">
                {t('images.openrouterProvider')}
                <select className={inputClass} value={draft.provider_id || routers[0].provider_id} onChange={(event) => setDraft({ ...draft, provider_id: event.target.value })}>
                  {routers.map((item) => <option key={item.provider_id} value={item.provider_id}>{item.name}</option>)}
                </select>
              </label>
            )}
            {KEYED.has(adding) && (
              <label className="block text-xs text-[var(--text-muted)]">
                {adding === 'openrouter' && routers.length > 0 ? t('images.apiKeyOptional') : t('images.apiKey')}
                <input type="password" autoComplete="off" spellCheck={false} className={inputClass} value={draft.api_key} onChange={(event) => setDraft({ ...draft, api_key: event.target.value })} />
              </label>
            )}
            {KEYED.has(adding) && (
              <label className="block text-xs text-[var(--text-muted)]">
                {t('images.model')}
                <input className={inputClass} placeholder={adding === 'openai' ? 'gpt-image-1' : adding === 'fal' ? 'fal-ai/flux/schnell' : adding === 'google' ? 'gemini-2.5-flash-image' : 'google/gemini-2.5-flash-image'} value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} />
              </label>
            )}
            {adding === 'comfyui' && (
              <>
                <label className="block text-xs text-[var(--text-muted)]">
                  {t('images.endpoint')}
                  <input className={inputClass} placeholder="http://127.0.0.1:8188" value={draft.endpoint} onChange={(event) => setDraft({ ...draft, endpoint: event.target.value })} />
                </label>
                <p className="text-xs text-[var(--text-subtle)]">{t('images.workflowHint')}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {OPERATIONS.map((op) => (
                    <label key={op} className="block text-xs text-[var(--text-muted)]">
                      {t(OPERATION_LABEL[op])}{draft.workflows[op] ? ' ✓' : ''}
                      <input type="file" accept=".json,application/json" className="mt-1 block w-full text-xs" aria-label={t('images.workflowFor', { op: t(OPERATION_LABEL[op]) })} onChange={(event) => void loadWorkflow(op, event.target.files?.[0])} />
                    </label>
                  ))}
                </div>
              </>
            )}
            {adding === 'mcp' && (servers.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">{t('images.mcpMissing')}</p>
            ) : (
              <>
                <label className="block text-xs text-[var(--text-muted)]">
                  {t('images.mcpServer')}
                  <select className={inputClass} value={draft.server || servers[0]} onChange={(event) => setDraft({ ...draft, server: event.target.value })}>
                    {servers.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
                <p className="text-xs text-[var(--text-subtle)]">{t('images.mcpHint')}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {OPERATIONS.map((op) => (
                    <label key={op} className="block text-xs text-[var(--text-muted)]">
                      {t(OPERATION_LABEL[op])}
                      <input className={inputClass} placeholder={t('images.mcpToolPlaceholder')} value={draft.tools[op] ?? ''} onChange={(event) => setDraft({ ...draft, tools: { ...draft.tools, [op]: event.target.value } })} />
                    </label>
                  ))}
                  <label className="block text-xs text-[var(--text-muted)]">
                    {t('images.mcpPromptArg')}
                    <input className={inputClass} value={draft.prompt_arg} onChange={(event) => setDraft({ ...draft, prompt_arg: event.target.value })} />
                  </label>
                  <label className="block text-xs text-[var(--text-muted)]">
                    {t('images.mcpImageArg')}
                    <input className={inputClass} value={draft.image_arg} onChange={(event) => setDraft({ ...draft, image_arg: event.target.value })} />
                  </label>
                </div>
              </>
            ))}
            <p className="text-xs text-[var(--text-subtle)]">{t(KIND_COST[adding])}{adding === 'openai' || adding === 'fal' || adding === 'google' ? ` · ${t('images.cost.perImageHint')}` : ''}</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => { setAdding(null); setDraft(EMPTY_DRAFT) }}>{t('common.cancel')}</button>
              <button type="button" className="btn btn-primary btn-sm" disabled={!canAdd || busy} onClick={() => void add()}>{t('images.add')}</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {KINDS.map((kind) => (
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
