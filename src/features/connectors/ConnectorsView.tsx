import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Download, Ellipsis, LoaderCircle, Plus, RotateCcw } from 'lucide-react'
import { commandMessage, engineApi, type McpServer, type McpTest } from '../../services/engine'
import { useI18n } from '../../i18n'
import { useUIStore } from '../../stores/ui'
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../components/ui/dropdown-menu'
import { ProgressBar } from '../../components/ui/progress-bar'
import { art } from '../rinari/art'
import {
  canSignOut,
  connectorCapabilities,
  isOAuth,
  isRemote,
  type ConnectorCapabilities,
} from './connectorModel'
import { ConnectorLogo } from './ConnectorLogo'
import { McpServerDialog, TestResult } from './McpServerDialog'
import { AccountLine, PrimaryButton, StateChip, StateHint, type ConnectorActions } from './ConnectorParts'
import { CatalogDialog } from './CatalogDialog'
import { ImportDialog } from './ImportDialog'
import { ConnectorDetail } from './ConnectorDetail'
import { SignInDialog, useSignIn } from './SignInDialog'
import { useConnectors, type ConnectorItem } from './useConnectors'

/**
 * Ajustes → Conectores (plan de conectores C3): los servicios que Rinari usa
 * con herramientas. Por dentro cada uno es un servidor MCP, remoto o local;
 * la tarjeta dice cuál con un chip, su estado real y el botón que toca.
 * Reemplaza a «Servidores MCP»: «Agregar servidor MCP» sigue dentro del alta.
 */
