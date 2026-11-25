import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, FolderOpen, MessageCircleQuestion, Plug, RotateCcw, Sparkles, Users, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../../i18n'
import { commandMessage, engineApi, type McpCatalogEntry, type ModelSummary, type ProviderSummary } from '../../../services/engine'
import { useUIStore } from '../../../stores/ui'
import ModelPicker from '../../../components/composer/ModelPicker'
import { ProgressBar } from '../../../components/ui/progress-bar'
import { RinariAvatar } from '../../rinari/RinariAvatar'
import { EditorHero, EditorPage } from '../AgencyEditor'
import { JobCancelledError, JobTimeoutError, runJob } from '../jobEvents'
import { useConnectorDirectory } from '../useConnectorDirectory'
import type { AgencyTeam, PlanPending, TeamDraftOutcome, TeamPlan } from '../types'
import PlanReview from './PlanReview'
import { blockers } from './planEdit'

/** Pensar un equipo entero lleva más que una ficha: si en 4 minutos no llega nada, se dice. */
const DRAFT_TIMEOUT_MS = 240_000
const MAX_DESCRIPTION = 4000
const MAX_FEEDBACK = 2000

type Phase =
  | { kind: 'describe' }
  | { kind: 'working'; reason: 'propose' | 'answers' | 'feedback' }
  | { kind: 'questions'; questions: string[]; answers: string[] }
  | { kind: 'review' }

interface TeamBuilderProps {
  /** Una plantilla para revisar en vez de describir. */
  templateId?: string
  onCreated: (team: AgencyTeam) => void
  onCancel: () => void
}

/**
 * «Arma tu equipo con Rinari»: el dueño describe lo que quiere y Rinari
 * propone el equipo completo (agentes, jefe, flujo, rutinas, carpetas,
 * manual y lo que usa cada uno), o pregunta lo que no queda claro. El dueño
 * lo revisa y lo ajusta aquí; nada se crea hasta «Crear equipo», y entonces
 * todo a la vez (`agency.team.apply`).
 */
