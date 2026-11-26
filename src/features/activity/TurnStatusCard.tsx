import { TriangleAlert } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useNow } from '../../lib/clock'
import { TurnAvatar } from './TurnAvatar'
import { rinariStateForTurn } from '../rinari/turnState'
import { activityState, turnDuration } from './activityPresentation'
import { ActivityMotion, ActivityText } from './ActivityText'
import { ActivityHeader, liveActionLabel } from './ActivityHeader'
import TokenUsage from './TokenUsageIndicator'
import type { Checklist } from '../../types/protocol.generated'
import type { TimelineItem, TurnTimeline } from './types'

/** «25 s», «20 min», «1 h 05 min»: corto, para la tarjeta. */
export function shortElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`
}

/**
 * La cabecera de un turno terminado (#E de la ronda 1434): la cara de Rinari
 * al acabar, «Ha trabajado durante…» y, a la derecha, las incidencias en un
 * chip ámbar. Va dentro del botón que despliega la actividad, sin borde vivo:
 * el turno ya no trabaja.
 */
export function TurnDoneHeader({ timeline, now, issues }: { timeline: TurnTimeline; now: number; issues: number }) {
  const { t } = useI18n()
  return (
    <span className="turn-done">
      <TurnAvatar sessionId={timeline.sessionId} state={rinariStateForTurn(timeline.status)} size={38} />
      <span className="turn-done-title"><ActivityHeader timeline={timeline} now={now} /></span>
      {issues > 0 && (
        <span className="r-chip turn-done-issues" data-tone="warning">
          <TriangleAlert size={11} aria-hidden="true" />
          {t(issues === 1 ? 'activity.incidentsOne' : 'activity.incidents', { n: issues })}
        </span>
      )}
    </span>
  )
}

/** Desde cuándo dura lo que hace ahora: la acción en curso o la última llamada al modelo. */
function actionSince(timeline: TurnTimeline): number {
  const state = activityState(timeline)
  if (state.kind === 'action') return state.item.occurredAt
  const model = [...timeline.items].reverse().find((item): item is Extract<TimelineItem, { type: 'model' }> => item.type === 'model')
  return model?.occurredAt ?? timeline.startedAt
}

/** The list's step in progress, when the list belongs to this turn. */
export function turnStep(timeline: TurnTimeline, checklist: Checklist | null) {
  const own = checklist && (!checklist.turn_id || checklist.turn_id === timeline.turnId) ? checklist : null
  const index = own ? own.items.findIndex((item) => item.status === 'in_progress') : -1
  return own && index >= 0 ? { item: own.items[index], index, total: own.items.length } : null
}

/**
 * The running turn in one line, for the status above the composer (plan C):
 * Rinari's face, the step of the list («3/4») or the action of the moment as
 * the title, then the action with its own clock (it restarts with each
 * action, so a long turn that moves reads apart from a stuck one), and on the
 * right the turn's total time and the tokens the model has produced.
 *
 * It owns the turn's clock: a tick re-renders this line, not the chat.
 */
export default function TurnStatusLine({ timeline, checklist, now: fixedNow }: { timeline: TurnTimeline; checklist: Checklist | null; now?: number }) {
  const { t } = useI18n()
  const ticking = useNow(200, fixedNow === undefined)
  const now = fixedNow ?? ticking
  const state = activityState(timeline)
  const action = liveActionLabel(timeline, t)
  const step = turnStep(timeline, checklist)
  const title = step ? (step.item.active_form || step.item.content) : action
  const total = turnDuration(timeline, now)
  const since = actionSince(timeline)
  // Mientras la acción empezó con el turno, su reloj marca lo mismo que el
  // total: se muestra solo el total (plan 0.4.0 extras, E2).
  // Y un reloj que acaba de empezar no dice nada («0 s»): sale al primer segundo.
  const ownClock = since - timeline.startedAt >= 2000 && now - since >= 1000
  const working = !['approval', 'question', 'cancelling'].includes(state.kind)
  const detail = [
    step ? action : null,
    ownClock ? shortElapsed(Math.max(0, now - since)) : null,
    state.parallel > 0 ? t('activity.parallelAgents', { n: state.parallel }) : null,
  ].filter((part): part is string => Boolean(part))
  const label = [step ? t('turn.status.step', { n: step.index + 1, total: step.total }) : null, title, ...detail].filter(Boolean).join(' · ')
  return (
    <span className="turn-line" data-live-activity data-working={working || undefined} data-state={state.kind} title={label}>
      <span className="turn-line-avatar"><TurnAvatar sessionId={timeline.sessionId} state={rinariStateForTurn(state.kind)} size={22} /></span>
      {step && <span className="turn-line-count" aria-label={t('turn.status.step', { n: step.index + 1, total: step.total })}>{step.index + 1}/{step.total}</span>}
      <ActivityMotion.Provider value={working}>
        <ActivityText active={working} role="status" aria-live="polite" className="turn-line-title">{title}</ActivityText>
      </ActivityMotion.Provider>
      {detail.length > 0 && (
        <span className="turn-line-detail">
          {step && <span className="turn-line-action">{action}</span>}
          {ownClock && <span className="turn-line-clock" data-testid="turn-action-time">{shortElapsed(Math.max(0, now - since))}</span>}
          {state.parallel > 0 && <span>{t('activity.parallelAgents', { n: state.parallel })}</span>}
        </span>
      )}
      <span className="turn-line-meta">
        <span className="tabular-nums" data-testid="turn-total-time">{total === null ? '—' : shortElapsed(total)}</span>
        <TokenUsage usage={timeline.usage} />
      </span>
    </span>
  )
}
