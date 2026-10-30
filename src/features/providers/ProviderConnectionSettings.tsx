import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n, type I18nKey } from '../../i18n'
import { commandMessage, engineApi, type ExecutionSettingsResult, type TimeoutKey } from '../../services/engine'
import { inputClass } from '../../components/settings/parts'

const TIMEOUT_KEYS: readonly TimeoutKey[] = ['connect', 'first_byte', 'idle', 'total']

/**
 * Proveedores → Conexión (plan 0.4.0 #96): las llamadas a la vez y los
 * tiempos de este proveedor. Vacío hereda lo de Ajustes → Avanzado, que se
 * ve como valor en uso.
 */
export default function ProviderConnectionSettings({ providerId }: { providerId: string }) {
  const { t } = useI18n()
  const [execution, setExecution] = useState<ExecutionSettingsResult | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    engineApi.executionSettingsGet().then(setExecution).catch((e) => setError(commandMessage(e)))
  }, [])
  if (error) return <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>
  if (!execution) return <div className="h-24 rounded-[var(--r-md)] bg-[var(--bg-active)] motion-safe:animate-pulse" aria-busy="true" />

  const settings = execution.settings
  const own = settings.provider_timeouts?.[providerId] ?? {}
  const global = (key: TimeoutKey) => settings.timeouts?.[key] ?? execution.defaults.timeouts[key]
  const save = async (next: ExecutionSettingsResult['settings']) => {
    try {
      setExecution(await engineApi.executionSettingsSet(next))
      toast.success(t('adv.saved'))
    } catch (e) {
      toast.error(commandMessage(e))
    }
  }
  const setConcurrency = (raw: string) => {
    const providers = { ...settings.providers }
    if (raw.trim() === '') delete providers[providerId]
    else {
      const value = Number(raw)
      if (!Number.isInteger(value) || value < 1 || value > 64) { toast.error(t('adv.range', { min: 1, max: 64 })); return }
      if (providers[providerId] === value) return
      providers[providerId] = value
    }
    void save({ ...settings, providers })
  }
  const setTimeoutValue = (key: TimeoutKey, raw: string) => {
    const current = { ...own }
    if (raw.trim() === '') delete current[key]
    else {
      const value = Number(raw)
      if (!Number.isFinite(value) || value <= 0) { toast.error(t('adv.range', { min: 1, max: '∞' })); return }
      if (current[key] === value) return
      current[key] = value
    }
    const providerTimeouts = { ...settings.provider_timeouts }
    if (Object.keys(current).length === 0) delete providerTimeouts[providerId]
    else providerTimeouts[providerId] = current
    void save({ ...settings, provider_timeouts: providerTimeouts })
  }
  const customised = settings.providers[providerId] !== undefined || Object.keys(own).length > 0
  return (
    <div className="space-y-4" data-testid="provider-connection">
      <p className="field-hint">{t('providers.connection.hint')}</p>
      <label className="adv-field">
        <span>{t('adv.connections.concurrency')}</span>
        <input type="number" min={1} max={64} className={inputClass} defaultValue={settings.providers[providerId] ?? ''} placeholder={t('providers.connection.inherits', { value: settings.max_concurrency })} onBlur={(event) => setConcurrency(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') setConcurrency(event.currentTarget.value) }} />
      </label>
      <div className="adv-fields">
        {TIMEOUT_KEYS.map((key) => (
          <label key={key} className="adv-field">
            <span>{t(`adv.timeout.${key}` as I18nKey)}</span>
            <input type="number" min={1} className={inputClass} defaultValue={own[key] ?? ''} placeholder={t('providers.connection.inheritsSeconds', { value: global(key) })} onBlur={(event) => setTimeoutValue(key, event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') setTimeoutValue(key, event.currentTarget.value) }} />
          </label>
        ))}
      </div>
      <p className="adv-hint">{t('providers.connection.example')}</p>
      {customised && (
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => {
          const providers = { ...settings.providers }
          delete providers[providerId]
          const providerTimeouts = { ...settings.provider_timeouts }
          delete providerTimeouts[providerId]
          void save({ ...settings, providers, provider_timeouts: providerTimeouts })
        }}>
          <RotateCcw size={12} aria-hidden="true" /> {t('providers.connection.inheritAll')}
        </button>
      )}
    </div>
  )
}

/**
 * El máximo de tokens de salida de un modelo (plan 0.4.0 #96): vacío es
 * «Automático». Para servidores que rechazan un `max_tokens` grande.
 */
export function ModelOutputCap({ modelId }: { modelId: string }) {
  const { t } = useI18n()
  const [execution, setExecution] = useState<ExecutionSettingsResult | null>(null)
  useEffect(() => { engineApi.executionSettingsGet().then(setExecution).catch(() => setExecution(null)) }, [])
  if (!execution?.settings) return null
  const value = execution.settings.models?.[modelId]
  const save = async (raw: string) => {
    const models = { ...execution.settings.models }
    if (raw.trim() === '') {
      if (value === undefined) return
      delete models[modelId]
    } else {
      const next = Number(raw)
      if (!Number.isInteger(next) || next < 1) { toast.error(t('adv.range', { min: 1, max: '∞' })); return }
      if (next === value) return
      models[modelId] = next
    }
    try {
      setExecution(await engineApi.executionSettingsSet({ ...execution.settings, models }))
      toast.success(t('adv.saved'))
    } catch (e) {
      toast.error(commandMessage(e))
    }
  }
  return (
    <label className="adv-field" data-testid="model-output-cap">
      <span>{t('models.outputCap')}</span>
      <input type="number" min={1} className={inputClass} defaultValue={value ?? ''} placeholder={t('models.outputCapAuto')} onBlur={(event) => void save(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void save(event.currentTarget.value) }} />
      <small>{t('models.outputCapHint')}</small>
    </label>
  )
}
