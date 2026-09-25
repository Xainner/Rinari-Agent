import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { engineApi, commandMessage, type ModelSummary, type ProviderSummary } from '../../services/engine'
import type { VisionSettings as Config } from '../../types/protocol.generated'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'
import { inputClass, Section } from './parts'

type Mode = Config['mode']

const MODES: ReadonlyArray<{ value: Mode; title: 'vision.mode.automatic' | 'vision.mode.dedicated' | 'vision.mode.conversation'; hint: 'vision.mode.automaticHint' | 'vision.mode.dedicatedHint' | 'vision.mode.conversationHint' }> = [
  { value: 'automatic', title: 'vision.mode.automatic', hint: 'vision.mode.automaticHint' },
  { value: 'dedicated', title: 'vision.mode.dedicated', hint: 'vision.mode.dedicatedHint' },
  { value: 'conversation', title: 'vision.mode.conversation', hint: 'vision.mode.conversationHint' },
]

/**
 * Ajustes > Visión e imágenes: cómo se analizan las imágenes y con qué modelo.
 * Si un modelo ve o no ya lo sabe el Engine por su catálogo (Actualizar
 * modelos), así que aquí no se declara a mano. Los cambios se guardan al
 * elegir; la ejecución de modelos vive en Avanzado.
 */
export default function VisionSettings({ models, providers }: { models: ModelSummary[]; providers: ProviderSummary[] }) {
  const { t } = useI18n()
  const [config, setConfig] = useState<Config>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void engineApi.visionSettingsGet().then(setConfig).catch((e) => setError(commandMessage(e)))
  }, [])

  const save = async (patch: Partial<Config>) => {
    if (!config) return
    const next = { ...config, ...patch }
    setBusy(true)
    setError('')
    try {
      // Sin `execution`: el Engine conserva la política de ejecución tal cual.
      const { execution: _execution, ...vision } = next
      setConfig(await engineApi.visionSettingsSet(vision as Config))
      window.dispatchEvent(new Event('rinari-vision-changed'))
      toast.success(t('vision.saved'))
    } catch (e) {
      setError(commandMessage(e))
    } finally {
      setBusy(false)
    }
  }

  // Modelos que ven, o de los que el catálogo aún no lo sabe (se pueden probar).
  const visual = (model: ModelSummary) => (config?.model_overrides?.[model.id] ?? model.capabilities?.vision) !== false
  const usable = models.filter((model) => model.saved !== false)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-bold text-[var(--text)]">{t('vision.title')}</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{t('vision.intro')}</p>
      </div>
      {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
      {config && (
        <>
          <Section title={t('vision.modeTitle')}>
            <div role="radiogroup" aria-label={t('vision.modeTitle')} className="grid gap-2 sm:grid-cols-3">
              {MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  role="radio"
                  aria-checked={config.mode === mode.value}
                  disabled={busy}
                  onClick={() => {
                    if (mode.value === config.mode) return
                    // Auxiliar sin modelo elegido: se elige abajo y ahí se guarda.
                    if (mode.value === 'dedicated' && !config.model_id) setConfig({ ...config, mode: mode.value })
                    else void save({ mode: mode.value })
                  }}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-60',
                    config.mode === mode.value
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                      : 'border-[var(--border)] hover:bg-[var(--bg-hover)]',
                  )}
                >
                  <span className="block text-sm font-medium text-[var(--text)]">{t(mode.title)}</span>
                  <span className="mt-0.5 block text-xs text-[var(--text-subtle)]">{t(mode.hint)}</span>
                </button>
              ))}
            </div>
          </Section>

          {config.mode !== 'conversation' && (
            <Section title={t('vision.modelTitle')} desc={t('vision.modelHint')}>
              <select
                aria-label={t('vision.modelTitle')}
                className={inputClass}
                disabled={busy}
                value={config.model_id ?? ''}
                onChange={(event) => void save({ model_id: event.target.value || null })}
              >
                <option value="">{t('vision.noModel')}</option>
                {providers.map((provider) => {
                  const options = usable.filter((model) => model.provider_id === provider.id && visual(model))
                  return options.length === 0 ? null : (
                    <optgroup key={provider.id} label={provider.alias}>
                      {options.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.alias}{model.capabilities?.vision === true ? '' : ` · ${t('vision.unknown')}`}
                        </option>
                      ))}
                    </optgroup>
                  )
                })}
              </select>
            </Section>
          )}
        </>
      )}
    </div>
  )
}
