import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { dispatchAction, resolveContextualAction, type DesktopAction } from './services/actions'
import { bugReportUrl } from './services/support'
import { useDesktopShortcuts } from './hooks/useDesktopShortcuts'
import { platform } from './platform'
import { refreshNotificationSupport } from './services/notifications'
import { toast } from 'sonner'
import { warnUntrusted } from './features/projects/trustWarning'
import { X } from 'lucide-react'
import { useNotificationCenter } from './stores/notificationCenter'
import { I18nProvider, translate, type I18nKey } from './i18n'
import { commandMessage, engineApi, type TrustState } from './services/engine'
import { useConfirm } from './components/ui/useConfirm'
import { applyUpdate, checkForUpdates, downloadUpdate, onUpdateState, reportsUpdateError } from './services/updates'
import { useUIStore } from './stores/ui'
import { version as appVersion } from '../package.json'
import { useBoardStore } from './stores/board'
import { useEngineSession } from './features/engine/useEngineSession'
import { EngineProvider } from './features/engine/EngineContext'
import { useSessionHasContent } from './features/engine/sessionSelectors'
import SingleSessionView from './features/engine/SingleSessionView'
import BoardActivityController from './features/board/BoardActivityController'
import SkillLearnedNotifier from './features/skills/SkillLearnedNotifier'
import ScheduleForm from './features/schedules/ScheduleForm'
import ScheduleNotifier from './features/schedules/ScheduleNotifier'
import SoundCoordinator from './features/sounds/SoundCoordinator'
import UpdateNotifier from './features/updates/UpdateNotifier'
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
  requestTurnReveal,
  toggleFocusMode,
} from './features/board/boardCommands'
import { markEverythingRead } from './features/notifications/attentionCommands'
import { signalOf, useSessionPendingStore, type SessionSignal } from './features/notifications/attentionIndicators'
import AppShell from './components/app-shell/AppShell'
import AppStatusBar from './components/app-shell/AppStatusBar'
import DockViewButtons from './components/app-shell/DockViewButtons'
import { requestDockToggle } from './features/session/SessionWorkspace'
import { useTerminalStore } from './features/terminal/terminalStore'
import { AGENT_TAB } from './features/terminal/agentTab'
import { useSessionDockStore, viewForSurface, type DockSurface } from './stores/sessionDock'
import { ProcessRuntimeProvider } from './features/processes/ProcessRuntimeProvider'
import { desktopApi } from './services/desktop'
import AppSidebar from './components/app-shell/AppSidebar'
import ChatHeader from './components/app-shell/ChatHeader'
import CommandPalette from './components/CommandPalette'
import EngineConsole from './features/engine/EngineConsole'
import WorkspaceView from './features/workspace/WorkspaceView'
import ProjectHome from './features/projects/ProjectHome'
import ProviderWizard from './features/providers/ProviderWizard'
import WelcomeDialog from './features/welcome/WelcomeDialog'
import ReviewExportDialog from './features/review/ReviewExportDialog'
import { welcomeSeen, markWelcomeSeen } from './features/welcome/welcomeState'
import StartupSplash from './components/StartupSplash'
import DesktopContextMenu from './components/app-shell/DesktopContextMenu'
import { switchToProfileOf, useProfileWorkspace } from './features/profiles/useProfileWorkspace'
import { useProfileMoves } from './features/profiles/useProfileMoves'
import { CreateProjectDialog } from './features/projects/CreateProjectDialog'
import { useCreateProjectStore } from './features/projects/createProjectStore'
import { PROJECT_PICKER_EVENT } from './components/composer/ProjectChip'

const BoardView = lazy(() => import('./features/board/BoardView'))
const SchedulesView = lazy(() => import('./features/schedules/SchedulesView'))
// Ajustes se carga al abrirlo (#91): el bloque principal pesaba 1,8 MB.
const SettingsView = lazy(() => import('./features/settings/SettingsView'))

