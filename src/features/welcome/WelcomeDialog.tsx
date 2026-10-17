import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n, type I18nKey } from '../../i18n'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import { commandMessage, engineApi, type AboutMe } from '../../services/engine'
import { art } from '../rinari/art'

/** Los usos que se ofrecen (#71); orientan, no limitan nada. */
export const USES = ['code', 'design', 'documents', 'research', 'automation', 'learning'] as const
type Use = (typeof USES)[number]

const STEPS = ['name', 'uses', 'preferences'] as const
type Step = (typeof STEPS)[number]

/**
 * Bienvenida de primer uso (plan 0.4.0 #71): cómo llamarte, para qué vas a
 * usar a Rinari y cómo te gusta trabajar. Todo se puede saltar; lo que se
 * responde va a la memoria del usuario (el nombre siempre entra al prompt).
 * Va antes de conectar un proveedor y se repite desde Ajustes → Memoria.
 */
export default function WelcomeDialog({ open, onClose, repeat = false }: { open: boolean; onClose: (saved: boolean) => void; repeat?: boolean }) {
  const { t } = useI18n()
  const [step, setStep] = useState<Step>('name')
  const [name, setName] = useState('')
  const [uses, setUses] = useState<string[]>([])
  const [other, setOther] = useState('')
  const [otherOn, setOtherOn] = useState(false)
  const [preferences, setPreferences] = useState('')
  const [saving, setSaving] = useState(false)

  // Al repetirla, se parte de lo que ya se contó.
  useEffect(() => {
    if (!open) return
    setStep('name')
    if (!repeat) return
    engineApi.aboutGet().then((about: AboutMe) => {
      setName(about.name ?? '')
      const known = about.uses.filter((use) => (USES as readonly string[]).includes(use))
      const extra = about.uses.filter((use) => !(USES as readonly string[]).includes(use))
      setUses(known)
      setOther(extra.join(', '))
      setOtherOn(extra.length > 0)
      setPreferences(about.preferences ?? '')
    }).catch(() => {})
  }, [open, repeat])

  const index = STEPS.indexOf(step)
  const last = index === STEPS.length - 1
  const toggle = (use: Use) => setUses((current) => (current.includes(use) ? current.filter((value) => value !== use) : [...current, use]))

  const save = async () => {
    setSaving(true)
    try {
      const allUses = [...uses, ...(otherOn ? other.split(',').map((value) => value.trim()).filter(Boolean) : [])]
      await engineApi.aboutSet({ name: name.trim() || null, uses: allUses, preferences: preferences.trim() || null })
      onClose(true)
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(false) }}>
      <DialogContent className="welcome-dialog max-w-xl" data-testid="welcome-dialog" data-step={step}>
        <div className="welcome-hero" aria-hidden="true">
          <img src={art.chibi(step === 'name' ? 'wave' : step === 'uses' ? 'telescope' : 'typing')} alt="" draggable={false} />
        </div>
        <ol className="welcome-progress" aria-label={t('welcome.progress', { n: index + 1, total: STEPS.length })}>
          {STEPS.map((value, position) => <li key={value} data-state={position < index ? 'done' : position === index ? 'active' : 'pending'} />)}
        </ol>
        <DialogTitle className="welcome-title">{t(`welcome.${step}.title` as I18nKey)}</DialogTitle>
        <DialogDescription className="welcome-copy">{t(`welcome.${step}.copy` as I18nKey)}</DialogDescription>

        {step === 'name' && (
          <input
            autoFocus
            className="welcome-input"
            value={name}
            maxLength={60}
            placeholder={t('welcome.name.placeholder')}
            aria-label={t('welcome.name.title')}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') setStep('uses') }}
          />
        )}
        {step === 'uses' && (
          <div className="welcome-chips" role="group" aria-label={t('welcome.uses.title')}>
            {USES.map((use) => (
              <button key={use} type="button" className="welcome-chip" aria-pressed={uses.includes(use)} onClick={() => toggle(use)}>
                {uses.includes(use) && <Check size={13} aria-hidden="true" />} {t(`welcome.use.${use}` as I18nKey)}
              </button>
            ))}
            <button type="button" className="welcome-chip" aria-pressed={otherOn} onClick={() => setOtherOn((value) => !value)}>
              {otherOn && <Check size={13} aria-hidden="true" />} {t('welcome.use.other')}
            </button>
            {otherOn && (
              <input
                autoFocus
                className="welcome-input"
                value={other}
                maxLength={200}
                placeholder={t('welcome.use.otherPlaceholder')}
                aria-label={t('welcome.use.other')}
                onChange={(event) => setOther(event.target.value)}
              />
            )}
          </div>
        )}
        {step === 'preferences' && (
          <textarea
            autoFocus
            className="welcome-input welcome-textarea"
            value={preferences}
            maxLength={1000}
            rows={4}
            placeholder={t('welcome.preferences.placeholder')}
            aria-label={t('welcome.preferences.title')}
            onChange={(event) => setPreferences(event.target.value)}
          />
        )}

        <div className="welcome-actions">
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => onClose(false)} data-testid="welcome-skip">
            {t('welcome.skip')}
          </button>
          <span className="flex-1" />
          {index > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep(STEPS[index - 1])}>
              <ArrowLeft size={13} aria-hidden="true" /> {t('welcome.back')}
            </button>
          )}
          {last ? (
            <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => void save()} data-testid="welcome-finish">
              {repeat ? t('welcome.save') : t('welcome.finish')} <ArrowRight size={13} aria-hidden="true" />
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setStep(STEPS[index + 1])} data-testid="welcome-next">
              {t('welcome.next')} <ArrowRight size={13} aria-hidden="true" />
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