export default function TeamBuilder({ templateId, onCreated, onCancel }: TeamBuilderProps) {
  const { t, lang } = useI18n()
  const [phase, setPhase] = useState<Phase>(templateId ? { kind: 'working', reason: 'propose' } : { kind: 'describe' })
  const [description, setDescription] = useState('')
  const [model, setModel] = useState<string | null>(null)
  const [plan, setPlan] = useState<TeamPlan | null>(null)
  const [pending, setPending] = useState<PlanPending[]>([])
  const [connectorStatus, setConnectorStatus] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState('')
  const [creating, setCreating] = useState(false)
  const [models, setModels] = useState<ModelSummary[]>([])
  const [providers, setProviders] = useState<ProviderSummary[]>([])
  const [catalog, setCatalog] = useState<McpCatalogEntry[]>([])
  const { marks } = useConnectorDirectory()
  const request = useRef<AbortController | null>(null)
  const creatingRef = useRef(false)
  const fromTemplate = Boolean(templateId)
  // App passes a new closure on every render: the template effect must not restart for it.
  const cancelRef = useRef(onCancel)
  cancelRef.current = onCancel

  useEffect(() => {
    engineApi.modelList().then((result) => setModels(result.models.filter((item) => item.saved !== false))).catch(() => {})
    engineApi.providerList().then((result) => setProviders(result.providers)).catch(() => {})
    engineApi.mcpCatalogList().then((result) => setCatalog(result.entries)).catch(() => {})
    return () => request.current?.abort()
  }, [])

  // Una plantilla llega ya armada: directo a revisarla.
  useEffect(() => {
    if (!templateId) return
    let alive = true
    engineApi.agencyTemplates(lang)
      .then((result) => {
        if (!alive) return
        const chosen = result.templates.find((item) => item.id === templateId)
        if (!chosen?.plan) throw new Error(t('agency.templates.failed'))
        setPlan(chosen.plan)
        setPhase({ kind: 'review' })
      })
      .catch((error) => {
        if (!alive) return
        toast.error(commandMessage(error))
        cancelRef.current()
      })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` follows `lang`
  }, [templateId, lang])

  // Lo que faltará y el estado de cada conector, contra lo que el dueño tiene ahora.
  useEffect(() => {
    if (phase.kind !== 'review' || !plan) return
    const timer = window.setTimeout(() => {
      engineApi.agencyTeamCheck(plan, lang)
        .then((result) => {
          setPending(result.pending)
          setConnectorStatus(result.connectors)
        })
        .catch(() => {})
    }, 450)
    return () => window.clearTimeout(timer)
  }, [plan, phase.kind, lang])

  const draft = async (
    reason: 'propose' | 'answers' | 'feedback',
    extra: { answers?: Array<{ question: string; answer: string }>; previous?: TeamPlan; feedback?: string },
    back: Phase,
  ) => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setPhase({ kind: 'working', reason })
    try {
      const outcome = await runJob<TeamDraftOutcome>(
        () => engineApi.agencyTeamDraft({ description: description.trim(), language: lang, model, ...extra }),
        (event) => {
          if (event.event === 'agency.team_draft.ready') {
            const payload = event.payload as Record<string, unknown>
            if (payload.kind === 'questions') return { kind: 'questions', questions: (payload.questions as string[]) ?? [] }
            if (payload.kind === 'plan' && payload.plan) {
              return { kind: 'plan', plan: payload.plan as TeamPlan, notes: [], pending: (payload.pending as PlanPending[]) ?? [] }
            }
          }
          if (event.event === 'agency.team_draft.failed') return { kind: 'failed', message: String(event.payload.message ?? '') }
          return null
        },
        DRAFT_TIMEOUT_MS,
        controller.signal,
      )
      if (outcome.kind === 'failed') {
        toast.error(outcome.message || t('agency.builder.failed'))
        setPhase(back)
        return
      }
      if (outcome.kind === 'questions') {
        setPhase({ kind: 'questions', questions: outcome.questions, answers: outcome.questions.map(() => '') })
        return
      }
      setPlan(outcome.plan)
      setPending(outcome.pending)
      setFeedback('')
      setPhase({ kind: 'review' })
    } catch (error) {
      if (error instanceof JobCancelledError) return
      toast.error(error instanceof JobTimeoutError ? t('agency.jobTimeout') : commandMessage(error))
      setPhase(back)
    }
  }

  const cancelWork = () => {
    request.current?.abort()
    request.current = null
    setPhase(plan ? { kind: 'review' } : { kind: 'describe' })
  }

  const problems = useMemo(() => (plan ? blockers(plan) : []), [plan])

  const create = async () => {
    if (!plan || problems.length > 0 || creatingRef.current) return
    creatingRef.current = true
    setCreating(true)
    try {
      const result = await engineApi.agencyTeamApply(plan)
      const missing = result.setup.filter((item) => item.status === 'pending').length
      toast.success(missing > 0
        ? t('agency.builder.createdPending', { name: result.team.name, n: missing })
        : t('agency.builder.created', { name: result.team.name }))
      onCreated(result.team)
    } catch (error) {
      toast.error(commandMessage(error))
      creatingRef.current = false
      setCreating(false)
    }
  }

  if (phase.kind === 'working') {
    return (
      <div className="agency-editor-page" data-testid="team-builder" data-phase="working">
        <div className="team-builder-working" role="status" aria-live="polite">
          <RinariAvatar state="thinking" size={72} />
          <h1 className="team-builder-working-title">
            {fromTemplate && !plan ? t('agency.settings.loading') : t(`agency.builder.working.${phase.reason}`)}
          </h1>
          {description.trim() && <p className="team-builder-working-quote">«{description.trim()}»</p>}
          <ProgressBar label={t('agency.builder.working.propose')} className="team-builder-working-bar" />
          {!fromTemplate && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={cancelWork} data-testid="team-builder-cancel-work">
              {t('common.cancel')}
            </button>
          )}
        </div>
      </div>
    )
  }

  if (phase.kind === 'questions') {
    const answers = phase.answers
    return (
      <EditorPage
        testId="team-builder"
        onSubmit={() => void draft('answers', {
          answers: phase.questions.map((question, index) => ({ question, answer: answers[index].trim() })),
        }, phase)}
        footer={(
          <>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPhase({ kind: 'describe' })}>
              <RotateCcw size={13} aria-hidden="true" /> {t('agency.builder.backToDescribe')}
            </button>
            <span className="flex-1" />
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>{t('common.cancel')}</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={answers.every((item) => !item.trim())} data-testid="team-builder-answer">
              <Sparkles size={13} aria-hidden="true" /> {t('agency.builder.propose')}
            </button>
          </>
        )}
      >
        <div className="team-builder-intro" data-phase="questions">
          <RinariAvatar state="waiting" size={56} />
          <div className="min-w-0">
            <p className="agency-editor-kicker">{t('agency.builder.kicker')}</p>
            <h1 className="team-builder-title">{t('agency.builder.questionsTitle')}</h1>
            <p className="team-builder-copy">{t('agency.builder.questionsCopy')}</p>
          </div>
        </div>
        <ol className="team-builder-questions">
          {phase.questions.map((question, index) => (
            <li key={`${index}:${question}`} className="team-builder-question" data-testid="team-builder-question">
              <label>
                <span className="team-builder-question-text"><MessageCircleQuestion size={15} aria-hidden="true" /> {question}</span>
                <textarea
                  className="field-input"
                  rows={2}
                  value={answers[index]}
                  maxLength={2000}
                  autoFocus={index === 0}
                  onChange={(event) => setPhase({ ...phase, answers: answers.map((item, at) => (at === index ? event.target.value : item)) })}
                />
              </label>
            </li>
          ))}
        </ol>
      </EditorPage>
    )
  }

  if (phase.kind === 'describe' || !plan) {
    const chosenModel = model ? models.find((item) => item.id === model) ?? null : null
    return (
      <EditorPage
        testId="team-builder"
        onSubmit={() => { if (description.trim()) void draft('propose', {}, { kind: 'describe' }) }}
        footer={(
          <>
            <span className="flex-1" />
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>{t('common.cancel')}</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={!description.trim()} data-testid="team-builder-propose">
              <Sparkles size={13} aria-hidden="true" /> {t('agency.builder.propose')}
            </button>
          </>
        )}
      >
        <div className="team-builder-intro">
          <RinariAvatar state="idle" size={56} />
          <div className="min-w-0">
            <p className="agency-editor-kicker">{t('agency.builder.kicker')}</p>
            <h1 className="team-builder-title">{t('agency.builder.title')}</h1>
            <p className="team-builder-copy">{t('agency.builder.copy')}</p>
          </div>
        </div>
        <div className="team-builder-prompt">
          <textarea
            className="team-builder-prompt-input"
            value={description}
            maxLength={MAX_DESCRIPTION}
            autoFocus
            aria-label={t('agency.builder.describe')}
            placeholder={t('agency.builder.placeholder')}
            onChange={(event) => setDescription(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && description.trim()) {
                event.preventDefault()
                void draft('propose', {}, { kind: 'describe' })
              }
            }}
            data-testid="team-builder-description"
          />
          <div className="team-builder-prompt-foot">
            <div className="agency-model-field team-builder-model" title={t('agency.builder.modelHint')}>
              <ModelPicker
                models={models}
                providers={providers}
                activeAlias={chosenModel?.alias ?? null}
                activeModel={chosenModel}
                missingLabel={t('agency.form.modelDefault')}
                onUseModel={(item) => setModel(item.id)}
                onDiscoverModels={() => {}}
                onOpenProviders={() => useUIStore.getState().goSettings('providers')}
              />
            </div>
            {model && (
              <button type="button" className="btn btn-quiet btn-xs" onClick={() => setModel(null)}>
                <RotateCcw size={12} aria-hidden="true" /> {t('agency.form.modelUseDefault')}
              </button>
            )}
            <span className="flex-1" />
            <span className="agency-count m-0">{description.length}/{MAX_DESCRIPTION}</span>
          </div>
        </div>
        <ul className="team-builder-tips" aria-label={t('agency.builder.tipsLabel')}>
          <li><span className="agency-tour-icon"><Users size={14} aria-hidden="true" /></span><span><b>{t('agency.builder.tip.who')}</b><small>{t('agency.builder.tip.whoCopy')}</small></span></li>
          <li><span className="agency-tour-icon"><CalendarClock size={14} aria-hidden="true" /></span><span><b>{t('agency.builder.tip.when')}</b><small>{t('agency.builder.tip.whenCopy')}</small></span></li>
          <li><span className="agency-tour-icon"><FolderOpen size={14} aria-hidden="true" /></span><span><b>{t('agency.builder.tip.where')}</b><small>{t('agency.builder.tip.whereCopy')}</small></span></li>
          <li><span className="agency-tour-icon"><Plug size={14} aria-hidden="true" /></span><span><b>{t('agency.builder.tip.with')}</b><small>{t('agency.builder.tip.withCopy')}</small></span></li>
        </ul>
      </EditorPage>
    )
  }

  const agentName = (key: string) => plan.agents.find((agent) => agent.key === key)?.name || t('agency.builder.agentUnnamed')
  const firstProblem = problems[0]

  return (
    <EditorPage
      testId="team-builder"
      onSubmit={() => void create()}
      footer={(
        <>
          {!fromTemplate && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPhase({ kind: 'describe' })}>
              <RotateCcw size={13} aria-hidden="true" /> {t('agency.builder.backToDescribe')}
            </button>
          )}
          {firstProblem && (
            <span className="team-builder-blocker" role="status" data-testid="team-builder-blocker">
              {t(`agency.builder.blocker.${firstProblem.key}`, { name: firstProblem.name ?? '' })}
            </span>
          )}
          <span className="flex-1" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={creating || problems.length > 0} data-testid="team-builder-create">
            {creating ? t('agency.templates.creating') : t('agency.builder.create')}
          </button>
        </>
      )}
    >
      <div data-phase="review" className="contents">
        <EditorHero
          media={<span className="agency-team-emblem"><Users size={30} aria-hidden="true" /></span>}
          kicker={fromTemplate ? t('agency.builder.kickerTemplate') : t('agency.builder.kickerReview')}
        >
          <input
            className="agency-title-input"
            value={plan.team.name}
            maxLength={60}
            aria-label={t('agency.team.name')}
            placeholder={t('agency.team.namePlaceholder')}
            onChange={(event) => setPlan({ ...plan, team: { ...plan.team, name: event.target.value } })}
            data-testid="team-builder-name"
          />
          <input
            className="agency-subtitle-input"
            value={plan.team.purpose}
            title={plan.team.purpose || undefined}
            maxLength={2000}
            aria-label={t('agency.builder.purpose')}
            placeholder={t('agency.builder.purpose')}
            onChange={(event) => setPlan({ ...plan, team: { ...plan.team, purpose: event.target.value } })}
          />
        </EditorHero>

        {!fromTemplate && (
          <div className="agency-draft-card team-builder-feedback" data-testid="team-builder-feedback">
            <span className="agency-draft-spark" aria-hidden="true"><Wand2 size={16} /></span>
            <div className="min-w-0 flex-1">
              <p className="agency-draft-title">{t('agency.builder.feedbackTitle')}</p>
              <div className="agency-draft-row">
                <input
                  className="field-input"
                  value={feedback}
                  maxLength={MAX_FEEDBACK}
                  aria-label={t('agency.builder.feedbackTitle')}
                  placeholder={t('agency.builder.feedbackPlaceholder')}
                  onChange={(event) => setFeedback(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      if (feedback.trim()) void draft('feedback', { previous: plan, feedback: feedback.trim() }, { kind: 'review' })
                    }
                  }}
                  data-testid="team-builder-feedback-input"
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={!feedback.trim()}
                  onClick={() => void draft('feedback', { previous: plan, feedback: feedback.trim() }, { kind: 'review' })}
                >
                  <Sparkles size={13} aria-hidden="true" /> {t('agency.builder.feedbackSend')}
                </button>
              </div>
            </div>
          </div>
        )}

        {pending.length > 0 && (
          <section className="team-builder-pending" aria-labelledby="team-builder-pending-title" data-testid="team-builder-pending">
            <div className="team-builder-pending-head">
              <Plug size={15} aria-hidden="true" />
              <h2 id="team-builder-pending-title">{t('agency.builder.pendingTitle')}</h2>
            </div>
            <ul>
              {pending.map((item, index) => (
                <li key={`${item.agent}:${item.kind}:${item.catalog_id ?? item.need ?? index}`}>
                  <span className="r-chip" data-tone="warning">{item.kind === 'catalog' ? t('agency.builder.pendingConnect') : t('agency.builder.pendingMissing')}</span>
                  <span className="min-w-0 flex-1">
                    {item.kind === 'catalog'
                      ? t('agency.builder.pendingCatalog', { name: item.name ?? item.catalog_id ?? '', agent: agentName(item.agent) })
                      : t('agency.builder.pendingNeed', { need: item.need ?? '', agent: agentName(item.agent) })}
                  </span>
                </li>
              ))}
            </ul>
            <p className="field-hint mt-0">{t('agency.builder.pendingHint')}</p>
          </section>
        )}

        <PlanReview
          plan={plan}
          onChange={setPlan}
          context={{ marks, catalog, connectorStatus, pending, models, providers }}
        />
      </div>
    </EditorPage>
  )
}
