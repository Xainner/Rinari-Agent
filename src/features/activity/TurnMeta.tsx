import { CheckCheck, FileDiff, GraduationCap, Play, RotateCcw } from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import { useI18n, type I18nKey } from '../../i18n'
import type { ChatMessage, TurnStopReason } from '../../types'
import { terminalOutcomeOf } from '../engine/sessionSelectors'
import { useBoardAttentionStore } from '../../stores/boardAttention'
import { useReadTracking } from '../board/useResultVisibility'
import { cn } from '../../lib/utils'
import { usePrepareRetry } from './usePrepareRetry'
import type { TurnTimeline } from './types'
import { presentedChangeSets } from './changeSetPresentation'
import TokenUsage from './TokenUsageIndicator'
import { useOptionalEngineCommands, useOptionalEngineData } from '../engine/EngineContext'
import { turnDuration } from './activityPresentation'

export interface TurnMetaProps {
  timeline: TurnTimeline
  /** Mensaje del usuario correlacionado con el turno (entrada del reintento). */
  user?: ChatMessage
  /** Acciones significativas del turno (herramientas, aprobaciones…). */
  actions: number
  /** La conversación pide la fila aunque no haya no-leído ni changeset. */
  emphasis: boolean
  durationInHeader?: boolean
  onReviewChanges?: () => void
}

