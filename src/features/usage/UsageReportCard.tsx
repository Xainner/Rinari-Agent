import { useEffect, useState } from 'react'
import { ArrowRight, BarChart3, Check, CircleCheck, Copy, Download, LoaderCircle, Minimize2, RotateCcw, TriangleAlert } from 'lucide-react'
import ProviderLogo from '../../components/ProviderLogo'
import { toast } from 'sonner'
import { useI18n, type I18nKey } from '../../i18n'
import { copyText } from '../../lib/clipboard'
import { useUIStore } from '../../stores/ui'
import { commandMessage, engineApi } from '../../services/engine'
import type { ContextStatus, ProviderUsageSnapshot } from '../../types/protocol.generated'
import { usageApi, usageMarkdown, type UsageLimits, type UsageReport, type UsageScope } from './usageReport'

const SCOPES: UsageScope[] = ['session', 'today', 'project', 'all']
const compact = (value: number, lang: string) =>
  new Intl.NumberFormat(lang === 'es' ? 'es' : 'en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
/** De la primera a la última actividad del ámbito, en segundos. */
const span = (first: string | null, last: string | null) => {
  if (!first || !last) return null
  const seconds = (Date.parse(last) - Date.parse(first)) / 1000
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}
const duration = (seconds: number) => {
  const minutes = Math.round(seconds / 60)
  if (minutes < 1) return `${Math.round(seconds)} s`
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

/** El tono de una barra de uso: tranquilo, cerca del límite o en él. */
const level = (percent: number) => (percent >= 90 ? 'high' : percent >= 70 ? 'mid' : 'low')

/**
 * Informe de uso en el chat (`/usage`, plan 0.4.0 #78): una foto con fecha
 * que se queda en la conversación y nunca va al modelo. Lleva los límites del
 * plan con su reinicio, el contexto, el uso por modelo (con caché leída y
 * escrita), las herramientas, los avisos de desperdicio y el tiempo; se
 * puede copiar, descargar o actualizar, y cambiar de ámbito.
 */
/** Lo que arregla cada aviso: compactar suelta imágenes y salidas viejas; los demás piden otro modelo. */
const FIX_COMPACT = new Set(['image_resent', 'large_outputs'])
const FIX_MODELS = new Set(['empty_answers', 'no_cache', 'loops'])

/** Por qué un proveedor no trae límites, en el idioma del dueño (el Engine lo dice en inglés). */
function silentReason(item: UsageLimits): I18nKey {
  if (item.product_id === 'claude-subscription') return 'usage.limitsClaudeLater'
  if (item.status === 'needs_auth') return 'usage.limitsNeedsAuth'
  if (item.status === 'disabled') return 'usage.limitsDisabled'
  if (item.product_id === 'ollama' || item.product_id === 'lmstudio') return 'usage.limitsLocal'
  return 'usage.limitsUnknown'
}

/** Las ventanas que la app ya nombra (5 h, semanal…); las demás, como vienen. */
const WINDOW_KEYS: Record<string, I18nKey> = { rolling: 'providers.windowRolling', weekly: 'providers.windowWeekly', monthly: 'providers.windowMonthly' }

export function UsageReportCard({ report: initial, sessionId, providerId: chosenProvider }: { report: UsageReport; sessionId: string; providerId?: string | null }) {
  const { t, lang } = useI18n()
  const windowLabel = (id: string, label: string) => (WINDOW_KEYS[id] ? t(WINDOW_KEYS[id]) : label)
  const [report, setReport] = useState(initial)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [compacting, setCompacting] = useState(false)
  const compactNow = async () => {
    setCompacting(true)
    try {
      await engineApi.contextCompact(sessionId)
      toast.success(t('usage.fix.compacted'))
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setCompacting(false)
    }
  }
  const [liveLimits, setLiveLimits] = useState<ProviderUsageSnapshot | null>(null)
  const [liveContext, setLiveContext] = useState<ContextStatus | null>(null)

  // Una foto de 0.4.0 trae sus límites y su contexto; una de antes no: se
  // piden en vivo, como entonces (el proveedor que más usó la conversación).
  const legacy = initial.limits === undefined
  const providerId = chosenProvider ?? initial.models.find((row) => row.provider_id)?.provider_id ?? null
  useEffect(() => {
    if (!legacy) return
    if (providerId) engineApi.providerUsage(providerId).then(setLiveLimits).catch(() => setLiveLimits(null))
    if (sessionId) engineApi.contextStatus({ session_id: sessionId }).then(setLiveContext).catch(() => setLiveContext(null))
  }, [legacy, providerId, sessionId])
  const limits: UsageLimits[] = report.limits
    ?? (liveLimits ? [{ ...liveLimits, provider_id: liveLimits.provider_id, provider_alias: null, product_id: liveLimits.product_id ?? null, conversation: true }] : [])

  const scopeLabel = t(`usage.scope.${report.scope}` as I18nKey)
  const when = new Date(report.generated_at).toLocaleString(lang === 'es' ? 'es' : 'en', { dateStyle: 'medium', timeStyle: 'short' })
  const reload = async (scope: UsageScope) => {
    setLoading(true)
    try {
      const ref = scope === 'session' || scope === 'project' ? sessionId : null
      setReport((await usageApi.report(scope, ref)).report)
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setLoading(false)
    }
  }
  const markdown = () => usageMarkdown(report, { title: t('usage.title'), scope: scopeLabel })
  const download = () => {
    const blob = new Blob([markdown()], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `rinari-usage-${report.generated_at.slice(0, 10)}.md`
    link.click()
    URL.revokeObjectURL(url)
  }
  const used = report.context !== undefined
    ? Number(report.context?.used_tokens ?? 0)
    : Number((liveContext?.last_request as { input_tokens?: number } | null)?.input_tokens ?? 0)
  const windowTokens = report.context !== undefined ? report.context?.window_tokens ?? 0 : liveContext?.window_tokens ?? 0
  const client = report.client
  const who = client ? [client.app_version && `Rinari Agent ${client.app_version}`, client.engine_version && `Engine ${client.engine_version}`, client.profile, [client.provider, client.model].filter(Boolean).join(' / ')].filter(Boolean).join(' · ') : ''

  return (
    <section className="usage-report" data-testid="usage-report" data-scope={report.scope} data-loading={loading || undefined} aria-label={t('usage.title')} aria-busy={loading || undefined}>
      <header className="usage-report-head">
        <span className="usage-report-icon" aria-hidden="true"><BarChart3 size={15} /></span>
        <span className="min-w-0">
          <span className="usage-report-title">{t('usage.title')}</span>
          <span className="usage-report-when">{when}</span>
          {who && <span className="usage-report-client" data-testid="usage-report-client" title={who}>{who}</span>}
        </span>
        <span className="flex-1" />
        <div role="tablist" aria-label={t('usage.scope')} className="seg-tabs w-fit">
          {SCOPES.map((scope) => (
            <button key={scope} type="button" role="tab" className="seg-tab" aria-selected={report.scope === scope} data-active={report.scope === scope || undefined} onClick={() => void reload(scope)}>
              {report.scope === scope && <span className="seg-tab-pill" aria-hidden="true" />}
              <span className="relative">{t(`usage.scope.${scope}` as I18nKey)}</span>
            </button>
          ))}
        </div>
      </header>

      <dl className="usage-report-totals">
        <div><dt>{t('usage.col.calls')}</dt><dd>{report.totals.calls}</dd></div>
        <div><dt>{t('usage.col.input')}</dt><dd>{compact(report.totals.input_tokens, lang)}</dd></div>
        <div><dt>{t('usage.col.output')}</dt><dd>{compact(report.totals.output_tokens, lang)}</dd></div>
        <div><dt>{t('usage.col.cacheRead')}</dt><dd>{compact(report.totals.cache_read_tokens, lang)}</dd></div>
        <div><dt>{t('usage.col.cost')}</dt><dd>{report.totals.cost !== null && report.totals.cost !== undefined ? `$${report.totals.cost.toFixed(2)}` : '—'}</dd></div>
      </dl>

      {limits.length > 0 && (
        <div className="usage-report-block" data-block="limits">
          <p className="usage-report-label">{t('usage.limits')}</p>
          {limits.map((item) => (
            <div key={item.provider_id} className="usage-report-provider-limits" data-provider={item.provider_id}>
              {(limits.length > 1 || item.provider_alias) && (
                <p className="usage-report-line" data-tone="name">
                  <ProviderLogo productId={item.product_id ?? undefined} alias={item.provider_alias ?? undefined} size={14} />
                  {item.provider_alias ?? item.provider_id}
                </p>
              )}
              {item.windows.map((window) => (
                <div key={window.id} className="usage-report-window">
                  <span>{windowLabel(window.id, window.label)}</span>
                  <span className="usage-bar" aria-hidden="true" data-level={level(window.used_percent ?? 0)}><span style={{ width: `${Math.min(100, window.used_percent ?? 0)}%` }} /></span>
                  <span className="usage-report-percent">{window.used_percent !== null ? `${Math.round(window.used_percent)} %` : '—'}</span>
                  {window.resets_at && <span className="usage-report-reset">{t('usage.resets', { time: new Date(window.resets_at).toLocaleString(lang === 'es' ? 'es' : 'en', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) })}</span>}
                </div>
              ))}
              {item.balances.map((balance) => <p key={balance.scope} className="usage-report-line">{balance.label}: {balance.unlimited ? t('providers.keyUnlimited') : `${balance.remaining ?? '—'} ${balance.currency}`}</p>)}
              {item.windows.length === 0 && item.balances.length === 0 && <p className="usage-report-line">{t(silentReason(item))}</p>}
            </div>
          ))}
        </div>
      )}

      {windowTokens > 0 && (
        <div className="usage-report-block" data-block="context">
          <p className="usage-report-label">{t('usage.context')}</p>
          <span className="usage-bar" aria-hidden="true" data-level={level((100 * used) / windowTokens)}><span style={{ width: `${Math.min(100, (100 * used) / windowTokens)}%` }} /></span>
          <p className="usage-report-line">
            {t('usage.contextLine', { used: compact(used, lang), window: compact(windowTokens, lang), percent: windowTokens ? Math.round((100 * used) / windowTokens) : 0 })}
            {report.compactions > 0 && ` · ${t('usage.compactions', { n: report.compactions })}`}
          </p>
        </div>
      )}

      <div className="usage-report-block" data-block="models">
        <p className="usage-report-label">{t('usage.byModel')}</p>
        {report.models.length === 0 ? <p className="usage-report-line">{t('usage.noCalls')}</p> : (
          <table className="usage-report-table">
            <thead>
              <tr>
                <th>{t('usage.col.model')}</th><th>{t('usage.col.calls')}</th><th>{t('usage.col.input')}</th><th>{t('usage.col.output')}</th>
                <th>{t('usage.col.cacheRead')}</th><th>{t('usage.col.cacheWrite')}</th><th>{t('usage.col.cost')}</th>
              </tr>
            </thead>
            <tbody>
              {report.models.map((row) => (
                <tr key={row.model_id}>
                  <td>{row.model_name}{row.provider_alias ? <span className="usage-report-provider"> · {row.provider_alias}</span> : null}</td>
                  <td>{row.calls}</td>
                  <td>{compact(row.input_tokens, lang)}</td>
                  <td>{compact(row.output_tokens, lang)}</td>
                  <td>{compact(row.cache_read_tokens, lang)}{row.cache_percent !== null ? ` (${row.cache_percent} %)` : ''}</td>
                  <td>{compact(row.cache_write_tokens, lang)}</td>
                  <td>{row.cost !== null ? `$${row.cost.toFixed(4)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="usage-report-block" data-block="tools">
        <p className="usage-report-label">{t('usage.tools')}</p>
        <p className="usage-report-line">{t('usage.toolsLine', { total: report.tools.total, ok: report.tools.ok, failed: report.tools.failed })}</p>
        {report.tools.top.length > 0 && (
          <p className="usage-report-tools">
            {report.tools.top.map((item) => <span key={item.tool} className="usage-report-tool"><span>{item.tool}</span> {item.count}</span>)}
          </p>
        )}
      </div>

      <div className="usage-report-block" data-block="warnings">
        <p className="usage-report-label">{t('usage.warnings')}</p>
        {report.warnings.length === 0
          ? <p className="usage-report-line" data-tone="ok"><CircleCheck size={13} aria-hidden="true" />{t('usage.allGood')}</p>
          : report.warnings.map((warning) => (
            <p key={warning.kind} className="usage-report-line" data-tone="warning" data-warning={warning.kind}>
              <TriangleAlert size={13} aria-hidden="true" />
              {t(`usage.warning.${warning.kind}` as I18nKey, { n: warning.count, max: warning.max ?? 0, model: warning.model ?? '' })}
              {/* El arreglo de un toque de cada aviso (#78). */}
              {FIX_COMPACT.has(warning.kind) && report.scope === 'session' && sessionId && (
                <button type="button" className="btn btn-secondary btn-xs usage-fix" disabled={compacting} data-testid="usage-fix" onClick={() => void compactNow()}>
                  {compacting ? <LoaderCircle size={12} className="motion-safe:animate-spin" aria-hidden="true" /> : <Minimize2 size={12} aria-hidden="true" />} {t('context.compactNow')}
                </button>
              )}
              {FIX_MODELS.has(warning.kind) && (
                <button type="button" className="btn btn-secondary btn-xs usage-fix" data-testid="usage-fix" onClick={() => useUIStore.getState().goSettings('models')}>
                  {t('usage.fix.models')} <ArrowRight size={12} aria-hidden="true" />
                </button>
              )}
            </p>
          ))}
      </div>

      <footer className="usage-report-actions">
        <span className="usage-report-time">
          {t('usage.time', { s: Math.round(report.time.active_ms / 1000) })}
          {span(report.time.first_at, report.time.last_at) !== null && ` · ${t('usage.duration', { time: duration(span(report.time.first_at, report.time.last_at)!) })}`}
        </span>
        <span className="flex-1" />
        <button type="button" className="btn btn-quiet btn-xs" onClick={() => void copyText(markdown()).then((ok) => { if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1500) } })}>
          {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />} {copied ? t('usage.copied') : t('usage.copy')}
        </button>
        <button type="button" className="btn btn-quiet btn-xs" onClick={download}><Download size={12} aria-hidden="true" /> {t('usage.download')}</button>
        <button type="button" className="btn btn-quiet btn-xs" disabled={loading} onClick={() => void reload(report.scope)}>
          {loading ? <LoaderCircle size={12} className="motion-safe:animate-spin" aria-hidden="true" /> : <RotateCcw size={12} aria-hidden="true" />} {t('usage.refresh')}
        </button>
      </footer>
    </section>
  )
}
