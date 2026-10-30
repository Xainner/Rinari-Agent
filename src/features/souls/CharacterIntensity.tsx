import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { commandMessage, engineApi } from '../../services/engine'
import { useI18n, type I18nKey } from '../../i18n'
import { instant, spring, useCalmMotion } from '../../lib/motion'
import { RinariAvatar, type RinariState } from '../rinari/RinariAvatar'
import { art, type Expression } from '../rinari/art'

type Intensity = 'minimal' | 'balanced' | 'full'
const LEVELS: Intensity[] = ['minimal', 'balanced', 'full']
const FACE: Record<Intensity, RinariState> = { minimal: 'idle', balanced: 'streaming', full: 'done' }
/** La cara de cada ejemplo de «Así suena». */
const PREVIEW_FACE: Record<'greeting' | 'result' | 'error', Expression> = { greeting: 'laugh', result: 'proud', error: 'pout' }

/**
 * Cuánto personaje pone Rinari en sus respuestas (`soul_character_intensity_v1`).
 * Lo guarda el Engine y lo comparte con la CLI; no cambia permisos ni la
 * verdad de lo que reporta, solo la voz. Sin la capacidad, no se ofrece.
 */
export default function CharacterIntensity() {
  const { t } = useI18n()
  const calm = useCalmMotion()
  const [value, setValue] = useState<Intensity | null>(null)
  const [supported, setSupported] = useState(false)

  useEffect(() => {
    let alive = true
    void Promise.resolve().then(() => engineApi.status()).then((status) => {
      if (!alive || status.capabilities?.soul_character_intensity_v1 !== true) return
      setSupported(true)
      void engineApi.soulSettingsGet().then((result) => { if (alive) setValue(result.settings.character_intensity) }).catch(() => {})
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  if (!supported || value === null) return null

  async function choose(next: Intensity) {
    const previous = value
    setValue(next)
    try {
      const result = await engineApi.soulSettingsSet(next)
      setValue(result.settings.character_intensity)
    } catch (err) {
      setValue(previous)
      toast.error(commandMessage(err))
    }
  }

  return (
    <section className="settings-card">
      <div className="flex items-start gap-4">
        <RinariAvatar state={FACE[value]} size={52} />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[16px] font-bold text-[var(--text)]">{t('soul.intensity.title')}</h3>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">{t('soul.intensity.desc')}</p>
        </div>
      </div>
      <div className="seg-tabs mt-4" role="radiogroup" aria-label={t('soul.intensity.title')}>
        {LEVELS.map((level) => (
          <button key={level} type="button" role="radio" aria-checked={value === level} className="seg-tab flex-1" onClick={() => void choose(level)}>
            {value === level && <motion.span layoutId="soul-intensity" className="seg-tab-pill" transition={calm ? instant : spring} aria-hidden="true" />}
            <span className="relative">{t(`soul.intensity.${level}`)}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-[12.5px] text-[var(--accent-2)]">{t(`soul.intensity.${value}Hint`)}</p>
      {/* Cómo suena cada nivel (#87): ejemplos escritos a mano, sin llamar al modelo. */}
      <div className="soul-preview" data-testid="soul-preview" data-level={value} aria-live="polite">
        <p className="soul-preview-title">{t('soul.preview.title')}</p>
        {(['greeting', 'result', 'error'] as const).map((kind) => (
          <div key={kind} className="soul-preview-line" data-kind={kind}>
            <img className="soul-preview-face" src={art.expression(PREVIEW_FACE[kind])} alt="" aria-hidden="true" draggable={false} />
            <div className="min-w-0">
              <span className="soul-preview-label">{t(`soul.preview.${kind}` as I18nKey)}</span>
              {/* La clave cambia con el nivel: el texto nuevo entra como cambio, no de golpe. */}
              <p key={value} className="soul-preview-text">{t(`soul.preview.${value}.${kind}` as I18nKey)}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
