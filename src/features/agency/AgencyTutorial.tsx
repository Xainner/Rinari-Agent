import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, UserPlus } from 'lucide-react'
import { useI18n, type I18nKey } from '../../i18n'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import { art, type StandingPose } from '../rinari/art'
import agencyOffice from '../../assets/agency/agency-office.webp'

const STEPS = ['intro', 'agents', 'teams', 'rules', 'start'] as const
type Step = (typeof STEPS)[number]

/** Rinari de pie, una pose por paso (sección 2.1 del plan). */
const POSE_OF: Record<Step, StandingPose> = {
  intro: 'hello',
  agents: 'think',
  teams: 'wink',
  rules: 'wait',
  start: 'happy',
}
const POSES = Array.from(new Set(Object.values(POSE_OF)))

interface AgencyTutorialProps {
  open: boolean
  /** `create`: el dueño pidió crear su primer agente al terminar. */
  onClose: (next: 'create' | 'later') => void
}

/**
 * El tutorial de la primera vez que se abre la Agency (D-20): cinco pasos
 * con Rinari de pie, como la bienvenida (#71), sobre la imagen de la
 * oficina. Esa imagen es lo que viene (la vista de 8 bits, A4) y se dice
 * así: nunca se ofrece como algo que ya se puede usar.
 */
export default function AgencyTutorial({ open, onClose }: AgencyTutorialProps) {
  const { t } = useI18n()
  const [step, setStep] = useState<Step>('intro')

  useEffect(() => {
    if (open) setStep('intro')
  }, [open])

  const index = STEPS.indexOf(step)
  const last = index === STEPS.length - 1
  const pose = POSE_OF[step]

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose('later') }}>
      <DialogContent className="welcome-dialog agency-tutorial" data-testid="agency-tutorial" data-step={step}>
        <div className="welcome-hero">
          <div className="welcome-room agency-tutorial-office" aria-hidden="true" style={{ backgroundImage: `url(${agencyOffice})` }} />
          <div className="welcome-figure" aria-hidden="true">
            {POSES.map((value) => (
              <img key={value} src={art.standing(value)} alt="" draggable={false} data-on={value === pose || undefined} />
            ))}
          </div>
          <div className="welcome-say">
            <span className="welcome-say-name" aria-hidden="true">Rinari</span>
            <DialogDescription key={step} className="welcome-copy">
              {t(`agency.tutorial.${step}.copy` as I18nKey)}
            </DialogDescription>
          </div>
        </div>

        <div className="welcome-panel">
          <div className="welcome-head">
            <ol className="welcome-progress" aria-label={t('agency.tutorial.progress', { n: index + 1, total: STEPS.length })}>
              {STEPS.map((value, position) => <li key={value} data-state={position < index ? 'done' : position === index ? 'active' : 'pending'} />)}
            </ol>
            <span className="welcome-count" aria-hidden="true">{index + 1}/{STEPS.length}</span>
          </div>
          <DialogTitle key={step} className="welcome-title">{t(`agency.tutorial.${step}.title` as I18nKey)}</DialogTitle>

          {step === 'intro' && (
            <figure className="agency-tutorial-preview">
              <img src={agencyOffice} alt="" draggable={false} />
              <figcaption>{t('agency.tutorial.officeNote')}</figcaption>
            </figure>
          )}

          <span className="flex-1" />
          <div className="welcome-actions">
            {!last && (
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => onClose('later')} data-testid="agency-tutorial-skip">
                {t('agency.tutorial.skip')}
              </button>
            )}
            <span className="flex-1" />
            {index > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep(STEPS[index - 1])}>
                <ArrowLeft size={13} aria-hidden="true" /> {t('agency.tutorial.back')}
              </button>
            )}
            {last ? (
              <>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onClose('later')} data-testid="agency-tutorial-later">
                  {t('agency.tutorial.later')}
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => onClose('create')} data-testid="agency-tutorial-create">
                  <UserPlus size={13} aria-hidden="true" /> {t('agency.tutorial.create')}
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setStep(STEPS[index + 1])} data-testid="agency-tutorial-next">
                {t('agency.tutorial.next')} <ArrowRight size={13} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
