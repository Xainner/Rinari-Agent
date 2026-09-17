import { useCallback, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import type { ChatMessage } from '../../types'
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
import { prepareRetryDraft } from '../board/prepareRetryDraft'
import type { TurnTimeline } from './types'

/**
 * «Preparar reintento» prepara un borrador, nunca envía. Si ya existe otro
 * borrador (o el turno vino de otro agente), la decisión es explícita:
 * conservar o reemplazar. Compartido por la fila de metadatos del turno y por
 * la tarjeta resumen para no tener dos implementaciones del mismo flujo.
 */
export function usePrepareRetry(sessionId: string | null, timeline: TurnTimeline, messages: readonly ChatMessage[]): {
  retry: () => void
  dialog: ReactNode
} {
  const { t } = useI18n()
  const [pendingApply, setPendingApply] = useState<(() => void) | null>(null)
  const [pendingKind, setPendingKind] = useState<'draft-exists' | 'peer-origin'>('draft-exists')

  const retry = useCallback(() => {
    if (!sessionId) return
    const result = prepareRetryDraft(sessionId, timeline, messages)
    if (result.outcome === 'prepared') toast.success(t('board.result.retryPrepared'))
    else if (result.outcome === 'no-input') toast.info(t('board.result.retryNoInput'))
    else {
      setPendingKind(result.outcome)
      setPendingApply(() => result.apply)
    }
  }, [messages, sessionId, t, timeline])

  const dialog = (
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
  )

  return { retry, dialog }
}
