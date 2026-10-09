import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight, RefreshCw } from 'lucide-react'
import DiffView from './DiffView'
import { toast } from 'sonner'
import { commandMessage, engineApi, type ChangedFile } from '../../services/engine'
import { useI18n } from '../../i18n'

/** Cambios del worktree: estado git + archivos + diff unificado por archivo. */
export default function ChangesPanel({
  path,
  onFiles,
}: {
  path: string
  onFiles: (files: string[]) => void
}) {
  const { t } = useI18n()
  const [branch, setBranch] = useState<string | null>(null)
  const [available, setAvailable] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [files, setFiles] = useState<ChangedFile[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [diff, setDiff] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [binary, setBinary] = useState(false)
  const [loaded, setLoaded] = useState(false)
  // Cada petición de diff lleva su número: una respuesta que llega tarde
  // (A lenta, B rápida) nunca pinta el diff de A bajo la selección de B.
  const request = useRef(0)

  const reload = useCallback(async () => {
    try {
      const result = await engineApi.projectChanges(path)
      setAvailable(result.available)
      setBranch(result.branch)
      setDirty(result.dirty)
      setFiles(result.files)
      setLoaded(true)
      onFiles(result.files.map((f) => f.path))
    } catch (err) {
      toast.error(commandMessage(err))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  useEffect(() => {
    setSelected(null)
    setDiff(null)
    void reload()
  }, [reload])

  async function openDiff(file: string) {
    const id = ++request.current
    if (selected === file && diff !== null) {
      setSelected(null)
      setDiff(null)
      setLoadingDiff(false)
      return
    }
    setSelected(file)
    setDiff(null)
    setLoadingDiff(true)
    try {
      const result = await engineApi.projectDiff(path, file)
      if (id !== request.current) return
      setBinary(Boolean(result.binary))
      setDiff(result.binary ? '' : result.diff)
      setTruncated(result.truncated)
    } catch (err) {
      if (id !== request.current) return
      toast.error(commandMessage(err))
      setSelected(null)
    } finally {
      if (id === request.current) setLoadingDiff(false)
    }
  }

  if (!available) {
    return <p className="text-sm text-[var(--text-subtle)]">{t('workspace.noGit')}</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-xs text-[var(--text-subtle)]">
        {branch && <span className="rounded-md border border-[var(--line-2)] px-1.5 py-0.5 font-mono text-[var(--text-muted)]">{branch}</span>}
        {loaded && <span>{dirty ? t('workspace.dirty') : t('workspace.clean')}</span>}
        <span className="flex-1" />
        <button type="button" onClick={() => void reload()} className="btn btn-quiet btn-xs">
          <RefreshCw size={12} /> {t('workspace.refresh')}
        </button>
      </div>
      {loaded && files.length === 0 && (
        <p className="text-sm text-[var(--text-subtle)]">{t('workspace.clean')}</p>
      )}
      {files.map((file) => (
        <div
          key={file.path}
          className="change-file"
          data-open={selected === file.path || undefined}
        >
          <button
            type="button"
            aria-expanded={selected === file.path}
            onClick={() => void openDiff(file.path)}
            className="change-file-head"
          >
            <ChevronRight size={13} aria-hidden="true" className="change-file-chevron" />
            <span className="change-status" data-status={(file.unstaged || file.staged || '').trim()[0] ?? ''}>
              {[file.staged, file.unstaged].filter(Boolean).join('')}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-[var(--text)]">
              {file.path}
            </span>
          </button>
          {selected === file.path && (
            <div className="border-t border-[var(--border)]">
              {loadingDiff ? (
                <p className="px-3 py-2 text-xs text-[var(--text-subtle)]">
                  {t('workspace.loadingDiff')}
                </p>
              ) : (
                binary ? <p className="px-3 py-2 text-xs text-[var(--text-subtle)]">{t('workspace.diffBinary')}</p> : diff !== null && <DiffView diff={diff} truncated={truncated} />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