export function elapsedLabel(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m ${seconds % 60}s`
  return `${minutes}m ${seconds % 60}s`
}

/**
 * Fila compacta de metadatos y acciones de un turno terminado, debajo de la
 * respuesta canónica y sin repetir su cuerpo: estado (distinto por outcome),
 * duración solo con ambos tiempos válidos, acciones, changeset confirmado del
 * turno, modelo ejecutor si la llamada lo registró, motivo de Stop, «Nuevo»
 * con «Marcar como leído» y «Preparar reintento» (prepara un borrador, nunca
 * envía). Lo que falta se omite; nunca se rellena desde el estado actual.
 * Sustituye al resumen anterior de duración/acciones y a la tarjeta de
 * resultado dentro de la conversación expandida.
 */
function TurnMeta({ timeline, user, actions, emphasis, durationInHeader = false, onReviewChanges }: TurnMetaProps) {
  const { t, lang } = useI18n()
  const outcome = terminalOutcomeOf(timeline)
  const tracking = useReadTracking()
  const sessionId = tracking?.sessionId ?? null
  const receipt = useBoardAttentionStore((state) => (sessionId ? state.sessions[sessionId]?.turns[timeline.turnId] : undefined))
  const markTurnSeen = useBoardAttentionStore((state) => state.markTurnSeen)
  const messages = useMemo<readonly ChatMessage[]>(() => (user ? [user] : []), [user])
  const { retry, dialog } = usePrepareRetry(sessionId, timeline, messages)
  const commands = useOptionalEngineCommands()
  const [continuing, setContinuing] = useState(false)
  const [saving, setSaving] = useState(false)
  if (!outcome) return null
  // Un límite de seguridad o un bucle cortado no es un fallo: el trabajo sigue
  // donde quedó con un mensaje nuevo, sin volver a escribir la petición.
  const canContinue = outcome === 'stopped' && timeline.stopReason?.recoverable === true && Boolean(sessionId && commands)
  const continueWork = async () => {
    if (!sessionId || !commands || continuing) return
    setContinuing(true)
    try {
      await commands.sendTo(sessionId, t('turn.continuePrompt'))
    } finally {
      setContinuing(false)
    }
  }

  // A turn that did work can leave a lesson: Rinari writes 1-3 rules into the
  // skill that does that job (or memory). The turn's own request goes as the
  // focus, so a lesson from an older turn is about that turn.
  // Not on a turn that was itself a slash command (/lesson, /learn, /merge-skills).
  const fromCommand = (timeline.userMessage || '').trimStart().startsWith('/')
  const canSaveLesson = actions > 0 && outcome !== 'cancelled' && !fromCommand && Boolean(sessionId && commands)
  const saveLesson = async () => {
    if (!sessionId || !commands || saving) return
    setSaving(true)
    try {
      const focus = (timeline.userMessage || '').replace(/\s+/g, ' ').trim().slice(0, 160)
      await commands.sendTo(sessionId, '/lesson', [], { command: { name: 'lesson', text: focus } })
    } finally {
      setSaving(false)
    }
  }

  const unread = receipt?.state === 'unread'
  const { latest: changeset } = presentedChangeSets(timeline)
  const filesChanged = changeset?.files.length ?? null
  const duration = durationInHeader ? null : turnDuration(timeline)
  const finalItem = [...timeline.items].reverse().find((item) => item.type === 'model' && item.outputKind === 'final')
  const executorId = finalItem && finalItem.type === 'model' ? finalItem.model ?? null : null
  // The Engine reports the model id (mdl_…); the owner knows its name.
  const models = useOptionalEngineData()?.models
  const executor = executorId ? models?.find((model) => model.id === executorId)?.alias ?? executorId : null
  const retryable = outcome === 'failed' || outcome === 'stopped' || outcome === 'cancelled'
  if (!emphasis && !unread && filesChanged === null && !retryable && !timeline.usage && !canSaveLesson) return null

  const hasPrefix = !durationInHeader || duration !== null
  return (
    <div
      data-testid="turn-meta"
      data-turn-id={timeline.turnId}
      data-outcome={outcome}
      data-unread={unread || undefined}
      className={cn('turn-meta flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-[var(--text-subtle)]', `is-${outcome}`)}
    >
      {!durationInHeader && <span className="turn-meta-outcome">{t(`board.result.outcome.${outcome}`)}</span>}
      {duration !== null && <><span aria-hidden="true">·</span><span>{elapsedLabel(duration)}</span></>}
      {timeline.usage && <>{hasPrefix && <span aria-hidden="true">·</span>}<TokenUsage usage={timeline.usage} /></>}
      {actions > 0 && <>{(hasPrefix || timeline.usage) && <span aria-hidden="true">·</span>}<span>{actions} {lang === 'es' ? 'acciones' : 'actions'}</span></>}
      {filesChanged !== null && <>{(hasPrefix || timeline.usage || actions > 0) && <span aria-hidden="true">·</span>}<span>{t('board.result.files', { n: filesChanged })}</span></>}
      {executor && <>{(hasPrefix || timeline.usage || actions > 0 || filesChanged !== null) && <span aria-hidden="true">·</span>}<span>{t('board.result.model', { model: executor })}</span></>}
      {outcome === 'stopped' && timeline.stopReason && <>{(hasPrefix || timeline.usage || actions > 0 || filesChanged !== null || executor) && <span aria-hidden="true">·</span>}<span title={timeline.stopReason.loop || timeline.stopReason.budget ? timeline.stopReason.message : undefined}>{stopText(timeline.stopReason, t)}</span></>}
      {unread && <span className="turn-meta-new">{t('board.status.new')}</span>}
      <span className="turn-meta-actions ml-auto inline-flex items-center gap-1">
        {onReviewChanges && filesChanged !== null && (
          <button type="button" className="turn-meta-action" onClick={onReviewChanges}>
            <FileDiff size={11} aria-hidden="true" /> {t('board.result.review')}
          </button>
        )}
        {unread && sessionId && (
          <button type="button" className="turn-meta-action" onClick={() => markTurnSeen(sessionId, timeline.turnId)}>
            <CheckCheck size={11} aria-hidden="true" /> {t('board.result.markRead')}
          </button>
        )}
        {canContinue && (
          <button type="button" className="turn-meta-action" data-testid="turn-continue" disabled={continuing} onClick={() => void continueWork()}>
            <Play size={11} aria-hidden="true" /> {t('turn.continue')}
          </button>
        )}
        {canSaveLesson && (
          <button type="button" className="turn-meta-action" data-testid="turn-lesson" disabled={saving} title={t('turn.lessonHint')} onClick={() => void saveLesson()}>
            <GraduationCap size={11} aria-hidden="true" /> {t('turn.lesson')}
          </button>
        )}
        {retryable && sessionId && (
          <button type="button" className="turn-meta-action" onClick={retry}>
            <RotateCcw size={11} aria-hidden="true" /> {t('board.result.prepareRetry')}
          </button>
        )}
      </span>
      {dialog}
    </div>
  )
}

export default memo(TurnMeta)

const BUDGET_KINDS = ['model-calls', 'tool-calls', 'wall-time']
const LOOP_KINDS = ['same-tool-args', 'two-action-oscillation', 'repeated-rewrites', 'same-error', 'repeated-denied-approval', 'duplicated-subagent-work', 'stagnation']

/** Un corte por bucle se dice en el idioma de la app; el texto técnico del Engine queda en el título. */
export function stopText(reason: TurnStopReason, t: (key: I18nKey, vars?: Record<string, string | number>) => string): string {
  if (reason.loop) return t(`turn.loop.${LOOP_KINDS.includes(reason.loop) ? reason.loop : 'other'}` as I18nKey)
  if (reason.budget) {
    const key = BUDGET_KINDS.includes(reason.budget) && reason.limit !== undefined ? reason.budget : 'other'
    const n = reason.budget === 'wall-time' && reason.limit !== undefined ? Math.round(reason.limit / 60) : reason.limit
    return t(`turn.budget.${key}` as I18nKey, { n: n ?? 0 })
  }
  return reason.message || t('turn.stoppedFallback')
}
