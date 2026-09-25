import { ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { engineApi, commandMessage, type ModelSummary, type ProviderSummary } from '../../services/engine'
import type { VisionSettings as Config } from '../../types/protocol.generated'
import { useI18n } from '../../i18n'
import { inputClass } from './parts'

type Execution = NonNullable<Config['execution']>
type TimeoutKey = 'connect' | 'first_byte' | 'idle' | 'total'
const TIMEOUT_KEYS: readonly TimeoutKey[] = ['connect', 'first_byte', 'idle', 'total']
const TIMEOUT_DEFAULTS: Record<TimeoutKey, number> = { connect: 15, first_byte: 120, idle: 120, total: 900 }
const TIMEOUT_LABEL = {
  connect: 'execution.timeout.connect',
  first_byte: 'execution.timeout.firstByte',
  idle: 'execution.timeout.idle',
  total: 'execution.timeout.total',
} as const

const numberOrNull = (value: string): number | null => (value.trim() === '' ? null : Number(value))

/**
 * Ajustes > Avanzado > Ejecución de modelos: cuántas llamadas van a la vez a
 * cada proveedor, cuánto se espera y el máximo de salida por modelo. Con los
 * valores por defecto funciona sola; se toca solo para un servidor lento o
 * limitado. El Engine la guarda junto a la configuración de visión (misma
 * vía de protocolo) y la aplica en todas las rutas.
 */
export default function ExecutionSettings({ models, providers }: { models: ModelSummary[]; providers: ProviderSummary[] }) {
  const { t } = useI18n()
  const [config, setConfig] = useState<Config>()
  const [draft, setDraft] = useState<Execution>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void engineApi.visionSettingsGet().then((value) => {
      setConfig(value)
      setDraft(value.execution ?? undefined)
    }).catch((e) => setError(commandMessage(e)))
  }, [])
  if (!config || !draft) return error ? <p role="alert" className="text-sm text-[var(--danger)]">{error}</p> : null

  const dirty = JSON.stringify(draft) !== JSON.stringify(config.execution)
  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const saved = await engineApi.visionSettingsSet({ ...config, execution: draft })
      setConfig(saved)
      setDraft(saved.execution ?? draft)
      toast.success(t('execution.saved'))
    } catch (e) {
      setError(commandMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const setMap = (key: 'providers' | 'models', id: string, value: number | null) => {
    const next: Record<string, number> = { ...draft[key] }
    if (value === null) delete next[id]
    else next[id] = value
    setDraft({ ...draft, [key]: next })
  }
  const setTimeout = (key: TimeoutKey, value: number | null, providerId?: string) => {
    if (providerId) {
      const current = { ...(draft.provider_timeouts?.[providerId] as Record<string, number> | undefined) }
      if (value === null) delete current[key]
      else current[key] = value
      setDraft({ ...draft, provider_timeouts: { ...draft.provider_timeouts, [providerId]: current } })
      return
    }
    const current = { ...draft.timeouts }
    if (value === null) delete current[key]
    else current[key] = value
    setDraft({ ...draft, timeouts: current })
  }
  const usable = models.filter((model) => model.saved !== false)
  const fieldClass = `${inputClass} h-9`

  return (
    <details className="group rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-sm font-medium text-[var(--text)]">
        <ChevronRight size={14} aria-hidden="true" className="transition-transform group-open:rotate-90" />
        <span className="flex-1">{t('execution.title')}</span>
        <span className="text-xs font-normal text-[var(--text-subtle)]">{t('execution.defaultsWork')}</span>
      </summary>
      <div className="space-y-5 border-t border-[var(--border)] p-4">
        <p className="text-xs text-[var(--text-muted)]">{t('execution.hint')}</p>
        <label className="flex items-center justify-between gap-4 text-sm text-[var(--text)]">
          {t('execution.concurrency')}
          <input type="number" min={1} className={`${fieldClass} w-24`} value={draft.max_concurrency} onChange={(e) => setDraft({ ...draft, max_concurrency: Number(e.target.value) })} />
        </label>

        <div className="space-y-2">
          <p className="text-sm font-medium text-[var(--text)]">{t('execution.timeouts')}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TIMEOUT_KEYS.map((key) => (
              <label key={key} className="text-xs text-[var(--text-muted)]">
                {t(TIMEOUT_LABEL[key])}
                <input type="number" min={1} className={fieldClass} placeholder={String(TIMEOUT_DEFAULTS[key])} value={draft.timeouts?.[key] ?? ''} onChange={(e) => setTimeout(key, numberOrNull(e.target.value))} />
              </label>
            ))}
          </div>
        </div>

        {providers.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-[var(--text)]">{t('execution.perProvider')}</p>
            {providers.map((provider) => (
              <div key={provider.id} className="grid grid-cols-2 gap-2 rounded-lg border border-[var(--border)] p-2 sm:grid-cols-5">
                <label className="text-xs text-[var(--text-muted)]">
                  {provider.alias}
                  <input type="number" min={1} className={fieldClass} aria-label={`${t('execution.concurrency')}: ${provider.alias}`} placeholder={`${draft.max_concurrency}`} value={draft.providers[provider.id] ?? ''} onChange={(e) => setMap('providers', provider.id, numberOrNull(e.target.value))} />
                </label>
                {TIMEOUT_KEYS.map((key) => (
                  <label key={key} className="text-xs text-[var(--text-muted)]">
                    {t(TIMEOUT_LABEL[key])}
                    <input type="number" min={1} className={fieldClass} placeholder={t('execution.inherit')} value={(draft.provider_timeouts?.[provider.id] as Record<string, number> | undefined)?.[key] ?? ''} onChange={(e) => setTimeout(key, numberOrNull(e.target.value), provider.id)} />
                  </label>
                ))}
              </div>
            ))}
          </div>
        )}

        {usable.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-[var(--text)]">{t('execution.maxOutput')}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {usable.map((model) => (
                <label key={model.id} className="flex items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
                  <span className="truncate">{model.alias}</span>
                  <input type="number" min={1} className={`${fieldClass} w-28`} placeholder={t('execution.inherit')} value={draft.models[model.id] ?? ''} onChange={(e) => setMap('models', model.id, numberOrNull(e.target.value))} />
                </label>
              ))}
            </div>
          </div>
        )}

        {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
        <div className="flex justify-end">
          <button type="button" disabled={busy || !dirty} onClick={() => void save()} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {t('execution.save')}
          </button>
        </div>
      </div>
    </details>
  )
}
