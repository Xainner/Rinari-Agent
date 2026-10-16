import { useEffect, useState, type FormEvent } from 'react'
import { CircleCheck, Flag, Pause, Play, Square, Timer } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'
import { commandMessage, engineApi } from '../../services/engine'
import type { Goal } from '../../types/protocol.generated'
import { useGoalStore } from './goalStore'
import './goal.css'

/**
 * The goal of the conversation above the composer (plan 0.4.0 #23): the
 * objective, its state, the iteration, time and tokens, and what the owner
 * can do: pause, resume, end, cap it, or give a hint when it is blocked or
 * stalled. Nothing appears without a goal.
 */
export function GoalDock({ sessionId, onHint }: { sessionId: string; onHint?: (text: string) => void }) {
  const { t } = useI18n()
  const goal = useGoalStore((state) => state.bySession[sessionId]?.goal ?? null)
  const apply = useGoalStore((state) => state.apply)
  const [capOpen, setCapOpen] = useState(false)
  const [hintOpen, setHintOpen] = useState(false)

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
  const needsOwner = goal.state === 'blocked' || goal.state === 'stalled'
  const resumable = ['paused', 'waiting_limits', 'blocked', 'stalled', 'budget_limited'].includes(goal.state)
  const minutes = Math.floor(goal.active_seconds / 60)
  const cap = goal.budget.turns ? ` / ${goal.budget.turns}` : ''

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
    <section className={cn('goal-dock', `is-${goal.state}`)} data-state={goal.state} data-testid="goal-dock" aria-label={t('goal.label')}>
      <div className="goal-bar">
        <span className="goal-icon" aria-hidden="true">{goal.state === 'achieved' ? <CircleCheck size={15} /> : <Flag size={15} />}</span>
        <div className="goal-text">
          <span className="goal-objective" title={goal.objective}>{goal.objective}</span>
          <span className="goal-meta">
            <span className="goal-chip" data-state={goal.state}>{t(`goal.state.${goal.state}`)}</span>
            <span>{t('goal.iteration', { n: goal.iteration, cap })}</span>
            <span>{t('goal.minutes', { n: minutes })}</span>
            <span>{t('goal.tokens', { n: goal.tokens_used.toLocaleString() })}</span>
          </span>
        </div>
        <span className="goal-actions">
          {pursuing && (
            <button type="button" className="goal-action" onClick={() => void run(() => engineApi.goalPause(sessionId))}>
              <Pause size={12} aria-hidden="true" /> {t('goal.pause')}
            </button>
          )}
          {resumable && !needsOwner && (
            <button type="button" className="goal-action" onClick={() => void run(() => engineApi.goalResume(sessionId))}>
              <Play size={12} aria-hidden="true" /> {t('goal.resume')}
            </button>
          )}
          {goal.state !== 'achieved' && (
            <button type="button" className="goal-action" onClick={() => setCapOpen((open) => !open)} aria-expanded={capOpen}>
              <Timer size={12} aria-hidden="true" /> {t('goal.cap')}
            </button>
          )}
          <button type="button" className="goal-action" onClick={() => void run(() => engineApi.goalClear(sessionId))}>
            <Square size={11} aria-hidden="true" /> {goal.state === 'achieved' ? t('goal.dismiss') : t('goal.end')}
          </button>
        </span>
      </div>
      {goal.state === 'achieved' && goal.assessment.evidence && (
        <p className="goal-detail">{t('goal.evidence', { text: goal.assessment.evidence })}</p>
      )}
      {(needsOwner || goal.state === 'waiting_limits' || goal.state === 'budget_limited' || goal.state === 'paused') && goal.reason && (
        <p className="goal-detail">{goal.reason}</p>
      )}
      {needsOwner && (
        <div className="goal-owner">
          <button type="button" className="goal-action" onClick={() => void run(() => engineApi.goalResume(sessionId))}>
            <Play size={12} aria-hidden="true" /> {t('goal.continue')}
          </button>
          <button type="button" className="goal-action" onClick={() => setHintOpen((open) => !open)} aria-expanded={hintOpen}>
            {t('goal.hint')}
          </button>
        </div>
      )}
      {hintOpen && (
        <form className="goal-form" onSubmit={submitHint}>
          <input name="hint" aria-label={t('goal.hint')} placeholder={t('goal.hintPlaceholder')} autoFocus />
          <button type="submit" className="goal-action">{t('goal.send')}</button>
        </form>
      )}
      {capOpen && (
        <form className="goal-form" onSubmit={submitCap}>
          <label>{t('goal.capTurns')} <input name="turns" type="number" min={1} defaultValue={goal.budget.turns ?? ''} /></label>
          <label>{t('goal.capMinutes')} <input name="minutes" type="number" min={1} defaultValue={goal.budget.minutes ?? ''} /></label>
          <button type="submit" className="goal-action">{t('goal.capSave')}</button>
        </form>
      )}
    </section>
  )
}
