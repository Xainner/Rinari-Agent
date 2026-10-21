import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ExternalLink, LoaderCircle, Plus, TriangleAlert } from 'lucide-react'
import {
  commandMessage,
  engineApi,
  isCommandError,
  type McpCatalogEntry,
  type McpCatalogSetup,
  type McpServer,
  type McpSetupField,
} from '../../services/engine'
import { useI18n, type I18nKey } from '../../i18n'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { ProgressBar } from '../../components/ui/progress-bar'
import { SearchField } from '../../components/ui/SearchField'
import { platform } from '../../platform'
import { ConnectorLogo } from './ConnectorLogo'
import { KindChip } from './ConnectorParts'
import { SegChoice } from './SegChoice'
import { parsePort } from './mcpForm'

type Category = McpCatalogEntry['category'] | 'all'
const CATEGORIES: readonly Category[] = ['all', 'google', 'work', 'dev', 'design', 'files', 'crm', 'media', 'data']

/**
 * «Agregar conector»: el catálogo que trae Rinari. Elegir una entrada rellena
 * el alta y pide solo lo que falta: nada (iniciar sesión), un token, el
 * cliente propio o los datos de un servidor local. Lo que no está en la
 * lista entra por «Agregar servidor MCP».
 */
export function CatalogDialog({ open, onClose, onManual, onAdded }: {
  open: boolean
  onClose: () => void
  onManual: () => void
  onAdded: (server: McpServer, next: 'sign_in' | 'connect', label: string) => void
}) {
  const { t, lang } = useI18n()
  const [entries, setEntries] = useState<McpCatalogEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category>('all')
  const [chosen, setChosen] = useState<McpCatalogEntry | null>(null)

  useEffect(() => {
    if (!open) return
    setChosen(null)
    setQuery('')
    setCategory('all')
    setError(null)
    let alive = true
    engineApi.mcpCatalogList().then((result) => { if (alive) setEntries(result.entries) }).catch((err) => { if (alive) setError(commandMessage(err)) })
    return () => { alive = false }
  }, [open])

  const matching = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (entries ?? []).filter((entry) => !q || `${entry.name} ${entry.description[lang]} ${entry.id}`.toLowerCase().includes(q))
  }, [entries, query, lang])
  const visible = useMemo(() => matching.filter((entry) => category === 'all' || entry.category === category), [matching, category])
  // Las categorías como chips con cuántas hay (lo que busca el texto); solo las que tienen alguna.
  const counts = useMemo(() => {
    const out = new Map<Category, number>([['all', matching.length]])
    for (const entry of matching) out.set(entry.category, (out.get(entry.category) ?? 0) + 1)
    return out
  }, [matching])
  const shown = CATEGORIES.filter((value) => value === 'all' || value === category || (counts.get(value) ?? 0) > 0)

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className={chosen ? 'max-w-3xl' : 'max-w-3xl grid-rows-[minmax(0,1fr)] overflow-hidden'} data-testid="connector-catalog" data-step={chosen ? 'setup' : 'browse'}>
        {chosen ? (
          <SetupStep entry={chosen} onBack={() => setChosen(null)} onAdded={onAdded} />
        ) : (
          <div className="catalog-browse">
            <DialogHeader>
              <DialogTitle>{t('connectors.catalog.title')}</DialogTitle>
              <DialogDescription>{t('connectors.catalog.intro')}</DialogDescription>
            </DialogHeader>
            <SearchField label={t('connectors.catalog.search')} value={query} onChange={(event) => setQuery(event.target.value)} />
            {entries && (
              <div className="catalog-filters" role="group" aria-label={t('connectors.catalog.category')}>
                {shown.map((value) => (
                  <button key={value} type="button" className="catalog-filter" aria-pressed={category === value} data-category={value} onClick={() => setCategory(value)}>
                    {t(`connectors.category.${value}` as I18nKey)}
                    <span className="catalog-filter-count">{counts.get(value) ?? 0}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="catalog-scroll">
            {error && <p role="alert" className="text-[13px] text-[var(--danger)]">{error}</p>}
            {!entries && !error && <ProgressBar label={t('connectors.catalog.loading')} />}
            {entries && visible.length === 0 && <p className="text-[13px] text-[var(--text-muted)]">{t('connectors.catalog.none')}</p>}
            <ul className="catalog-grid" aria-label={t('connectors.catalog.list')}>
              {visible.map((entry) => (
                <li key={entry.id}>
                  <button type="button" className="catalog-entry" data-entry={entry.id} onClick={() => setChosen(entry)}>
                    <ConnectorLogo name={entry.name} logo={entry.logo} tone={entry.category} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <b>{entry.name}</b>
                        {entry.preview && <span className="r-chip" data-tone="warning">{t('connectors.catalog.preview')}</span>}
                        {entry.added && <span className="r-chip" data-tone="success">{t('connectors.catalog.added')}</span>}
                      </span>
                      <small>{entry.description[lang] ?? entry.description.es}</small>
                      <span className="mt-1.5 flex"><KindChip remote={entry.server.transport === 'http'} /></span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            </div>
            <div className="catalog-manual">
              <p className="text-[12.5px] text-[var(--text-muted)]">{t('connectors.catalog.notListed')}</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onManual} data-testid="catalog-manual"><Plus size={13} /> {t('connectors.catalog.manual')}</button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Los campos que pide una forma de alta; `connection_string` y los secretos de un local van aparte. */
function fieldsOf(setup: McpCatalogSetup): Array<{ name: McpSetupField; required: boolean }> {
  return (setup.fields ?? []).filter((field) => field.name !== 'connection_string')
}

const FIELD_LABEL: Record<McpSetupField, I18nKey> = {
  client_id: 'connectors.field.client_id',
  client_secret: 'connectors.field.client_secret',
  redirect_port: 'connectors.field.redirect_port',
  token: 'connectors.field.token',
  connection_string: 'connectors.field.connection_string',
}
const SECRET_FIELDS: ReadonlySet<McpSetupField> = new Set(['client_secret', 'token', 'connection_string'])

function SetupStep({ entry, onBack, onAdded }: {
  entry: McpCatalogEntry
  onBack: () => void
  onAdded: (server: McpServer, next: 'sign_in' | 'connect', label: string) => void
}) {
  const { t, lang } = useI18n()
  const alternatives = entry.setup.alternatives ?? []
  const [method, setMethod] = useState(0)
  const setup = method === 0 ? entry.setup : alternatives[method - 1] ?? entry.setup
  const [values, setValues] = useState<Record<string, string>>({})
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<{ text: string; field?: 'name' } | null>(null)
  const local = entry.server.transport === 'stdio'
  const env = entry.server.transport === 'stdio' ? entry.server.env ?? [] : []
  const takesConnectionString = entry.server.transport === 'stdio' && Boolean(entry.server.connection_string)
  const fields = fieldsOf(setup)
  const google = entry.category === 'google'
  const signsIn = !local && setup.kind !== 'token'

  const set = (key: string, value: string) => { setValues((current) => ({ ...current, [key]: value })); setFailure(null) }
  const port = values.redirect_port?.trim() ? parsePort(values.redirect_port) : undefined
  const ready = fields.every((field) => !field.required || Boolean(values[field.name]?.trim()))
    && port !== null
    && (!local || Boolean(values.connection_string?.trim()) || env.every((spec) => !spec.required || Boolean(secrets[spec.name]?.trim())))

  async function add() {
    setBusy(true)
    setFailure(null)
    try {
      const input: Parameters<typeof engineApi.mcpCatalogAdd>[0] = { id: entry.id }
      if (name.trim()) input.name = name.trim()
      for (const field of fields) {
        const value = values[field.name]?.trim()
        if (!value) continue
        if (field.name === 'redirect_port') input.redirect_port = parsePort(value) ?? undefined
        else input[field.name as 'client_id' | 'client_secret' | 'token'] = value
      }
      if (local) {
        if (values.connection_string?.trim()) input.connection_string = values.connection_string.trim()
        const given = Object.fromEntries(Object.entries(secrets).filter(([, value]) => value.trim()))
        if (Object.keys(given).length) input.secrets = given
      }
      const result = await engineApi.mcpCatalogAdd(input)
      onAdded(result.server, result.next, entry.name)
    } catch (err) {
      const taken = isCommandError(err) && (err.details as { hint?: string } | undefined)?.hint === 'name_taken'
      setFailure(taken ? { text: t('connectors.catalog.nameTaken'), field: 'name' } : { text: commandMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const help = setup.help?.[lang] ?? setup.help?.es
  const consoleUrl = setup.console_url ?? entry.setup.console_url
  return (
    <div className="space-y-4" data-testid="catalog-setup" data-entry={entry.id}>
      <button type="button" className="btn btn-quiet btn-sm -ml-2" onClick={onBack}><ArrowLeft size={13} /> {t('connectors.catalog.back')}</button>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <ConnectorLogo name={entry.name} logo={entry.logo} tone={entry.category} size={40} />
          <div className="min-w-0">
            <DialogTitle>{t('connectors.catalog.setupTitle', { name: entry.name })}</DialogTitle>
            <DialogDescription>{entry.description[lang] ?? entry.description.es}</DialogDescription>
          </div>
        </div>
      </DialogHeader>

      {entry.preview && (
        <div className="connector-notice" data-tone="warning" role="note" data-testid="catalog-preview-notice">
          <TriangleAlert size={15} aria-hidden="true" />
          <div>
            <p className="font-semibold">{t('connectors.catalog.previewTitle')}</p>
            <p>{entry.notes?.[lang] ?? t('connectors.catalog.previewBody')}</p>
          </div>
        </div>
      )}
      {!entry.preview && entry.notes && <p className="connector-notice" role="note">{entry.notes[lang] ?? entry.notes.es}</p>}
      {entry.added && <p className="text-[12.5px] text-[var(--text-muted)]">{t('connectors.catalog.alreadyAdded', { names: entry.servers.map((server) => server.name).join(', ') })}</p>}

      {alternatives.length > 0 && (
        <div>
          <span className="field-label mt-0" id="catalog-method">{t('connectors.catalog.method')}</span>
          <SegChoice
            value={String(method)}
            labelledBy="catalog-method"
            options={[entry.setup, ...alternatives].map((item, index) => ({ value: String(index), label: t(`connectors.setup.${item.kind}` as I18nKey) }))}
            onChange={(value) => { setMethod(Number(value)); setValues({}); setFailure(null) }}
          />
        </div>
      )}

      {google && setup.kind === 'own_client' ? (
        <GoogleGuide consoleUrl={consoleUrl} />
      ) : help ? (
        <p className="text-[13px] text-[var(--text)]">{help}</p>
      ) : null}

      {fields.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.name}>
              <label className="field-label mt-0" htmlFor={`catalog-${field.name}`}>{t(FIELD_LABEL[field.name])}{field.required ? '' : ` · ${t('connectors.field.optional')}`}</label>
              <input
                id={`catalog-${field.name}`}
                className={field.name === 'redirect_port' ? 'field-input w-32 font-mono' : 'field-input font-mono'}
                type={SECRET_FIELDS.has(field.name) ? 'password' : 'text'}
                inputMode={field.name === 'redirect_port' ? 'numeric' : undefined}
                value={values[field.name] ?? ''}
                onChange={(event) => set(field.name, field.name === 'redirect_port' ? event.target.value.replace(/[^0-9]/g, '') : event.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          ))}
        </div>
      )}
      {fields.some((field) => field.name === 'redirect_port') && <p className="field-hint">{t('connectors.field.redirectHint')}</p>}
      {fields.some((field) => SECRET_FIELDS.has(field.name)) && <p className="field-hint">{t('connectors.field.secretHint')}</p>}

      {local && (
        <div className="space-y-3">
          {takesConnectionString && (
            <div>
              <label className="field-label mt-0" htmlFor="catalog-connection-string">{t('connectors.field.connection_string')}</label>
              <input id="catalog-connection-string" type="password" className="field-input font-mono" value={values.connection_string ?? ''} onChange={(event) => set('connection_string', event.target.value)} autoComplete="off" spellCheck={false} />
              <p className="field-hint">{t('connectors.field.connectionStringHint')}</p>
            </div>
          )}
          {env.length > 0 && (
            <details open={!takesConnectionString}>
              <summary className="cursor-pointer text-[12.5px] text-[var(--text-muted)]">{t(takesConnectionString ? 'connectors.field.orEachField' : 'connectors.field.envTitle')}</summary>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {env.map((spec) => (
                  <div key={spec.name}>
                    <label className="field-label mt-0" htmlFor={`catalog-env-${spec.name}`}>{spec.label[lang] ?? spec.name}{spec.required ? '' : ` · ${t('connectors.field.optional')}`}</label>
                    <input id={`catalog-env-${spec.name}`} type={spec.secret ? 'password' : 'text'} className="field-input font-mono" value={secrets[spec.name] ?? ''} placeholder={spec.default ?? ''}
                      onChange={(event) => { setSecrets((current) => ({ ...current, [spec.name]: event.target.value })); setFailure(null) }} autoComplete="off" spellCheck={false} />
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      <details>
        <summary className="cursor-pointer text-[12.5px] text-[var(--text-muted)]">{t('mcp.advanced')}</summary>
        <label className="field-label" htmlFor="catalog-name">{t('connectors.catalog.name')}</label>
        <input id="catalog-name" className="field-input w-64" value={name} onChange={(event) => { setName(event.target.value); setFailure(null) }} placeholder={entry.id} autoComplete="off" spellCheck={false} aria-invalid={failure?.field === 'name' || undefined} />
        <p className="field-hint">{t('connectors.catalog.nameHint')}</p>
      </details>

      {failure && <p role="alert" className="text-[13px] text-[var(--danger)]">{failure.text}</p>}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {entry.docs_url && <button type="button" className="btn btn-quiet btn-sm mr-auto" onClick={() => void platform().opener.openUrl(entry.docs_url).catch(() => undefined)}><ExternalLink size={13} /> {t('connectors.docs')}</button>}
        <button type="button" className="btn btn-primary" disabled={!ready || busy} onClick={() => void add()} data-testid="catalog-add">
          {busy && <LoaderCircle size={14} className="r-spin" />} {t(signsIn ? 'connectors.catalog.addSignIn' : 'connectors.catalog.addConnect')}
        </button>
      </div>
    </div>
  )
}

/** La guía de Google con cliente propio (C0): primero la Developer Preview, después los pasos. */
function GoogleGuide({ consoleUrl }: { consoleUrl?: string }) {
  const { t } = useI18n()
  const steps: I18nKey[] = ['connectors.google.step1', 'connectors.google.step2', 'connectors.google.step3', 'connectors.google.step4', 'connectors.google.step5', 'connectors.google.step6']
  return (
    <div className="space-y-2" data-testid="google-guide">
      <p className="text-[13px] font-semibold text-[var(--text)]">{t('connectors.google.title')}</p>
      <ol className="connector-guide">
        {steps.map((key) => <li key={key}>{t(key)}</li>)}
      </ol>
      <p className="field-hint">{t('connectors.google.sameClient')}</p>
      {consoleUrl && <button type="button" className="btn btn-secondary btn-sm" onClick={() => void platform().opener.openUrl(consoleUrl).catch(() => undefined)}><ExternalLink size={13} /> {t('connectors.google.console')}</button>}
    </div>
  )
}