// De package.json al compilar: fija en el código se quedó en 0.2.0 tras publicar
// la 0.2.1. `npm run release:bump` solo toca package.json y sus copias.
const APP_VERSION = appVersion

function App() {
  const view = useUIStore((s) => s.view)
  const lang = useUIStore((s) => s.lang)
  const setLang = useUIStore((s) => s.setLang)
  const { ask: confirm, dialog: confirmDialog } = useConfirm()
  const theme = useUIStore((s) => s.theme)
  const setTheme = useUIStore((s) => s.setTheme)
  const paletteOpen = useUIStore((s) => s.paletteOpen)
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen)
  const togglePalette = useUIStore((s) => s.togglePalette)
  const goChat = useUIStore((s) => s.goChat)
  const goNormal = useUIStore((s) => s.goNormal)
  const goBoard = useUIStore((s) => s.goBoard)
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
  // Perfil activo: listas, cambio de perfil y movimientos entre perfiles.
  useProfileWorkspace({
    ready: session.ready,
    activeRecord,
    refreshSessions: session.refreshSessions,
    refreshProjects: session.refreshProjects,
    openDraft: () => { session.openDraft(); goChat() },
  })
  const profileMoves = useProfileMoves(session.projects)
  // Booleano estable: decide si hay header sin suscribirse a cada token.
  const activeHasContent = useSessionHasContent(session.runtime, session.activeSession)
  // Sesiones distintas con aprobaciones pendientes (una sesión cuenta una vez).
  const attentionSessionCount = useMemo(
    () => new Set(session.approvals.map((item) => item.session_id).filter(Boolean)).size,
    [session.approvals],
  )
  const activeTitle = activeRecord?.title ?? null
  // La madre de una conversación hija (#40), para la miga de la cabecera.
  const motherRecord = activeRecord?.parent_session_id ? session.sessionsById[activeRecord.parent_session_id] ?? null : null
  const activeMother = motherRecord
    ? {
        id: motherRecord.id,
        title: motherRecord.title || translate(lang, 'sidebar.newChat'),
        brief: typeof activeRecord?.brief?.title === 'string' && activeRecord.brief.title !== activeTitle ? activeRecord.brief.title : null,
        onOpen: (id: string) => { void session.selectSession(id) },
      }
    : null

  // Handoff `rinari code [path] [--session]`: misma sesión/proyecto.
  // Con path: project.open registra/deduplica y devuelve la sesión
  // recomendada del engine (nunca se inventa una paralela en Code).
  async function handleOpenProjectPath(path: string): Promise<boolean> {
    const opened = await session.openProject(path)
    if (!opened) return false
    // Una carpeta nueva sin confianza se pregunta ya, no después en su página;
    // mientras se pregunta, el aviso de «no confiado» espera la respuesta.
    const root = opened.project.root
    const release = session.deferTrustWarning(root)
    await session.refreshSessions()
    await session.refreshProjects()
    await session.selectSession(opened.session.id)
    void engineApi.projectIntelligence(root)
      .then(async (intel) => {
        if (intel.instructions.trusted) return
        const state = intel.instructions.trust_state
        if (!(await offerTrust(root, state))) warnUntrusted(root, state, `project-trust-${opened.project.id ?? root}`)
      })
      .catch(() => undefined)
      .finally(release)
    return true
  }

  /** Confiar habilita instrucciones, skills y plugins del proyecto: se pregunta. */
  async function offerTrust(root: string, state?: TrustState | null): Promise<boolean> {
    const ok = await confirm({
      title: translate(lang, 'project.trustTitle'),
      // Si ya confiaste y cambió su identidad, se dice eso y no «¿confías?» a secas.
      body: translate(lang, state === 'revalidation-required' ? 'project.trustChangedConfirm' : 'project.trustConfirm'),
      confirmLabel: translate(lang, 'project.trust'),
      cancelLabel: translate(lang, 'project.trustLater'),
    })
    if (ok) await session.trustProject(root)
    return ok
  }

  /** Borrado definitivo de un proyecto archivado: se dice cuántas conversaciones se van. */
  async function handleDeleteProject(id: string): Promise<void> {
    const count = await engineApi
      .sessions(undefined, true, id, undefined, 500)
      .then((result) => result.sessions.length)
      .catch(() => null)
    const ok = await confirm({
      title: translate(lang, 'project.deleteForever'),
      body: count === null
        ? translate(lang, 'project.deleteConfirm')
        : translate(lang, 'project.deleteConfirmCount', { n: count }),
      confirmLabel: translate(lang, 'project.deleteAction'),
      cancelLabel: translate(lang, 'common.cancel'),
    })
    if (!ok) return
    const deleted = await session.deleteProject(id)
    if (deleted === null) return
    await session.refreshSessions()
    toast.success(translate(lang, 'project.deleted'))
  }

  function confirmArchiveProject(): Promise<boolean> {
    return confirm({
      title: translate(lang, 'project.archive'),
      body: translate(lang, 'project.archiveConfirm'),
      confirmLabel: translate(lang, 'project.archiveAction'),
      cancelLabel: translate(lang, 'common.cancel'),
    })
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

  // El menú nativo, la bandeja y los diálogos de main siguen el idioma de la
  // interfaz. Un host sin esta intención (versiones anteriores) se ignora.
  useEffect(() => {
    void platform().app.setLanguage(lang).catch(() => undefined)
  }, [lang])

  // `rinari desktop` en frío llega antes de que el Engine esté listo: abrir
  // entonces fallaba con «engine is not running» y luego funcionaba. La
  // petición espera a `session.ready`; si llegan varias, vale la última.
  type OpenRequest = { project: string | null; session: string | null }
  const pendingOpen = useRef<OpenRequest | null>(null)
  const openWhenReady = useRef<(request: OpenRequest) => void>(() => {})
  openWhenReady.current = (request) => {
    if (!session.ready) {
      pendingOpen.current = request
      return
    }
    void (async () => {
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
    })()
  }
  useEffect(() => {
    if (!session.ready || !pendingOpen.current) return
    const request = pendingOpen.current
    pendingOpen.current = null
    openWhenReady.current(request)
  }, [session.ready])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    void engineApi
      .initialOpenRequest()
      .then((request) => {
        if (request.project || request.session) openWhenReady.current(request)
      })
      .catch(() => {})
    void platform()
      .events.onOpenRequest((request) => openWhenReady.current(request))
      .then((stop) => {
        unlisten = stop
      })
    return () => unlisten?.()
  }, [])

  // El motor arranca solo al abrir la app: Rinari nunca parece "apagado".
  // El footer + EngineConsole conservan el estado real y el reintento.
  const autoStarted = useRef(false)
  useEffect(() => {
    const tr = (key: I18nKey, vars?: Record<string, string | number>) => translate(lang, key, vars)
    let stop: (() => void) | undefined
    let active = true
    let previous: Parameters<typeof reportsUpdateError>[0] = null
    // Se pregunta con el diálogo de la app (antes era uno nativo, sin estilo);
    // main ya no vuelve a preguntar.
    const confirmAndApply = () =>
      void confirm({
        title: tr('update.applyTitle'),
        body: tr('update.applyDetail'),
        confirmLabel: tr('update.restartAction'),
        cancelLabel: tr('common.cancel'),
      }).then((ok) => {
        if (ok) void applyUpdate().catch((error) => toast.error(commandMessage(error)))
      })
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
          action: { label: tr('update.install'), onClick: confirmAndApply },
        })
        // `rinari update` con la app abierta: pregunta sin esperar al toast.
        if (state.prompt) confirmAndApply()
      } else if (state.phase === 'error' && reportsUpdateError(before)) {
        toast.error(tr('update.failed', { detail: state.message ?? tr('update.unknownError') }), { id: 'rinari-update' })
      }
    }).then((unsubscribe) => {
      if (active) stop = unsubscribe
      else unsubscribe()
    })
    return () => {
      active = false
      stop?.()
    }
  }, [lang, confirm])

  useEffect(() => {
    if (!autoStarted.current) {
      autoStarted.current = true
      void session.startEngine()
      // Auto-update silencioso estilo Hermes: solo avisa si hay versión.
      // App vive fuera del I18nProvider: se usa translate() con el idioma actual.
      const tr = (key: I18nKey, vars?: Record<string, string | number>) =>
        translate(lang, key, vars)
      // Avanzado → Actualizaciones puede apagar la búsqueda al abrir.
      void (useUIStore.getState().autoCheckUpdates ? checkForUpdates() : Promise.resolve(null))
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
  // Aviso de degradación bajo la barra: se cierra con la × y no vuelve hasta
  // que el error cambie. Cada uno queda además en la campana (Sistema).
  const [dismissedBanner, setDismissedBanner] = useState<string | null>(null)
  const bannerError = session.sessionsError ?? session.catalogError
  useEffect(() => {
    if (bannerError === null) return
    const key = session.sessionsError !== null ? 'startup.sessionsDegraded' : 'startup.catalogDegraded'
    useNotificationCenter.getState().push({
      id: `system:${key}:${bannerError}`,
      module: 'system',
      title: translate(lang, key, { detail: bannerError }),
      tone: 'warning',
      target: session.sessionsError !== null ? undefined : { kind: 'providers' },
    })
  }, [bannerError, session.sessionsError, lang])
  // Primer uso (#71): la bienvenida va antes de conectar el proveedor.
  const [welcomeOpen, setWelcomeOpen] = useState(false)
  useEffect(() => {
    if (
      session.ready &&
      session.catalogLoaded &&
      !session.catalogError &&
      session.providers.length === 0 &&
      !wizardSnoozed
    ) {
      if (!welcomeSeen()) setWelcomeOpen(true)
      else setWizardOpen(true)
    }
  }, [session.ready, session.catalogLoaded, session.catalogError, session.providers.length, wizardSnoozed])

  useDesktopShortcuts(shortcutBindings, (action) => {
    if (action === 'palette') togglePalette()
    if (action === 'settings') goSettings()
    if (action === 'sidebar') toggleSidebarCollapsed()
    if (action === 'sidePanel') toggleDock()
    if (action === 'boards') toggleBoards()
    if (action === 'flows') openFlow()
    if (action === 'newChat') dispatchAction('new-chat')
    // Colapso/expansión solo actúan en Boards; en otras vistas no hacen nada.
    if (action === 'collapsePane') dispatchAction('collapse-pane')
    if (action === 'expandPane') dispatchAction('expand-pane')
    // Abre el chip de proyecto del composer enfocado, si es una conversación nueva (#42).
    if (action === 'projectPicker') window.dispatchEvent(new Event(PROJECT_PICKER_EVENT))
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
  /**
   * Señal por sesión para el sidebar, de **todas** las conversaciones (#33):
   * te necesita, falló o resultado sin leer. Sale de la misma cuenta que el
   * número de la barra de tareas.
   */
  const pendingBySession = useSessionPendingStore((state) => state.bySession)
  const signalBySession = useMemo(() => {
    const out: Record<string, SessionSignal> = {}
    for (const [id, pending] of Object.entries(pendingBySession)) {
      const signal = signalOf(pending)
      if (signal) out[id] = signal
    }
    return out
  }, [pendingBySession])
  const boardLabelFor = (id: string) => {
    const record = session.sessionsById[id]
    return record?.title || (record?.project_root ? projectDisplayName(record.project_root) : null) || translate(lang, 'sidebar.newChat')
  }
  const focusedBoardPane = boardPanes.find((pane) => pane.paneId === boardFocusedPaneId) ?? null

  // Destino del dock: una sola regla para barra superior, acciones, menú y
  // paleta. En Boards es el panel enfocado y **nunca** todos los docks
  // montados; en Normal, la sesión activa.
  const dockTargetSessionId = (view === 'board' ? focusedBoardPane?.sessionId : session.activeSession) || null
  // Los botones de las vistas solo aparecen con una conversación de verdad:
  // no en la pantalla de inicio, en una conversación nueva sin enviar, en
  // Ajustes ni en las demás pantallas sin sesión (#47).
  const dockButtonsSessionId = view === 'board' ? focusedBoardPane?.sessionId || null : view === 'chat' && activeHasContent ? session.activeSession || null : null
  /**
   * Botón de una vista del panel lateral (barra de título, atajo, menú o
   * paleta): la abre o la cierra en la sesión destino. Desde un atajo, con el
   * mosaico lleno, ocupa el sitio de la última (la barra pregunta cuál).
   */
  const toggleDockSurface = useCallback(
    (surface: DockSurface) => {
      if (!dockTargetSessionId) return
      const store = useSessionDockStore.getState()
      const { view } = viewForSurface(surface)
      if (store.toggleView(dockTargetSessionId, view) === 'full') store.openView(dockTargetSessionId, view)
    },
    [dockTargetSessionId],
  )
  /**
   * El Flujo es una vista del panel lateral (#43): el atajo, el menú y «Ver
   * flujo» la abren en la sesión destino (o en la que se indica), sin cerrarla
   * si ya está abierta. Desde una pantalla sin sesión se vuelve a Normal.
   */
  const openFlow = useCallback((sessionId?: string) => {
    const target = sessionId ?? dockTargetSessionId
    if (!target) return
    if (view !== 'chat' && view !== 'board') goNormal()
    useSessionDockStore.getState().openView(target, 'flow')
  }, [dockTargetSessionId, goNormal, view])
  /** Ctrl+B: oculta o vuelve a mostrar el panel lateral sin cerrar sus vistas. */
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
          // Un borrador: la sesión se crea con el primer mensaje.
          session.openDraft(); goChat(); break
        }
        case 'view-normal': goNormal(); break
        case 'view-boards': goBoard(); break
        case 'view-flows': openFlow(); break
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
        case 'mark-all-read': markEverythingRead(); break
        case 'open-folder': useCreateProjectStore.getState().openWith(); break
        case 'close-session': {
          // Contextual: en Boards quita el panel enfocado sin cerrar su sesión.
          if (resolveContextualAction('close', { view }) === 'remove-pane') { boardActionsRef.current.removePane(); break }
          if (session.activeSession) void session.closeSession(session.activeSession); break
        }
        case 'settings': goSettings(); break
        case 'appearance': goSettings('appearance'); break
        case 'about': goSettings('about'); break
        case 'report-bug':
          void platform().opener.openUrl(bugReportUrl(APP_VERSION, session.status, translate(lang, 'settings.about.issueTemplate')))
            .catch(error => toast.error(commandMessage(error)))
          break
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
        case 'workspace-panel': toggleDockSurface('changes'); break
        case 'side-panel': toggleDock(); break
        case 'terminal': toggleDockSurface('terminal'); break
        case 'commands': setPaletteOpen(true); break
        case 'processes':
          if (session.activeSession) {
            goChat()
            if (session.status?.capabilities.desktop_terminal_v1 === true) {
              // Los procesos viven en la pestaña «Rinari» del panel Terminal.
              useTerminalStore.getState().select(session.activeSession, AGENT_TAB)
              requestDockToggle({ sessionId: session.activeSession, surface: 'terminal' })
            } else {
              setProcessesSignal((value) => value + 1)
            }
          }
          break
        case 'undo': case 'redo': document.execCommand(action); break
        case 'updates': goSettings('about'); void checkForUpdates().then(found => {
          if (!found) { toast.success(translate(lang, 'update.upToDate')); return }
          toast(translate(lang, 'update.available', { v: found.version }), {
            description: found.unsigned ? translate(lang, 'update.unsigned') : undefined,
            action: { label: translate(lang, 'update.download'), onClick: () => void downloadUpdate().catch(error => toast.error(commandMessage(error))) },
          })
        }).catch(error => toast.error(commandMessage(error))); break
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
  const degradedText = degradedDetail !== null ? translate(lang, degradedKey, { detail: degradedDetail }) : null

  return (
    <I18nProvider lang={lang}>
      <EngineProvider session={session}>
      {confirmDialog}
      {profileMoves.dialog}
      <CreateProjectDialog
        onCreated={(project, created) => {
          void session.refreshProjects()
          // A conversation of the new project, not created until the first
          // message (#60): leaving without writing leaves nothing behind.
          if (!created) {
            session.openDraft(project.id)
            goChat()
            return
          }
          void session.refreshSessions().then(() => {
            void session.selectSession(created.id).then(() => goChat())
          })
        }}
      />
      <BoardActivityController />
      <SoundCoordinator activeSession={session.activeSession} />
      <UpdateNotifier lang={lang} />
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
        banner={degradedText !== null && degradedText !== dismissedBanner && (
          <div
            role="alert"
            className="app-banner"
          >
            <span className="min-w-0 flex-1 truncate">
              {degradedText}
            </span>
            <button
              type="button"
              onClick={() => {
                void session.refreshSessions()
                void session.refreshCatalog()
              }}
              className="btn btn-ghost btn-xs"
            >
              {translate(lang, 'startup.retry')}
            </button>
            <button
              type="button"
              aria-label={translate(lang, 'startup.dismiss')}
              title={translate(lang, 'startup.dismiss')}
              onClick={() => setDismissedBanner(degradedText)}
              className="shrink-0 rounded p-0.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
            >
              <X size={14} />
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
            onNewProjectChat={(id) => { session.openDraft(id); goChat() }}
            onMoveSession={(id, projectId) => void desktopApi.moveSession(id, projectId).then(() => session.refreshSessions()).catch(error => toast.error(commandMessage(error)))}
            onMoveSessionProfile={profileMoves.moveSession}
            onMoveProjectProfile={profileMoves.moveProject}
            onNewChat={() => dispatchAction('new-chat')}
            onOpenFolder={() => useCreateProjectStore.getState().openWith()}
            sessions={session.sessions}
            closedSessions={session.closedSessions}
            archivedSessions={session.archivedSessions}
            projects={session.projects}
            archivedProjects={session.archivedProjects}
            activeId={view === 'board' ? (focusedBoardPane?.sessionId ?? '') : session.activeSession}
            busySessionIds={session.busySessionIds}
            boardSessionIds={boardSessionIds}
            signalBySession={signalBySession}
            onOpenInBoard={openInBoard}
            onViewFlow={(scope) => {
              // El Flujo vive en el panel lateral de la conversación (#43): se
              // abre esa conversación y su vista Flujo.
              void session.selectSession(scope.id)
              openFlow(scope.id)
            }}
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
              void confirmArchiveProject().then((ok) => { if (ok) void session.removeProject(id, 'archive') })
            }}
            onDeleteProject={session.status?.capabilities.project_delete_v1 === true
              ? (id) => void handleDeleteProject(id)
              : undefined}
            approvals={session.approvals}
          />
        }
        topbar={
          <AppStatusBar
            context={
              view === 'chat' && activeHasContent ? (
                <ChatHeader title={activeTitle} sessionId={activeRecord?.id ?? null} mother={activeMother} permission={activeRecord?.effective_permission_profile ?? null} />
              ) : view !== 'chat' && view !== 'board' ? (
                <span className="truncate text-sm font-semibold text-[var(--text)]">{translate(lang, `topbar.view.${view}` as I18nKey)}</span>
              ) : null
            }
            selectedView={view === 'chat' || view === 'board' ? view : null}
            onSelectView={(next) => (next === 'board' ? goBoard() : goNormal())}
            toggleShortcut={shortcutBindings.boards}
            attentionCount={attentionSessionCount}
            boardAttentionCount={boardCounts.attentionPaneCount}
            attentionMenu={
              <NotificationCenter
                labelFor={boardLabelFor}
                projectFor={(id) => {
                  const root = session.sessionsById[id]?.project_root
                  return root ? projectDisplayName(root) : null
                }}
                goBoard={goBoard}
                disabled={!session.ready}
                onOpenTarget={(target) => {
                  if (target.kind === 'session') {
                    // De otro perfil: primero ese perfil (#34).
                    void switchToProfileOf(session.sessionsById[target.sessionId]?.rinari_profile_id).then(() => {
                      chooseSession(target.sessionId)
                      if (target.turnId) requestTurnReveal({ sessionId: target.sessionId, turnId: target.turnId })
                    }).catch((error) => toast.error(commandMessage(error)))
                  }
                  else if (target.kind === 'schedules') goSchedules()
                  else if (target.kind === 'providers') goSettings('providers')
                  else if (target.kind === 'update') goSettings('about')
                  else if (target.skill) useUIStore.getState().openSkill(target.skill)
                  else goSettings('skills')
                }}
              />
            }
            onOpenMobileSidebar={() => setSidebarOpen(true)}
            onToggleSidebar={toggleSidebarCollapsed}
            sidebarCollapsed={sidebarCollapsed}
            dockViews={dockButtonsSessionId ? <DockViewButtons key={dockButtonsSessionId} sessionId={dockButtonsSessionId} terminalEnabled={session.status?.capabilities.desktop_terminal_v1 === true} /> : null}
          />
        }
      >
        {/* Cada vista entra con un fundido corto (solo opacidad: un transform
            movería el rectángulo del navegador nativo durante la entrada). */}
        <div key={view} className="view-stage">
        {view === 'chat' && <SingleSessionView onOpenProviders={() => goSettings('providers')} processesOpenSignal={processesSignal} />}
        {view === 'board' && (
          <Suspense fallback={<div className="board-canvas" aria-busy="true" />}>
            <BoardView actionsRef={boardActionsRef} />
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
            onNewSession={() => {
              session.openDraft(session.projects.find((p) => p.root === projectRoot)?.id ?? null)
              goChat()
            }}
            onEnsure={() => {
              void session.loadProjectStatus(projectRoot)
              if (!session.projectIntelByRoot[projectRoot]) {
                void session.loadProjectIntelligence(projectRoot)
              }
            }}
            onTrust={() => void offerTrust(projectRoot)}
            onUpdate={(changes) => {
              const project = session.projects.find((item) => item.root === projectRoot)
              return project ? session.updateProject(project.id, changes) : Promise.resolve(false)
            }}
            onArchive={() => {
              const project = session.projects.find((item) => item.root === projectRoot)
              if (project) {
                void confirmArchiveProject().then((ok) => {
                  if (ok) void session.removeProject(project.id, 'archive').then((done) => done && goChat())
                })
              }
            }}
          />
        )}
        {view === 'settings' && (
          <Suspense fallback={<div className="settings-loading" aria-busy="true" />}>
            <SettingsView
              appVersion={APP_VERSION}
              providers={session.providers}
              models={session.models}
              activeSessionId={session.activeSession || null}
              engineCapabilities={session.status?.capabilities}
              onCatalogChanged={() => void session.refreshCatalog()}
              onOpenSession={chooseSession}
            />
          </Suspense>
        )}
        </div>
      </AppShell>

      <ReviewExportDialog />

      <WelcomeDialog
        open={welcomeOpen}
        onClose={() => {
          // Respondida o saltada, no vuelve sola; se repite desde Ajustes → Memoria.
          markWelcomeSeen()
          setWelcomeOpen(false)
          setWizardOpen(true)
        }}
      />

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
