import { useEffect, useId, useState } from 'react'
import { engineApi, commandMessage, type ProviderSummary } from '../../services/engine'
import { useI18n } from '../../i18n'
import ModelCatalog from './ModelCatalog'
import ProviderUsagePanel from './ProviderUsagePanel'
import ProviderAuthPanel from './ProviderAuthPanel'

export default function ProviderDetails({ provider, onChanged }: { provider: ProviderSummary; onChanged: () => void }) {
  const { t } = useI18n()
  const tabId = useId()
  const [tab, setTab] = useState<'connection' | 'models' | 'usage' | 'diagnostics'>(provider.auth_method === 'oauth' && !provider.has_credential ? 'connection' : 'usage')
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (tab !== 'diagnostics') return
    let active = true
    void engineApi.providerDiagnostics(provider.alias).then(value => { if (active) { setDiagnostics(value); setError('') } }).catch(err => { if (active) setError(commandMessage(err)) })
    return () => { active = false }
  }, [provider.alias, tab])
  const tabs = ['connection', 'models', 'usage', 'diagnostics'] as const
  return <div className="space-y-4 border-t border-[var(--border)] pt-3">
    <div className="flex flex-wrap gap-1" role="tablist" aria-label={provider.alias}>
      {tabs.map(value => <button key={value} id={`${tabId}-${value}`} role="tab" aria-controls={`${tabId}-panel`} tabIndex={tab === value ? 0 : -1} aria-selected={tab === value} onClick={() => setTab(value)} onKeyDown={event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        const index = (tabs.indexOf(value) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
        setTab(tabs[index]); (event.currentTarget.parentElement?.children[index] as HTMLElement)?.focus()
      }} className={`rounded-lg px-3 py-2 text-xs font-semibold ${tab === value ? 'bg-[var(--bg-hover)] text-[var(--accent)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'}`}>{t(`providers.tab.${value}`)}</button>)}
    </div>
    <div id={`${tabId}-panel`} role="tabpanel" aria-labelledby={`${tabId}-${tab}`}>
      {tab === 'connection' && (provider.auth_method === 'oauth'
        ? <ProviderAuthPanel providerAlias={provider.alias} onConnected={onChanged} />
        : <p className="text-sm text-[var(--text-muted)]">{provider.has_credential ? t('providers.credentialOk') : provider.auth_method === 'none' ? t('providers.authNone') : t('providers.noCredential')}</p>)}
      {tab === 'models' && <ModelCatalog providerAlias={provider.alias} onChanged={onChanged} />}
      {tab === 'usage' && <ProviderUsagePanel providerAlias={provider.alias} />}
      {tab === 'diagnostics' && <div className="space-y-3">
        <p className="text-xs text-[var(--text-muted)]">{t('providers.discoveryHint')}</p>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        {diagnostics && <dl className="space-y-2 text-xs">
          {(['product_id', 'endpoint', 'auth_method', 'checked_at'] as const).map(key => <div key={key} className="grid grid-cols-[7rem_1fr] gap-2"><dt className="text-[var(--text-muted)]">{key}</dt><dd className="break-all font-mono">{String(diagnostics[key] ?? '—')}</dd></div>)}
          {Array.isArray(diagnostics.models) && diagnostics.models.map((model: { id: string; model: string; transport: string }) => <div key={model.id} className="flex flex-wrap justify-between gap-2"><dt>{model.model}</dt><dd className="font-mono text-[var(--text-muted)]">{model.transport}</dd></div>)}
        </dl>}
      </div>}
    </div>
  </div>
}
