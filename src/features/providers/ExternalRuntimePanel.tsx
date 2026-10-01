import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, LogIn, RefreshCw, ShieldAlert } from 'lucide-react'
import { commandMessage, engineApi, type ExternalRuntimeStatus } from '../../services/engine'
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

  const check = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const next = providerRef
        ? ((await engineApi.providerDiagnostics(providerRef)) as { runtime?: ExternalRuntimeStatus })
            .runtime ?? null
        : (await engineApi.providerRuntimeProbe(runtime)).runtime
      setStatus(next)
      onStateChange?.(next)
    } catch (err) {
      setError(commandMessage(err))
      setStatus(null)
      onStateChange?.(null)
    } finally {
      setBusy(false)
    }
  }, [providerRef, runtime, onStateChange])

  useEffect(() => {
    void check()
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
      ? 'text-emerald-400'
      : state === 'non_subscription_auth'
        ? 'text-red-400'
        : 'text-amber-400'
  const button =
    'rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-50'

  return (
    <div className="space-y-3" data-testid="external-runtime">
      <p className="text-xs text-[var(--text-muted)]">{t('providers.experimental')}</p>
      {error && (
        <p role="alert" className="text-sm text-red-400">
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
                <dd className="font-mono">{status.sanitized_env.join(', ')}</dd>
              </>
            )}
          </dl>
          {status.state === 'missing_cli' && status.hint && (
            <pre className="overflow-x-auto rounded-xl bg-[var(--bg-subtle)] p-3 text-xs select-all">
              {status.hint}
            </pre>
          )}
          {status.state === 'logged_out' && (
            <pre className="overflow-x-auto rounded-xl bg-[var(--bg-subtle)] p-3 text-xs select-all">
              claude auth login --claudeai
            </pre>
          )}
          {status.state === 'non_subscription_auth' && (
            <p className="text-sm text-[var(--text-muted)]">
              {t('providers.claudeWrongAuthHelp')}
            </p>
          )}
          {status.state === 'connected' && (
            <p className="text-xs text-[var(--text-muted)]">{t('providers.claudeDisclosure')}</p>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} className={button} onClick={() => void check()}>
          <span className="flex items-center gap-2">
            <RefreshCw size={14} className={busy ? 'motion-safe:animate-spin' : undefined} />
            {t('providers.claudeCheckAgain')}
          </span>
        </button>
      </div>
    </div>
  )
}
