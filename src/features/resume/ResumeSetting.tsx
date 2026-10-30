import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useI18n, type I18nKey } from '../../i18n'
import { commandMessage, engineApi } from '../../services/engine'
import { Section } from '../../components/settings/parts'
import { SegTabPill } from '../../components/ui/SegTabPill'

type Mode = 'ask' | 'always' | 'never'
const MODES: Mode[] = ['ask', 'always', 'never']

/**
 * Ajustes → Proveedores: qué hace Rinari cuando un turno se corta por un
 * límite del proveedor (plan 0.4.0 #24). «Siempre» también deja seguir solo a
 * un objetivo desatendido.
 */
export default function ResumeSetting() {
  const { t } = useI18n()
  const [mode, setMode] = useState<Mode | null>(null)

  useEffect(() => {
    let alive = true
    Promise.resolve().then(() => engineApi.resumeSettings())
      .then((result) => { if (alive) setMode(result.auto_resume_on_limits) })
      .catch(() => { /* an older Engine: the setting is not shown */ })
    return () => { alive = false }
  }, [])

  if (mode === null) return null

  async function choose(next: Mode) {
    const previous = mode
    setMode(next)
    try {
      setMode((await engineApi.setResumeSettings(next)).auto_resume_on_limits)
    } catch (err) {
      setMode(previous)
      toast.error(commandMessage(err))
    }
  }

  return (
    <div data-testid="resume-setting">
    <Section title={t('resume.setting')} desc={t('resume.settingHint')}>
      <div role="radiogroup" aria-label={t('resume.setting')} className="seg-tabs w-fit">
        {MODES.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={mode === option}
            onClick={() => void choose(option)}
            className="seg-tab"
          >
            {mode === option && <SegTabPill />}
            <span className="relative">{t(`resume.setting.${option}` as I18nKey)}</span>
          </button>
        ))}
      </div>
    </Section>
    </div>
  )
}
