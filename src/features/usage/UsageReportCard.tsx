import { useEffect, useState } from 'react'
import { BarChart3, Check, Copy, Download, LoaderCircle, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n, type I18nKey } from '../../i18n'
import { copyText } from '../../lib/clipboard'
import { commandMessage, engineApi } from '../../services/engine'
import type { ContextStatus, ProviderUsageSnapshot } from '../../types/protocol.generated'
import { usageApi, usageMarkdown, type UsageReport, type UsageScope } from './usageReport'

const SCOPES: UsageScope[] = ['session', 'today', 'project', 'all']
const compact = (value: number, lang: string) =>
  new Intl.NumberFormat(lang === 'es' ? 'es' : 'en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)

/**
 * Informe de uso en el chat (`/usage`, plan 0.4.0 #78): una foto con fecha
 * que se queda en la conversación y nunca va al modelo. Lleva los límites del
 * plan con su reinicio, el contexto, el uso por modelo (con caché leída y
 * escrita), las herramientas, los avisos de desperdicio y el tiempo; se
 * puede copiar, descargar o actualizar, y cambiar de ámbito.
 */
export function UsageReportCard({ report: initial, sessionId, providerId: chosenProvider }: { report: UsageReport; sessionId: string; providerId?: string | null }) {
  const { t, lang } = useI18n()
  const [report, setReport] = useState(initial)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [limits, setLimits] = useState<ProviderUsageSnapshot | null>(null)
  const [context, setContext] = useState<ContextStatus | null>(null)

  // Los límites del proveedor que más usó la conversación, si no se dice otro.
  const providerId = chosenProvider ?? initial.models.find((row) => row.provider_id)?.provider_id ?? null
  useEffect(() => {
    if (providerId) engineApi.providerUsage(providerId).then(setLimits).catch(() => setLimits(null))
    if (sessionId) engineApi.contextStatus({ session_id: sessionId }).then(setContext).catch(() => setContext(null))
  }, [providerId, sessionId])

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
  const used = Number((context?.last_request as { input_tokens?: number } | null)?.input_tokens ?? 0)
  const windowTokens = context?.window_tokens ?? 0

  return (
    <section className="usage-report" data-testid="usage-report" data-scope={report.scope} aria-label={t('usage.title')}>
      <header className="usage-report-head">
        <BarChart3 size={15} aria-hidden="true" />
        <span className="usage-report-title">{t('usage.title')}</span>
        <span className="usage-report-when">{when}</span>
        <span className="flex-1" />
        <div role="tablist" aria-label={t('usage.scope')} className="seg-tabs w-fit">
          {SCOPES.map((scope) => (
            <button key={scope} type="button" role="tab" className="seg-tab" aria-selected={report.scope === scope} data-active={report.scope === scope || undefined} onClick={() => void reload(scope)}>
              {t(`usage.scope.${scope}` as I18nKey)}
            </button>
          ))}
        </div>
      </header>

      {limits && (limits.windows.length > 0 || limits.balances.length > 0 || limits.status !== 'available') && (
        <div className="usage-report-block" data-block="limits">
          <p className="usage-report-label">{t('usage.limits')}</p>
          {limits.windows.map((window) => (
            <div key={window.id} className="usage-report-window">
              <span>{window.label}</span>
              <span className="usage-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, window.used_percent ?? 0)}%` }} /></span>
              <span>{window.used_percent !== null ? `${Math.round(window.used_percent)} %` : '—'}</span>
              {window.resets_at && <span className="usage-report-reset">{t('usage.resets', { time: new Date(window.resets_at).toLocaleString(lang === 'es' ? 'es' : 'en', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) })}</span>}
            </div>
          ))}
          {limits.balances.map((balance) => <p key={balance.scope} className="usage-report-line">{balance.label}</p>)}
          {limits.windows.length === 0 && limits.balances.length === 0 && <p className="usage-report-line">{t('usage.limitsUnknown')}</p>}
        </div>
      )}

      {windowTokens > 0 && (
        <div className="usage-report-block" data-block="context">
          <p className="usage-report-label">{t('usage.context')}</p>
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
        <p className="usage-report-line">
          {t('usage.toolsLine', { total: report.tools.total, ok: report.tools.ok, failed: report.tools.failed })}
          {report.tools.top.length > 0 && ` · ${report.tools.top.map((item) => `${item.tool} ${item.count}`).join(', ')}`}
        </p>
      </div>

      <div className="usage-report-block" data-block="warnings">
        <p className="usage-report-label">{t('usage.warnings')}</p>
        {report.warnings.length === 0
          ? <p className="usage-report-line" data-tone="ok">{t('usage.allGood')}</p>
          : report.warnings.map((warning) => (
            <p key={warning.kind} className="usage-report-line" data-tone="warning">
              {t(`usage.warning.${warning.kind}` as I18nKey, { n: warning.count, max: warning.max ?? 0, model: warning.model ?? '' })}
            </p>
          ))}
      </div>

      <p className="usage-report-line usage-report-time">{t('usage.time', { s: Math.round(report.time.active_ms / 1000) })}</p>

      <footer className="usage-report-actions">
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
