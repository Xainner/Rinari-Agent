import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { dispatchAction, resolveContextualAction, type DesktopAction } from './services/actions'
import { useDesktopShortcuts } from './hooks/useDesktopShortcuts'
import { platform } from './platform'
import { refreshNotificationSupport } from './services/notifications'
import { toast } from 'sonner'
import { I18nProvider, translate, type I18nKey } from './i18n'
import { engineApi } from './services/engine'
import { applyUpdate, checkForUpdates, downloadUpdate, onUpdateState, reportsUpdateError } from './services/updates'
import { useUIStore } from './stores/ui'
import { useBoardStore } from './stores/board'
import { useEngineSession } from './features/engine/useEngineSession'
import { EngineProvider } from './features/engine/EngineContext'
import { useSessionHasContent } from './features/engine/sessionSelectors'
import SingleSessionView from './features/engine/SingleSessionView'
import BoardActivityController from './features/board/BoardActivityController'
import SkillLearnedNotifier from './features/skills/SkillLearnedNotifier'
import ScheduleForm from './features/schedules/ScheduleForm'
import ScheduleNotifier from './features/schedules/ScheduleNotifier'
import NotificationCenter from './features/notifications/NotificationCenter'
import { selectAttentionCounts, useBoardStatusStore } from './stores/boardStatus'
import { projectDisplayName } from './features/projects/workspaceModel'
import {
  collapseAllPanes,
  collapseFinishedPanes,
  collapseFocusedPane,
  expandAllPanes,
  expandPaneShortcut,
  markAllBoardResultsRead,
  toggleFocusMode,
} from './features/board/boardCommands'
import AppShell from './components/app-shell/AppShell'
import AppStatusBar from './components/app-shell/AppStatusBar'
import { requestDockToggle } from './features/session/SessionWorkspace'
import { dockNamespaceKey, nextDockIntent, useSessionDockStore, type DockSurface, type SessionDockState } from './stores/sessionDock'
import { ProcessRuntimeProvider } from './features/processes/ProcessRuntimeProvider'
import { desktopApi } from './services/desktop'
import AppSidebar from './components/app-shell/AppSidebar'
import ChatHeader from './components/app-shell/ChatHeader'
import CommandPalette from './components/CommandPalette'
import EngineConsole from './features/engine/EngineConsole'
import SettingsView from './features/settings/SettingsView'
import WorkspaceView from './features/workspace/WorkspaceView'
import ProjectHome from './features/projects/ProjectHome'
import ProviderWizard from './features/providers/ProviderWizard'
import StartupSplash from './components/StartupSplash'
import DesktopContextMenu from './components/app-shell/DesktopContextMenu'

const BoardView = lazy(() => import('./features/board/BoardView'))
const FlowView = lazy(() => import('./features/flow/FlowView'))
const SchedulesView = lazy(() => import('./features/schedules/SchedulesView'))

const APP_VERSION = '0.2.0'