export default function ConnectorsView({ onChanged, engineCapabilities }: { onChanged: () => void; engineCapabilities?: Record<string, boolean> }) {
  const { t } = useI18n()
  const [fallbackCaps, setFallbackCaps] = useState<Record<string, boolean> | undefined>(undefined)
  const caps = connectorCapabilities(engineCapabilities ?? fallbackCaps)
  const { items, error, loaded, reload } = useConnectors(caps)
  const [results, setResults] = useState<Record<string, McpTest>>({})
  const [testing, setTesting] = useState<string | null>(null)
  const [editing, setEditing] = useState<McpServer | 'new' | null>(null)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [detail, setDetail] = useState<string | null>(null)
  const [removing, setRemoving] = useState<McpServer | null>(null)
  const [signingOut, setSigningOut] = useState<McpServer | null>(null)
  const openSignIn = useSignIn((state) => state.open)
  const focus = useUIStore((state) => state.connectorFocus)
  const clearFocus = useUIStore((state) => state.clearConnectorFocus)

  // Sin las capacidades de la app (pruebas, arranque), se preguntan aquí.
  useEffect(() => {
    if (engineCapabilities) return
    void Promise.resolve().then(() => engineApi.status()).then((status) => setFallbackCaps(status.capabilities ?? {})).catch(() => {})
  }, [engineCapabilities])

  // La tarjeta «Conectores» del Resumen abre el detalle de ese servidor.
  useEffect(() => {
    if (!focus || !loaded) return
    if (items.some((item) => item.server.name === focus)) setDetail(focus)
    clearFocus()
  }, [focus, loaded])

  const changed = async () => { await reload(); onChanged() }
  const run = async (action: () => Promise<unknown>) => {
    try { await action(); await changed() } catch (err) { toast.error(commandMessage(err)) }
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

  const actions: ConnectorActions = {
    signIn: (item) => openSignIn(item.server.name, item.name),
    reconnect: (item) => void run(() => engineApi.mcpReconnect(item.server.name)),
    test: (item) => void test(item.server),
    toggle: (item) => void run(() => engineApi.mcpSetEnabled(item.server.name, !item.server.enabled)),
    edit: (item) => setEditing(item.server),
    remove: (item) => setRemoving(item.server),
    signOut: (item) => setSigningOut(item.server),
    details: (item) => setDetail(item.server.name),
  }

  const addConnector = () => (caps.catalog ? setCatalogOpen(true) : setEditing('new'))
  const detailItem = detail ? items.find((item) => item.server.name === detail) ?? null : null

  return (
    <div className="space-y-4" data-testid="connectors-view">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-bold text-[var(--text)]">{t('connectors.title')}</h2>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">{t('connectors.intro')}</p>
        </div>
        {caps.catalog && <button type="button" className="btn btn-secondary" onClick={() => setImportOpen(true)}><Download size={15} /> {t('connectors.import')}</button>}
        <button type="button" className="btn btn-primary" onClick={addConnector}><Plus size={15} /> {t('connectors.add')}</button>
      </div>

      {!loaded && <ProgressBar label={t('connectors.loading')} />}

      {error && (
        <div className="mcp-result is-error" role="alert">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[var(--danger)]">{t('connectors.loadFailed')}</p>
            <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">{error}</p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm self-start" onClick={() => void reload()}><RotateCcw size={13} /> {t('connectors.retry')}</button>
        </div>
      )}

      {loaded && !error && items.length === 0 && (
        <div className="mcp-empty">
          <img src={art.chibi('plug')} alt="" draggable={false} />
          <p className="font-display text-[15px] font-bold text-[var(--text)]">{t('connectors.emptyTitle')}</p>
          <p>{t('connectors.emptyHint')}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={addConnector}><Plus size={13} /> {t('connectors.add')}</button>
            {caps.catalog && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImportOpen(true)}><Download size={13} /> {t('connectors.import')}</button>}
          </div>
        </div>
      )}

      <ul className="connector-list" aria-label={t('connectors.listLabel')}>
        {items.map((item) => (
          <li key={item.key}>
            <ConnectorCard item={item} caps={caps} actions={actions} testing={testing === item.server.name} busy={testing !== null} result={results[item.server.name]} />
          </li>
        ))}
      </ul>

      <CatalogDialog
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onManual={() => { setCatalogOpen(false); setEditing('new') }}
        onAdded={(server, next, label) => {
          setCatalogOpen(false)
          void changed()
          if (next === 'sign_in') openSignIn(server.name, label)
          else toast.success(t('connectors.addedConnecting', { name: label }))
        }}
      />

      <McpServerDialog
        target={editing}
        caps={caps}
        onClose={() => setEditing(null)}
        onSaved={(server, { result, signIn }) => {
          setEditing(null)
          if (result) setResults((current) => ({ ...current, [server.name]: result }))
          void changed()
          if (signIn) openSignIn(server.name, server.name)
        }}
      />

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={() => void changed()} />

      <ConnectorDetail item={detailItem} caps={caps} actions={actions} onClose={() => setDetail(null)} />

      <SignInDialog />

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('connectors.remove')}</AlertDialogTitle>
            <AlertDialogDescription>{removing && t(isOAuth(removing) ? 'connectors.confirmRemoveOAuth' : 'mcp.confirmRemove', { name: removing.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction className="btn-danger" onClick={() => { const target = removing; setRemoving(null); if (target) void run(() => engineApi.mcpRemove(target.name)) }}>{t('connectors.remove')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={signingOut !== null} onOpenChange={(open) => !open && setSigningOut(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('connectors.signOut')}</AlertDialogTitle>
            <AlertDialogDescription>{signingOut && t('connectors.confirmSignOut', { name: signingOut.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction className="btn-danger" onClick={() => {
              const target = signingOut
              setSigningOut(null)
              if (!target) return
              void run(async () => {
                const out = await engineApi.mcpAuthSignout(target.name)
                // Solo se dice «revocada» si el servicio lo permitió.
                toast.success(t(out.revoked ? 'connectors.signedOutRevoked' : 'connectors.signedOut', { name: target.name }))
              })
            }}>{t('connectors.signOut')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ConnectorCard({ item, caps, actions, testing, busy, result }: {
  item: ConnectorItem
  caps: ConnectorCapabilities
  actions: ConnectorActions
  testing: boolean
  busy: boolean
  result?: McpTest
}) {
  const { t, lang } = useI18n()
  const { server, entry } = item
  const remote = isRemote(server)
  const description = entry ? entry.description[lang] ?? entry.description.es : null
  return (
    <section className="mcp-card connector-card" data-enabled={server.enabled || undefined} data-connector={server.name} data-state={item.state} aria-labelledby={`connector-${item.key}`}>
      <div className="flex items-start gap-3">
        <ConnectorLogo name={entry?.name ?? server.name} logo={entry?.logo} tone={entry?.category ?? (remote ? 'remote' : 'local')} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" id={`connector-${item.key}`} className="connector-name" onClick={() => actions.details(item)}>{item.name}</button>
            <StateChip item={item} />
            <span className="mcp-chip">{t(remote ? 'connectors.chip.remote' : 'connectors.chip.local')}</span>
            {server.scope === 'project' && <span className="mcp-chip">{t('connectors.chip.project')}</span>}
          </div>
          {description
            ? <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">{description}</p>
            : <p className="mt-1 truncate font-mono text-[11.5px] text-[var(--text-subtle)]" title={remote ? server.url : server.command}>{remote ? server.url : server.command}</p>}
          <AccountLine item={item} />
          <StateHint item={item} caps={caps} />
          {server.warnings?.includes('plain_http_remote') && <p className="mt-1 text-[11.5px] text-[var(--warning)]">{t('mcp.plainHttp')}</p>}
        </div>
      </div>
      {result && <TestResult result={result} oauthSupported={caps.oauth} />}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <PrimaryButton item={item} caps={caps} actions={actions} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => actions.details(item)}>{t('connectors.details')}</button>
        {canSignOut(server, item.auth) && caps.oauth && <button type="button" className="btn btn-ghost btn-sm" onClick={() => actions.signOut(item)}>{t('connectors.signOut')}</button>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="btn btn-quiet btn-icon btn-sm" aria-label={t('connectors.more', { name: item.name })} title={t('connectors.more', { name: item.name })}>
              {testing ? <LoaderCircle size={14} className="r-spin" /> : <Ellipsis size={14} />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={busy} onSelect={() => actions.test(item)}>{t('mcp.test')}</DropdownMenuItem>
            {caps.background && server.enabled && <DropdownMenuItem onSelect={() => actions.reconnect(item)}>{t('connectors.action.reconnect')}</DropdownMenuItem>}
            {caps.remote && <DropdownMenuItem onSelect={() => actions.edit(item)}>{t('mcp.edit')}</DropdownMenuItem>}
            <DropdownMenuItem onSelect={() => actions.toggle(item)}>{server.enabled ? t('connectors.action.disable') : t('connectors.action.enable')}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-[var(--danger)]" onSelect={() => actions.remove(item)}>{t('connectors.remove')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </section>
  )
}
