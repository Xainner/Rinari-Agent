import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Flag, Hourglass, Lightbulb, Pause, Play, Square, Timer, TriangleAlert, X } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'
import { commandMessage, engineApi } from '../../services/engine'
import type { Goal } from '../../types/protocol.generated'
import { useGoalStore } from './goalStore'

type GoalState = Goal['state']

/** Color del chip y del marco por estado: violeta mientras persigue, verde al lograrlo, ámbar si te necesita. */
const TONES: Record<GoalState, 'accent' | 'success' | 'warning' | 'neutral'> = {
  pursuing: 'accent',
  achieved: 'success',
  blocked: 'warning',
  stalled: 'warning',
  budget_limited: 'warning',
  waiting_limits: 'neutral',
  paused: 'neutral',
  cleared: 'neutral',
}

/**
 * The goal of the conversation above the composer (plan 0.4.0 #23): the
 * objective, its state, the iteration, time and tokens, and what the owner
 * can do: pause, resume, end, cap it, or give a hint when it is blocked or
 * stalled. Nothing appears without a goal.
 */
export function GoalDock({ sessionId, onHint }: { sessionId: string; onHint?: (text: string) => void }) {
  const { t } = useI18n()
  const goal = useGoalStore((state) => state.bySession[sessionId]?.goal ?? null)
  const known = useGoalStore((state) => sessionId in state.bySession)
  const apply = useGoalStore((state) => state.apply)
  const [capOpen, setCapOpen] = useState(false)
  const [hintOpen, setHintOpen] = useState(false)
  // Animar cambios, no montajes: el dock entra cuando se pone un objetivo con
  // la conversación abierta, no al abrir una conversación que ya lo tenía.
  const seenWithout = useRef(false)
  const enter = useRef<boolean | null>(null)
  if (known && !goal) { seenWithout.current = true; enter.current = null }
  if (goal && enter.current === null) enter.current = seenWithout.current
  // El check se dibuja solo si se le vio pasar de perseguir a logrado (§5).
  const sawActive = useRef(false)
  if (goal && goal.state !== 'achieved') sawActive.current = true

  useEffect(() => {
    if (!sessionId || useGoalStore.getState().bySession[sessionId]) return
    let cancelled = false
    engineApi.sessionGoal(sessionId)
      .then((result) => { if (!cancelled && !useGoalStore.getState().bySession[sessionId]) apply(sessionId, result.goal ?? null) })
      .catch(() => { /* an older Engine: no goals */ })
    return () => { cancelled = true }
  }, [sessionId, apply])

  if (!goal) return null

  const run = async (action: () => Promise<{ goal: Goal | null }>) => {
    try {
      const result = await action()
      apply(sessionId, result.goal ?? null)
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  const pursuing = goal.state === 'pursuing'
  const achieved = goal.state === 'achieved'
  const needsOwner = goal.state === 'blocked' || goal.state === 'stalled'
  const resumable = ['paused', 'waiting_limits', 'blocked', 'stalled', 'budget_limited'].includes(goal.state)
  const minutes = Math.floor(goal.active_seconds / 60)
  const cap = goal.budget.turns ? ` / ${goal.budget.turns}` : ''
  const tone = TONES[goal.state] ?? 'neutral'
  const celebrate = achieved && sawActive.current
  const reason = (needsOwner || goal.state === 'waiting_limits' || goal.state === 'budget_limited' || goal.state === 'paused') && goal.reason ? goal.reason : null

  const closeOnEscape = (close: () => void) => (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Escape') { event.stopPropagation(); close() }
  }

  const submitHint = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = String(new FormData(event.currentTarget).get('hint') ?? '').trim()
    if (!text) return
    setHintOpen(false)
    // The hint goes first as a normal turn; the goal goes on after it.
    void run(() => engineApi.goalResume(sessionId, { start: false })).then(() => onHint?.(text))
  }

  const submitCap = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const value = (key: string) => {
      const number = Number(form.get(key))
      return Number.isInteger(number) && number > 0 ? number : undefined
    }
    setCapOpen(false)
    void run(() => engineApi.goalBudget(sessionId, { turns: value('turns'), minutes: value('minutes') }))
  }

  return (
    <section
      className={cn('goal-dock', `is-${goal.state}`, celebrate && 'just-achieved')}
      data-state={goal.state}
      data-tone={tone}
      data-enter={enter.current || undefined}
      data-testid="goal-dock"
      aria-label={t('goal.label')}
    >
      <div className="goal-bar">
        <GoalMark state={goal.state} celebrate={celebrate} />
        <div className="goal-text">
          <span className="goal-objective" title={goal.objective}>{goal.objective}</span>
          <span className="goal-meta">
            <span className="r-chip goal-chip" data-tone={tone} data-state={goal.state}>{t(`goal.state.${goal.state}`)}</span>
            <span>{t('goal.iteration', { n: goal.iteration, cap })}</span>
            <span aria-hidden="true">·</span>
            <span>{t('goal.minutes', { n: minutes })}</span>
            <span aria-hidden="true">·</span>
            <span>{t('goal.tokens', { n: goal.tokens_used.toLocaleString() })}</span>
          </span>
        </div>
        <span className="goal-actions">
          {pursuing && (
            <GoalAction icon={<Pause size={12} />} label={t('goal.pause')} onClick={() => void run(() => engineApi.goalPause(sessionId))} />
          )}
          {resumable && !needsOwner && (
            <GoalAction icon={<Play size={12} />} label={t('goal.resume')} onClick={() => void run(() => engineApi.goalResume(sessionId))} />
          )}
          {!achieved && (
            <GoalAction icon={<Timer size={12} />} label={t('goal.cap')} expanded={capOpen} onClick={() => { setCapOpen((open) => !open); setHintOpen(false) }} />
          )}
          <GoalAction
            icon={achieved ? <X size={12} /> : <Square size={10} />}
            label={achieved ? t('goal.dismiss') : t('goal.end')}
            onClick={() => void run(() => engineApi.goalClear(sessionId))}
          />
        </span>
      </div>
      {achieved && goal.assessment.evidence && (
        <p className="goal-detail is-evidence"><span>{t('goal.evidence', { text: goal.assessment.evidence })}</span></p>
      )}
      {reason && <p className="goal-detail"><span>{reason}</span></p>}
      {needsOwner && (
        <div className="goal-owner">
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => void run(() => engineApi.goalResume(sessionId))}>
            <Play size={12} aria-hidden="true" /> {t('goal.continue')}
          </button>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => { setHintOpen((open) => !open); setCapOpen(false) }} aria-expanded={hintOpen}>
            <Lightbulb size={12} aria-hidden="true" /> {t('goal.hint')}
          </button>
        </div>
      )}
      {hintOpen && (
        <form className="goal-form" onSubmit={submitHint} onKeyDown={closeOnEscape(() => setHintOpen(false))}>
          <input name="hint" className="field-input" aria-label={t('goal.hint')} placeholder={t('goal.hintPlaceholder')} autoFocus />
          <button type="submit" className="btn btn-primary btn-xs">{t('goal.send')}</button>
        </form>
      )}
      {capOpen && (
        <form className="goal-form" onSubmit={submitCap} onKeyDown={closeOnEscape(() => setCapOpen(false))}>
          <label className="goal-cap-field">{t('goal.capTurns')} <input name="turns" type="number" min={1} className="field-input" defaultValue={goal.budget.turns ?? ''} autoFocus /></label>
          <label className="goal-cap-field">{t('goal.capMinutes')} <input name="minutes" type="number" min={1} className="field-input" defaultValue={goal.budget.minutes ?? ''} /></label>
          <button type="submit" className="btn btn-secondary btn-xs">{t('goal.capSave')}</button>
        </form>
      )}
    </section>
  )
}

