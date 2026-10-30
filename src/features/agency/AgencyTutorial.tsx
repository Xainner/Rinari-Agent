import { useEffect, useState, type ComponentType } from 'react'
import {
  ArrowLeft, ArrowRight, Briefcase, CircleHelp, ClipboardList, Clock, Cpu, KanbanSquare, LayoutTemplate, MessageSquare,
  MessagesSquare, Plug, ScrollText, ShieldCheck, Sparkles, UserPlus, Wallet,
} from 'lucide-react'
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

type Icon = ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' }>
/** Lo que cuenta cada paso en el panel, además de lo que dice Rinari. */
const POINTS: Partial<Record<Step, Array<{ icon: Icon; key: string }>>> = {
  agents: [
    { icon: Briefcase, key: 'job' },
    { icon: Cpu, key: 'model' },
    { icon: Wallet, key: 'budget' },
    { icon: MessageSquare, key: 'chat' },
  ],
  teams: [
    { icon: MessagesSquare, key: 'office' },
    { icon: ClipboardList, key: 'errands' },
    { icon: KanbanSquare, key: 'board' },
  ],
  rules: [
    { icon: Clock, key: 'time' },
    { icon: Plug, key: 'connector' },
    { icon: ShieldCheck, key: 'autonomy' },
    { icon: ScrollText, key: 'log' },
  ],
}

/** `create`: «Créalo con Rinari»; `template`: elegir una plantilla; `later`: cerrar. */
export type AgencyTutorialNext = 'create' | 'template' | 'later'

interface AgencyTutorialProps {
  open: boolean
  onClose: (next: AgencyTutorialNext) => void
  /** Esta versión de Rinari trae plantillas (`agency_audit_v1`); sin ellas, «Usar una plantilla» dice «Pronto». */
  templatesAvailable?: boolean
  /** «Créalo con Rinari» (`agency_draft_v1`); sin él, la primera opción es crear a mano. */
  draftAvailable?: boolean
}

/**
 * El tutorial de la primera vez que se abre la Agency (D-20): cinco pasos
 * con Rinari de pie, como la bienvenida (#71), sobre la imagen de la
 * oficina. Esa imagen es lo que viene (la vista de 8 bits, A4) y se dice
 * así: nunca se ofrece como algo que ya se puede usar. El último paso es
 * una elección: crear con Rinari, usar una plantilla o dejarlo para después.
 */
export default function AgencyTutorial({ open, onClose, templatesAvailable = false, draftAvailable = true }: AgencyTutorialProps) {
  const { t } = useI18n()
  const [step, setStep] = useState<Step>('intro')

  useEffect(() => {
    if (open) setStep('intro')
  }, [open])

  const index = STEPS.indexOf(step)
  const last = index === STEPS.length - 1
  const pose = POSE_OF[step]
  const points = POINTS[step]

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
            <figure className="agency-tutorial-preview" key="preview">
              <div className="agency-tutorial-shot">
                <img src={agencyOffice} alt="" draggable={false} />
                <span className="agency-tutorial-soon">{t('agency.view.soon')}</span>
              </div>
              <figcaption>{t('agency.tutorial.officeNote')}</figcaption>
            </figure>
          )}

          {points && (
            <ul className="agency-tour-points" key={`points-${step}`}>
              {points.map(({ icon: PointIcon, key }, position) => (
                <li key={key} style={{ animationDelay: `${60 + position * 50}ms` }}>
                  <span className="agency-tour-icon"><PointIcon size={15} aria-hidden="true" /></span>
                  <span className="min-w-0">
                    <b>{t(`agency.tutorial.${step}.${key}.title` as I18nKey)}</b>
                    <small>{t(`agency.tutorial.${step}.${key}.copy` as I18nKey)}</small>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {last && (
            <div className="agency-tour-choices" role="group" aria-label={t('agency.tutorial.start.title')}>
              <button type="button" className="agency-tour-choice is-primary" onClick={() => onClose('create')} data-testid="agency-tutorial-create">
                <span className="agency-tour-icon">{draftAvailable ? <Sparkles size={16} aria-hidden="true" /> : <UserPlus size={16} aria-hidden="true" />}</span>
                <span className="min-w-0">
                  <b>{t(draftAvailable ? 'agency.tutorial.createWithRinari' : 'agency.tutorial.create')}</b>
                  <small>{t(draftAvailable ? 'agency.tutorial.createWithRinariCopy' : 'agency.tutorial.createCopy')}</small>
                </span>
              </button>
              <button
                type="button"
                className="agency-tour-choice"
                onClick={() => onClose('template')}
                disabled={!templatesAvailable}
                data-testid="agency-tutorial-template"
              >
                <span className="agency-tour-icon"><LayoutTemplate size={16} aria-hidden="true" /></span>
                <span className="min-w-0">
                  <b>{t('agency.tutorial.template')}{!templatesAvailable && <span className="agency-soon ml-2">{t('agency.view.soon')}</span>}</b>
                  <small>{t('agency.tutorial.templateCopy')}</small>
                </span>
              </button>
              <button type="button" className="agency-tour-choice" onClick={() => onClose('later')} data-testid="agency-tutorial-later">
                <span className="agency-tour-icon"><Clock size={16} aria-hidden="true" /></span>
                <span className="min-w-0">
                  <b>{t('agency.tutorial.later')}</b>
                  <small>{t('agency.tutorial.laterCopy')}</small>
                </span>
              </button>
            </div>
          )}

          <span className="flex-1" />
          {last && <p className="welcome-note"><CircleHelp size={13} aria-hidden="true" />{t('agency.tutorial.repeatNote')}</p>}
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
            {!last && (
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
