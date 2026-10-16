import { FileDiff, Info, RotateCcw, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useI18n, type I18nKey } from '../../i18n'
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
import { commandMessage, engineApi, type TurnChangedFile, type TurnUndoPreview } from '../../services/engine'
import { useSessionDockStore } from '../../stores/sessionDock'
import { useReadTracking } from '../board/useResultVisibility'
import type { TimelineItem } from './types'
import { changeSetPresentation, hasPartialCoverage } from './changeSetPresentation'

/** Tono del chip de cada tipo de cambio. */
const KIND_TONE: Record<TurnChangedFile['kind'], string | undefined> = {
  created: 'success',
  modified: 'accent',
  deleted: 'danger',
  renamed: undefined,
}

const STATUS_KEY: Partial<Record<string, I18nKey>> = {
  undone: 'changes.card.undone',
  partially_undone: 'changes.card.partiallyUndone',
  conflicted: 'changes.card.conflicted',
}

/**
 * Cambios de un turno (plan 0.4.0 #41): cuántos archivos y su `+/−`, la lista
 * con el tipo de cada uno, y dos acciones. «Revisar» (o un archivo de la
 * lista) abre la vista Cambios del panel lateral en este turno, con el diff a
 * color y sin depender de git; «Deshacer» enseña antes qué se restaura.
 */
export function ChangeSetRow({ item, turnActive }: { item: Extract<TimelineItem, { type: 'changeset' }>; turnActive: boolean }) {
  const { t } = useI18n()
  const sessionId = useReadTracking()?.sessionId ?? null
  const reviewTurn = useSessionDockStore((state) => state.reviewTurn)
  const [preview, setPreview] = useState<TurnUndoPreview | null>(null)
  const [working, setWorking] = useState(false)
  const presentation = changeSetPresentation(item)
  if (presentation === 'hidden') return null
  const files = item.files

  function review(path?: string) {
    if (sessionId) reviewTurn(sessionId, item.turnId, path)
  }

  async function prepareUndo() {
    setWorking(true)
    try {
      setPreview(await engineApi.previewTurnUndo(item.turnId))
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setWorking(false)
    }
  }

  async function undo(safeOnly: boolean) {
    setWorking(true)
    try {
      const result = await engineApi.undoTurnChanges(item.turnId, undefined, safeOnly)
      toast.success(t(result.applied.length === 1 ? 'changes.undo.doneOne' : 'changes.undo.done', { n: result.applied.length }))
      window.dispatchEvent(new Event('rinari-workspace-refresh'))
      setPreview(null)
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setWorking(false)
    }
  }

  const statusKey = STATUS_KEY[item.status]
  const conflicts = preview?.conflicts.length ?? 0
  return (
    <section className="turn-changes" data-testid="turn-changes" data-status={item.status} aria-label={t(files.length === 1 ? 'changes.card.filesOne' : 'changes.card.files', { n: files.length })}>
      <header className="turn-changes-head">
        <span className="turn-changes-icon" aria-hidden="true"><FileDiff size={14} /></span>
        <span className="turn-changes-title">{t(files.length === 1 ? 'changes.card.filesOne' : 'changes.card.files', { n: files.length })}</span>
        <span className="turn-changes-stat is-add">+{item.additions}</span>
        <span className="turn-changes-stat is-del">−{item.deletions}</span>
        {statusKey && <span className="r-chip turn-changes-status">{t(statusKey)}</span>}
      </header>
      <ul className="turn-changes-files">
        {files.map((file) => (
          <li key={file.absolute_path}>
            <button type="button" className="turn-changes-file" disabled={!sessionId} onClick={() => review(file.path)} title={t('changes.card.openFile', { path: file.path })}>
              <span className="r-chip turn-changes-kind" data-tone={KIND_TONE[file.kind]}>{t(`changes.kind.${file.kind}`)}</span>
              <span className="turn-changes-path">{file.previous_path && file.kind === 'renamed' ? `${file.previous_path} → ${file.path}` : file.path}</span>
              {file.sensitive && <span className="r-chip turn-changes-kind" data-tone="warning">{t('changes.card.sensitive')}</span>}
              <span className="turn-changes-file-stat">
                {typeof file.additions === 'number' && <span className="is-add">+{file.additions}</span>}
                {typeof file.deletions === 'number' && <span className="is-del">−{file.deletions}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {hasPartialCoverage(item) && (
        <p className="turn-changes-note"><Info size={12} aria-hidden="true" /> {t('changes.card.partial')}</p>
      )}
      <div className="turn-changes-actions">
        <button type="button" className="btn btn-secondary btn-xs" disabled={!sessionId} onClick={() => review()}>
          <FileDiff size={12} aria-hidden="true" /> {t('changes.card.review')}
        </button>
        <button type="button" className="btn btn-ghost btn-xs" disabled={working || turnActive || item.status !== 'active' || files.length === 0} onClick={() => void prepareUndo()}>
          <RotateCcw size={12} aria-hidden="true" /> {t('changes.card.undo')}
        </button>
      </div>
      <AlertDialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('changes.undo.title')}</AlertDialogTitle>
            <AlertDialogDescription>{conflicts > 0 ? t(conflicts === 1 ? 'changes.undo.conflictsOne' : 'changes.undo.conflicts', { n: conflicts }) : t('changes.undo.safe')}</AlertDialogDescription>
          </AlertDialogHeader>
          {preview && conflicts > 0 && (
            <ul className="turn-changes-conflicts">
              {preview.conflicts.map((conflict) => <li key={conflict.absolute_path}><ShieldAlert size={12} aria-hidden="true" /> {conflict.path} · {conflict.reason}</li>)}
            </ul>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction disabled={working || (preview?.operations.length ?? 0) === 0} onClick={() => void undo(conflicts > 0)}>
              {conflicts > 0 ? t('changes.undo.safeOnly') : t('changes.card.undo')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
