import { useCallback, useEffect, useState } from 'react'
import { Folder, FolderPlus, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'
import { platform } from '../../platform'
import { commandMessage, engineApi } from '../../services/engine'
import type { ProjectFolder } from '../../types/protocol.generated'
import { branchLabel } from './ProjectBranch'

const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path

/**
 * A project's working folders on its page: each with its branch and trust,
 * and the way to add, trust or remove the extra ones. The primary folder
 * stays (it is where memory, tasks and checkpoints live).
 */
export function ProjectFolders({ projectId, onChanged }: { projectId: string; onChanged?: () => void }) {
  const { t } = useI18n()
  const [folders, setFolders] = useState<ProjectFolder[] | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const result = await engineApi.projectGet(projectId)
      setFolders(result.project.folders ?? [])
    } catch {
      setFolders([])
    }
  }, [projectId])

  useEffect(() => { void load() }, [load])

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    try {
      await action()
      await load()
      onChanged?.()
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function add() {
    const picked = await platform().dialog.openFiles({ directory: true, multiple: true, title: t('createProject.pick') })
    if (!picked?.length) return
    await run(async () => {
      for (const path of picked) await engineApi.projectFolderAdd(projectId, path)
    })
  }

  if (folders === null) return null
  return (
    <section className="project-folders" aria-label={t('createProject.folders')} data-testid="project-folders">
      <div className="project-folders-head">
        <p className="text-xs font-semibold text-[var(--text-muted)]">{t('createProject.folders')}</p>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void add()}>
          <FolderPlus size={13} aria-hidden="true" /> {t('createProject.addFolder')}
        </button>
      </div>
      <ul className="project-folders-list">
        {folders.map((folder) => {
          const trusted = folder.trust_state === 'trusted'
          const branch = branchLabel(folder.git_head ?? null)
          return (
            <li key={folder.path} className={cn('project-folder', !folder.exists && 'is-missing')}>
              <Folder size={13} aria-hidden="true" className="shrink-0 text-[var(--text-subtle)]" />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[12.5px] font-medium text-[var(--text)]">{baseName(folder.path)}</span>
                  {folder.primary && <span className="create-project-primary">{t('createProject.primary')}</span>}
                  {branch && <span className="project-branch">{branch}</span>}
                </span>
                <span className="block truncate font-mono text-[10.5px] text-[var(--text-subtle)]" title={folder.path}>{folder.path}</span>
              </span>
              {!folder.primary && (trusted
                ? <span className="project-folder-trust" title={t('projectFolders.trusted')}><ShieldCheck size={12} aria-hidden="true" /> {t('projectFolders.trusted')}</span>
                : <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !folder.exists} onClick={() => void run(() => engineApi.projectTrust(folder.path))}>{t('createProject.trust')}</button>)}
              {!folder.primary && (
                <button type="button" className="create-project-icon" disabled={busy} onClick={() => void run(() => engineApi.projectFolderRemove(projectId, folder.path))} aria-label={t('createProject.remove')} title={t('createProject.remove')}>
                  <X size={13} aria-hidden="true" />
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {folders.some((folder) => !folder.primary && folder.trust_state !== 'trusted') && (
        <p className="text-[11px] leading-relaxed text-[var(--text-subtle)]">{t('projectFolders.untrustedNote')}</p>
      )}
    </section>
  )
}
