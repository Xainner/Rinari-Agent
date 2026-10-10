import { useMemo, useState } from 'react'
import { Folder, FolderOpen, MessageSquare, MessageSquarePlus, Search } from 'lucide-react'
import { platform } from '../../platform'
import { useI18n } from '../../i18n'
import { engineApi, type ProjectSummary, type SessionSummary } from '../../services/engine'
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
import { isDraftPane, useBoardStore } from '../../stores/board'
import { useProjectExpansionStore } from '../../stores/projectExpansion'
import { inProfile, useProfileStore } from '../profiles/profileStore'
import { useCreateProjectStore } from '../projects/createProjectStore'

const SEARCH_THRESHOLD = 8

export interface AddPaneDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Se llama con una sesión existente elegida; el llamador añade el panel. */
  onAdded: (sessionId: string) => void
  /**
   * Conversación nueva (general o de un proyecto): el llamador añade un panel
   * borrador; la sesión se crea con su primer mensaje.
   */
  onAddDraft: (projectId: string | null) => void
}

type PendingProject = { project: ProjectSummary; sharedWith: string[] }

/**
 * Alta de un panel: chat general, proyecto registrado, carpeta nueva o sesión
 * existente. Un proyecto entra como borrador (la sesión nace con su primer
 * mensaje; nunca `project.open`, que reutiliza la sesión activa del root) y se
 * avisa antes de repetir una raíz canónica ya presente en el board. Una
 * carpeta nueva abre la ventana «Nuevo proyecto».
 */
export default function AddPaneDialog({ open, onOpenChange, onAdded, onAddDraft }: AddPaneDialogProps) {
  const { t } = useI18n()
  const commands = useEngineCommands()
  const data = useEngineData()
  const panes = useBoardStore((state) => state.panes)
  const [query, setQuery] = useState('')
  const [pendingProject, setPendingProject] = useState<PendingProject | null>(null)

  const boardSessionIds = useMemo(() => new Set(panes.map((pane) => pane.sessionId)), [panes])
  const activeProfileId = useProfileStore((state) => state.activeId)
  const visibleProjects = useMemo(
    () => data.projects.filter((project) => !project.archived && inProfile(project, activeProfileId)),
    [data.projects, activeProfileId],
  )
  const projects = useMemo(() => {
    const sorted = [...visibleProjects].sort((a, b) => (b.last_opened_at ?? '').localeCompare(a.last_opened_at ?? ''))
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return sorted
    return sorted.filter((project) => [project.name, project.root].some((value) => value?.toLocaleLowerCase().includes(needle)))
  }, [visibleProjects, query])
  const existingSessions = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return data.sessions.filter((session) =>
      session.state === 'active' &&
      inProfile(session, activeProfileId) &&
      !boardSessionIds.has(session.id) &&
      (!needle || (session.title ?? '').toLocaleLowerCase().includes(needle)),
    )
  }, [boardSessionIds, data.sessions, query, activeProfileId])

  /** Sesiones del board que ya trabajan sobre la misma raíz canónica. */
  const sharedWith = (project: ProjectSummary): string[] => [
    ...panes
      .map((pane) => data.sessionsById[pane.sessionId])
      .filter((session): session is SessionSummary => Boolean(session))
      .filter((session) => {
        if (session.project_id && session.project_id === project.id) return true
        const root = session.project_root
        return root !== null && (root === project.root || root === project.canonical_root)
      })
      .map((session) => session.title || session.id),
    // Un borrador del mismo proyecto también ocupa esa raíz.
    ...panes.filter((pane) => isDraftPane(pane) && pane.draft.projectId === project.id).map(() => t('sidebar.newChat')),
  ]

  const finish = (sessionId: string) => {
    onAdded(sessionId)
    onOpenChange(false)
    setQuery('')
  }

  const finishDraft = (projectId: string | null) => {
    onAddDraft(projectId)
    onOpenChange(false)
    setQuery('')
  }

  function addGeneralChat() {
    finishDraft(null)
  }

  function createForProject(project: ProjectSummary) {
    useProjectExpansionStore.getState().reveal(project.id)
    finishDraft(project.id)
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
    const picked = (await platform().dialog.openFiles({ directory: true }))?.[0] ?? null
    if (typeof picked !== 'string') return
    // Una carpeta de un proyecto ya visible abre ese proyecto, como elegirlo en la
    // lista. Lo decide el Engine: compara rutas canónicas (nombres cortos de
    // Windows, enlaces, mayúsculas), cosa que el renderer no puede hacer.
    const owner = await engineApi.projectFoldersValidate([picked])
      .then((result) => result.folders[0]?.error)
      .catch(() => null)
    const existing = owner?.code === 'IN_PROJECT'
      ? visibleProjects.find((project) => project.id === owner.project_id)
      : undefined
    if (existing) {
      chooseProject(existing)
      return
    }
    // Una carpeta nueva pasa por la ventana «Nuevo proyecto» (nombre, carpetas,
    // confianza, perfil). Al crearlo, el panel es un borrador: la conversación
    // nace con su primer mensaje, como en el resto de Boards.
    onOpenChange(false)
    setQuery('')
    useCreateProjectStore.getState().openWith([picked], {
      openSession: false,
      onCreated: (project) => {
        void commands.refreshProjects()
        onAddDraft(project.id)
      },
    })
  }

  const showSearch = data.projects.length + existingSessions.length > SEARCH_THRESHOLD

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
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
              <button type="button" onClick={() => void addGeneralChat()} className="add-pane-row">
                <MessageSquarePlus size={16} aria-hidden="true" className="text-[var(--accent-2)]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-[var(--text)]">{t('board.addPane.generalChat')}</span>
                  <span className="block text-[11px] text-[var(--text-subtle)]">{t('board.addPane.generalChatHint')}</span>
                </span>
              </button>
            </section>
            <section aria-label={t('board.addPane.projects')}>
              <h3 className="add-pane-heading">{t('board.addPane.projects')}</h3>
              <button type="button" onClick={() => void chooseFolder()} className="add-pane-row">
                <FolderOpen size={16} aria-hidden="true" className="text-[var(--text-muted)]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-[var(--text)]">{t('board.addPane.openFolder')}</span>
                  <span className="block text-[11px] text-[var(--text-subtle)]">{t('board.addPane.openFolderHint')}</span>
                </span>
              </button>
              {projects.map((project) => (
                <button key={project.id} type="button" onClick={() => chooseProject(project)} className="add-pane-row">
                  <Folder size={16} aria-hidden="true" className="text-[var(--text-muted)]" />
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
                  <button key={session.id} type="button" onClick={() => finish(session.id)} className="add-pane-row">
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
