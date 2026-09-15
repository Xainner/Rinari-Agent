import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  Copy,
  Cpu,
  FolderGit2,
  FolderOpen,
  MessageSquare,
  LoaderCircle,
  MoreHorizontal,
  PanelLeftOpen,
  PanelLeftClose,
  Plus,
  GitFork,
  Pencil,
  Pin,
  Search,
} from 'lucide-react'
import type { ProjectSummary, SessionSummary } from '../../services/engine'
import type { PendingApproval } from '../../types'
import { buildWorkspaceModel, projectDisplayName, groupRecentChats } from '../../features/projects/workspaceModel'
import { useI18n } from '../../i18n'
import { useUIStore } from '../../stores/ui'
import { cn } from '../../lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from '../ui/dropdown-menu'
import { Switch } from '../ui/switch'
import ApplicationMenu from './ApplicationMenu'

export interface AppSidebarProps {
  collapsed: boolean
  onToggleCollapse: () => void
  onSearch: () => void
  onOpenSettings: () => void
  onOpenEngine: () => void
  /** Home del proyecto de la sesión activa; null si no hay. */
  onOpenProjectHome: (() => void) | null
  onNewChat: () => void
  onNewProjectChat?: (projectId: string) => void
  onMoveSession?: (id: string, projectId: string | null) => void
  /** Abrir carpeta con el diálogo nativo (registra proyecto en el engine). */
  onOpenFolder: () => void
  sessions: SessionSummary[]
  closedSessions: SessionSummary[]
  archivedSessions: SessionSummary[]
  projects: ProjectSummary[]
  archivedProjects: ProjectSummary[]
  activeId: string
  busySessionIds?: ReadonlySet<string>
  onSelectSession: (id: string) => void
  /** Ir al home del proyecto (vista workspace). */
  onOpenProject: (root: string) => void
  onCloseSession: (id: string) => void
  onRenameSession: (id: string, title: string) => void
  onArchiveSession: (id: string) => void
  onRestoreSession: (id: string) => void
  onForkSession: (id: string) => void
  onDeleteSession: (id: string, cascade: boolean) => void
  onUpdateProject: (id: string, changes: { pinned?: boolean; archived?: boolean }) => void
  onArchiveProject: (id: string) => void
  approvals: PendingApproval[]
}

function sessionLabel(session: SessionSummary, fallback: string): string {
  return session.title || fallback
}

function RailButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-10 items-center justify-center rounded-xl text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
    >
      {children}
    </button>
  )
}

