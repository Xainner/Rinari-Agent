import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { commandMessage, engineApi } from '../../services/engine'
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

type Checkpoint = Record<string, unknown>

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Checkpoints: timeline + vista previa + restauración.
 * Restaurar siempre pasa por preview y confirmación; la seguridad la pone el engine.
 */
export default function CheckpointsPanel({ path }: { path: string }) {
  const { t } = useI18n()
  const [points, setPoints] = useState<Checkpoint[]>([])
  const [detail, setDetail] = useState<Checkpoint | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [working, setWorking] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    setPoints([])
    setDetail(null)
    setOpenId(null)
    setPreview(null)
    setLoading(true)
    setLoadError(null)
    // A stale request (including StrictMode's first mount) must not report
    // errors after the panel has been replaced. Loading errors belong here,
    // once, rather than in global toasts for every mounted workspace.
    void engineApi.checkpointList(path).then(result => {
      if (active) setPoints(result.checkpoints)
    }).catch(err => {
      if (active) setLoadError(commandMessage(err))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [path, reload])

  async function openCheckpoint(id: string) {
    if (openId === id) {
      setOpenId(null)
      setDetail(null)
      setPreview(null)
      return
    }
    try {
      const result = await engineApi.checkpointShow(id)
      setDetail(result.checkpoint)
      setOpenId(id)
      setPreview(null)
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  async function runPreview() {
    if (!openId) return
    setWorking(true)
    try {
      const result = await engineApi.checkpointRestore({
        path,
        checkpoint_id: openId,
        preview: true,
      })
      setPreview(result.result)
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setWorking(false)
    }
  }

  async function runRestore() {
    if (!openId) return
    setWorking(true)
    try {
      await engineApi.checkpointRestore({ path, checkpoint_id: openId })
      toast.success(t('workspace.restored'))
      setConfirming(false)
      setPreview(null)
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setWorking(false)
    }
  }

  function previewFiles(): string[] {
    const value = preview?.['restored'] ?? preview?.['files'] ?? []
    return Array.isArray(value)
      ? value.map((v) => (typeof v === 'string' ? v : str((v as Checkpoint)['path'])))
      : []
  }

  if (loading) return <p role="status" className="text-sm text-[var(--text-subtle)]">{t('workspace.loadingCheckpoints')}</p>

  if (loadError) return <div className="space-y-2 text-sm">
    <p role="alert" className="break-words text-[var(--danger)]">{loadError}</p>
    <button type="button" onClick={() => setReload(value => value + 1)} className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs hover:bg-[var(--bg-hover)]">{t('workspace.retry')}</button>
  </div>

  if (points.length === 0) {
    return <p className="text-sm text-[var(--text-subtle)]">{t('workspace.checkpointsEmpty')}</p>
  }

  return (
    <div className="space-y-1.5">
      {points.map((point, i) => {
        const id = str(point['id'])
        const isOpen = openId === id
        const files = Array.isArray(detail?.['files'])
          ? (detail?.['files'] as Array<Record<string, unknown>>)
          : []
        return (
          <div key={id || i} className="overflow-hidden rounded-xl border border-[var(--border)]">
            <button
              type="button"
              onClick={() => void openCheckpoint(id)}
              className="flex w-full items-center gap-2 bg-[var(--bg-subtle)] px-3 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--text)]">
                {str(point['label']) || id}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-[var(--text-subtle)]">
                {str(point['created_at'])}
              </span>
            </button>
            {isOpen && detail && (
              <div className="space-y-2 border-t border-[var(--border)] px-3 py-2.5">
                {files.length > 0 && (
                  <ul className="space-y-0.5">
                    {files.map((file, j) => (
                      <li
                        key={j}
                        className="truncate font-mono text-[12px] text-[var(--text-muted)]"
                      >
                        {str(file['path'])}
                        {str(file['status']) !== '' && ` · ${str(file['status'])}`}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void runPreview()}
                    disabled={working}
                    className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
                  >
                    {t('workspace.preview')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    disabled={working}
                    className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--danger)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
                  >
                    {t('workspace.restore')}
                  </button>
                </div>
                {preview && (
                  <div className="rounded-lg bg-[var(--bg-subtle)] px-2.5 py-2">
                    <p className="text-[11px] font-semibold text-[var(--text-subtle)] uppercase">
                      {t('workspace.preview')}
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {previewFiles().map((file) => (
                        <li key={file} className="truncate font-mono text-[12px] text-[var(--text)]">
                          {file}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      <AlertDialog open={confirming} onOpenChange={(open) => !open && setConfirming(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('workspace.restore')}</AlertDialogTitle>
            <AlertDialogDescription>{t('workspace.confirmRestore')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('providers.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runRestore()}>
              {t('workspace.restore')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
