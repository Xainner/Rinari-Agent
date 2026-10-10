import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  ChevronDown,
  Columns3,
  Copy,
  Cpu,
  Folder,
  FolderOpen,
  Layers,
  MessageSquare,
  MoreHorizontal,
  Plus,
  GitFork,
  Pencil,
  Pin,
  PinOff,
  Search,
  Trash2,
  Workflow,
  X,
} from 'lucide-react'
import type { ProjectSummary, SessionSummary } from '../../services/engine'
import type { PendingApproval } from '../../types'
import { buildWorkspaceModel, projectDisplayName, groupRecentChats, PINNED_VISIBLE_LIMIT } from '../../features/projects/workspaceModel'
import { useI18n } from '../../i18n'
import { useUIStore } from '../../stores/ui'
import { cn } from '../../lib/utils'
import { copyText } from '../../lib/clipboard'
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
  DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from '../ui/dropdown-menu'
import { Switch } from '../ui/switch'
import ApplicationMenu, { SidebarFooter } from './ApplicationMenu'
import SidebarIdentity from './SidebarIdentity'
import { AnimatePresence, motion } from 'framer-motion'
import { ease, useCalmMotion } from '../../lib/motion'
import { art } from '../../features/rinari/art'
import { inProfile, useProfileStore } from '../../features/profiles/profileStore'
import { isProjectExpanded, useProjectExpansionStore } from '../../stores/projectExpansion'
import { ProjectBranch } from '../../features/projects/ProjectBranch'
import { TitleSwap } from '../TitleSwap'

export interface AppSidebarProps {
  collapsed: boolean
  onSearch: () => void
  onOpenSettings: () => void
  onOpenEngine: () => void
  /** Tareas programadas; ausente si el Engine no anuncia `scheduled_tasks_v1`. */
  onOpenSchedules?: () => void
  /** Home del proyecto de la sesión activa; null si no hay. */
  onOpenProjectHome: (() => void) | null
  onNewChat: () => void
  onNewProjectChat?: (projectId: string) => void
  onMoveSession?: (id: string, projectId: string | null) => void
  /** Move a conversation to another Rinari profile (the app asks when it is in a project). */
  onMoveSessionProfile?: (session: SessionSummary, profileId: string) => void
  /** Move a project, with all its conversations, to another Rinari profile. */
  onMoveProjectProfile?: (project: ProjectSummary, profileId: string) => void
  /** Abrir carpeta con el diálogo nativo (registra proyecto en el engine). */
  onOpenFolder: () => void
  sessions: SessionSummary[]
  closedSessions: SessionSummary[]
  archivedSessions: SessionSummary[]
  projects: ProjectSummary[]
  archivedProjects: ProjectSummary[]
  activeId: string
  busySessionIds?: ReadonlySet<string>
  /** Sesiones presentes en el board (marca visual). */
  boardSessionIds?: ReadonlySet<string>
  /** Señal de atención por sesión del board (intervención › fallo › resultado sin leer). */
  boardSignalBySession?: Record<string, 'needs_you' | 'failed' | 'unread'>
  /** Añade la sesión al board (o la enfoca) y va a Boards. */
  onOpenInBoard?: (id: string) => void
  /** Abre Flujos con ese alcance (proyecto o conversación). */
  onViewFlow?: (scope: { kind: 'project' | 'session'; id: string }) => void
  onSelectSession: (id: string) => void
  /** Ir al home del proyecto (vista workspace). */
  onOpenProject: (root: string) => void
  onCloseSession: (id: string) => void
  onRenameSession: (id: string, title: string) => void
  /** Fijar/desfijar; ausente si el Engine no anuncia `session_pins_v1`. */
  onPinSession?: (id: string, pinned: boolean) => void
  onArchiveSession: (id: string) => void
  onRestoreSession: (id: string) => void
  onForkSession: (id: string) => void
  onDeleteSession: (id: string, cascade: boolean) => void
  onUpdateProject: (id: string, changes: { pinned?: boolean; archived?: boolean }) => void
  onArchiveProject: (id: string) => void
  /** Borrado definitivo de un archivado; ausente si el Engine no anuncia `project_delete_v1`. */
  onDeleteProject?: (id: string) => void
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
  onSearch,
  onOpenEngine,
  onOpenSchedules,
  onOpenProjectHome,
  onNewChat,
  onNewProjectChat,
  onMoveSession,
  onMoveSessionProfile,
  onMoveProjectProfile,
  onOpenFolder,
  sessions,
  closedSessions,
  archivedSessions,
  projects,
  archivedProjects,
  activeId,
  busySessionIds,
  boardSessionIds,
  boardSignalBySession,
  onOpenInBoard,
  onViewFlow,
  onSelectSession,
  onOpenProject,
  onCloseSession,
  onRenameSession,
  onPinSession,
  onArchiveSession,
  onRestoreSession,
  onForkSession,
  onDeleteSession,
  onUpdateProject,
  onArchiveProject,
  onDeleteProject,
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
  const [showAllPinned, setShowAllPinned] = useState(false)
  const query = useProjectExpansionStore((state) => state.query)
  const setQuery = useProjectExpansionStore((state) => state.setQuery)
  const [sessionMenu, setSessionMenu] = useState<string | null>(null)
  const [projectMenu, setProjectMenu] = useState<string | null>(null)
  const projectChoices = useProjectExpansionStore((state) => state.choices)
  const toggle = useProjectExpansionStore((state) => state.toggle)
  const activeProjectId = sessions.find((session) => session.id === activeId)?.project_id ?? null
  const projectOpen = (id: string) => Boolean(query) || isProjectExpanded(projectChoices, id, activeProjectId)
  const toggleProject = (id: string) => toggle(id, activeProjectId)
  const [deleteTarget, setDeleteTarget] = useState<SessionSummary | null>(null)
  const [renameTarget, setRenameTarget] = useState<SessionSummary | null>(null)
  const [renameTitle, setRenameTitle] = useState('')
  const [cascade, setCascade] = useState(false)

