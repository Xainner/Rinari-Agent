import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Globe, KeyRound, LoaderCircle, Pencil, Plus, Power, SquareTerminal, Trash2, X, Zap } from 'lucide-react'
import {
  commandMessage,
  engineApi,
  type McpServer,
  type McpTest,
} from '../../services/engine'
import { useI18n, type I18nKey } from '../../i18n'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog'
import { RinariAvatar } from '../rinari/RinariAvatar'
import { art } from '../rinari/art'
import { cn } from '../../lib/utils'
import { configFromForm, emptyForm, formFromServer, formReady, type KeyValue, type McpFormState } from './mcpForm'

/**
 * Ajustes > MCP: servidores locales (un programa) y remotos (una URL con su
 * autorización). Cada uno se puede probar antes de guardar, y un fallo dice
 * qué pasó y cómo seguir. Los secretos van al llavero a través del Engine:
 * aquí nunca vuelven ni se registran.
 */
export default function McpView({ onChanged }: { onChanged: () => void }) {
  const { t } = useI18n()
  const [servers, setServers] = useState<McpServer[] | null>(null)
  const [remoteSupported, setRemoteSupported] = useState(false)
  const [results, setResults] = useState<Record<string, McpTest>>({})
  const [testing, setTesting] = useState<string | null>(null)
  const [editing, setEditing] = useState<McpServer | 'new' | null>(null)
  const [removing, setRemoving] = useState<McpServer | null>(null)

  const reload = useCallback(async () => {
    try {
      const result = await engineApi.mcpList()
      setServers(result.servers)
    } catch (err) {
      setServers([])
      toast.error(commandMessage(err))
    }
  }, [])

  useEffect(() => {
    void reload()
    void Promise.resolve().then(() => engineApi.status()).then((status) => setRemoteSupported(status.capabilities?.mcp_remote_v1 === true)).catch(() => {})
  }, [reload])

  async function toggle(server: McpServer) {
    try {
      await engineApi.mcpSetEnabled(server.name, !server.enabled)
      await reload()
      onChanged()
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  async function test(server: McpServer) {
    setTesting(server.name)
    try {
      const result = await engineApi.mcpTest(server.name)
      setResults((current) => ({ ...current, [server.name]: result.test }))
      await reload()
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setTesting(null)
    }
  }

  async function remove() {
    if (!removing) return
    try {
      await engineApi.mcpRemove(removing.name)
      setRemoving(null)
      await reload()
      onChanged()
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-bold text-[var(--text)]">{t('mcp.title')}</h2>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">{t('mcp.intro')}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={15} /> {t('mcp.add')}</button>
      </div>

      {servers?.length === 0 && (
        <div className="mcp-empty">
          <img src={art.chibi('plug')} alt="" draggable={false} />
          <p className="font-display text-[15px] font-bold text-[var(--text)]">{t('mcp.emptyTitle')}</p>
          <p>{t('mcp.emptyHint')}</p>
        </div>
      )}

      {servers?.map((server) => {
        const remote = server.transport === 'http'
        const result = results[server.name]
        return (
          <section key={server.name} className="mcp-card" data-enabled={server.enabled || undefined}>
            <div className="flex items-start gap-3">
              <span className="mcp-icon" data-remote={remote || undefined} aria-hidden="true">{remote ? <Globe size={16} /> : <SquareTerminal size={16} />}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-semibold text-[var(--text)]">{server.name}</span>
                  <span className="mcp-status" data-state={!server.enabled ? 'off' : server.connected ? 'on' : 'idle'}>
                    {!server.enabled ? t('mcp.disabled') : server.connected ? t('mcp.connected') : t('mcp.disconnected')}
                  </span>
                  <span className="mcp-chip">{remote ? t('mcp.remote') : t('mcp.local')}</span>
                </div>
                <p className="mt-1 truncate font-mono text-[11.5px] text-[var(--text-subtle)]" title={remote ? server.url : server.command}>{remote ? server.url : server.command}</p>
                {remote && <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-[var(--text-muted)]"><KeyRound size={12} aria-hidden="true" />{authSummary(server, t)}</p>}
                {server.warnings?.includes('plain_http_remote') && <p className="mt-1 text-[11.5px] text-[var(--warning)]">{t('mcp.plainHttp')}</p>}
              </div>
            </div>
            {result && <TestResult result={result} />}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void test(server)} disabled={testing !== null}>
                {testing === server.name ? <LoaderCircle size={13} className="r-spin" /> : <Zap size={13} />} {t('mcp.test')}
              </button>
              {remoteSupported && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(server)}><Pencil size={13} /> {t('mcp.edit')}</button>}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void toggle(server)}><Power size={13} /> {server.enabled ? t('mcp.disable') : t('mcp.enable')}</button>
              <button type="button" className="btn btn-quiet btn-sm text-[var(--danger)]" onClick={() => setRemoving(server)}><Trash2 size={13} /> {t('mcp.remove')}</button>
            </div>
          </section>
        )
      })}

      <McpServerDialog
        target={editing}
        remoteSupported={remoteSupported}
        onClose={() => setEditing(null)}
        onSaved={(name, result) => {
          setEditing(null)
          if (result) setResults((current) => ({ ...current, [name]: result }))
          void reload()
          onChanged()
        }}
      />

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('mcp.remove')}</AlertDialogTitle>
            <AlertDialogDescription>
              {removing && t('mcp.confirmRemove', { name: removing.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('providers.cancel')}</AlertDialogCancel>
            <AlertDialogAction className="btn-danger" onClick={() => void remove()}>
              {t('mcp.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function authSummary(server: McpServer, t: (key: I18nKey, params?: Record<string, string | number>) => string): string {
  const auth = server.auth
  if (!auth || auth.kind === 'none') return t('mcp.authNone')
  if (auth.kind === 'bearer') {
    if (!auth.token?.configured) return t('mcp.authBearerMissing')
    return auth.token.source === 'env' ? t('mcp.authBearerEnv', { name: auth.token.env_var ?? '' }) : t('mcp.authBearerStored')
  }
  return t('mcp.authHeaders', { n: server.headers?.length ?? 0 })
}

/** Resultado de una prueba: lo que respondió el servidor, o qué falló y qué hacer. */
function TestResult({ result }: { result: McpTest }) {
  const { t } = useI18n()
  const code = result.code ?? result.error
  if (result.ok) {
    return (
      <div className="mcp-result is-ok" role="status">
        <RinariAvatar state="done" size={34} />
        <div className="min-w-0">
          <p className="font-semibold text-[var(--success)]">{t('mcp.result.ok', { n: result.tools ?? 0, ms: Math.round(result.latency_ms ?? 0) })}</p>
          <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
            {[result.server_info?.name && `${result.server_info.name}${result.server_info.version ? ` ${result.server_info.version}` : ''}`, result.resources != null && t('mcp.result.resources', { n: result.resources }), result.prompts != null && t('mcp.result.prompts', { n: result.prompts })].filter(Boolean).join(' · ')}
          </p>
          {result.names && result.names.length > 0 && <p className="mt-1 truncate font-mono text-[11px] text-[var(--text-subtle)]" title={result.names.join(', ')}>{result.names.slice(0, 8).join(' · ')}{result.names.length > 8 ? ' …' : ''}</p>}
        </div>
      </div>
    )
  }
  return (
    <div className="mcp-result is-error" role="alert">
      <RinariAvatar state="error" size={34} />
      <div className="min-w-0">
        <p className="font-semibold text-[#ffb3c1]">{code ? t(`mcp.code.${code}` as I18nKey) : t('mcp.code.unknown')}{result.http_status ? ` · HTTP ${result.http_status}` : ''}</p>
        {result.hint && <p className="mt-1 text-[12.5px] text-[var(--text)]">{t(`mcp.hint.${result.hint}` as I18nKey)}</p>}
        {result.message && <details className="mt-1 text-[11.5px] text-[var(--text-subtle)]"><summary className="cursor-pointer">{t('mcp.result.details')}</summary><p className="mt-1 break-words font-mono">{result.message}</p></details>}
      </div>
    </div>
  )
}

/** Alta y edición: el formulario pide solo lo que ese tipo de servidor necesita. */
function McpServerDialog({ target, remoteSupported, onClose, onSaved }: {
  target: McpServer | 'new' | null
  remoteSupported: boolean
  onClose: () => void
  onSaved: (name: string, result?: McpTest) => void
}) {
  const { t } = useI18n()
  const original = target && target !== 'new' ? target : null
  const [form, setForm] = useState<McpFormState>(emptyForm)
  const [result, setResult] = useState<McpTest | null>(null)
  const [busy, setBusy] = useState<'probe' | 'save' | null>(null)

  useEffect(() => {
    setForm(original ? formFromServer(original) : emptyForm())
    setResult(null)
    setBusy(null)
  }, [target])

  const set = (patch: Partial<McpFormState>) => { setForm((current) => ({ ...current, ...patch })); setResult(null) }
  const ready = formReady(form)

  async function probe() {
    setBusy('probe')
    try {
      const config = configFromForm(form, original)
      const response = await engineApi.mcpProbe(original ? { ...config, name: original.name } : config)
      setResult(response.test)
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    setBusy('save')
    try {
      const config = configFromForm(form, original)
      if (original) await engineApi.mcpUpdate(original.name, config)
      else await engineApi.mcpCreate(form.name.trim(), remoteSupported ? config : { command: config.command })
      onSaved(form.name.trim(), result ?? undefined)
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{original ? t('mcp.editTitle', { name: original.name }) : t('mcp.addTitle')}</DialogTitle>
          <DialogDescription>{t('mcp.formIntro')}</DialogDescription>
        </DialogHeader>

        {remoteSupported && !original && (
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('mcp.transport')}>
            {(['stdio', 'http'] as const).map((transport) => (
              <button key={transport} type="button" role="radio" aria-checked={form.transport === transport} className={cn('mcp-choice', form.transport === transport && 'is-on')} onClick={() => set({ transport })}>
                {transport === 'stdio' ? <SquareTerminal size={17} aria-hidden="true" /> : <Globe size={17} aria-hidden="true" />}
                <span><b>{t(transport === 'stdio' ? 'mcp.local' : 'mcp.remote')}</b><small>{t(transport === 'stdio' ? 'mcp.localHint' : 'mcp.remoteHint')}</small></span>
              </button>
            ))}
          </div>
        )}

        <label className="field-label" htmlFor="mcp-name">{t('mcp.nameLabel')}</label>
        <input id="mcp-name" className="field-input" value={form.name} disabled={Boolean(original)} onChange={(e) => set({ name: e.target.value })} autoComplete="off" spellCheck={false} placeholder="github" />

        {form.transport === 'stdio' ? (
          <>
            <label className="field-label" htmlFor="mcp-command">{t('mcp.commandLabel')}</label>
            <input id="mcp-command" className="field-input font-mono" value={form.command} onChange={(e) => set({ command: e.target.value })} placeholder="npx -y @modelcontextprotocol/server-github" autoComplete="off" spellCheck={false} />
            {remoteSupported && <KeyValueList label={t('mcp.envLabel')} hint={t('mcp.envHint')} rows={form.env} onChange={(env) => set({ env })} secretAlways namePlaceholder="GITHUB_TOKEN" />}
          </>
        ) : (
          <>
            <label className="field-label" htmlFor="mcp-url">{t('mcp.urlLabel')}</label>
            <input id="mcp-url" className="field-input font-mono" value={form.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://example.com/mcp" autoComplete="off" spellCheck={false} />
            <span className="field-label">{t('mcp.authLabel')}</span>
            <div className="seg-tabs w-fit" role="radiogroup" aria-label={t('mcp.authLabel')}>
              {(['bearer', 'headers', 'none'] as const).map((kind) => (
                <button key={kind} type="button" role="radio" aria-checked={form.auth === kind} className="seg-tab" onClick={() => set({ auth: kind })}>
                  {form.auth === kind && <span className="seg-tab-pill" aria-hidden="true" />}
                  <span className="relative">{t(`mcp.auth.${kind}`)}</span>
                </button>
              ))}
            </div>
            {form.auth === 'bearer' && (
              <>
                <label className="field-label" htmlFor="mcp-token">{t('mcp.tokenLabel')}</label>
                <input id="mcp-token" type="password" className="field-input font-mono" value={form.token} onChange={(e) => set({ token: e.target.value })} placeholder={form.tokenStored ? t('mcp.tokenStored') : 'env://MI_TOKEN'} autoComplete="off" spellCheck={false} />
                <p className="field-hint">{t('mcp.tokenHint')}</p>
              </>
            )}
            {form.auth === 'headers' && <KeyValueList label={t('mcp.headersLabel')} hint={t('mcp.headersHint')} rows={form.headers} onChange={(headers) => set({ headers })} namePlaceholder="X-Api-Key" />}
          </>
        )}

        {remoteSupported && (
          <details className="mt-1">
            <summary className="cursor-pointer text-[12.5px] text-[var(--text-muted)]">{t('mcp.advanced')}</summary>
            <label className="field-label" htmlFor="mcp-timeout">{t('mcp.timeoutLabel')}</label>
            <input id="mcp-timeout" className="field-input w-32" inputMode="numeric" value={form.timeout} onChange={(e) => set({ timeout: e.target.value.replace(/[^0-9]/g, '') })} placeholder="30" />
          </details>
        )}

        {result && <TestResult result={result} />}

        <div className="mt-2 flex flex-wrap justify-end gap-2">
          {remoteSupported && (
            <button type="button" className="btn btn-secondary" disabled={!ready || busy !== null} onClick={() => void probe()}>
              {busy === 'probe' ? <LoaderCircle size={14} className="r-spin" /> : <Zap size={14} />} {t('mcp.probe')}
            </button>
          )}
          <button type="button" className="btn btn-primary" disabled={!ready || busy !== null} onClick={() => void save()}>
            {busy === 'save' && <LoaderCircle size={14} className="r-spin" />} {original ? t('mcp.saveChanges') : t('mcp.save')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function KeyValueList({ label, hint, rows, onChange, secretAlways = false, namePlaceholder }: {
  label: string
  hint: string
  rows: KeyValue[]
  onChange: (rows: KeyValue[]) => void
  secretAlways?: boolean
  namePlaceholder: string
}) {
  const { t } = useI18n()
  const update = (index: number, patch: Partial<KeyValue>) => onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  return (
    <div>
      <span className="field-label">{label}</span>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={index} className="flex items-center gap-2">
            <input aria-label={t('mcp.kvName')} className="field-input font-mono" value={row.key} disabled={row.stored} onChange={(e) => update(index, { key: e.target.value })} placeholder={namePlaceholder} spellCheck={false} />
            <input aria-label={t('mcp.kvValue')} type={secretAlways || row.secret ? 'password' : 'text'} className="field-input font-mono" value={row.value} onChange={(e) => update(index, { value: e.target.value })} placeholder={row.stored ? t('mcp.tokenStored') : t('mcp.kvValue')} spellCheck={false} autoComplete="off" />
            {!secretAlways && (
              <label className="flex shrink-0 items-center gap-1 text-[11.5px] text-[var(--text-muted)]">
                <input type="checkbox" checked={row.secret} onChange={(e) => update(index, { secret: e.target.checked })} /> {t('mcp.kvSecret')}
              </label>
            )}
            <button type="button" className="btn btn-quiet btn-icon btn-sm" aria-label={t('mcp.kvRemove')} onClick={() => onChange(rows.filter((_, i) => i !== index))}><X size={14} /></button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-quiet btn-xs mt-2" onClick={() => onChange([...rows, { key: '', value: '', secret: true }])}><Plus size={12} /> {t('mcp.kvAdd')}</button>
      <p className="field-hint">{hint}</p>
    </div>
  )
}
