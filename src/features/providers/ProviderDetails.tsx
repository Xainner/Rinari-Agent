import { useEffect, useId, useState, type ReactNode } from 'react'
import { Pencil, PlugZap, Trash2, Zap } from 'lucide-react'
import { engineApi, commandMessage, type ProviderSummary } from '../../services/engine'
import { useI18n, type I18nKey } from '../../i18n'
import ModelCatalog from './ModelCatalog'
import ProviderUsagePanel from './ProviderUsagePanel'
import ProviderAuthPanel from './ProviderAuthPanel'
import ExternalRuntimePanel from './ExternalRuntimePanel'
import ProviderConnectionSettings from './ProviderConnectionSettings'
import { registerProviderModels } from './registerModels'
import type { ProviderTab } from '../../stores/ui'

type Tab = 'summary' | 'connection' | 'models' | 'usage' | 'diagnostics'
const TABS: readonly Tab[] = ['summary', 'connection', 'models', 'usage', 'diagnostics']

/** La última prueba de una tarjeta: conectó o no, cuántos modelos y cuánto tardó. */
export interface ProviderTestResult {
  connected: boolean
  detail: string
  models: number
  ms: number
}

const seconds = (ms: number) => (ms / 1000).toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 })

/**
 * Un proveedor abierto (#97 B): Resumen (estado, credencial, cuenta,
 * endpoint, la conexión de su cuenta o CLI y las acciones), Modelos, Uso y
 * límites, y Diagnóstico. Las acciones usan los botones canónicos.
 */
export default function ProviderDetails({
  provider,
  onChanged,
  initialTab,
  test,
  testing,
  onTest,
  onUse,
  onEdit,
  onDelete,
  usage = true,
}: {
  provider: ProviderSummary
  onChanged: () => void
  initialTab?: ProviderTab
  test?: ProviderTestResult
  testing?: boolean
  onTest?: () => void
  onUse?: () => void
  onEdit?: () => void
  onDelete?: () => void
  /** Sin `provider_usage_v1` no hay pestaña de uso. */
  usage?: boolean
}) {
  const { t, lang } = useI18n()
  const tabId = useId()
  const tabs = usage ? TABS : TABS.filter((value) => value !== 'usage')
  const [tab, setTab] = useState<Tab>(initialTab && tabs.includes(initialTab) ? initialTab : 'summary')
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')
  const off = provider.enabled === false
  useEffect(() => {
    if (tab !== 'diagnostics') return
    let active = true
    void engineApi.providerDiagnostics(provider.alias).then(value => { if (active) { setDiagnostics(value); setError('') } }).catch(err => { if (active) setError(commandMessage(err)) })
    return () => { active = false }
  }, [provider.alias, tab])

  const credential = provider.auth_method === 'none'
    ? t('providers.authNone')
    : provider.auth_method === 'external-cli'
      ? t('providers.credentialCli')
      : provider.has_credential ? t('providers.credentialOk') : t('providers.noCredential')
  const checked = provider.status_checked_at ? new Date(provider.status_checked_at).toLocaleString(lang) : null

  return <div className="provider-details">
    <div className="seg-tabs w-fit" role="tablist" aria-label={provider.alias}>
      {tabs.map((value, index) => <button key={value} id={`${tabId}-${value}`} type="button" role="tab" aria-controls={`${tabId}-panel`} tabIndex={tab === value ? 0 : -1} aria-selected={tab === value} className="seg-tab" onClick={() => setTab(value)} onKeyDown={event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
        setTab(tabs[next]); (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus()
      }}>
        {tab === value && <span className="seg-tab-pill" aria-hidden="true" />}
        <span className="relative">{t(`providers.tab.${value}` as I18nKey)}</span>
      </button>)}
    </div>
    <div id={`${tabId}-panel`} role="tabpanel" aria-labelledby={`${tabId}-${tab}`} className="provider-details-panel">
      {tab === 'summary' && <div className="space-y-4">
        <dl className="provider-facts">
          <Fact label={t('providers.fact.type')}>{provider.product_name ?? provider.type}{provider.experimental ? ` · ${t('providers.experimental')}` : ''}</Fact>
          <Fact label={t('providers.fact.credential')}>{credential}</Fact>
          {provider.account_hint && <Fact label={t('providers.fact.account')}>{provider.account_hint}</Fact>}
          {provider.endpoint && <Fact label={t('providers.fact.endpoint')}><span className="provider-fact-mono" title={provider.endpoint}>{provider.endpoint}</span></Fact>}
          {provider.model_count !== undefined && <Fact label={t('providers.fact.models')}>{t(provider.model_count === 1 ? 'providers.savedModelOne' : 'providers.savedModelCount', { n: provider.model_count })}</Fact>}
          <Fact label={t('providers.fact.checked')}>{checked ?? t('settings.connection.notChecked')}</Fact>
        </dl>
        {test && (
          <p role="status" className="provider-test-result" data-ok={test.connected || undefined}>
            {test.connected
              ? t('providers.testOk', { n: test.models, s: seconds(test.ms) })
              : t('providers.healthFail', { detail: test.detail })}
          </p>
        )}
        {provider.auth_method === 'external-cli' && <div className="space-y-3">
          <ExternalRuntimePanel runtime="claude-cli" providerRef={provider.alias} />
          <p className="field-hint">{t('providers.claudeNoTools')}</p>
          <p className="field-hint">{t('providers.claudeDisconnect')}</p>
        </div>}
        {provider.auth_method === 'oauth' && <ProviderAuthPanel providerAlias={provider.alias} onConnected={() => void registerProviderModels(provider.alias).then(onChanged)} />}
        <div className="provider-actions">
          {onUse && !provider.active && !off && <button type="button" className="btn btn-secondary btn-sm" onClick={onUse}><Zap size={13} aria-hidden="true" /> {t('providers.use')}</button>}
          {onTest && <button type="button" className="btn btn-secondary btn-sm" disabled={testing || off} onClick={onTest}><PlugZap size={13} aria-hidden="true" /> {testing ? t('providers.testing') : t('providers.test')}</button>}
          {onEdit && <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit}><Pencil size={13} aria-hidden="true" /> {t('providers.edit')}</button>}
          <span className="flex-1" />
          {onDelete && <button type="button" className="btn btn-ghost btn-sm provider-delete" onClick={onDelete}><Trash2 size={13} aria-hidden="true" /> {t('providers.delete')}</button>}
        </div>
      </div>}
      {tab === 'connection' && <ProviderConnectionSettings providerId={provider.id} />}
      {tab === 'models' && <ModelCatalog providerAlias={provider.alias} onChanged={onChanged} />}
      {tab === 'usage' && <ProviderUsagePanel providerAlias={provider.alias} />}
      {tab === 'diagnostics' && <div className="space-y-3">
        <p className="field-hint">{t('providers.discoveryHint')}</p>
        {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
        {diagnostics && <dl className="provider-facts">
          {(['product_id', 'endpoint', 'auth_method', 'checked_at'] as const).map(key => <Fact key={key} label={key}><span className="provider-fact-mono">{String(diagnostics[key] ?? '—')}</span></Fact>)}
          {Array.isArray(diagnostics.models) && diagnostics.models.map((model: { id: string; model: string; transport: string }) => <Fact key={model.id} label={model.model}><span className="provider-fact-mono">{model.transport}</span></Fact>)}
        </dl>}
      </div>}
    </div>
  </div>
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt>{label}</dt><dd>{children}</dd></div>
}
