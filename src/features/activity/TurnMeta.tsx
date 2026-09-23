import { CheckCheck, FileDiff, RotateCcw } from 'lucide-react'
import { memo, useMemo } from 'react'
import { useI18n } from '../../i18n'
import type { ChatMessage } from '../../types'
import { terminalOutcomeOf } from '../engine/sessionSelectors'
import { useBoardAttentionStore } from '../../stores/boardAttention'
import { useReadTracking } from '../board/useResultVisibility'
import { cn } from '../../lib/utils'
import { usePrepareRetry } from './usePrepareRetry'
import type { TurnTimeline } from './types'
import { presentedChangeSets } from './changeSetPresentation'

export interface TurnMetaProps {
  timeline: TurnTimeline
  /** Mensaje del usuario correlacionado con el turno (entrada del reintento). */
  user?: ChatMessage
  /** Acciones significativas del turno (herramientas, aprobaciones…). */
  actions: number
  /** La conversación pide la fila aunque no haya no-leído ni changeset. */
  emphasis: boolean
  onReviewChanges?: () => void
}

export function elapsedLabel(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
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
function TurnMeta({ timeline, user, actions, emphasis, onReviewChanges }: TurnMetaProps) {
  const { t, lang } = useI18n()
  const outcome = terminalOutcomeOf(timeline)
  const tracking = useReadTracking()
  const sessionId = tracking?.sessionId ?? null
  const receipt = useBoardAttentionStore((state) => (sessionId ? state.sessions[sessionId]?.turns[timeline.turnId] : undefined))
  const markTurnSeen = useBoardAttentionStore((state) => state.markTurnSeen)
  const messages = useMemo<readonly ChatMessage[]>(() => (user ? [user] : []), [user])
  const { retry, dialog } = usePrepareRetry(sessionId, timeline, messages)
  if (!outcome) return null

  const unread = receipt?.state === 'unread'
  const { latest: changeset, emptyPartial } = presentedChangeSets(timeline)
  const filesChanged = changeset?.files.length ?? null
  const duration = timeline.completedAt !== undefined && timeline.startedAt > 0 ? Math.max(0, timeline.completedAt - timeline.startedAt) : null
  const finalItem = [...timeline.items].reverse().find((item) => item.type === 'model' && item.outputKind === 'final')
  const executor = finalItem && finalItem.type === 'model' ? finalItem.model ?? null : null
  const retryable = outcome === 'failed' || outcome === 'stopped' || outcome === 'cancelled'
  if (!emphasis && !unread && filesChanged === null && !retryable) return null

  return (
    <div
      data-testid="turn-meta"
      data-turn-id={timeline.turnId}
      data-outcome={outcome}
      data-unread={unread || undefined}
      className={cn('turn-meta flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-[var(--text-subtle)]', `is-${outcome}`)}
    >
      <span className="turn-meta-outcome">{t(`board.result.outcome.${outcome}`)}</span>
      {duration !== null && <><span aria-hidden="true">·</span><span>{elapsedLabel(duration)}</span></>}
      {actions > 0 && <><span aria-hidden="true">·</span><span>{actions} {lang === 'es' ? 'acciones' : 'actions'}</span></>}
      {filesChanged !== null && <><span aria-hidden="true">·</span><span>{t('board.result.files', { n: filesChanged })}</span></>}
      {emptyPartial.length > 0 && <><span aria-hidden="true">·</span><span>{t('changes.coverage.meta')}</span></>}
      {executor && <><span aria-hidden="true">·</span><span>{t('board.result.model', { model: executor })}</span></>}
      {outcome === 'stopped' && timeline.stopReason && <><span aria-hidden="true">·</span><span>{timeline.stopReason.message}</span></>}
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
