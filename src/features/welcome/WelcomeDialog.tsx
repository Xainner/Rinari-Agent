import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Brain, Check, Code2, FileText, GraduationCap, Palette, Plus, Workflow, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n, type I18nKey } from '../../i18n'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import { commandMessage, engineApi, type AboutMe } from '../../services/engine'
import { useCalmMotion } from '../../lib/motion'
import { art, type StandingPose } from '../rinari/art'

/** Los usos que se ofrecen (#71); orientan, no limitan nada. */
export const USES = ['code', 'design', 'documents', 'research', 'automation', 'learning'] as const
type Use = (typeof USES)[number]

const USE_ICONS: Record<Use, LucideIcon> = {
  code: Code2,
  design: Palette,
  documents: FileText,
  research: BookOpen,
  automation: Workflow,
  learning: GraduationCap,
}

const STEPS = ['name', 'uses', 'preferences'] as const
type Step = (typeof STEPS)[number]

/** Rinari de pie, una pose por paso; todas montadas para cruzarlas sin parpadeo. */
const POSES: StandingPose[] = ['hello', 'wink', 'think', 'wait', 'happy']
/** Lo que se ve la pose feliz antes de cerrar, al terminar. */
const HAPPY_MS = 520

/**
 * Bienvenida de primer uso (plan 0.4.0 #71): cómo llamarte, para qué vas a
 * usar a Rinari y cómo te gusta trabajar. Todo se puede saltar; lo que se
 * responde va a la memoria del usuario (el nombre siempre entra al prompt).
 * Va antes de conectar un proveedor y se repite desde Ajustes → Memoria.
 *
 * Rinari está de pie en su cuarto, como en la bienvenida del móvil: cambia de
 * pose con cada paso y dice la explicación en su cuadro de diálogo.
 */
export default function WelcomeDialog({ open, onClose, repeat = false }: { open: boolean; onClose: (saved: boolean) => void; repeat?: boolean }) {
  const { t } = useI18n()
  const calm = useCalmMotion()
  const [step, setStep] = useState<Step>('name')
  const [name, setName] = useState('')
  const [uses, setUses] = useState<string[]>([])
  const [other, setOther] = useState('')
  const [otherOn, setOtherOn] = useState(false)
  const [preferences, setPreferences] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  // Al repetirla, se parte de lo que ya se contó.
  useEffect(() => {
    if (!open) return
    setStep('name')
    setDone(false)
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
  const pose: StandingPose = done ? 'happy' : step === 'name' ? (repeat ? 'wink' : 'hello') : step === 'uses' ? 'think' : 'wait'
  const greeting = step === 'uses' && name.trim() !== '' ? t('welcome.nice', { name: name.trim() }) : ''

  const save = async () => {
    setSaving(true)
    try {
      const allUses = [...uses, ...(otherOn ? other.split(',').map((value) => value.trim()).filter(Boolean) : [])]
      await engineApi.aboutSet({ name: name.trim() || null, uses: allUses, preferences: preferences.trim() || null })
      // Se despide contenta un instante antes de cerrar (sin movimiento, al momento).
      setDone(true)
      if (!calm) await new Promise((resolve) => window.setTimeout(resolve, HAPPY_MS))
      onClose(true)
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(false) }}>
      <DialogContent className="welcome-dialog" data-testid="welcome-dialog" data-step={step}>
        <div className="welcome-hero">
          <div className="welcome-room" aria-hidden="true" style={{ backgroundImage: `url(${art.room()})` }} />
          <div className="welcome-figure" aria-hidden="true">
            {POSES.map((value) => (
              <img key={value} src={art.standing(value)} alt="" draggable={false} data-on={value === pose || undefined} />
            ))}
          </div>
          <div className="welcome-say">
            <span className="welcome-say-name" aria-hidden="true">Rinari</span>
            <DialogDescription key={step} className="welcome-copy">
              {greeting && <strong className="welcome-greeting">{greeting} </strong>}
              {t(`welcome.${step}.copy` as I18nKey)}
            </DialogDescription>
          </div>
        </div>

        <div className="welcome-panel">
          <div className="welcome-head">
            <ol className="welcome-progress" aria-label={t('welcome.progress', { n: index + 1, total: STEPS.length })}>
              {STEPS.map((value, position) => <li key={value} data-state={position < index ? 'done' : position === index ? 'active' : 'pending'} />)}
            </ol>
            <span className="welcome-count" aria-hidden="true">{index + 1}/{STEPS.length}</span>
          </div>
          <DialogTitle key={step} className="welcome-title">{t(`welcome.${step}.title` as I18nKey)}</DialogTitle>

          <div key={`field-${step}`} className="welcome-field">
            {step === 'name' && (
              <input
                autoFocus
                className="welcome-input welcome-input-name"
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
                {USES.map((use) => {
                  const Icon = USE_ICONS[use]
                  const on = uses.includes(use)
                  return (
                    <button key={use} type="button" className="welcome-chip" aria-pressed={on} onClick={() => toggle(use)}>
                      <span className="welcome-chip-icon" aria-hidden="true">{on ? <Check size={14} /> : <Icon size={14} />}</span>
                      {t(`welcome.use.${use}` as I18nKey)}
                    </button>
                  )
                })}
                <button type="button" className="welcome-chip" aria-pressed={otherOn} onClick={() => setOtherOn((value) => !value)}>
                  <span className="welcome-chip-icon" aria-hidden="true">{otherOn ? <Check size={14} /> : <Plus size={14} />}</span>
                  {t('welcome.use.other')}
                </button>
                {otherOn && (
                  <input
                    autoFocus
                    className="welcome-input welcome-other"
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
                rows={5}
                placeholder={t('welcome.preferences.placeholder')}
                aria-label={t('welcome.preferences.title')}
                onChange={(event) => setPreferences(event.target.value)}
              />
            )}
          </div>

          <p className="welcome-note"><Brain size={13} aria-hidden="true" /> {t('welcome.note')}</p>

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
        </div>
      </DialogContent>
    </Dialog>
  )
}
