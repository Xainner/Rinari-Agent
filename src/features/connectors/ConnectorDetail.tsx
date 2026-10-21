import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ExternalLink, Folder, LoaderCircle, RotateCcw, ShieldCheck, ShieldAlert } from 'lucide-react'
import {
  commandMessage,
  engineApi,
  type McpDecision,
  type McpHintKey,
  type McpTest,
  type McpToolPermission,
  type McpToolPermissions,
} from '../../services/engine'
import { useI18n, type I18nKey } from '../../i18n'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { ProgressBar } from '../../components/ui/progress-bar'
import { Select } from '../../components/ui/select'
import { SearchField } from '../../components/ui/SearchField'
import { platform } from '../../platform'
import { isOAuth, isRemote, type ConnectorCapabilities } from './connectorModel'
import { ConnectorLogo } from './ConnectorLogo'
import { TestResult } from './McpServerDialog'
import { SegChoice } from './SegChoice'
import { useConnectorEvents, type ConnectorLogEntry } from './connectorStore'
import { AccountLine, PrimaryButton, StateChip, StateHint, type ConnectorActions } from './ConnectorParts'
import type { ConnectorItem } from './useConnectors'

type Tab = 'tools' | 'connection' | 'activity'

/**
 * El detalle de un conector: sus herramientas con Permitir / Preguntar /
 * Bloquear (C5) y las anotaciones que el dueño puede corregir; la conexión,
 * la cuenta y el ámbito; y lo que esta ventana vio pasar.
 */
