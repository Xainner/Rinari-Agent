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
import { useI18n } from '../../i18n'

export interface StopTarget {
  id: string
  command: string
  cwd: string
  lastVerifiedAt: number
}

/**
 * Confirmación pequeña y específica: identifica el recurso y advierte que
 * detener no cancela la conversación ni revierte cambios. Nunca usa
 * window.confirm ni ejecuta stop al abrirse.
 */
export default function ProcessStopDialog({
  target,
  stale,
  busy,
  resultMessage,
  onConfirm,
  onCancel,
}: {
  target: StopTarget | null
  stale: boolean
  busy: boolean
  resultMessage: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useI18n()

  return (
    <AlertDialog open={target !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {target ? t('processes.stopTitle', { name: target.command || target.id }) : ''}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {target ? t('processes.stopDesc', { cwd: target.cwd }) : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {stale && (
          <p role="status" className="processes-note">
            {t('processes.stopStale')}
          </p>
        )}
        {resultMessage && (
          <p role="alert" className="processes-error">
            {resultMessage}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{t('processes.stopCancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(event) => {
              event.preventDefault()
              onConfirm()
            }}
          >
            {busy ? t('processes.stopping') : t('processes.stopConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
