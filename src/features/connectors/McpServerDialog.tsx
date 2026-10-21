import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Globe, LoaderCircle, Plus, SquareTerminal, X, Zap } from 'lucide-react'
import { commandMessage, engineApi, type McpServer, type McpTest } from '../../services/engine'
import { hasTranslation, useI18n, type I18nKey } from '../../i18n'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { RinariAvatar } from '../rinari/RinariAvatar'
import { cn } from '../../lib/utils'
import { configFromForm, emptyForm, formFromServer, formReady, type KeyValue, type McpAuthKind, type McpFormState } from './mcpForm'
import type { ConnectorCapabilities } from './connectorModel'
import { SegTabPill } from '../../components/ui/SegTabPill'

/**
 * «Agregar servidor MCP»: el alta manual de un servidor local (un programa)
 * o remoto (una URL con su autorización, ahora también OAuth). Se puede
 * probar antes de guardar, y un fallo dice qué pasó y cómo seguir. Los
 * secretos van al llavero a través del Engine: aquí nunca vuelven.
 */
export function McpServerDialog({ target, caps, onClose, onSaved }: {
  target: McpServer | 'new' | null
  caps: ConnectorCapabilities
  onClose: () => void
  /** `signIn`: el servidor usa OAuth y todavía hay que iniciar sesión. */
  onSaved: (server: McpServer, options: { result?: McpTest; signIn: boolean }) => void
}) {
  const { t } = useI18n()
  const original = target && target !== 'new' ? target : null
  const [form, setForm] = useState<McpFormState>(emptyForm)
  const [result, setResult] = useState<McpTest | null>(null)
  const [busy, setBusy] = useState<'probe' | 'save' | null>(null)
  const remoteSupported = caps.remote

  useEffect(() => {
    setForm(original ? formFromServer(original) : emptyForm())
    setResult(null)
    setBusy(null)
  }, [target])

  const set = (patch: Partial<McpFormState>) => { setForm((current) => ({ ...current, ...patch })); setResult(null) }
  const ready = formReady(form)
  const authKinds: McpAuthKind[] = caps.oauth ? ['oauth', 'bearer', 'headers', 'none'] : ['bearer', 'headers', 'none']

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
      const saved = original
        ? await engineApi.mcpUpdate(original.name, config)
        : await engineApi.mcpCreate(form.name.trim(), remoteSupported ? config : { command: config.command })
      const oauthNow = form.transport === 'http' && form.auth === 'oauth'
      const wasOAuth = original?.auth?.kind === 'oauth'
      onSaved(saved.server, { result: result ?? undefined, signIn: caps.oauth && oauthNow && !wasOAuth })
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-xl" data-testid="mcp-server-dialog">
        <DialogHeader>
          <DialogTitle>{original ? t('mcp.editTitle', { name: original.name }) : t('mcp.addTitle')}</DialogTitle>
          <DialogDescription>{t('mcp.formIntro')}</DialogDescription>
        </DialogHeader>

        {remoteSupported && !original && (
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('mcp.transport')}>
            {(['stdio', 'http'] as const).map((transport) => (
              <button key={transport} type="button" role="radio" aria-checked={form.transport === transport} className={cn('connector-choice', form.transport === transport && 'is-on')} onClick={() => set({ transport })}>
                {transport === 'stdio' ? <SquareTerminal size={17} aria-hidden="true" /> : <Globe size={17} aria-hidden="true" />}
                <span><b>{t(transport === 'stdio' ? 'mcp.local' : 'mcp.remote')}</b><small>{t(transport === 'stdio' ? 'mcp.localHint' : 'mcp.remoteHint')}</small></span>
              </button>
            ))}
          </div>
        )}

        <div>
          <label className="field-label" htmlFor="mcp-name">{t('mcp.nameLabel')}</label>
          <input id="mcp-name" className="field-input" value={form.name} disabled={Boolean(original)} onChange={(e) => set({ name: e.target.value })} autoComplete="off" spellCheck={false} placeholder="github" />
        </div>

        {form.transport === 'stdio' ? (
          <>
            <div>
              <label className="field-label" htmlFor="mcp-command">{t('mcp.commandLabel')}</label>
              <input id="mcp-command" className="field-input font-mono" value={form.command} onChange={(e) => set({ command: e.target.value })} placeholder="npx -y @modelcontextprotocol/server-github" autoComplete="off" spellCheck={false} />
            </div>
            {remoteSupported && <KeyValueList label={t('mcp.envLabel')} hint={t('mcp.envHint')} rows={form.env} onChange={(env) => set({ env })} secretAlways namePlaceholder="GITHUB_TOKEN" />}
          </>
        ) : (
          <>
            <div>
              <label className="field-label" htmlFor="mcp-url">{t('mcp.urlLabel')}</label>
              <input id="mcp-url" className="field-input font-mono" value={form.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://example.com/mcp" autoComplete="off" spellCheck={false} />
            </div>
            <div>
              <span className="field-label" id="mcp-auth-label">{t('mcp.authLabel')}</span>
              <div className="seg-tabs w-fit" role="radiogroup" aria-labelledby="mcp-auth-label">
                {authKinds.map((kind) => (
                  <button key={kind} type="button" role="radio" aria-checked={form.auth === kind} className="seg-tab" onClick={() => set({ auth: kind })}>
                    {form.auth === kind && <SegTabPill />}
                    <span className="relative">{t(`mcp.auth.${kind}` as I18nKey)}</span>
                  </button>
                ))}
              </div>
            </div>
            {form.auth === 'bearer' && (
              <div>
                <label className="field-label" htmlFor="mcp-token">{t('mcp.tokenLabel')}</label>
                <input id="mcp-token" type="password" className="field-input font-mono" value={form.token} onChange={(e) => set({ token: e.target.value })} placeholder={form.tokenStored ? t('mcp.tokenStored') : 'env://MI_TOKEN'} autoComplete="off" spellCheck={false} />
                <p className="field-hint">{t('mcp.tokenHint')}</p>
              </div>
            )}
            {form.auth === 'headers' && <KeyValueList label={t('mcp.headersLabel')} hint={t('mcp.headersHint')} rows={form.headers} onChange={(headers) => set({ headers })} namePlaceholder="X-Api-Key" />}
            {form.auth === 'oauth' && <OAuthFields form={form} set={set} />}
          </>
        )}

        {remoteSupported && (
          <details className="mt-1">
            <summary className="cursor-pointer text-[12.5px] text-[var(--text-muted)]">{t('mcp.advanced')}</summary>
            <label className="field-label" htmlFor="mcp-timeout">{t('mcp.timeoutLabel')}</label>
            <input id="mcp-timeout" className="field-input w-32" inputMode="numeric" value={form.timeout} onChange={(e) => set({ timeout: e.target.value.replace(/[^0-9]/g, '') })} placeholder="30" />
          </details>
        )}

        {result && <TestResult result={result} oauthSupported={caps.oauth} />}

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

/** OAuth: el cliente propio es opcional cuando el servidor admite registrarse solo. */
function OAuthFields({ form, set }: { form: McpFormState; set: (patch: Partial<McpFormState>) => void }) {
  const { t } = useI18n()
  return (
    <div className="space-y-2" data-testid="mcp-oauth-fields">
      <p className="field-hint mt-0">{t('connectors.oauth.formHint')}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="mcp-client-id">{t('connectors.field.client_id')}</label>
          <input id="mcp-client-id" className="field-input font-mono" value={form.clientId} onChange={(e) => set({ clientId: e.target.value })} autoComplete="off" spellCheck={false} placeholder={t('connectors.field.optional')} />
        </div>
        <div>
          <label className="field-label" htmlFor="mcp-client-secret">{t('connectors.field.client_secret')}</label>
          <div className="flex items-center gap-1">
            <input id="mcp-client-secret" type="password" className="field-input font-mono" value={form.clientSecret} onChange={(e) => set({ clientSecret: e.target.value })} autoComplete="off" spellCheck={false} placeholder={form.clientSecretStored ? t('mcp.tokenStored') : t('connectors.field.optional')} />
            {form.clientSecretStored && !form.clientSecret && (
              <button type="button" className="btn btn-quiet btn-icon btn-sm" aria-label={t('connectors.field.forgetSecret')} title={t('connectors.field.forgetSecret')} onClick={() => set({ clientSecretStored: false })}><X size={14} /></button>
            )}
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor="mcp-scopes">{t('connectors.field.scopes')}</label>
          <input id="mcp-scopes" className="field-input font-mono" value={form.scopes} onChange={(e) => set({ scopes: e.target.value })} autoComplete="off" spellCheck={false} placeholder={t('connectors.field.optional')} />
        </div>
        <div>
          <label className="field-label" htmlFor="mcp-redirect-port">{t('connectors.field.redirect_port')}</label>
          <input id="mcp-redirect-port" className="field-input w-32 font-mono" inputMode="numeric" value={form.redirectPort} onChange={(e) => set({ redirectPort: e.target.value.replace(/[^0-9]/g, '') })} placeholder={t('connectors.field.optional')} />
        </div>
      </div>
      <p className="field-hint">{t('connectors.field.redirectHint')}</p>
    </div>
  )
}

/** Resultado de una prueba: lo que respondió el servidor, o qué falló y qué hacer. */
export function TestResult({ result, oauthSupported }: { result: McpTest; oauthSupported: boolean }) {
  const { t } = useI18n()
  const code = result.code ?? result.error
  const oauth = oauthSupported && result.oauth?.available ? result.oauth : null
  const oauthLine = oauth && <p className="mt-1 text-[12px] text-[var(--text-muted)]">{t(oauth.client === 'required' ? 'connectors.test.oauthClientRequired' : 'connectors.test.oauthAvailable')}</p>
  if (result.ok) {
    return (
      <div className="connector-result is-ok" role="status">
        <RinariAvatar state="done" size={34} />
        <div className="min-w-0">
          <p className="font-semibold text-[var(--success)]">{t('mcp.result.ok', { n: result.tools ?? 0, ms: Math.round(result.latency_ms ?? 0) })}</p>
          <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
            {[result.server_info?.name && `${result.server_info.name}${result.server_info.version ? ` ${result.server_info.version}` : ''}`, result.resources != null && t('mcp.result.resources', { n: result.resources }), result.prompts != null && t('mcp.result.prompts', { n: result.prompts })].filter(Boolean).join(' · ')}
          </p>
          {result.names && result.names.length > 0 && <p className="mt-1 truncate font-mono text-[11px] text-[var(--text-subtle)]" title={result.names.join(', ')}>{result.names.slice(0, 8).join(' · ')}{result.names.length > 8 ? ' …' : ''}</p>}
          {oauthLine}
        </div>
      </div>
    )
  }
  const codeKey = code ? `mcp.code.${code}` : ''
  const hint = result.hint === 'oauth_required' && oauthSupported ? 'connectors.hint.oauth_required' : result.hint ? `mcp.hint.${result.hint}` : ''
  return (
    <div className="connector-result is-error" role="alert">
      <RinariAvatar state="error" size={34} />
      <div className="min-w-0">
        <p className="font-semibold text-[var(--danger)]">{hasTranslation(codeKey) ? t(codeKey) : t('mcp.code.unknown')}{result.http_status ? ` · HTTP ${result.http_status}` : ''}</p>
        {hint && <p className="mt-1 text-[12.5px] text-[var(--text)]">{hasTranslation(hint) ? t(hint) : t('connectors.hint.unknown')}</p>}
        {oauthLine}
        {result.message && <details className="mt-1 text-[11.5px] text-[var(--text-subtle)]"><summary className="cursor-pointer">{t('mcp.result.details')}</summary><p className="mt-1 break-words font-mono">{result.message}</p></details>}
      </div>
    </div>
  )
}

export function KeyValueList({ label, hint, rows, onChange, secretAlways = false, namePlaceholder }: {
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
                <input type="checkbox" className="r-checkbox" checked={row.secret} onChange={(e) => update(index, { secret: e.target.checked })} /> {t('mcp.kvSecret')}
              </label>
            )}
            <button type="button" className="btn btn-quiet btn-icon btn-sm" aria-label={t('mcp.kvRemove')} title={t('mcp.kvRemove')} onClick={() => onChange(rows.filter((_, i) => i !== index))}><X size={14} /></button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-quiet btn-xs mt-2" onClick={() => onChange([...rows, { key: '', value: '', secret: true }])}><Plus size={12} /> {t('mcp.kvAdd')}</button>
      <p className="field-hint">{hint}</p>
    </div>
  )
}