/** Botón de la barra: con poco ancho queda solo el icono, y el nombre sigue ahí para lectores y tooltip. */
function GoalAction({ icon, label, onClick, expanded }: { icon: ReactNode; label: string; onClick: () => void; expanded?: boolean }) {
  return (
    <button type="button" className="btn btn-quiet btn-xs goal-action" onClick={onClick} aria-expanded={expanded} title={label}>
      <span aria-hidden="true" className="goal-action-icon">{icon}</span>
      <span className="goal-action-label">{label}</span>
    </button>
  )
}

/**
 * El icono del objetivo dice su estado: la bandera con una chispa que orbita
 * mientras persigue (el bucle se apaga al parar), un check que se dibuja al
 * lograrlo y un aviso cuando te necesita.
 */
function GoalMark({ state, celebrate }: { state: GoalState; celebrate: boolean }) {
  const icon = state === 'achieved'
    ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" className={cn(celebrate && 'r-check')}><path d="M5 12.5l4.2 4.2L19 7" /></svg>
    : state === 'paused' ? <Pause size={14} />
      : state === 'waiting_limits' ? <Hourglass size={14} />
        : state === 'budget_limited' ? <Timer size={14} />
          : state === 'blocked' || state === 'stalled' ? <TriangleAlert size={14} />
            : <Flag size={14} />
  return (
    <span className={cn('goal-mark', celebrate && 'r-check-pop')} data-state={state} aria-hidden="true">
      {icon}
      {state === 'pursuing' && <span className="goal-mark-orbit" />}
    </span>
  )
}
