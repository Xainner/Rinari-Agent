import { GitBranch, RotateCcw, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
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
import type { TimelineItem } from './types'
import { changeSetPresentation, hasPartialCoverage } from './changeSetPresentation'
import { CoverageWarning } from './CoverageWarning'

/** Changeset confirmado de un turno: revisión de archivos y undo con vista previa. */
export function ChangeSetRow({ item, turnActive }: { item: Extract<TimelineItem, { type: 'changeset' }>; turnActive: boolean }) {
  const { lang, t } = useI18n()
  const [reviewing, setReviewing] = useState(false)
  const [files, setFiles] = useState<TurnChangedFile[]>(item.files)
  const [preview, setPreview] = useState<TurnUndoPreview | null>(null)
  const [working, setWorking] = useState(false)
  const presentation = changeSetPresentation(item)
  if (presentation === 'hidden') return null
  if (presentation === 'coverage-warning') return <CoverageWarning warnings={item.warnings} />

  async function review() {
    try {
      const result = await engineApi.reviewTurnChanges(item.turnId)
      setFiles(result.files)
    } catch {
      // The event already contains the persisted public diff; keep it available
      // when an older bridge lacks the review command.
      setFiles(item.files)
    }
    setReviewing((open) => !open)
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
      const result = await engineApi.undoTurnChanges(
        item.turnId,
        undefined,
        safeOnly,
      )
      toast.success(lang === 'es'
        ? `Deshacer: ${result.applied.length} archivo(s) restaurado(s)`
        : `Undo: ${result.applied.length} file(s) restored`)
      window.dispatchEvent(new Event('rinari-workspace-refresh'))
      setPreview(null)
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setWorking(false)
    }
  }

  const status = item.status === 'undone'
    ? (lang === 'es' ? 'Deshecho' : 'Undone')
    : item.status === 'partially_undone'
      ? (lang === 'es' ? 'Deshecho parcialmente' : 'Partially undone')
      : item.status === 'conflicted'
        ? (lang === 'es' ? 'Con conflictos' : 'Conflicted')
        : null
  return (
    <div className="my-2 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]/50 p-3 text-[12px]">
      <div className="flex flex-wrap items-center gap-2">
        <GitBranch size={14} className="text-[var(--accent-2)]" />
        <span className="font-medium text-[var(--text)]">{files.length} {lang === 'es' ? 'archivo(s) de este turno' : 'file(s) from this turn'}</span>
        <span className="font-mono text-[11px] text-emerald-400">+{item.additions}</span>
        <span className="font-mono text-[11px] text-red-400">-{item.deletions}</span>
        {status && <span className="text-[var(--text-subtle)]">· {status}</span>}
      </div>
      {hasPartialCoverage(item) && (
        <div className="mt-2 flex gap-2 text-amber-400"><ShieldAlert size={13} aria-hidden="true" className="mt-0.5 shrink-0" /><span>{t('changes.coverage.withFiles')}</span></div>
      )}
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => void review()} className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[var(--text-muted)] hover:text-[var(--text)]">{lang === 'es' ? 'Revisar' : 'Review'}</button>
        <button type="button" disabled={working || turnActive || item.status !== 'active' || files.length === 0} onClick={() => void prepareUndo()} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-40"><RotateCcw size={12} />{lang === 'es' ? 'Deshacer' : 'Undo'}</button>
      </div>
      {reviewing && <div className="mt-3 space-y-2">{files.map((file) => <details key={file.absolute_path} className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2"><summary className="cursor-pointer text-[var(--text-muted)]"><span className="mr-2 uppercase text-[10px] text-[var(--text-subtle)]">{file.kind}</span>{file.path}{file.sensitive && <span className="ml-2 text-amber-300">{lang === 'es' ? 'sensible' : 'sensitive'}</span>}</summary>{file.diff != null && <pre className="mt-2 max-h-64 overflow-auto whitespace-pre font-mono text-[11px] text-[var(--text-subtle)]">{file.diff}</pre>}{file.diff == null && <p className="mt-2 text-[var(--text-subtle)]">{lang === 'es' ? 'Contenido no disponible para revisión.' : 'Content unavailable for review.'}</p>}</details>)}</div>}
      <AlertDialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{lang === 'es' ? 'Deshacer cambios de este turno' : 'Undo this turn’s changes'}</AlertDialogTitle>
            <AlertDialogDescription>{preview?.conflicts.length
              ? (lang === 'es' ? `${preview.conflicts.length} ruta(s) cambiaron después del turno. El undo total está bloqueado.` : `${preview.conflicts.length} path(s) changed after the turn. Full undo is blocked.`)
              : (lang === 'es' ? 'Se restaurarán únicamente los archivos atribuidos con seguridad a este turno.' : 'Only files safely attributed to this turn will be restored.')}</AlertDialogDescription>
          </AlertDialogHeader>
          {preview && preview.conflicts.length > 0 && <ul className="max-h-40 overflow-auto text-xs text-amber-300">{preview.conflicts.map((conflict) => <li key={conflict.absolute_path}>{conflict.path} · {conflict.reason}</li>)}</ul>}
          <AlertDialogFooter>
            <AlertDialogCancel>{lang === 'es' ? 'Cancelar' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction disabled={working || (preview?.operations.length ?? 0) === 0} onClick={() => void undo(Boolean(preview?.conflicts.length))}>{preview?.conflicts.length ? (lang === 'es' ? 'Deshacer solo los seguros' : 'Undo safe files only') : (lang === 'es' ? 'Deshacer' : 'Undo')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
