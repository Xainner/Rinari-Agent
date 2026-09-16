import { memo, useState } from 'react'
import { CheckCheck, CircleAlert, CircleCheck, CircleSlash, FileDiff, OctagonX, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import type { ChatMessage } from '../../types'
import type { TurnTimeline } from '../activity/types'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog'
import { selectTurnFinalText, terminalOutcomeOf, type TerminalOutcome } from '../engine/sessionSelectors'
import { useBoardAttentionStore } from '../../stores/boardAttention'
import { cn } from '../../lib/utils'
import { prepareRetryDraft } from './prepareRetryDraft'

export const RESULT_PREVIEW_CHARS = 140

export interface ResultSummaryCardProps {
  sessionId: string
  timeline: TurnTimeline
  messages: readonly ChatMessage[]
  /** Abre el dock de cambios del panel (rotulado por proyecto si no hay changeset del turno). */
  onReviewChanges?: () => void
}

function elapsedLabel(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s`
}

function previewOf(text: string | null): string | null {
  if (!text) return null
  const plain = text.replace(/```[\s\S]*?```/g, ' ').replace(/[#*_>`]/g, '').replace(/\s+/g, ' ').trim()
  if (!plain) return null
  return plain.length > RESULT_PREVIEW_CHARS ? `${plain.slice(0, RESULT_PREVIEW_CHARS - 1)}…` : plain
}

/**
 * Tarjeta de resultado de un turno terminado (solo Boards). Datos admisibles:
 * outcome del turno, vista previa del texto final, changeset **de ese turno**
 * (si el timeline lo trae), duración con ambos tiempos y modelo ejecutor solo
 * cuando la llamada lo registró. Lo que falta se omite: nunca se rellena
 * desde el modelo actual ni desde `git status` del root. El color comunica el
 * estado del turno, no la corrección del código.
 */
function ResultSummaryCard({ sessionId, timeline, messages, onReviewChanges }: ResultSummaryCardProps) {
  const { t } = useI18n()
  const outcome = terminalOutcomeOf(timeline)
  const receipt = useBoardAttentionStore((state) => state.sessions[sessionId]?.turns[timeline.turnId])
  const markTurnSeen = useBoardAttentionStore((state) => state.markTurnSeen)
  const [pendingApply, setPendingApply] = useState<(() => void) | null>(null)
  const [pendingKind, setPendingKind] = useState<'draft-exists' | 'peer-origin'>('draft-exists')
  if (!outcome) return null

  const unread = receipt?.state === 'unread'
  const finalText = selectTurnFinalText(timeline)
  const preview = previewOf(finalText)
  const changeset = [...timeline.items].reverse().find((item) => item.type === 'changeset')
  const filesChanged = changeset && changeset.type === 'changeset' ? changeset.files.length : null
  const duration = timeline.completedAt !== undefined && timeline.startedAt > 0 ? Math.max(0, timeline.completedAt - timeline.startedAt) : null
  const finalItem = [...timeline.items].reverse().find((item) => item.type === 'model' && item.outputKind === 'final')
  const executor = finalItem && finalItem.type === 'model' ? finalItem.model ?? null : null
  const outcomeKey = `board.result.outcome.${outcome}` as const
  const Icon = outcome === 'completed' ? CircleCheck : outcome === 'failed' ? OctagonX : outcome === 'stopped' ? CircleAlert : CircleSlash

  function retry() {
    const result = prepareRetryDraft(sessionId, timeline, messages)
    if (result.outcome === 'prepared') toast.success(t('board.result.retryPrepared'))
    else if (result.outcome === 'no-input') toast.info(t('board.result.retryNoInput'))
    else {
      setPendingKind(result.outcome)
      setPendingApply(() => result.apply)
    }
  }

  return (
    <section
      aria-label={t('board.result.title')}
      data-testid="result-summary-card"
      data-outcome={outcome}
      data-unread={unread || undefined}
      className={cn('result-card', `is-${outcome}`)}
    >
      <header className="result-card-header">
        <Icon size={15} aria-hidden="true" className="result-card-icon" />
        <span className="result-card-outcome">{t(outcomeKey)}</span>
        {unread && <span className="result-card-new">{t('board.status.new')}</span>}
      </header>
      <p className="result-card-summary">{preview ?? (outcome === 'failed' && timeline.error ? timeline.error : t('board.result.summaryEmpty'))}</p>
      <dl className="result-card-meta">
        <div>{filesChanged === null ? t('board.result.filesUnknown') : t('board.result.files', { n: filesChanged })}</div>
        <div>{duration === null ? t('board.result.durationUnavailable') : t('board.result.duration', { value: elapsedLabel(duration) })}</div>
        <div>{executor ? t('board.result.model', { model: executor }) : t('board.result.modelUnknown')}</div>
        {outcome === 'stopped' && timeline.stopReason && <div className="result-card-reason">{timeline.stopReason.message}</div>}
      </dl>
      {outcome === 'failed' && timeline.errorDetails && (
        <details className="result-card-details">
          <summary>{t('board.result.errorDetails')}</summary>
          <pre>{JSON.stringify(Object.fromEntries(Object.entries(timeline.errorDetails).filter(([key]) => key !== 'partial_text')), null, 2)}</pre>
        </details>
      )}
      <div className="result-card-actions">
        {onReviewChanges && (
          <button type="button" className="result-card-action" onClick={onReviewChanges}>
            <FileDiff size={13} aria-hidden="true" /> {t('board.result.review')}
          </button>
        )}
        {unread && (
          <button type="button" className="result-card-action" onClick={() => markTurnSeen(sessionId, timeline.turnId)}>
            <CheckCheck size={13} aria-hidden="true" /> {t('board.result.markRead')}
          </button>
        )}
        {(outcome === 'failed' || outcome === 'stopped' || outcome === 'cancelled') && (
          <button type="button" className="result-card-action" onClick={retry}>
            <RotateCcw size={13} aria-hidden="true" /> {t('board.result.prepareRetry')}
          </button>
        )}
      </div>
      <AlertDialog open={pendingApply !== null} onOpenChange={(open) => { if (!open) setPendingApply(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('board.result.prepareRetry')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingKind === 'peer-origin' ? t('board.peers.untrusted') : t('board.result.replaceDraftHint')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('board.result.preserveDraft')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { pendingApply?.(); setPendingApply(null); toast.success(t('board.result.retryPrepared')) }}>
              {t('board.result.replaceDraft')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

export default memo(ResultSummaryCard)
export type { TerminalOutcome }
