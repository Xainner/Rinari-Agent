import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Laptop, Server } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { platform } from '../../platform'
import type { EngineStatus } from '../../platform/engineStatus'
import { commandMessage } from '../../services/engine'
import { useConfirm } from '../../components/ui/useConfirm'
import { Section, inputClass, labelClass } from '../../components/settings/parts'
import type { EnginesView, RemoteEngine } from '../../../electron/shared/contracts'

const LOCAL = 'local'

/**
 * Ajustes → Servidor: «Conectar a mi servidor». La app trabaja con un solo
 * Rinari a la vez: el de este equipo o el de un servidor con Rinari Gateway,
 * emparejado con el código de su panel. Cambiar reconecta; lo que se muestra
 * es lo que el host confirma.
 */
export default function ServerSettings() {
  const { t } = useI18n()
  const [view, setView] = useState<EnginesView | null>(null)
  const [status, setStatus] = useState<EngineStatus | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [link, setLink] = useState('')
  const [server, setServer] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [paired, setPaired] = useState<RemoteEngine | null>(null)
  const { ask, dialog } = useConfirm()

  const refresh = useCallback(async () => {
    const [engines, engine] = await Promise.all([platform().engines.list(), platform().engine.status()])
    setView(engines)
    setStatus(engine)
  }, [])

  useEffect(() => {
    void refresh().catch(() => undefined)
    // El estado de la conexión cambia solo (conectando, reconectando).
    const timer = setInterval(() => void refresh().catch(() => undefined), 3000)
    return () => clearInterval(timer)
  }, [refresh])

  async function use(id: string) {
    setBusy(id)
    try {
      setView(await platform().engines.use(id))
      setPaired(null)
      await refresh()
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function forget(remote: RemoteEngine) {
    const confirmed = await ask({
      title: t('servers.forgetTitle', { name: remote.name }),
      body: t('servers.forgetBody'),
      confirmLabel: t('servers.forget'),
      cancelLabel: t('common.cancel'),
    })
    if (!confirmed) return
    setBusy(remote.id)
    try {
      setView(await platform().engines.forget(remote.id))
      if (paired?.id === remote.id) setPaired(null)
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function pair() {
    setBusy('pair')
    setError(null)
    try {
      const remote = await platform().engines.pair(
        link.trim() ? { link: link.trim() } : { server: server.trim(), code: code.trim() },
      )
      setPaired(remote)
      setLink('')
      setCode('')
      await refresh()
    } catch (err) {
      setError(commandMessage(err))
    } finally {
      setBusy(null)
    }
  }

  if (!view) return null
  const activeRemote = view.remotes.find((r) => r.id === view.active) ?? null
  const connection = activeRemote && status ? connectionText(status, t) : null
  const canPair = Boolean(link.trim() || (server.trim() && code.trim()))

  return (
    <>
      <Section title={t('servers.title')} desc={t('servers.desc')}>
        <ul className="space-y-2" aria-label={t('servers.listLabel')}>
          <EngineRow
            icon={<Laptop size={16} aria-hidden="true" />}
            name={t('servers.thisComputer')}
            detail={t('servers.thisComputerDesc')}
            plainDetail
            active={view.active === LOCAL}
            busy={busy === LOCAL}
            disabled={busy !== null}
            onUse={() => void use(LOCAL)}
          />
          {view.remotes.map((remote) => (
            <EngineRow
              key={remote.id}
              icon={<Server size={16} aria-hidden="true" />}
              name={remote.name}
              detail={remote.server}
              active={view.active === remote.id}
              busy={busy === remote.id}
              disabled={busy !== null}
              status={view.active === remote.id ? connection : null}
              onUse={() => void use(remote.id)}
              onForget={() => void forget(remote)}
            />
          ))}
        </ul>
        {activeRemote && <p className="text-xs text-[var(--text-subtle)]">{t('servers.remoteLimits')}</p>}
      </Section>

      <Section title={t('servers.pairTitle')} desc={t('servers.pairDesc')}>
        <div>
          <label className={labelClass} htmlFor="server-link">
            {t('servers.link')}
          </label>
          <input
            id="server-link"
            className={inputClass}
            value={link}
            placeholder="rinari://pair?url=…&code=…"
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setLink(event.target.value)}
          />
        </div>
        <p className="text-xs text-[var(--text-subtle)]">{t('servers.orManual')}</p>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <div>
            <label className={labelClass} htmlFor="server-address">
              {t('servers.address')}
            </label>
            <input
              id="server-address"
              className={inputClass}
              value={server}
              placeholder="https://rinari.example.com"
              spellCheck={false}
              autoComplete="off"
              disabled={Boolean(link.trim())}
              onChange={(event) => setServer(event.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="server-code">
              {t('servers.code')}
            </label>
            <input
              id="server-code"
              className={`${inputClass} font-mono uppercase`}
              value={code}
              spellCheck={false}
              autoComplete="off"
              maxLength={64}
              disabled={Boolean(link.trim())}
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
        {paired && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--text)]">
            <span>{t('servers.paired', { name: paired.name })}</span>
            {view.active !== paired.id && (
              <button type="button" className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => void use(paired.id)}>
                {t('servers.useNow')}
              </button>
            )}
          </div>
        )}
        <div className="flex justify-end">
          <button type="button" className="btn btn-primary" disabled={!canPair || busy !== null} onClick={() => void pair()}>
            {busy === 'pair' ? t('servers.pairing') : t('servers.pair')}
          </button>
        </div>
        <p className="text-xs text-[var(--text-subtle)]">{t('servers.revokeHint')}</p>
      </Section>
      {dialog}
    </>
  )
}

function connectionText(status: EngineStatus, t: ReturnType<typeof useI18n>['t']): { text: string; tone: 'ok' | 'wait' | 'bad' } {
  if (status.state === 'ready') return { text: t('servers.state.ready'), tone: 'ok' }
  if (status.state === 'failed') {
    if (status.detail?.startsWith('REMOTE_UNPAIRED')) return { text: t('servers.state.unpaired'), tone: 'bad' }
    return { text: t('servers.state.failed'), tone: 'bad' }
  }
  if (status.state === 'degraded') return { text: t('servers.state.reconnecting'), tone: 'wait' }
  return { text: t('servers.state.connecting'), tone: 'wait' }
}

function EngineRow({
  icon,
  name,
  detail,
  active,
  busy,
  disabled,
  status,
  plainDetail = false,
  onUse,
  onForget,
}: {
  icon: ReactNode
  name: string
  detail: string
  active: boolean
  busy: boolean
  disabled: boolean
  status?: { text: string; tone: 'ok' | 'wait' | 'bad' } | null
  /** Una descripción, no una dirección: sin monoespaciada. */
  plainDetail?: boolean
  onUse: () => void
  onForget?: () => void
}) {
  const { t } = useI18n()
  const tone = status?.tone === 'ok' ? 'success' : status?.tone === 'bad' ? 'danger' : 'warning'
  return (
    <li className="flex items-center gap-3 rounded-[var(--r-md)] border border-[var(--line-1)] px-3 py-2.5">
      <span className="text-[var(--text-muted)]">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--text)]">
          {name}{' '}
          {active && <span className="r-chip" data-tone="accent">{t('servers.inUse')}</span>}{' '}
          {status && (
            <span className="r-chip" data-tone={tone} role="status">
              {status.text}
            </span>
          )}
        </p>
        <p className={`truncate text-xs text-[var(--text-subtle)]${plainDetail ? '' : ' font-mono'}`}>{detail}</p>
      </div>
      {!active && (
        <button type="button" className="btn btn-secondary btn-sm" disabled={disabled} onClick={onUse}>
          {busy ? t('servers.switching') : t('servers.use')}
        </button>
      )}
      {onForget && (
        <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={onForget}>
          {t('servers.forget')}
        </button>
      )}
    </li>
  )
}
