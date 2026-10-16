import { useI18n } from '../../i18n'
import { RinariAvatar } from '../rinari/RinariAvatar'
import { rinariStateForTurn } from '../rinari/turnState'
import { useChecklistStore } from '../checklist/checklistStore'
import { activityState, turnDuration } from './activityPresentation'
import { ActivityText } from './ActivityText'
import { liveActionLabel } from './ActivityHeader'
import TokenUsage from './TokenUsageIndicator'
import type { TimelineItem, TurnTimeline } from './types'

/** «25 s», «20 min», «1 h 05 min»: corto, para la tarjeta. */
export function shortElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`
}

/** Desde cuándo dura lo que hace ahora: la acción en curso o la última llamada al modelo. */
function actionSince(timeline: TurnTimeline): number {
  const state = activityState(timeline)
  if (state.kind === 'action') return state.item.occurredAt
  const model = [...timeline.items].reverse().find((item): item is Extract<TimelineItem, { type: 'model' }> => item.type === 'model')
  return model?.occurredAt ?? timeline.startedAt
}

/**
 * La cabecera del turno en curso (plan 0.4.0 #49, diseño A): qué hace Rinari
 * (el paso de la lista si hay lista; si no, la acción del momento), «Paso
 * n/m», la acción con su propio tiempo (se reinicia con cada acción: así se
 * distingue un turno largo que avanza de uno trabado), y a la derecha el
 * tiempo total y los tokens. Abajo, una línea viva mientras trabaja. En un
 * panel angosto queda en una sola línea, con el detalle al pasar el ratón.
 */
export default function TurnStatusCard({ timeline, now }: { timeline: TurnTimeline; now: number }) {
  const { t } = useI18n()
  const checklist = useChecklistStore((state) => state.bySession[timeline.sessionId]?.checklist ?? null)
  const state = activityState(timeline)
  const action = liveActionLabel(timeline, t)
  // La lista vale si es de este turno (o sin turno marcado) y tiene un paso en curso.
  const ownList = checklist && (!checklist.turn_id || checklist.turn_id === timeline.turnId) ? checklist : null
  const stepIndex = ownList ? ownList.items.findIndex((item) => item.status === 'in_progress') : -1
  const step = stepIndex >= 0 && ownList ? ownList.items[stepIndex] : null
  const title = step ? (step.active_form || step.content) : action
  const total = turnDuration(timeline, now)
  const actionMs = Math.max(0, now - actionSince(timeline))
  const stepLabel = step && ownList ? t('turn.status.step', { n: stepIndex + 1, total: ownList.items.length }) : null
  const detail = [stepLabel, step ? action : null, shortElapsed(actionMs)].filter(Boolean).join(' · ')
  const working = !['approval', 'question', 'cancelling'].includes(state.kind)
  return (
    <div className="turn-status-wrap">
      <div data-live-activity className="turn-status" data-working={working || undefined} title={`${title} · ${detail}`}>
        <RinariAvatar state={rinariStateForTurn(state.kind)} size={38} />
        <div className="turn-status-body">
          <ActivityText active={working} role="status" aria-live="polite" className="turn-status-title">{title}</ActivityText>
          <div className="turn-status-detail">
            {stepLabel && <span className="turn-status-step">{stepLabel}</span>}
            {step && <span className="turn-status-action">{action}</span>}
            <span className="turn-status-clock" data-testid="turn-action-time">{shortElapsed(actionMs)}</span>
            {state.parallel > 0 && <span>{t('activity.parallelAgents', { n: state.parallel })}</span>}
          </div>
        </div>
        <div className="turn-status-meta">
          {stepLabel && <span className="turn-status-step is-compact">{stepIndex + 1}/{ownList!.items.length}</span>}
          <span className="tabular-nums" data-testid="turn-total-time">{total === null ? '—' : shortElapsed(total)}</span>
          <TokenUsage usage={timeline.usage} />
        </div>
        <span className="turn-status-line" aria-hidden="true" />
      </div>
    </div>
  )
}