export function AppSidebar({
  collapsed,
  onToggleCollapse,
  onSearch,
  onOpenEngine,
  onOpenProjectHome,
  onNewChat,
  onNewProjectChat,
  onMoveSession,
  onOpenFolder,
  sessions,
  closedSessions,
  archivedSessions,
  projects,
  archivedProjects,
  activeId,
  busySessionIds,
  onSelectSession,
  onOpenProject,
  onCloseSession,
  onRenameSession,
  onArchiveSession,
  onRestoreSession,
  onForkSession,
  onDeleteSession,
  onUpdateProject,
  onArchiveProject,
  approvals,
}: AppSidebarProps) {
  const { t } = useI18n()
  // El mismo nodo vive en el aside desktop y en el drawer móvil: en el
  // drawer siempre se muestra expandido.
  const newChatShortcut = useUIStore(s => s.shortcutBindings.newChat)
  const mobileOpen = useUIStore((s) => s.sidebarOpen)
  const rail = collapsed && !mobileOpen
  const [showClosed, setShowClosed] = useState(false)
  const [showArchivedProjects, setShowArchivedProjects] = useState(false)
  const [showArchivedSessions, setShowArchivedSessions] = useState(false)
  const [query, setQuery] = useState('')
  const [sessionMenu, setSessionMenu] = useState<string | null>(null)
  const [projectMenu, setProjectMenu] = useState<string | null>(null)
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(() => new Set())
  const [deleteTarget, setDeleteTarget] = useState<SessionSummary | null>(null)
  const [renameTarget, setRenameTarget] = useState<SessionSummary | null>(null)
  const [renameTitle, setRenameTitle] = useState('')
  const [cascade, setCascade] = useState(false)

  const model = useMemo(() => buildWorkspaceModel(sessions, projects, query), [sessions, projects, query])
  const archivedProjectResults = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return archivedProjects
    return archivedProjects.filter((project) =>
      [project.name, project.description, project.root]
        .some((value) => value?.toLocaleLowerCase().includes(needle)),
    )
  }, [archivedProjects, query])
  const archivedSessionResults = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return archivedSessions
    return archivedSessions.filter((session) => session.title?.toLocaleLowerCase().includes(needle))
  }, [archivedSessions, query])

  const confirmDelete = () => {
    if (!deleteTarget) return
    onDeleteSession(deleteTarget.id, cascade)
    setDeleteTarget(null)
    setCascade(false)
  }

  const row = (session: SessionSummary, opts?: { closed?: boolean }) => {
    const active = session.id === activeId
    const working = busySessionIds?.has(session.id) === true
    return (
      <li key={session.id} className="group relative" onContextMenu={e => { e.preventDefault(); setSessionMenu(session.id) }}>
        <div
          className={cn(
            'flex w-full items-center gap-1 rounded-xl pr-1 pl-2.5 transition-colors',
            active ? 'bg-[var(--bg-active)]' : 'hover:bg-[var(--bg-hover)]/60',
          )}
        >
          <button
            type="button"
            onClick={() => onSelectSession(session.id)}
            aria-current={active ? 'page' : undefined}
            className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5 text-left"
          >
            {active && (
              <span
                aria-hidden="true"
                className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-[var(--accent)]"
              />
            )}
            {working ? <span role="status" aria-label={t('sidebar.sessionWorking')} title={t('sidebar.sessionWorking')}>
              <LoaderCircle size={14} aria-hidden="true" className="shrink-0 text-[var(--accent)] motion-safe:animate-spin" />
            </span> : <MessageSquare
              size={14}
              aria-hidden="true"
              className={cn('shrink-0 transition-colors', active ? 'text-[var(--accent)]' : 'text-[var(--text-subtle)]')}
            />}
            <span
              className={cn(
                'block min-w-0 flex-1 truncate text-sm',
                active ? 'font-semibold text-[var(--text)]' : 'text-[var(--text-muted)]',
              )}
            >
              {sessionLabel(session, t('sidebar.newChat'))}
            </span>
            {session.state !== 'active' && (
              <span
                role="img"
                aria-label={t('sidebar.sessionInterrupted')}
                title={t('sidebar.sessionInterrupted')}
                data-testid="session-interrupted-dot"
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
              />
            )}
          </button>
          <DropdownMenu open={sessionMenu === session.id} onOpenChange={open => setSessionMenu(open ? session.id : null)}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t('sidebar.sessionOptions')}
                onClick={(e) => e.stopPropagation()}
                className="rounded-md p-1 text-[var(--text-subtle)] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 hover:bg-[var(--bg-active)] hover:text-[var(--text)]"
              >
                <MoreHorizontal size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2.5 py-1.5 font-mono text-[10px] break-all text-[var(--text-subtle)]">{session.id}</div>
              <DropdownMenuItem onSelect={() => {
                void navigator.clipboard.writeText(session.id).then(() => toast.success('ID de sesión copiado')).catch(() => toast.error('No se pudo copiar el ID de sesión'))
              }}><Copy size={13} /> Copiar ID de sesión</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => {
                const reference = `Sesión: ${session.id}\nTítulo: ${sessionLabel(session, t('sidebar.newChat'))}${session.project_id ? `\nProyecto: ${session.project_id}` : ''}${session.project_root ? `\nWorkspace: ${session.project_root}` : ''}`
                void navigator.clipboard.writeText(reference).then(() => toast.success('Referencia de sesión copiada')).catch(() => toast.error('No se pudo copiar la referencia'))
              }}><Copy size={13} /> Copiar referencia</DropdownMenuItem>
              {opts?.closed ? (
                <DropdownMenuItem onSelect={() => onRestoreSession(session.id)}>
                  <ArchiveRestore size={13} /> {t('sidebar.restore')}
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem onSelect={() => {
                    setRenameTitle(sessionLabel(session, t('sidebar.newChat')))
                    setRenameTarget(session)
                  }}>
                    <Pencil size={13} /> {t('sidebar.rename')}
                  </DropdownMenuItem>
                  {onMoveSession && <DropdownMenuSub><DropdownMenuSubTrigger><FolderGit2 size={13} /> Mover a proyecto…</DropdownMenuSubTrigger><DropdownMenuSubContent>
                    <DropdownMenuItem disabled={session.kind === 'CHAT'} onSelect={() => onMoveSession(session.id, null)}>Espacio general</DropdownMenuItem>
                    {projects.filter(project => !project.archived).map(project => <DropdownMenuItem key={project.id} disabled={project.id === session.project_id} onSelect={() => onMoveSession(session.id, project.id)}>{project.name || projectDisplayName(project.root)}</DropdownMenuItem>)}
                  </DropdownMenuSubContent></DropdownMenuSub>}
                  <DropdownMenuItem onSelect={() => onForkSession(session.id)}>
                    <GitFork size={13} /> {t('sidebar.fork')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onArchiveSession(session.id)}>
                    <Archive size={13} /> {t('sidebar.archive')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onCloseSession(session.id)}>
                    {t('sidebar.close')}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem
                onSelect={() => {
                  setCascade(false)
                  setDeleteTarget(session)
                }}
                className="text-red-500 focus:text-red-500"
              >
                {t('sidebar.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </li>
    )
  }

  if (rail) {
    return (
      <div className="flex h-full w-full flex-col items-center gap-1 px-2 pt-4 pb-3">
        <RailButton label={t('sidebar.newChat')} onClick={onNewChat}>
          <Plus size={17} />
        </RailButton>
        <RailButton label={t('sidebar.commands')} onClick={onSearch}>
          <Search size={17} />
        </RailButton>
        {onOpenProjectHome && (
          <RailButton label={t('sidebar.projects')} onClick={onOpenProjectHome}>
            <FolderGit2 size={17} />
          </RailButton>
        )}
        <RailButton label={t('nav.engine')} onClick={onOpenEngine}>
          <Cpu size={17} />
        </RailButton>
        <div className="flex-1" />
        <ApplicationMenu collapsed />
        <RailButton label={t('shell.expand')} onClick={onToggleCollapse}>
          <PanelLeftOpen size={17} />
        </RailButton>
      </div>
    )
  }

  return (
    <div className="concept-sidebar flex h-full w-full flex-col gap-4 overflow-hidden px-3 pt-3 pb-0">
      <div className="shrink-0 space-y-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onNewChat}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-[var(--bg-active)] px-3 py-3 text-sm font-semibold text-[var(--text)] transition-colors hover:bg-[var(--bg-active)]"
        >
          <Plus size={15} aria-hidden="true" />
          <span className="truncate">{t('sidebar.newChat')}</span><kbd className="ml-auto whitespace-nowrap text-[11px] font-normal text-[var(--text-subtle)]">{newChatShortcut.replaceAll('+', ' + ')}</kbd>
        </button>

      </div>
      </div>

        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-2.5 py-1.5 transition-colors focus-within:border-[var(--border-strong)]">
          <Search size={13} aria-hidden="true" className="text-[var(--text-subtle)]" />
          <input
            aria-label={t('sidebar.searchWorkspace')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('sidebar.searchWorkspace')}
            className="min-w-0 flex-1 border-0 bg-transparent text-xs text-[var(--text)] outline-none"
          />
        <button type="button" onClick={onToggleCollapse} aria-label={t('shell.collapse')} title={t('shell.collapse')} className="hidden rounded-lg p-1 text-[var(--text-subtle)] hover:text-[var(--text)] lg:block"><PanelLeftClose size={15} /></button>
        </div>
      <div className="sidebar-scroll min-h-0 flex-1 space-y-4 overflow-y-auto pr-0.5">

        <section aria-label={t('sidebar.projects')}>
          <div className="mb-1 flex items-center justify-between pl-2">
            <p className="text-[11px] font-semibold tracking-widest text-[var(--text-subtle)] uppercase">
              {t('sidebar.projects')}
            </p>
            <button
              type="button"
              onClick={onOpenFolder}
              aria-label={t('sidebar.openFolder')}
              title={t('sidebar.openFolder')}
              className="rounded-md p-1 text-[var(--text-subtle)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
            >
              <FolderOpen size={13} />
            </button>
          </div>
          {model.sections.length === 0 && (
            <p className="px-2 text-xs text-[var(--text-subtle)]">{t('sidebar.noProjects')}</p>
          )}
          <ul className="space-y-1.5">
            {model.sections.map(({ project, sessions: items }) => (
              <li key={project.id} className="group/project" onContextMenu={e => { if (!e.defaultPrevented) { e.preventDefault(); setProjectMenu(project.id) } }}>
                <div className="flex items-center">
                <button
                  type="button"
                  aria-expanded={!collapsedProjects.has(project.id) || Boolean(query)}
                  onClick={() => setCollapsedProjects(current => { const next = new Set(current); if (next.has(project.id)) next.delete(project.id); else next.add(project.id); return next })}
                  title={project.root}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-[var(--bg-hover)]/60"
                >
                  <FolderGit2 size={14} aria-hidden="true" className="shrink-0 text-[var(--accent)]" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text)]">
                    {project.name || projectDisplayName(project.root)}
                  </span>
                  {project.pinned && <Pin size={11} className="text-[var(--text-subtle)]" />}
                  {items.length > 0 && (
                    <span className="shrink-0 rounded-md border border-[var(--border)] px-1 font-mono text-[10px] text-[var(--text-subtle)]">
                      {items.length}
                    </span>
                  )}
                  {items.some(item => busySessionIds?.has(item.id)) && (
                    <span role="status" aria-label={t('sidebar.projectWorking')} title={t('sidebar.projectWorking')}>
                      <LoaderCircle size={13} aria-hidden="true" className="text-[var(--accent)] motion-safe:animate-spin" />
                    </span>
                  )}
                </button>
                {onNewProjectChat && <button type="button" aria-label={`Nueva sesión en ${project.name || projectDisplayName(project.root)}`} title="Nueva sesión en este proyecto" onClick={() => {
                  setQuery('')
                  setCollapsedProjects(current => { const next = new Set(current); next.delete(project.id); return next })
                  onNewProjectChat(project.id)
                }} className="rounded-md p-1 text-[var(--text-subtle)] opacity-0 group-hover/project:opacity-100 focus-visible:opacity-100 hover:bg-[var(--bg-hover)]"><Plus size={14} /></button>}
                <DropdownMenu open={projectMenu === project.id} onOpenChange={open => setProjectMenu(open ? project.id : null)}>
                  <DropdownMenuTrigger asChild>
                    <button type="button" aria-label={t('project.options')} className="rounded-md p-1 text-[var(--text-subtle)] opacity-0 group-hover/project:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100">
                      <MoreHorizontal size={13} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onUpdateProject(project.id, { pinned: !project.pinned })}>
                      <Pin size={13} /> {project.pinned ? t('project.unpin') : t('project.pin')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onOpenProject(project.root)}>
                      <Pencil size={13} /> {t('project.edit')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onArchiveProject(project.id)}>
                      <Archive size={13} /> {t('project.archive')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                </div>
                {items.length > 0 && (!collapsedProjects.has(project.id) || Boolean(query)) && (
                  <ul className="mt-0.5 ml-3.5 space-y-0.5 border-l border-[var(--border)] pl-1">
                    {items.map((session) => row(session))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>

        {archivedProjectResults.length > 0 && (
          <section aria-label={t('project.archived')}>
            <button type="button" onClick={() => setShowArchivedProjects((value) => !value)} aria-expanded={showArchivedProjects} className="flex w-full items-center gap-1.5 px-2 text-[11px] font-semibold tracking-widest text-[var(--text-subtle)] uppercase">
              <ChevronDown size={12} className={cn('transition-transform', !showArchivedProjects && '-rotate-90')} />
              {t('project.archived')} · {archivedProjectResults.length}
            </button>
            {showArchivedProjects && (
              <ul className="mt-1 space-y-0.5">
                {archivedProjectResults.map((project) => (
                  <li key={project.id} className="flex items-center gap-1 rounded-lg px-2 py-1.5">
                    <FolderGit2 size={13} className="text-[var(--text-subtle)]" />
                    <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-muted)]">{project.name}</span>
                    <button type="button" onClick={() => onUpdateProject(project.id, { archived: false })} className="rounded-md p-1 text-[var(--text-subtle)] hover:bg-[var(--bg-hover)]" aria-label={t('project.restore')} title={t('project.restore')}>
                      <ArchiveRestore size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section aria-label={t('sidebar.chats')}>
          <div className="mb-1 flex items-center justify-between px-2">
            <p className="text-[11px] font-semibold tracking-widest text-[var(--text-subtle)] uppercase">
              {t('sidebar.chats')}
            </p>
            <button
              type="button"
              aria-label={t('sidebar.newGeneralChat')}
              title={t('sidebar.newGeneralChat')}
              onClick={() => { setQuery(''); onNewChat() }}
              className="rounded-md p-1 text-[var(--text-subtle)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
            >
              <Plus size={14} aria-hidden="true" />
            </button>
          </div>
          <ul className="space-y-0.5">
            {groupRecentChats(model.chats).map(group => <li key={group.key} className="mt-2">
              <details open><summary className="cursor-pointer px-1 pb-2 text-[11px] text-[var(--text-subtle)]">{t(`home.${group.key}`)}</summary>
              <ul className="space-y-0.5">{group.sessions.map(session => row(session))}</ul></details>
            </li>)}
            {model.chats.length === 0 && (
              <li className="px-2 text-xs text-[var(--text-subtle)]">{t('sidebar.emptyChats')}</li>
            )}
          </ul>
        </section>

        {archivedSessionResults.length > 0 && (
          <section aria-label={t('sidebar.archivedSessions')}>
            <button
              type="button"
              onClick={() => setShowArchivedSessions((value) => !value)}
              aria-expanded={showArchivedSessions}
              className="flex w-full items-center gap-1.5 px-2 text-[11px] font-semibold tracking-widest text-[var(--text-subtle)] uppercase transition-colors hover:text-[var(--text-muted)]"
            >
              <ChevronDown
                size={12}
                aria-hidden="true"
                className={cn('transition-transform', !showArchivedSessions && '-rotate-90')}
              />
              {t('sidebar.archivedSessions')} · {archivedSessionResults.length}
            </button>
            {showArchivedSessions && (
              <ul className="mt-1 space-y-0.5">
                {archivedSessionResults.map((session) => row(session, { closed: true }))}
              </ul>
            )}
          </section>
        )}

        {closedSessions.length > 0 && (
          <section aria-label={t('sidebar.closed')}>
            <button
              type="button"
              onClick={() => setShowClosed((v) => !v)}
              aria-expanded={showClosed}
              className="flex w-full items-center gap-1.5 px-2 text-[11px] font-semibold tracking-widest text-[var(--text-subtle)] uppercase transition-colors hover:text-[var(--text-muted)]"
            >
              <ChevronDown
                size={12}
                aria-hidden="true"
                className={cn('transition-transform', !showClosed && '-rotate-90')}
              />
              {t('sidebar.closed')} · {closedSessions.length}
            </button>
            {showClosed && (
              <ul className="mt-1 space-y-0.5">
                {closedSessions.map((session) => row(session, { closed: true }))}
              </ul>
            )}
          </section>
        )}

        {approvals.length > 0 && (
          <div className="mt-3">
            <p className="mb-1 px-2 text-[11px] font-semibold tracking-widest text-[var(--text-subtle)] uppercase">
              {t('sidebar.approvals')} · {approvals.length}
            </p>
            <p className="px-2 text-[11px] leading-relaxed text-[var(--text-subtle)]">
              Responde la solicitud dentro del turno activo.
            </p>
          </div>
        )}
      </div>

      <ApplicationMenu />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('sidebar.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('sidebar.deleteDesc', { title: deleteTarget ? sessionLabel(deleteTarget, t('sidebar.newChat')) : '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-3 py-2.5">
            <span className="text-sm text-[var(--text)]">{t('sidebar.deleteCascade')}</span>
            <Switch checked={cascade} onCheckedChange={setCascade} />
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {t('sidebar.deleteConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={renameTarget !== null} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('sidebar.rename')}</AlertDialogTitle>
            <AlertDialogDescription>{t('sidebar.renameDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <input
            autoFocus
            aria-label={t('sidebar.rename')}
            value={renameTitle}
            onChange={(event) => setRenameTitle(event.target.value)}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (renameTarget && renameTitle.trim()) onRenameSession(renameTarget.id, renameTitle.trim())
              setRenameTarget(null)
            }}>{t('project.save')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default AppSidebar
