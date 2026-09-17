import { useMemo, useState } from 'react'
import { FolderOpen, FolderGit2, MessageSquare, MessageSquarePlus, Search } from 'lucide-react'
import { open as openFolderDialog } from '@tauri-apps/plugin-dialog'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { commandMessage, engineApi, type ProjectSummary, type SessionSummary } from '../../services/engine'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog'
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
import { projectDisplayName } from '../projects/workspaceModel'
import { useEngineCommands, useEngineData } from '../engine/EngineContext'
import { useBoardStore } from '../../stores/board'

const SEARCH_THRESHOLD = 8

export interface AddPaneDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Se llama con la sesión ya creada o elegida; el llamador añade el panel. */
  onAdded: (sessionId: string) => void
}

type PendingProject = { project: ProjectSummary; sharedWith: string[] }

/**
 * Alta de un panel: chat general, proyecto registrado, carpeta nueva o sesión
 * existente. Siempre crea la sesión con `createSession(project.id,
 * {activate:false})` —nunca `project.open`, que reutiliza la sesión activa del
 * root— y avisa antes de repetir una raíz canónica ya presente en el board.
 */
export default function AddPaneDialog({ open, onOpenChange, onAdded }: AddPaneDialogProps) {
  const { t } = useI18n()
  const commands = useEngineCommands()
  const data = useEngineData()
  const panes = useBoardStore((state) => state.panes)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingProject, setPendingProject] = useState<PendingProject | null>(null)

  const boardSessionIds = useMemo(() => new Set(panes.map((pane) => pane.sessionId)), [panes])
  const projects = useMemo(() => {
    const active = data.projects.filter((project) => !project.archived)
    const sorted = [...active].sort((a, b) => (b.last_opened_at ?? '').localeCompare(a.last_opened_at ?? ''))
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return sorted
    return sorted.filter((project) => [project.name, project.root].some((value) => value?.toLocaleLowerCase().includes(needle)))
  }, [data.projects, query])
  const existingSessions = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return data.sessions.filter((session) =>
      session.state === 'active' &&
      !boardSessionIds.has(session.id) &&
      (!needle || (session.title ?? '').toLocaleLowerCase().includes(needle)),
    )
  }, [boardSessionIds, data.sessions, query])

  /** Sesiones del board que ya trabajan sobre la misma raíz canónica. */
  const sharedWith = (project: ProjectSummary): string[] =>
    panes
      .map((pane) => data.sessionsById[pane.sessionId])
      .filter((session): session is SessionSummary => Boolean(session))
      .filter((session) => {
        if (session.project_id && session.project_id === project.id) return true
        const root = session.project_root
        return root !== null && (root === project.root || root === project.canonical_root)
      })
      .map((session) => session.title || session.id)

  const finish = (sessionId: string) => {
    onAdded(sessionId)
    onOpenChange(false)
    setQuery('')
  }

  async function addGeneralChat() {
    setBusy(true)
    try {
      const id = await commands.createSession(undefined, { activate: false })
      if (id) finish(id)
    } finally {
      setBusy(false)
    }
  }

  async function createForProject(project: ProjectSummary) {
    setBusy(true)
    try {
      const id = await commands.createSession(project.id, { activate: false })
      if (id) finish(id)
    } finally {
      setBusy(false)
    }
  }

  function chooseProject(project: ProjectSummary) {
    const shared = sharedWith(project)
    if (shared.length > 0) {
      setPendingProject({ project, sharedWith: shared })
      return
    }
    void createForProject(project)
  }

  async function chooseFolder() {
    const picked = await openFolderDialog({ directory: true })
    if (typeof picked !== 'string') return
    setBusy(true)
    try {
      // project.add registra o deduplica el proyecto sin crear sesiones.
      const added = await engineApi.projectAdd(picked)
      await commands.refreshProjects()
      setBusy(false)
      chooseProject(added.project)
    } catch (error) {
      setBusy(false)
      toast.error(commandMessage(error))
    }
  }

  const showSearch = data.projects.length + existingSessions.length > SEARCH_THRESHOLD

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
        <DialogContent className="max-w-lg p-0">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle>{t('board.addPane.title')}</DialogTitle>
            <DialogDescription>{t('board.addPane.description')}</DialogDescription>
          </DialogHeader>
          {showSearch && (
            <label className="mx-5 mt-3 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-1.5">
              <Search size={13} aria-hidden="true" className="text-[var(--text-subtle)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('board.addPane.search')}
                aria-label={t('board.addPane.search')}
                className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)]"
              />
            </label>
          )}
          <div className="max-h-[60vh] overflow-y-auto px-3 pb-4 pt-2">
            <section aria-label={t('board.addPane.generalChat')} className="mb-2">
              <button type="button" disabled={busy} onClick={() => void addGeneralChat()} className="add-pane-row">
                <MessageSquarePlus size={16} aria-hidden="true" className="text-[var(--accent-2)]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-[var(--text)]">{t('board.addPane.generalChat')}</span>
                  <span className="block text-[11px] text-[var(--text-subtle)]">{t('board.addPane.generalChatHint')}</span>
                </span>
              </button>
            </section>
            <section aria-label={t('board.addPane.projects')}>
              <h3 className="add-pane-heading">{t('board.addPane.projects')}</h3>
              <button type="button" disabled={busy} onClick={() => void chooseFolder()} className="add-pane-row">
                <FolderOpen size={16} aria-hidden="true" className="text-[var(--text-muted)]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-[var(--text)]">{t('board.addPane.openFolder')}</span>
                  <span className="block text-[11px] text-[var(--text-subtle)]">{t('board.addPane.openFolderHint')}</span>
                </span>
              </button>
              {projects.map((project) => (
                <button key={project.id} type="button" disabled={busy} onClick={() => chooseProject(project)} className="add-pane-row">
                  <FolderGit2 size={16} aria-hidden="true" className="text-[var(--text-muted)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-[var(--text)]">{project.name || projectDisplayName(project.root)}</span>
                    <span className="block truncate font-mono text-[11px] text-[var(--text-subtle)]">{project.root}</span>
                  </span>
                </button>
              ))}
              {projects.length === 0 && query && <p className="px-3 py-2 text-xs text-[var(--text-subtle)]">{t('board.addPane.noMatches')}</p>}
            </section>
            {existingSessions.length > 0 && (
              <section aria-label={t('board.addPane.existing')} className="mt-2">
                <h3 className="add-pane-heading">{t('board.addPane.existing')}</h3>
                {existingSessions.map((session) => (
                  <button key={session.id} type="button" disabled={busy} onClick={() => finish(session.id)} className="add-pane-row">
                    <MessageSquare size={16} aria-hidden="true" className="text-[var(--text-muted)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-[var(--text)]">{session.title || t('sidebar.newChat')}</span>
                      <span className="block truncate font-mono text-[11px] text-[var(--text-subtle)]">{session.project_root ?? t('board.addPane.generalChat')}</span>
                    </span>
                  </button>
                ))}
              </section>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={pendingProject !== null} onOpenChange={(next) => { if (!next) setPendingProject(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('board.sameProject.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('board.sameProject.body', { project: pendingProject?.project.name || projectDisplayName(pendingProject?.project.root ?? ''), panes: pendingProject?.sharedWith.join(', ') ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('board.sameProject.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const project = pendingProject?.project; setPendingProject(null); if (project) void createForProject(project) }}>
              {t('board.sameProject.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