  // Solo el trabajo del perfil activo; cambiar de perfil cambia la lista entera.
  const activeProfileId = useProfileStore((state) => state.activeId)
  const profileList = useProfileStore((state) => state.profiles)
  const activeProfile = profileList.find((profile) => profile.id === activeProfileId) ?? null
  const otherProfiles = profileList.filter((profile) => profile.id !== activeProfileId)
  const calm = useCalmMotion()
  const visibleSessions = useMemo(() => sessions.filter((session) => inProfile(session, activeProfileId)), [sessions, activeProfileId])
  const visibleProjects = useMemo(() => projects.filter((project) => inProfile(project, activeProfileId)), [projects, activeProfileId])
  const model = useMemo(() => buildWorkspaceModel(visibleSessions, visibleProjects, query), [visibleSessions, visibleProjects, query])
  const profileEmpty = Boolean(activeProfile) && !query && model.pinned.length === 0 && model.sections.length === 0 && model.chats.length === 0
  const profileLabel = (profile: { name: string; builtin?: boolean }) => (profile.builtin && profile.name === 'Default' ? t('profiles.defaultName') : profile.name)
  // Transición al cambiar de conversación activa: solo entre chats
  // sueltos dentro de la vista de chat. La barrita de la fila es un
  // elemento persistente que funde opacidad y escala; el resaltado ya
  // cruzaba por transition-colors. Cualquier cambio que toque proyecto
  // (sesión de proyecto o vista fuera del chat) corta las transiciones
  // con una clase, sin remontar nada.
  const view = useUIStore((s) => s.view)
  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p] as const)), [projects])
  const projectsByRoot = useMemo(() => new Map(projects.map((p) => [p.root, p] as const)), [projects])
  // Mismo criterio que el modelo del workspace: fuera de secciones de
  // proyecto solo quedan las sueltas.
  function resolveProjectId(session: SessionSummary): string | null {
    if (session.project_id && projectsById.has(session.project_id)) return session.project_id
    if (session.project_root && projectsByRoot.has(session.project_root)) {
      return projectsByRoot.get(session.project_root)!.id
    }
    return null
  }
  function isLooseChat(session: SessionSummary | null | undefined): session is SessionSummary {
    return session != null && !(session.kind === 'PROJECT' && resolveProjectId(session) !== null)
  }
  const prevActiveIdRef = useRef(activeId)
  const prevViewRef = useRef(view)
  const animatedSwitch =
    prevViewRef.current === 'chat' &&
    view === 'chat' &&
    isLooseChat(sessions.find((s) => s.id === prevActiveIdRef.current)) &&
    isLooseChat(sessions.find((s) => s.id === activeId))
  useEffect(() => {
    prevActiveIdRef.current = activeId
    prevViewRef.current = view
  })
  // Viajero vertical de la seccion de sueltas: una sola barrita que se
  // desliza entre filas como el pill de modo, con medidas reales y escritura
  // imperativa en layout effect (sin estado: asi transiciona desde lo ya
  // pintado). Solo viaja entre sueltas en vista chat; ante proyecto,
  // busqueda o grupos plegados se oculta y mandan los resaltados.
  const travelerRef = useRef<HTMLSpanElement>(null)
  const travelerRowRefs = useRef(new Map<string, HTMLLIElement>())
  const chatsSectionRef = useRef<HTMLElement>(null)
  const placeTraveler = useCallback(() => {
    const bar = travelerRef.current
    if (!bar) return
    const row = travelerRowRefs.current.get(activeId) ?? null
    if (!row || row.offsetParent === null || !animatedSwitch) {
      bar.style.opacity = '0'
      return
    }
    bar.style.transform = 'translateY(' + row.offsetTop + 'px)'
    bar.style.height = row.offsetHeight + 'px'
    bar.style.opacity = '1'
  }, [activeId, animatedSwitch])
  useLayoutEffect(() => {
    placeTraveler()
  })
  useEffect(() => {
    const section = chatsSectionRef.current
    if (!section || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => placeTraveler())
    observer.observe(section)
    return () => observer.disconnect()
  }, [placeTraveler])
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

  const row = (session: SessionSummary, opts?: { closed?: boolean; travel?: boolean; projectName?: string }) => {
    const active = session.id === activeId
    const working = busySessionIds?.has(session.id) === true
    const onBoard = boardSessionIds?.has(session.id) === true
    const signal = boardSignalBySession?.[session.id] ?? null
    const signalLabel = signal === 'needs_you' ? t('sidebar.sessionNeedsYou') : signal === 'failed' ? t('sidebar.sessionFailed') : signal === 'unread' ? t('sidebar.sessionUnread') : null
    return (
      <li key={session.id} ref={opts?.travel ? (element) => { if (element) travelerRowRefs.current.set(session.id, element); else travelerRowRefs.current.delete(session.id) } : undefined} className="group relative" onContextMenu={e => { e.preventDefault(); setSessionMenu(session.id) }}>
        <div
          className={cn('sidebar-row', active && 'is-active')}
        >
          <button
            type="button"
            onClick={() => onSelectSession(session.id)}
            aria-current={active ? 'page' : undefined}
            className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5 text-left"
          >
            {!opts?.travel && (
              <span
                aria-hidden="true"
                data-testid="session-rail"
                className={cn('sidebar-row-rail', active ? 'scale-y-100 opacity-100' : 'scale-y-0 opacity-0')}
              />
            )}
            {working ? <span role="status" aria-label={t('sidebar.sessionWorking')} title={t('sidebar.sessionWorking')}>
              <span aria-hidden="true" className="sidebar-spin" />
            </span> : <MessageSquare
              size={14}
              aria-hidden="true"
              className={cn('shrink-0 transition-colors', active ? 'text-[var(--accent)]' : 'text-[var(--text-subtle)]')}
            />}
            <TitleSwap
              sessionId={session.id}
              text={sessionLabel(session, t('sidebar.newChat'))}
              className={cn(
                'block min-w-0 flex-1 text-[13px]',
                active ? 'font-semibold text-[var(--text)]' : 'text-[var(--text-muted)]',
              )}
            />
            {opts?.projectName && (
              <span title={opts.projectName} className="max-w-[40%] shrink-0 truncate text-[11px] text-[var(--text-subtle)]">
                {opts.projectName}
              </span>
            )}
            {(session.state === 'interrupted' || session.state === 'stopped') && (
              <span
                role="img"
                aria-label={t('sidebar.sessionInterrupted')}
                title={t('sidebar.sessionInterrupted')}
                data-testid="session-interrupted-dot"
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--warning)]"
              />
            )}
            {signal && signalLabel && (
              <span role="status" aria-label={signalLabel} title={signalLabel} className="sidebar-signal" data-signal={signal} data-testid="sidebar-signal" />
            )}
            {onBoard && <span role="img" aria-label={t('sidebar.onBoard')} title={t('sidebar.onBoard')} className="shrink-0 text-[var(--text-subtle)]"><Columns3 size={12} aria-hidden="true" /></span>}
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
            <DropdownMenuContent align="end" className="w-max max-w-[calc(100vw-16px)]">
              <div title={session.id} className="truncate px-2.5 py-1.5 font-mono text-[10px] text-[var(--text-subtle)]">{session.id}</div>
              <DropdownMenuItem onSelect={() => {
                void copyText(session.id).then((ok) => toast[ok ? 'success' : 'error'](t(ok ? 'sidebar.sessionIdCopied' : 'sidebar.sessionIdCopyFailed')))
              }}><Copy size={13} /> {t('sidebar.copySessionId')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => {
                const reference = `${t('sidebar.refSession')}: ${session.id}\n${t('sidebar.refTitle')}: ${sessionLabel(session, t('sidebar.newChat'))}${session.project_id ? `\n${t('sidebar.refProject')}: ${session.project_id}` : ''}${session.project_root ? `\nWorkspace: ${session.project_root}` : ''}`
                void copyText(reference).then((ok) => toast[ok ? 'success' : 'error'](t(ok ? 'sidebar.sessionReferenceCopied' : 'sidebar.sessionReferenceCopyFailed')))
              }}><Copy size={13} /> {t('sidebar.copySessionReference')}</DropdownMenuItem>
              <DropdownMenuSeparator />
              {opts?.closed ? (
                <DropdownMenuItem onSelect={() => onRestoreSession(session.id)}>
                  <ArchiveRestore size={13} /> {t('sidebar.restore')}
                </DropdownMenuItem>
              ) : (
                <>
                  {onPinSession && <DropdownMenuItem onSelect={() => onPinSession(session.id, !session.pinned_at)}>
                    {session.pinned_at ? <PinOff size={13} /> : <Pin size={13} />} {t(session.pinned_at ? 'sidebar.unpin' : 'sidebar.pin')}
                  </DropdownMenuItem>}
                  <DropdownMenuItem onSelect={() => {
                    setRenameTitle(sessionLabel(session, t('sidebar.newChat')))
                    setRenameTarget(session)
                  }}>
                    <Pencil size={13} /> {t('sidebar.rename')}
                  </DropdownMenuItem>
                  {onMoveSession && <DropdownMenuSub><DropdownMenuSubTrigger><Folder size={13} /> {t('sidebar.moveToProject')}</DropdownMenuSubTrigger><DropdownMenuSubContent>
                    <DropdownMenuItem disabled={session.kind === 'CHAT'} onSelect={() => onMoveSession(session.id, null)}>{t('sidebar.generalSpace')}</DropdownMenuItem>
                    {visibleProjects.filter(project => !project.archived).map(project => <DropdownMenuItem key={project.id} disabled={project.id === session.project_id} onSelect={() => onMoveSession(session.id, project.id)}>{project.name || projectDisplayName(project.root)}</DropdownMenuItem>)}
                  </DropdownMenuSubContent></DropdownMenuSub>}
                  {onMoveSessionProfile && otherProfiles.length > 0 && <DropdownMenuSub><DropdownMenuSubTrigger><Layers size={13} /> {t('profiles.moveTo')}</DropdownMenuSubTrigger><DropdownMenuSubContent>
                    {otherProfiles.map(profile => <DropdownMenuItem key={profile.id} onSelect={() => onMoveSessionProfile(session, profile.id)}>{profileLabel(profile)}</DropdownMenuItem>)}
                  </DropdownMenuSubContent></DropdownMenuSub>}
                  {onOpenInBoard && <DropdownMenuItem onSelect={() => onOpenInBoard(session.id)}>
                    <Columns3 size={13} /> {t('sidebar.openInBoard')}
                  </DropdownMenuItem>}
                  {onViewFlow && <DropdownMenuItem onSelect={() => onViewFlow({ kind: 'session', id: session.id })}>
                    <Workflow size={13} /> {t('sidebar.viewFlow')}
                  </DropdownMenuItem>}
                  <DropdownMenuItem onSelect={() => onForkSession(session.id)}>
                    <GitFork size={13} /> {t('sidebar.fork')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => onArchiveSession(session.id)}>
                    <Archive size={13} /> {t('sidebar.archive')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onCloseSession(session.id)}>
                    <X size={13} /> {t('sidebar.close')}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  setCascade(false)
                  setDeleteTarget(session)
                }}
                className="menu-danger"
              >
                <Trash2 size={13} /> {t('sidebar.delete')}
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
        {onOpenSchedules && (
          <RailButton label={t('sidebar.schedules')} onClick={onOpenSchedules}>
            <CalendarClock size={17} />
          </RailButton>
        )}
        {onOpenProjectHome && (
          <RailButton label={t('sidebar.projects')} onClick={onOpenProjectHome}>
            <Folder size={17} />
          </RailButton>
        )}
        <RailButton label={t('nav.engine')} onClick={onOpenEngine}>
          <Cpu size={17} />
        </RailButton>
        <div className="flex-1" />
        <ApplicationMenu collapsed />
      </div>
    )
  }

  return (
    <div className="concept-sidebar flex h-full w-full min-w-0 flex-col gap-3 overflow-hidden px-3 pt-3 pb-0">
      <SidebarIdentity busy={busySessionIds?.size ?? 0} waiting={approvals.length} activeSessionId={activeId || null} />
      <div className="shrink-0 space-y-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onNewChat}
          className="sidebar-new"
        >
          <Plus size={15} aria-hidden="true" />
          <span className="truncate">{t('sidebar.newChat')}</span><kbd className="sidebar-kbd ml-auto">{newChatShortcut.replaceAll('+', ' ')}</kbd>
        </button>

      </div>
      {/* Destinos: páginas propias bajo «Nueva conversación». Cada una aparece
          cuando el Engine la ofrece. */}
      {onOpenSchedules && (
        <button
          type="button"
          onClick={onOpenSchedules}
          className="sidebar-link"
        >
          <CalendarClock size={15} aria-hidden="true" />
          <span className="truncate">{t('sidebar.schedules')}</span>
        </button>
      )}
      </div>

      <div className="sidebar-search">
        <Search size={13} aria-hidden="true" className="text-[var(--text-subtle)]" />
        <input
          aria-label={t('sidebar.searchWorkspace')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('sidebar.searchWorkspace')}
          className="min-w-0 flex-1 border-0 bg-transparent text-xs text-[var(--text)] outline-none"
        />
      </div>
      <div className={cn('sidebar-scroll min-h-0 min-w-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto pr-0.5', !animatedSwitch && 'sidebar-switch-instant')}>
        <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeProfileId ?? 'all'}
          data-profile={activeProfileId ?? undefined}
          className="space-y-4"
          initial={calm ? false : { opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0, transition: calm ? { duration: 0 } : { duration: 0.22, ease: ease.out } }}
          exit={calm ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, x: -14, transition: { duration: 0.12, ease: ease.inOut } }}
        >
        {profileEmpty && activeProfile && (
          <div className="profile-empty" data-testid="profile-empty">
            <img src={art.chibi('wave')} alt="" draggable={false} className="profile-empty-art" />
            <p className="profile-empty-title">{t('profiles.empty.title', { name: profileLabel(activeProfile) })}</p>
            <p className="profile-empty-body">{t('profiles.empty.body')}</p>
            <div className="profile-empty-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={onNewChat}><Plus size={13} aria-hidden="true" /> {t('sidebar.newChat')}</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenFolder}><FolderOpen size={13} aria-hidden="true" /> {t('profiles.empty.project')}</button>
            </div>
          </div>
        )}

        {model.pinned.length > 0 && (
          <section aria-label={t('sidebar.pinned')}>
            <p className="sidebar-heading mb-1 pl-2">
              {t('sidebar.pinned')}
            </p>
            <ul className="space-y-0.5">
              {(showAllPinned || query ? model.pinned : model.pinned.slice(0, PINNED_VISIBLE_LIMIT)).map(({ session, project }) =>
                row(session, { projectName: project ? project.name || projectDisplayName(project.root) : undefined }))}
            </ul>
            {!query && model.pinned.length > PINNED_VISIBLE_LIMIT && (
              <button
                type="button"
                onClick={() => setShowAllPinned((value) => !value)}
                aria-expanded={showAllPinned}
                className="mt-0.5 px-2 text-[11px] text-[var(--text-subtle)] transition-colors hover:text-[var(--text-muted)]"
              >
                {showAllPinned ? t('sidebar.showLess') : t('sidebar.showMore', { n: model.pinned.length - PINNED_VISIBLE_LIMIT })}
              </button>
            )}
          </section>
        )}

        <section aria-label={t('sidebar.projects')}>
          <div className="mb-1 flex items-center justify-between pl-2">
            <p className="sidebar-heading">
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
          {model.sections.length === 0 && !profileEmpty && (
            <p className="px-2 text-xs text-[var(--text-subtle)]">{t('sidebar.noProjects')}</p>
          )}
          <ul className="space-y-1.5">
            {model.sections.map(({ project, sessions: items }) => (
              <li key={project.id} className="group/project" onContextMenu={e => { if (!e.defaultPrevented) { e.preventDefault(); setProjectMenu(project.id) } }}>
                <div className="flex items-center">
                <button
                  type="button"
                  aria-expanded={projectOpen(project.id)}
                  onClick={() => toggleProject(project.id)}
                  title={project.root}
                  className="sidebar-project"
                >
                  <Folder size={14} aria-hidden="true" className="shrink-0 text-[var(--accent-2)]" />
                  <span className="sidebar-project-label">
                    <span className="sidebar-project-name">{project.name || projectDisplayName(project.root)}</span>
                    <ProjectBranch head={project.git_head} />
                  </span>
                  {project.pinned && <Pin size={11} className="text-[var(--text-subtle)]" />}
                  {items.length > 0 && (
                    <span className="shrink-0 rounded-md border border-[var(--border)] px-1 font-mono text-[10px] text-[var(--text-subtle)]">
                      {items.length}
                    </span>
                  )}
                  {items.some(item => busySessionIds?.has(item.id)) && (
                    <span role="status" aria-label={t('sidebar.projectWorking')} title={t('sidebar.projectWorking')}>
                      <span aria-hidden="true" className="sidebar-spin" />
                    </span>
                  )}
                </button>
                {onNewProjectChat && <button type="button" aria-label={t('sidebar.newSessionIn', { name: project.name || projectDisplayName(project.root) })} title={t('sidebar.newSessionInProject')} onClick={() => {
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
                    {onMoveProjectProfile && otherProfiles.length > 0 && <DropdownMenuSub><DropdownMenuSubTrigger><Layers size={13} /> {t('profiles.moveTo')}</DropdownMenuSubTrigger><DropdownMenuSubContent>
                      {otherProfiles.map(profile => <DropdownMenuItem key={profile.id} onSelect={() => onMoveProjectProfile(project, profile.id)}>{profileLabel(profile)}</DropdownMenuItem>)}
                    </DropdownMenuSubContent></DropdownMenuSub>}
                    <DropdownMenuItem onSelect={() => onArchiveProject(project.id)}>
                      <Archive size={13} /> {t('project.archive')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                </div>
                {items.length > 0 && projectOpen(project.id) && (
                  <ul className="sidebar-tree mt-0.5 ml-3.5 space-y-0.5 pl-1">
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
                    <Folder size={13} className="text-[var(--text-subtle)]" />
                    <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-muted)]">{project.name}</span>
                    <button type="button" onClick={() => onUpdateProject(project.id, { archived: false })} className="rounded-md p-1 text-[var(--text-subtle)] hover:bg-[var(--bg-hover)]" aria-label={t('project.restore')} title={t('project.restore')}>
                      <ArchiveRestore size={13} />
                    </button>
                    {onDeleteProject && (
                      <button type="button" onClick={() => onDeleteProject(project.id)} className="rounded-md p-1 text-[var(--text-subtle)] hover:bg-[var(--bg-hover)] hover:text-[var(--danger)]" aria-label={t('project.deleteForever')} title={t('project.deleteForever')}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section aria-label={t('sidebar.chats')} ref={chatsSectionRef} className="relative">
          <div className="mb-1 flex items-center justify-between px-2">
            <p className="sidebar-heading">
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
              <ul className="space-y-0.5">{group.sessions.map(session => row(session, { travel: true }))}</ul></details>
            </li>)}
            {model.chats.length === 0 && !profileEmpty && (
              <li className="px-2 text-xs text-[var(--text-subtle)]">{t('sidebar.emptyChats')}</li>
            )}
            </ul>
            <span
              aria-hidden="true"
              data-testid="sessions-traveler"
              ref={travelerRef}
              className="sidebar-traveler absolute top-0 left-0 w-[3px] rounded-full opacity-0"
              style={{ transition: 'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), height 0.22s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.18s ease' }}
            />
        </section>
        </motion.div>
        </AnimatePresence>

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
            <p className="sidebar-heading mb-1 px-2">
              {t('sidebar.approvals')} · {approvals.length}
            </p>
            <p className="px-2 text-[11px] leading-relaxed text-[var(--text-subtle)]">
              {t('sidebar.approvalsHint')}
            </p>
          </div>
        )}
      </div>

      <SidebarFooter />

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
              className="btn-danger"
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
            className="field-input"
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
