import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useI18n, type I18nKey } from '../../i18n'
import { commandMessage, engineApi } from '../../services/engine'

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
    <section data-testid="resume-setting" className="space-y-2 rounded-2xl border border-[var(--line-1)] px-4 py-3">
      <div role="radiogroup" aria-label={t('resume.setting')} className="flex flex-wrap items-center gap-2">
        <span className="mr-2 text-sm font-medium text-[var(--text)]">{t('resume.setting')}</span>
        {MODES.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={mode === option}
            onClick={() => void choose(option)}
            className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${mode === option ? 'border-[var(--accent)] bg-[var(--bg-active)] font-semibold text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'}`}
          >
            {t(`resume.setting.${option}` as I18nKey)}
          </button>
        ))}
      </div>
      <p className="text-xs text-[var(--text-subtle)]">{t('resume.settingHint')}</p>
    </section>
  )
}