export function ConnectorDetail({ item, caps, actions, testing = null, result, onClose }: {
  item: ConnectorItem | null
  caps: ConnectorCapabilities
  actions: ConnectorActions
  /** El servidor que se está probando (uno a la vez en toda la pantalla). */
  testing?: string | null
  /** El último «Probar» de este conector. */
  result?: McpTest
  onClose: () => void
}) {
  const { t } = useI18n()
  const tabs: Tab[] = caps.tools ? ['tools', 'connection', 'activity'] : ['connection', 'activity']
  const [tab, setTab] = useState<Tab>(tabs[0])
  const name = item?.server.name ?? null
  useEffect(() => { setTab(tabs[0]) }, [name])
  const remote = item ? isRemote(item.server) : false

  return (
    <Dialog open={item !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-2xl" data-testid="connector-detail" data-connector={name ?? undefined}>
        {item && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <ConnectorLogo name={item.entry?.name ?? item.server.name} logo={item.entry?.logo} tone={item.entry?.category ?? (remote ? 'remote' : 'local')} size={40} />
                <div className="min-w-0">
                  <DialogTitle>{item.name}</DialogTitle>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <StateChip item={item} />
                    <span className="mcp-chip">{t(remote ? 'connectors.chip.remote' : 'connectors.chip.local')}</span>
                  </div>
                </div>
              </div>
              <DialogDescription className="sr-only">{t('connectors.detail.description', { name: item.name })}</DialogDescription>
            </DialogHeader>
            <StateHint item={item} caps={caps} />
            <div className="flex flex-wrap gap-2">
              <PrimaryButton item={item} caps={caps} actions={actions} />
            </div>
            <div role="tablist" aria-label={t('connectors.detail.tabs')} className="seg-tabs w-fit">
              {tabs.map((value, index) => (
                <button key={value} type="button" role="tab" id={`connector-tab-${value}`} aria-controls={`connector-panel-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} className="seg-tab"
                  onClick={() => setTab(value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
                    event.preventDefault()
                    const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]
                    setTab(next)
                    document.getElementById(`connector-tab-${next}`)?.focus()
                  }}>
                  {tab === value && <span className="seg-tab-pill" aria-hidden="true" />}
                  <span className="relative">{t(`connectors.detail.tab.${value}` as I18nKey)}</span>
                </button>
              ))}
            </div>
            <div role="tabpanel" id={`connector-panel-${tab}`} aria-labelledby={`connector-tab-${tab}`}>
              {tab === 'tools' && <ToolsPanel item={item} actions={actions} />}
              {tab === 'connection' && <ConnectionPanel item={item} caps={caps} actions={actions} testing={testing} result={result} />}
              {tab === 'activity' && <ActivityPanel item={item} />}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

const DECISIONS: readonly McpDecision[] = ['allow', 'ask', 'deny']
const HINTS: readonly McpHintKey[] = ['readOnlyHint', 'destructiveHint', 'openWorldHint']
type HintChoice = 'server' | 'yes' | 'no'

function ToolsPanel({ item, actions }: { item: ConnectorItem; actions: ConnectorActions }) {
  const { t } = useI18n()
  const { server } = item
  const scope = server.scope === 'project' ? 'project' : undefined
  const [data, setData] = useState<McpToolPermissions | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const tick = useConnectorEvents((state) => state.tick)

  useEffect(() => {
    let alive = true
    engineApi.mcpToolsList(server.name, scope).then((result) => { if (alive) { setData(result.server); setError(null) } }).catch((err) => { if (alive) setError(commandMessage(err)) })
    return () => { alive = false }
  }, [server.name, scope, tick])

  async function save(key: string, change: () => Promise<{ server: McpToolPermissions }>) {
    setSaving(key)
    try {
      const result = await change()
      setData(result.server)
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setSaving(null)
    }
  }

  const tools = useMemo(() => {
    const all = data?.tools ?? []
    const q = query.trim().toLowerCase()
    return q ? all.filter((tool) => `${tool.name} ${tool.title ?? ''} ${tool.description}`.toLowerCase().includes(q)) : all
  }, [data, query])

  if (error) return <p role="alert" className="text-[13px] text-[var(--danger)]">{error}</p>
  if (!data) return <ProgressBar label={t('connectors.tools.loading')} />

  const decisionOptions = DECISIONS.map((value) => ({ value, label: t(`connectors.decision.${value}` as I18nKey) }))
  return (
    <div className="space-y-3" data-testid="connector-tools">
      <div className="connector-default">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-[var(--text)]" id="connector-default-label">{t('connectors.tools.default')}</p>
          <p className="text-[12px] text-[var(--text-muted)]">{t('connectors.tools.defaultHint')}</p>
        </div>
        <SegChoice
          value={data.default ?? 'mode'}
          labelledBy="connector-default-label"
          disabled={saving !== null}
          testId="connector-default"
          options={[{ value: 'mode', label: t('connectors.decision.mode') }, ...decisionOptions]}
          onChange={(value) => void save('default', () => engineApi.mcpToolsSetDefault({ name: server.name, decision: value === 'mode' ? null : value, scope }))}
        />
      </div>

      {data.tools.length === 0 ? (
        <div className="text-[13px] text-[var(--text-muted)]">
          <p>{t(server.enabled ? 'connectors.tools.empty' : 'connectors.tools.emptyDisabled')}</p>
          {server.enabled && <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={() => actions.reconnect(item)}><RotateCcw size={13} /> {t('connectors.action.reconnect')}</button>}
        </div>
      ) : (
        <>
          {data.tools.length > 6 && <SearchField label={t('connectors.tools.search')} value={query} onChange={(event) => setQuery(event.target.value)} />}
          <ul className="connector-tools" aria-label={t('connectors.tools.list')}>
            {tools.map((tool) => (
              <ToolRow key={tool.name} tool={tool} busy={saving === tool.name} options={decisionOptions}
                onDecision={(decision) => void save(tool.name, () => engineApi.mcpToolsSet({ name: server.name, tool: tool.name, decision, scope }))}
                onHint={(hint, choice) => void save(tool.name, () => engineApi.mcpToolsSet({ name: server.name, tool: tool.name, annotations: { [hint]: choice === 'server' ? null : choice === 'yes' }, scope }))}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function decisionSourceText(t: (key: I18nKey, vars?: Record<string, string | number>) => string, tool: McpToolPermission): string {
  if (tool.decision_source === 'tool') return t('connectors.tools.sourceTool')
  if (tool.decision_source === 'server' && tool.decision) return t('connectors.tools.sourceServer', { decision: t(`connectors.decision.${tool.decision}` as I18nKey) })
  return t('connectors.tools.sourceMode')
}

function ToolRow({ tool, busy, options, onDecision, onHint }: {
  tool: McpToolPermission
  busy: boolean
  options: Array<{ value: McpDecision; label: string }>
  onDecision: (decision: McpDecision | null) => void
  onHint: (hint: McpHintKey, choice: HintChoice) => void
}) {
  const { t } = useI18n()
  const kindTone = tool.kind === 'destructive' ? 'danger' : tool.kind === 'write' ? 'accent' : undefined
  const labelId = `tool-${tool.name}`
  return (
    <li className="connector-tool" data-tool={tool.name} data-listed={tool.listed || undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <span id={labelId} className="text-[13px] font-semibold text-[var(--text)]">{tool.title || tool.name}</span>
        {tool.title && <span className="font-mono text-[11px] text-[var(--text-subtle)]">{tool.name}</span>}
        <span className="r-chip" data-tone={kindTone}>{t(`connectors.kind.${tool.kind}` as I18nKey)}</span>
        {tool.sends_out && <span className="r-chip" data-tone="warning">{t('connectors.tools.sendsOut')}</span>}
        {!tool.listed && <span className="r-chip">{t('connectors.tools.unlisted')}</span>}
      </div>
      {tool.description && <p className="connector-tool-desc" title={tool.description}>{tool.description}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <SegChoice
          small
          value={tool.setting ?? 'default'}
          labelledBy={labelId}
          disabled={busy}
          options={[{ value: 'default', label: t('connectors.decision.default') }, ...options]}
          onChange={(value) => onDecision(value === 'default' ? null : value)}
        />
        <span className="text-[11.5px] text-[var(--text-subtle)]">{decisionSourceText(t, tool)}</span>
      </div>
      <details className="connector-hints">
        <summary>{t('connectors.hints.title')}</summary>
        <p className="field-hint mt-1">{t('connectors.hints.intro')}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {HINTS.map((hint) => {
            const server = tool.annotations.server?.[hint]
            const owner = tool.annotations.owner?.[hint]
            const choice: HintChoice = owner === true ? 'yes' : owner === false ? 'no' : 'server'
            const serverSays = server === true ? t('connectors.hints.yes') : server === false ? t('connectors.hints.no') : t('connectors.hints.unsaid')
            return (
              <div key={hint}>
                <span className="field-label mt-0" id={`${labelId}-${hint}`}>{t(`connectors.hints.${hint}` as I18nKey)}</span>
                <Select<HintChoice>
                  value={choice}
                  label={`${t(`connectors.hints.${hint}` as I18nKey)} · ${tool.title || tool.name}`}
                  disabled={busy}
                  options={[
                    { value: 'server', label: t('connectors.hints.fromServer', { value: serverSays }) },
                    { value: 'yes', label: t('connectors.hints.yes') },
                    { value: 'no', label: t('connectors.hints.no') },
                  ]}
                  onChange={(value) => onHint(hint, value)}
                />
              </div>
            )
          })}
        </div>
      </details>
    </li>
  )
}

function ConnectionPanel({ item, caps, actions, testing, result }: { item: ConnectorItem; caps: ConnectorCapabilities; actions: ConnectorActions; testing: string | null; result?: McpTest }) {
  const { t, lang } = useI18n()
  const { server, entry, auth } = item
  const remote = isRemote(server)
  const [trust, setTrust] = useState<boolean | null>(null)
  const root = server.scope === 'project' ? server.project_root ?? null : null

  useEffect(() => {
    setTrust(null)
    if (!root) return
    let alive = true
    engineApi.projectIntelligence(root).then((intel) => { if (alive) setTrust(intel.instructions.trusted) }).catch(() => { if (alive) setTrust(null) })
    return () => { alive = false }
  }, [root])

  const connection = server.connection
  return (
    <div className="space-y-4" data-testid="connector-connection">
      <dl className="connector-facts">
        <dt>{t('connectors.detail.where')}</dt>
        <dd className="font-mono break-all">{remote ? server.url : server.command}</dd>
        <dt>{t('connectors.detail.scope')}</dt>
        <dd data-testid="connector-scope">
          {server.scope !== 'project' ? t('connectors.scope.global') : (
            <div className="space-y-1">
              <p>{t('connectors.scope.project')}</p>
              {root ? (
                <>
                  <p className="flex items-center gap-1.5 font-mono text-[12px] break-all"><Folder size={12} aria-hidden="true" />{root}</p>
                  {trust === true && <p className="flex items-center gap-1.5 text-[var(--success)]" data-trust="trusted"><ShieldCheck size={13} aria-hidden="true" />{t('connectors.scope.trusted')}</p>}
                  {trust === false && <p className="flex items-center gap-1.5 text-[var(--warning)]" data-trust="untrusted"><ShieldAlert size={13} aria-hidden="true" />{t('connectors.scope.untrusted')}</p>}
                </>
              ) : <p className="text-[var(--text-muted)]">{t('connectors.scope.anyTrusted')}</p>}
            </div>
          )}
        </dd>
        {caps.background && connection && (
          <>
            <dt>{t('connectors.detail.attempts')}</dt>
            <dd>{t('connectors.detail.attemptsValue', { n: connection.attempts })}{connection.changed_at ? ` · ${formatTime(connection.changed_at, lang)}` : ''}</dd>
          </>
        )}
      </dl>
      {connection?.message && item.state === 'error' && (
        <details className="text-[11.5px] text-[var(--text-subtle)]"><summary className="cursor-pointer">{t('mcp.result.details')}</summary><p className="mt-1 break-words font-mono">{connection.message}</p></details>
      )}

      {remote && (
        <div className="space-y-2">
          <p className="text-[13px] font-semibold text-[var(--text)]">{t('connectors.detail.account')}</p>
          <AccountLine item={item} />
          {isOAuth(server) && auth && (
            <p className="text-[12px] text-[var(--text-muted)]">
              {[auth.client && t(`connectors.client.${auth.client}` as I18nKey), auth.expires_at && t('connectors.account.expires', { at: formatTime(auth.expires_at, lang) }), auth.scopes.length > 0 && t('connectors.account.scopes', { scopes: auth.scopes.join(' ') })].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary btn-sm" disabled={testing !== null} aria-busy={testing === server.name || undefined} onClick={() => actions.test(item)} data-testid="connector-detail-test">
          {testing === server.name && <LoaderCircle size={13} className="r-spin" />} {t('mcp.test')}
        </button>
        {caps.remote && <button type="button" className="btn btn-ghost btn-sm" onClick={() => actions.edit(item)}>{t('mcp.edit')}</button>}
        {caps.oauth && isOAuth(server) && auth && (auth.signed_in || auth.reauth_required) && <button type="button" className="btn btn-ghost btn-sm" onClick={() => actions.signOut(item)}>{t('connectors.signOut')}</button>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => actions.toggle(item)}>{server.enabled ? t('connectors.action.disable') : t('connectors.action.enable')}</button>
        {entry?.docs_url && <button type="button" className="btn btn-quiet btn-sm" onClick={() => void platform().opener.openUrl(entry.docs_url).catch(() => undefined)}><ExternalLink size={13} /> {t('connectors.docs')}</button>}
        <button type="button" className="btn btn-quiet btn-sm text-[var(--danger)]" onClick={() => actions.remove(item)}>{t('connectors.remove')}</button>
      </div>
      {result && testing !== server.name && <TestResult result={result} oauthSupported={caps.oauth} />}
    </div>
  )
}

function formatTime(value: string, lang: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(lang === 'en' ? 'en-US' : 'es-ES', { dateStyle: 'short', timeStyle: 'short' })
}

function logText(t: (key: I18nKey, vars?: Record<string, string | number>) => string, entry: ConnectorLogEntry): string {
  const key = `connectors.log.${entry.kind}.${entry.value}` as I18nKey
  const text = t(key)
  return text === key ? entry.value : text
}

function ActivityPanel({ item }: { item: ConnectorItem }) {
  const { t, lang } = useI18n()
  const log = useConnectorEvents((state) => state.log)
  const entries = log.filter((entry) => entry.server === item.server.name)
  return (
    <div className="space-y-2" data-testid="connector-activity">
      <p className="text-[12px] text-[var(--text-muted)]">{t('connectors.log.intro')}</p>
      {entries.length === 0 ? (
        <p className="text-[13px] text-[var(--text-subtle)]">{t('connectors.log.empty')}</p>
      ) : (
        <ol className="connector-log">
          {entries.map((entry, index) => (
            <li key={`${entry.at}-${index}`}>
              <time dateTime={entry.at}>{formatTime(entry.at, lang)}</time>
              <span>{logText(t, entry)}</span>
              {entry.message && <span className="font-mono text-[11px] text-[var(--text-subtle)] break-words">{entry.message}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
