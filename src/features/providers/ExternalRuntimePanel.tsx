import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Copy, Download, LogIn, RefreshCw, ShieldAlert } from 'lucide-react'
import { commandMessage, engineApi, type ExternalRuntimeStatus } from '../../services/engine'
import { copyText } from '../../lib/clipboard'
import { useI18n } from '../../i18n'

/**
 * Estado de un provider servido por un CLI externo (hoy, Claude Code).
 *
 * Todo lo que se muestra lo derivó el Engine: la UI no ejecuta el binario, no
 * lee credenciales y no decide si la fuente de autenticación sirve. Solo
 * `connected` habilita continuar; cualquier otro estado explica qué falta y
 * ofrece volver a comprobar, nunca un camino alternativo que termine
 * facturando contra la API.
 */
export default function ExternalRuntimePanel({
  runtime,
  providerRef,
  onStateChange,
}: {
  runtime: string
  /** Si existe el provider, se consultan sus diagnostics; si no, se sondea. */
  providerRef?: string
  onStateChange?: (status: ExternalRuntimeStatus | null) => void
}) {
  const { t } = useI18n()
  const [status, setStatus] = useState<ExternalRuntimeStatus | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Por ref: si el sondeo dependiera del callback, un padre que pasara una
  // función nueva en cada render relanzaría `claude` en bucle.
  const onStateChangeRef = useRef(onStateChange)
  onStateChangeRef.current = onStateChange
  // Solo cuenta la última consulta: un sondeo lento no pisa uno posterior.
  const latest = useRef(0)

  /**
   * `manual` es el usuario pidiendo comprobar de nuevo. Eso siempre pasa por
   * el sondeo, que es lo que levanta el bloqueo que el Engine pone cuando una
   * llamada eligió una credencial que no es la suscripción; los diagnostics
   * solo lo leen. La carga inicial no lo levanta.
   */
  const check = useCallback(async (manual: boolean) => {
    const id = ++latest.current
    setBusy(true)
    setError('')
    try {
      let next: ExternalRuntimeStatus | null = null
      if (manual || !providerRef) next = (await engineApi.providerRuntimeProbe(runtime)).runtime
      if (providerRef) {
        next = ((await engineApi.providerDiagnostics(providerRef)) as { runtime?: ExternalRuntimeStatus })
          .runtime ?? null
      }
      if (id !== latest.current) return
      setStatus(next)
      onStateChangeRef.current?.(next)
    } catch (err) {
      if (id !== latest.current) return
      setError(commandMessage(err))
      setStatus(null)
      onStateChangeRef.current?.(null)
    } finally {
      if (id === latest.current) setBusy(false)
    }
  }, [providerRef, runtime])

  useEffect(() => {
    void check(false)
  }, [check])

  const state = status?.state
  const Icon =
    state === 'connected'
      ? CheckCircle2
      : state === 'non_subscription_auth'
        ? ShieldAlert
        : state === 'missing_cli'
          ? Download
          : state === 'logged_out'
            ? LogIn
            : AlertTriangle
  const tone =
    state === 'connected'
      ? 'text-[var(--success)]'
      : state === 'non_subscription_auth'
        ? 'text-[var(--danger)]'
        : 'text-[var(--warning)]'
  const button =
    'rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-50'

  return (
    <div className="space-y-3" data-testid="external-runtime">
      <p className="text-xs text-[var(--text-muted)]">{t('providers.experimental')}</p>
      {error && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
      {/* Una sola región viva: dos `role="status"` se anuncian y se leen mal. */}
      {!error && (
        <p
          role="status"
          className={`flex items-center gap-2 text-sm font-medium ${status ? tone : 'text-[var(--text-muted)]'}`}
        >
          {status ? (
            <>
              <Icon size={16} aria-hidden="true" />
              {t(`providers.claudeState.${status.state}`)}
            </>
          ) : (
            t('providers.claudeChecking')
          )}
        </p>
      )}
      {status && (
        <>
          {status.detail && (
            <p className="text-sm text-[var(--text-muted)]">{status.detail}</p>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
            {status.version && (
              <>
                <dt>{t('providers.claudeVersion')}</dt>
                <dd className="font-mono">{status.version}</dd>
              </>
            )}
            {status.path && (
              <>
                <dt>{t('providers.claudePath')}</dt>
                <dd className="truncate font-mono" title={status.path}>
                  {status.path}
                </dd>
              </>
            )}
            {status.auth?.subscription_type && (
              <>
                <dt>{t('providers.claudePlan')}</dt>
                <dd>{status.auth.subscription_type}</dd>
              </>
            )}
            {status.sanitized_env.length > 0 && (
              <>
                <dt>{t('providers.claudeSanitized')}</dt>
                {/* Pueden ser decenas: se nombran unas pocas y el resto cuenta.
                    La lista completa vive en diagnostics, no en la tarjeta. */}
                <dd className="font-mono" title={status.sanitized_env.join(', ')}>
                  {status.sanitized_env.slice(0, 3).join(', ')}
                  {status.sanitized_env.length > 3 &&
                    ` +${status.sanitized_env.length - 3}`}
                </dd>
              </>
            )}
          </dl>
          {(status.state === 'missing_cli' ||
            status.state === 'logged_out' ||
            status.state === 'non_subscription_auth') && <ConnectGuide status={status} />}
          {status.state === 'connected' && (
            <p className="text-xs text-[var(--text-muted)]">{t('providers.claudeDisclosure')}</p>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} aria-busy={busy} className={button} onClick={() => void check(true)}>
          <span className="flex items-center gap-2">
            <RefreshCw size={14} aria-hidden="true" className={busy ? 'motion-safe:animate-spin' : undefined} />
            {t('providers.claudeCheckAgain')}
          </span>
        </button>
      </div>
    </div>
  )
}

/**
 * Pasos para conectar la cuenta según el estado. Los comandos los arma el
 * Engine para esta máquina: con la ruta completa si el CLI no está en el PATH
 * y con el `&` que PowerShell exige delante de una ruta entre comillas. Esas
 * dos cosas fueron justo las que hicieron fallar el primer inicio de sesión
 * a mano. La guía no ejecuta nada: el usuario corre el comando y vuelve.
 */
function ConnectGuide({ status }: { status: ExternalRuntimeStatus }) {
  const { t } = useI18n()
  const login = status.login_command
  const powershell = Boolean(login?.startsWith('& '))
  const step = 'pl-1'

  return (
    <section
      aria-label={t('providers.claudeGuide.title')}
      className="space-y-2 rounded-xl border border-[var(--border)] p-3"
      data-testid="claude-connect-guide"
    >
      <h4 className="text-sm font-semibold">{t('providers.claudeGuide.title')}</h4>
      {status.state === 'missing_cli' && (
        <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--text-muted)]">
          <li className={step}>
            {t('providers.claudeGuide.install1')}
            {status.install_command && <CommandBox command={status.install_command} />}
          </li>
          <li className={step}>{t('providers.claudeGuide.install2')}</li>
          <li className={step}>{t('providers.claudeGuide.install3')}</li>
        </ol>
      )}
      {status.state === 'logged_out' && (
        <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--text-muted)]">
          <li className={step}>{t('providers.claudeGuide.login1')}</li>
          <li className={step}>
            {t('providers.claudeGuide.login2')}
            {login && <CommandBox command={login} />}
          </li>
          <li className={step}>{t('providers.claudeGuide.login3')}</li>
          <li className={step}>{t('providers.claudeGuide.login4')}</li>
        </ol>
      )}
      {status.state === 'non_subscription_auth' && (
        <>
          <p className="text-sm text-[var(--text-muted)]">{t('providers.claudeWrongAuthHelp')}</p>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--text-muted)]">
            <li className={step}>
              {t('providers.claudeGuide.wrong1')}
              {login && <CommandBox command={login} />}
            </li>
            <li className={step}>{t('providers.claudeGuide.wrong2')}</li>
          </ol>
        </>
      )}
      {status.state !== 'missing_cli' && (
        <ul className="space-y-1 text-xs text-[var(--text-subtle)]">
          <li>{t('providers.claudeGuide.noteSubscription')}</li>
          {powershell && <li>{t('providers.claudeGuide.notePowerShell')}</li>}
          <li>{t('providers.claudeGuide.noteShared')}</li>
        </ul>
      )}
    </section>
  )
}

function CommandBox({ command }: { command: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle')
  return (
    <div className="mt-1.5 flex items-start gap-2">
      {/* Enfocable: el comando puede ser más ancho que la tarjeta y se desplaza con teclado. */}
      <pre tabIndex={0} className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-[var(--bg-subtle)] p-2.5 text-xs text-[var(--text)] select-all">
        {command}
      </pre>
      <button
        type="button"
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-2 text-xs hover:bg-[var(--bg-hover)]"
        onClick={async () => {
          setCopied((await copyText(command)) ? 'copied' : 'failed')
          window.setTimeout(() => setCopied('idle'), 2000)
        }}
      >
        <Copy size={13} aria-hidden="true" />
        <span aria-live="polite">
          {copied === 'copied'
            ? t('providers.claudeGuide.copied')
            : copied === 'failed'
              ? t('providers.claudeGuide.copyFailed')
              : t('providers.claudeGuide.copy')}
        </span>
      </button>
    </div>
  )
}