function App() {
  const view = useUIStore((s) => s.view)
  const lang = useUIStore((s) => s.lang)
  const setLang = useUIStore((s) => s.setLang)
  const theme = useUIStore((s) => s.theme)
  const setTheme = useUIStore((s) => s.setTheme)
  const paletteOpen = useUIStore((s) => s.paletteOpen)
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen)
  const togglePalette = useUIStore((s) => s.togglePalette)
  const goChat = useUIStore((s) => s.goChat)
  const goNormal = useUIStore((s) => s.goNormal)
  const goBoard = useUIStore((s) => s.goBoard)
  const goFlows = useUIStore((s) => s.goFlows)
  const toggleBoards = useUIStore((s) => s.toggleBoards)
  const goEngine = useUIStore((s) => s.goEngine)
  const goSchedules = useUIStore((s) => s.goSchedules)
  const goWorkspace = useUIStore((s) => s.goWorkspace)
  const goProject = useUIStore((s) => s.goProject)
  const projectRoot = useUIStore((s) => s.projectRoot)
  const goSettings = useUIStore((s) => s.goSettings)
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggleSidebarCollapsed = useUIStore((s) => s.toggleSidebarCollapsed)
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen)
  const shortcutBindings = useUIStore((s) => s.shortcutBindings)

  const session = useEngineSession()
  const activeRecord = session.sessionsById[session.activeSession] ?? null
  // Booleano estable: decide si hay header sin suscribirse a cada token.
  const activeHasContent = useSessionHasContent(session.runtime, session.activeSession)
  // Sesiones distintas con aprobaciones pendientes (una sesión cuenta una vez).
  const attentionSessionCount = useMemo(
    () => new Set(session.approvals.map((item) => item.session_id).filter(Boolean)).size,
    [session.approvals],
  )
  const activeTitle = activeRecord?.title ?? null
  const activeProject = activeRecord?.project_id
    ? session.projects.find((project) => project.id === activeRecord.project_id) ?? null
    : session.projects.find((project) => project.root === activeRecord?.project_root) ?? null

  // Handoff `rinari code [path] [--session]`: misma sesión/proyecto.
  // Con path: project.open registra/deduplica y devuelve la sesión
  // recomendada del engine (nunca se inventa una paralela en Code).
  async function handleOpenProjectPath(path: string): Promise<boolean> {
    const opened = await session.openProject(path)
    if (!opened) return false
    await session.refreshSessions()
    await session.refreshProjects()
    await session.selectSession(opened.session.id)
    return true
  }

  async function handleDeleteSession(id: string, cascade: boolean): Promise<void> {
    const result = await session.deleteSession(id, cascade)
    if (!result) return
    const c = result.cascade
    if (cascade && c.queue_dropped + c.checkpoints_removed + c.artifacts_removed > 0) {
      toast.success(
        translate(lang, 'sidebar.deletedCascade', {
          queue: c.queue_dropped,
          checkpoints: c.checkpoints_removed,
          artifacts: c.artifacts_removed,
        }),
      )
    } else {
      toast.success(translate(lang, 'sidebar.deleted'))
    }
    void session.refreshProjects()
  }

  // Lo que el host puede notificar de verdad se pregunta una vez al arrancar;
  // hasta entonces el ajuste lo muestra como no disponible.
  useEffect(() => {
    void refreshNotificationSupport()
  }, [])

  useEffect(() => {
    async function handleOpen(request: { project: string | null; session: string | null }) {
      try {
        if (request.session) {
          await session.selectSession(request.session)
          goChat()
          return
        }
        if (request.project) {
          if (await handleOpenProjectPath(request.project)) goChat()
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      }
    }
    let unlisten: (() => void) | undefined
    void engineApi
      .initialOpenRequest()
      .then((request) => {
        if (request.project || request.session) void handleOpen(request)
      })
      .catch(() => {})
    void platform()
      .events.onOpenRequest((request) => void handleOpen(request))
      .then((stop) => {
        unlisten = stop
      })
    return () => unlisten?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // El motor arranca solo al abrir la app: Rinari nunca parece "apagado".
  // El footer + EngineConsole conservan el estado real y el reintento.
  const autoStarted = useRef(false)
  useEffect(() => {
    const tr = (key: I18nKey, vars?: Record<string, string | number>) => translate(lang, key, vars)
    let stop: (() => void) | undefined
    let active = true
    let previous: Parameters<typeof reportsUpdateError>[0] = null
    void onUpdateState((state) => {
      const before = previous
      previous = state.phase
      if (state.phase === 'downloading') {
        const percent = Math.max(0, Math.min(100, Math.round(state.progress?.percent ?? 0)))
        toast.loading(tr('update.downloading', { percent }), { id: 'rinari-update' })
      } else if (state.phase === 'downloaded') {
        toast(tr('update.ready', { v: state.available_version ?? '' }), {
          id: 'rinari-update',
          description: state.unsigned ? tr('update.unsigned') : undefined,
          action: { label: tr('update.install'), onClick: () => void applyUpdate().catch((error) => toast.error(String(error))) },
        })
      } else if (state.phase === 'error' && reportsUpdateError(before)) {
        toast.error(tr('update.failed', { detail: state.message ?? 'unknown error' }), { id: 'rinari-update' })
      }
    }).then((unsubscribe) => {
      if (active) stop = unsubscribe
      else unsubscribe()
    })
    return () => {
      active = false
      stop?.()
    }
  }, [lang])

  useEffect(() => {
    if (!autoStarted.current) {
      autoStarted.current = true
      void session.startEngine()
      // Auto-update silencioso estilo Hermes: solo avisa si hay versión.
      // App vive fuera del I18nProvider: se usa translate() con el idioma actual.
      const tr = (key: I18nKey, vars?: Record<string, string | number>) =>
        translate(lang, key, vars)
      void checkForUpdates()
        .then((found) => {
          if (!found) return
          toast(tr('update.available', { v: found.version }), {
            description: found.unsigned ? tr('update.unsigned') : undefined,
            action: {
              label: tr('update.download'),
              onClick: () => {
                void downloadUpdate().catch((err: unknown) =>
                  toast.error(
                    tr('update.failed', {
                      detail: err instanceof Error ? err.message : String(err),
                    }),
                  ),
                )
              },
            },
          })
        })
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Alta guiada: motor listo, catálogo sano y sin proveedores → wizard una vez.
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardSnoozed, setWizardSnoozed] = useState(false)
  // Solicitud explícita de abrir el inspector de procesos de la sesión activa.
  const [processesSignal, setProcessesSignal] = useState(0)
  useEffect(() => {
    if (
      session.ready &&
      session.catalogLoaded &&
      !session.catalogError &&
      session.providers.length === 0 &&
      !wizardSnoozed
    ) {
      setWizardOpen(true)
    }
  }, [session.ready, session.catalogLoaded, session.catalogError, session.providers.length, wizardSnoozed])

  useDesktopShortcuts(shortcutBindings, (action) => {
    if (action === 'palette') togglePalette()
    if (action === 'settings') goSettings()
    if (action === 'sidebar') toggleSidebarCollapsed()
    if (action === 'boards') toggleBoards()
    if (action === 'flows') goFlows()
    if (action === 'newChat') dispatchAction('new-chat')
    // Colapso/expansión solo actúan en Boards; en otras vistas no hacen nada.
    if (action === 'collapsePane') dispatchAction('collapse-pane')
    if (action === 'expandPane') dispatchAction('expand-pane')
  })

  const desktopActionRef = useRef<(action: DesktopAction) => void>(() => {})
  /** Acciones del board (alta/baja de paneles); las registra BoardView cuando existe. */
  const boardActionsRef = useRef<{ addPane: () => void; removePane: () => void }>({ addPane: () => {}, removePane: () => {} })
  const boardPanes = useBoardStore((s) => s.panes)
  const boardFocusedPaneId = useBoardStore((s) => s.focusedPaneId)
  const boardAddPane = useBoardStore((s) => s.addPane)
  const boardFocusPane = useBoardStore((s) => s.focusPane)
  const boardSessionIds = useMemo(() => new Set(boardPanes.map((pane) => pane.sessionId)), [boardPanes])
  const boardCounts = useBoardStatusStore(selectAttentionCounts)
  const boardStatusByPane = useBoardStatusStore((s) => s.byPane)
  /** Señal por sesión para el sidebar: categorías distinguibles, no un punto genérico. */
  const boardSignalBySession = useMemo(() => {
    const out: Record<string, 'needs_you' | 'failed' | 'unread'> = {}
    for (const status of Object.values(boardStatusByPane)) {
      const current = out[status.sessionId]
      if (status.kind === 'needs_you') out[status.sessionId] = 'needs_you'
      else if (status.kind === 'failed' && current !== 'needs_you') out[status.sessionId] = 'failed'
      else if (status.unreadResultCount > 0 && !current) out[status.sessionId] = 'unread'
    }
    return out
  }, [boardStatusByPane])
  const boardLabelFor = (id: string) => {
    const record = session.sessionsById[id]
    return record?.title || (record?.project_root ? projectDisplayName(record.project_root) : null) || translate(lang, 'sidebar.newChat')
  }
  const focusedBoardPane = boardPanes.find((pane) => pane.paneId === boardFocusedPaneId) ?? null

  // Destino del dock: una sola regla para barra superior, acciones, menú y
  // paleta. En Boards es el panel enfocado y **nunca** todos los docks
  // montados; en Normal, la sesión activa.
  const dockTargetSessionId = (view === 'board' ? focusedBoardPane?.sessionId : session.activeSession) || null
  // Se selecciona la superficie, no el layout. `layoutFor` devuelve un objeto
  // **nuevo** cuando la sesión todavía no tiene layout guardado, y un selector
  // que devuelve una referencia nueva en cada llamada hace que el store
  // entregue un snapshot distinto cada render: la aplicación entra en un bucle
  // y la ventana se queda en blanco. Una cadena o `null` no tiene ese problema.
  const dockSurface = useSessionDockStore(
    useCallback(
      (state: SessionDockState) => {
        if (!dockTargetSessionId) return null
        const layout = state.layouts[dockNamespaceKey(state.homeId, dockTargetSessionId)]
        return layout?.visible ? layout.activeSurface : null
      },
      [dockTargetSessionId],
    ),
  )

  /**
   * Abre, cambia o cierra el dock de la sesión destino.
   *
   * Una sola semántica para los cuatro caminos que llegan aquí: cerrado abre
   * en esa superficie, abierto en otra cambia de pestaña sin cerrar, y abierto
   * en la misma cierra. Se envía por la acción tipada existente —que nombra su
   * destinatario— en vez de tocar el store de cada sesión montada.
   */
  const toggleDockSurface = useCallback(
    (surface: DockSurface) => {
      if (!dockTargetSessionId) return
      const layout = useSessionDockStore.getState().layoutFor(dockTargetSessionId)
      if (nextDockIntent(layout, surface) === 'close') {
        // Sin superficie, la acción alterna la visibilidad: la cierra.
        requestDockToggle({ sessionId: dockTargetSessionId })
        return
      }
      requestDockToggle({ sessionId: dockTargetSessionId, surface })
    },
    [dockTargetSessionId],
  )
  /** El botón de la barra: abre el panel en su última pestaña, o lo cierra. */
  const toggleDock = useCallback(() => {
    if (dockTargetSessionId) requestDockToggle({ sessionId: dockTargetSessionId })
  }, [dockTargetSessionId])
  // El layout del dock se guarda por Engine home + sesión: la identidad estable
  // viene del hello (`home_id`), nunca del instance id que cambia al arrancar.
  const homeId = session.status?.home_id ?? null
  useEffect(() => {
    useSessionDockStore.getState().setHomeId(homeId)
    // El alcance de Flujos es un id del Engine (proyecto o sesión) y se guarda
    // por el mismo motivo: en otro home ese id no existe o es otra cosa.
    useUIStore.getState().setFlowHomeId(homeId)
  }, [homeId])
  /** Elegir una sesión desde sidebar/paleta: en Boards enfoca o añade su panel; en Normal la selecciona. */
  const schedulesEnabled = session.status?.capabilities.scheduled_tasks_v1 === true
  const chooseSession = (id: string) => {
    if (view === 'board') {
      const existing = useBoardStore.getState().paneForSession(id)
      if (existing) boardFocusPane(existing.paneId)
      else boardAddPane(id, { focus: true })
      return
    }
    void session.selectSession(id)
    goChat()
  }
  const openInBoard = (id: string) => {
    const existing = useBoardStore.getState().paneForSession(id)
    if (existing) boardFocusPane(existing.paneId)
    else boardAddPane(id, { focus: true })
    goBoard()
  }

  useEffect(() => {
    const handle = (action: DesktopAction) => {
      switch (action) {
        case 'new-chat': {
          // Contextual: en Boards abre "Añadir panel" (lo cablea el store del board).
          if (resolveContextualAction('new', { view }) === 'add-pane') { boardActionsRef.current.addPane(); break }
          void session.createSession().then(id => id && goChat()); break
        }
        case 'view-normal': goNormal(); break
        case 'view-boards': goBoard(); break
        case 'view-flows': goFlows(); break
        case 'toggle-boards': toggleBoards(); break
        case 'collapse-pane': if (view === 'board') collapseFocusedPane(); break
        case 'expand-pane': if (view === 'board') expandPaneShortcut(); break
        case 'collapse-all-panes': collapseAllPanes(); break
        case 'expand-all-panes': expandAllPanes(); break
        case 'collapse-finished-panes': {
          const result = collapseFinishedPanes()
          if (result.outcome === 'focus-mode') toast.info(translate(lang, 'board.toolbar.collapseFinishedFocusMode'))
          else if (result.outcome === 'nothing') toast.info(translate(lang, 'board.toolbar.nothingToCollapse'))
          else toast.success(translate(lang, 'board.toolbar.collapsedFinished', { n: result.count }))
          break
        }
        case 'toggle-focus-mode': goBoard(); toggleFocusMode(); break
        case 'mark-all-board-results-read': markAllBoardResultsRead(); break
        case 'open-folder': void platform().dialog.openFiles({ directory: true }).then(picked => { const path = picked?.[0]; if (path) void handleOpenProjectPath(path).then(ok => ok && goChat()) }); break
        case 'close-session': {
          // Contextual: en Boards quita el panel enfocado sin cerrar su sesión.
          if (resolveContextualAction('close', { view }) === 'remove-pane') { boardActionsRef.current.removePane(); break }
          if (session.activeSession) void session.closeSession(session.activeSession); break
        }
        case 'settings': goSettings(); break
        case 'appearance': goSettings('appearance'); break
        case 'about': goSettings('about'); break
        case 'engine': goEngine(); break
        case 'schedules': if (schedulesEnabled) goSchedules(); break
        case 'sidebar': toggleSidebarCollapsed(); break
        // Las tres superficies del dock comparten destino y semántica: abrir,
        // cambiar de pestaña o cerrar según lo que ya esté visible. El
        // navegador es otra superficie del panel de la sesión, no una ventana
        // aparte (documento 03 §1), y «Panel de Workspace» es la pestaña del
        // dock, no la vista global.
        case 'files': toggleDockSurface('files'); break
        case 'browser': toggleDockSurface('browser'); break
        case 'workspace-panel': toggleDockSurface('workspace'); break
        case 'terminal': toggleDockSurface('terminal'); break
        case 'commands': setPaletteOpen(true); break
        case 'processes':
          if (session.activeSession) {
            goChat()
            setProcessesSignal((value) => value + 1)
          }
          break
        case 'undo': case 'redo': document.execCommand(action); break
        case 'updates': void checkForUpdates().then(found => {
          if (!found) { toast.success('Rinari Agent está actualizado.'); return }
          toast(`Nueva versión: ${found.version}`, {
            description: found.unsigned ? 'Canal sin firma Authenticode; el SHA-512 se verificará antes de aplicar.' : undefined,
            action: { label: 'Descargar', onClick: () => void downloadUpdate().catch(error => toast.error(String(error))) },
          })
        }).catch(error => toast.error(String(error))); break
      }
    }
    desktopActionRef.current = handle
  })

  useEffect(() => {
    const local = (event: Event) => desktopActionRef.current((event as CustomEvent<DesktopAction>).detail)
    window.addEventListener('rinari-action', local)
    const native = platform().events.onMenuAction((action) => desktopActionRef.current(action as DesktopAction))
    return () => { window.removeEventListener('rinari-action', local); void native.then(stop => stop()) }
  }, [])

  // El shell abre cuando el engine está usable. Sesiones y catálogo son
  // subsistemas independientes: si fallan, se degradan con retry local.
  const startupReady = session.ready
  if (!startupReady) {
    return (
      <I18nProvider lang={lang}>
        <StartupSplash
          failed={session.status?.state === 'failed' || session.status?.state === 'degraded'}
          detail={session.status?.detail}
          state={session.status?.state ?? null}
          onRetry={() => void session.restartEngine()}
        />
      </I18nProvider>
    )
  }

  const degradedDetail = session.sessionsError ?? session.catalogError
  const degradedKey =
    session.sessionsError !== null ? 'startup.sessionsDegraded' : 'startup.catalogDegraded'

  return (
    <I18nProvider lang={lang}>
      <EngineProvider session={session}>
      <BoardActivityController />
      <SkillLearnedNotifier />
      {schedulesEnabled && <ScheduleNotifier onOpenSession={chooseSession} />}
      <ScheduleForm />
      <DesktopContextMenu />
      <ProcessRuntimeProvider
        epoch={session.connectionEpoch ?? 0}
        engineReady={session.ready}
        hasCapability={session.processesCapability === true}
        hasIdentity={session.processesIdentityCapability === true}
      >
      <AppShell
        banner={degradedDetail !== null && (
          <div
            role="alert"
            className="flex items-center gap-3 border-b border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-xs text-[var(--text)]"
          >
            <span className="min-w-0 flex-1 truncate">
              {translate(lang, degradedKey, { detail: degradedDetail ?? '' })}
            </span>
            <button
              type="button"
              onClick={() => {
                void session.refreshSessions()
                void session.refreshCatalog()
              }}
              className="shrink-0 rounded-full border border-[var(--border)] px-3 py-0.5 transition-colors hover:border-[var(--accent)]/50"
            >
              {translate(lang, 'startup.retry')}
            </button>
          </div>
        )}
        sidebar={
          <AppSidebar
            collapsed={sidebarCollapsed}
            onSearch={() => setPaletteOpen(true)}
            onOpenSettings={() => goSettings()}
            onOpenEngine={goEngine}
            onOpenSchedules={schedulesEnabled ? goSchedules : undefined}
            onOpenProjectHome={
              session.activeProjectRoot ? () => goProject(session.activeProjectRoot as string) : null
            }
            onNewProjectChat={(id) => void session.createSession(id).then(created => created && goChat())}
            onMoveSession={(id, projectId) => void desktopApi.moveSession(id, projectId).then(() => session.refreshSessions()).catch(error => toast.error(String(error)))}
            onNewChat={() => dispatchAction('new-chat')}
            onOpenFolder={() =>
              void platform().dialog.openFiles({ directory: true }).then((selection) => {
                const picked = selection?.[0] ?? null
                if (typeof picked === 'string') void handleOpenProjectPath(picked).then((ok) => ok && goChat())
              })
            }
            sessions={session.sessions}
            closedSessions={session.closedSessions}
            archivedSessions={session.archivedSessions}
            projects={session.projects}
            archivedProjects={session.archivedProjects}
            activeId={view === 'board' ? (focusedBoardPane?.sessionId ?? '') : session.activeSession}
            busySessionIds={session.busySessionIds}
            boardSessionIds={boardSessionIds}
            boardSignalBySession={boardSignalBySession}
            onOpenInBoard={openInBoard}
            onViewFlow={(scope) => goFlows(scope)}
            onSelectSession={chooseSession}
            onOpenProject={(root) => goProject(root)}
            onCloseSession={(id) => void session.closeSession(id)}
            onRenameSession={(id, title) => void session.renameSession(id, title)}
            onPinSession={session.status?.capabilities.session_pins_v1 === true
              ? (id, pinned) => void session.pinSession(id, pinned)
              : undefined}
            onArchiveSession={(id) => void session.archiveSession(id)}
            onRestoreSession={(id) => void session.restoreSession(id).then(() => goChat())}
            onForkSession={(id) => void session.forkSession(id).then((created) => created && goChat())}
            onDeleteSession={(id, cascade) => void handleDeleteSession(id, cascade)}
            onUpdateProject={(id, changes) => void session.updateProject(id, changes)}
            onArchiveProject={(id) => {
              if (window.confirm(translate(lang, 'project.archiveConfirm'))) {
                void session.removeProject(id, 'archive')
              }
            }}
            approvals={session.approvals}
          />
        }
        topbar={
          <AppStatusBar
            context={
              view === 'chat' && activeHasContent ? (
                <ChatHeader
                  title={activeTitle}
                  kind={activeRecord?.kind ?? null}
                  mode={activeRecord?.mode ?? null}
                  projectRoot={session.activeProjectRoot}
                  projectName={activeProject?.name ?? session.activeProjectRoot}
                  git={
                    session.activeGitStatus?.status.available
                      ? {
                          branch: session.activeGitStatus.status.branch,
                          dirty: session.activeGitStatus.status.dirty,
                          changed: session.activeGitStatus.status.files.length,
                        }
                      : null
                  }
                  gitMissing={session.activeGitError !== null}
                  onOpenProject={
                    session.activeProjectRoot
                      ? () => goProject(session.activeProjectRoot as string)
                      : null
                  }
                />
              ) : view !== 'chat' && view !== 'board' && view !== 'flows' ? (
                <span className="truncate text-sm font-semibold text-[var(--text)]">{translate(lang, `topbar.view.${view}` as I18nKey)}</span>
              ) : null
            }
            selectedView={view === 'chat' || view === 'board' || view === 'flows' ? view : null}
            onSelectView={(next) => (next === 'board' ? goBoard() : next === 'flows' ? goFlows() : goNormal())}
            toggleShortcut={shortcutBindings.boards}
            workingCount={session.busySessionIds.size}
            attentionCount={attentionSessionCount}
            boardAttentionCount={boardCounts.attentionPaneCount}
            attentionMenu={
              <NotificationCenter
                labelFor={boardLabelFor}
                goBoard={goBoard}
                disabled={!session.ready}
                onOpenTarget={(target) => {
                  if (target.kind === 'session') chooseSession(target.sessionId)
                  else if (target.kind === 'schedules') goSchedules()
                  else goSettings('skills')
                }}
              />
            }
            onOpenMobileSidebar={() => setSidebarOpen(true)}
            onToggleSidebar={toggleSidebarCollapsed}
            sidebarCollapsed={sidebarCollapsed}
            dockOpen={dockSurface !== null}
            dockTargetAvailable={Boolean(dockTargetSessionId)}
            onToggleDock={toggleDock}
          />
        }
      >
        {view === 'chat' && <SingleSessionView onOpenProviders={() => goSettings('providers')} processesOpenSignal={processesSignal} />}
        {view === 'board' && (
          <Suspense fallback={<div className="board-canvas" aria-busy="true" />}>
            <BoardView actionsRef={boardActionsRef} />
          </Suspense>
        )}
        {view === 'flows' && (
          <Suspense fallback={<div className="flow-view" aria-busy="true" />}>
            <FlowView />
          </Suspense>
        )}
        {view === 'engine' && <EngineConsole session={session} />}
        {view === 'schedules' && (
          <Suspense fallback={null}>
            <SchedulesView onOpenSession={chooseSession} />
          </Suspense>
        )}
        {view === 'workspace' && (
          <WorkspaceView session={activeRecord} onBack={goChat} />
        )}
        {view === 'project' && projectRoot !== null && (
          <ProjectHome
            root={projectRoot}
            project={session.projects.find((p) => p.root === projectRoot) ?? null}
            sessions={session.sessions.filter((s) => {
              const projectId = session.projects.find((p) => p.root === projectRoot)?.id ?? null
              return (projectId !== null && s.project_id === projectId) || s.project_root === projectRoot
            })}
            activeId={session.activeSession}
            status={session.projectStatusByRoot[projectRoot] ?? null}
            statusError={session.projectStatusErrorByRoot[projectRoot] ?? null}
            intel={session.projectIntelByRoot[projectRoot] ?? null}
            onBack={goChat}
            onSelectSession={(id) => {
              void session.selectSession(id)
              goChat()
            }}
            onNewSession={() =>
              void engineApi
                .createSession({
                  project_id: session.projects.find((p) => p.root === projectRoot)?.id,
                  cwd: projectRoot,
                  mode: 'build',
                  permission_profile: 'workspace',
                })
                .then(async (created) => {
                  await session.refreshSessions()
                  await session.selectSession(created.session.id)
                  goChat()
                })
                .catch((err: unknown) =>
                  toast.error(err instanceof Error ? err.message : String(err)),
                )
            }
            onEnsure={() => {
              void session.loadProjectStatus(projectRoot)
              if (!session.projectIntelByRoot[projectRoot]) {
                void session.loadProjectIntelligence(projectRoot)
              }
            }}
            onTrust={() => {
              if (window.confirm(translate(lang, 'project.trustConfirm'))) {
                void session.trustProject(projectRoot)
              }
            }}
            onUpdate={(changes) => {
              const project = session.projects.find((item) => item.root === projectRoot)
              return project ? session.updateProject(project.id, changes) : Promise.resolve(false)
            }}
            onArchive={() => {
              const project = session.projects.find((item) => item.root === projectRoot)
              if (project && window.confirm(translate(lang, 'project.archiveConfirm'))) {
                void session.removeProject(project.id, 'archive').then((ok) => ok && goChat())
              }
            }}
          />
        )}
        {view === 'settings' && (
          <SettingsView
            appVersion={APP_VERSION}
            providers={session.providers}
            models={session.models}
            activeSessionId={session.activeSession || null}
            engineCapabilities={session.status?.capabilities}
            onCatalogChanged={() => void session.refreshCatalog()}
          />
        )}
      </AppShell>

      <ProviderWizard
        open={wizardOpen}
        onClose={(finished) => {
          setWizardOpen(false)
          if (finished) {
            void session.refreshCatalog().then(() => session.refreshSessions())
          } else {
            setWizardSnoozed(true)
          }
        }}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        sessions={session.sessions}
        activeId={(view === 'board' ? focusedBoardPane?.sessionId : session.activeSession) || null}
        onSelectSession={chooseSession}
        onNewSession={() => dispatchAction('new-chat')}
        onNewPane={() => { goBoard(); boardActionsRef.current.addPane() }}
        onOpenSettings={(section) => goSettings(section)}
        onOpenEngine={goEngine}
        onOpenWorkspace={goWorkspace}
        onOpenProcesses={() => dispatchAction('processes')}
        processesAvailable={session.activeSession !== ''}
        onEngineRestart={() => void session.restartEngine()}
        theme={theme}
        onThemeChange={setTheme}
        lang={lang}
        onLanguageChange={setLang}
      />
      </ProcessRuntimeProvider>
      </EngineProvider>
    </I18nProvider>
  )
}

export default App
