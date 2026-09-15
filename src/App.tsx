import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { dispatchAction, resolveContextualAction, type DesktopAction } from './services/actions'
import { useDesktopShortcuts } from './hooks/useDesktopShortcuts'
import { open as openFolderDialog } from '@tauri-apps/plugin-dialog'
import { toast } from 'sonner'
import { I18nProvider, translate, type I18nKey } from './i18n'
import { engineApi } from './services/engine'
import { checkForUpdates, installUpdateAndRelaunch } from './services/updates'
import { useUIStore } from './stores/ui'
import { useEngineSession } from './features/engine/useEngineSession'
import { EngineProvider } from './features/engine/EngineContext'
import { useSessionHasContent } from './features/engine/sessionSelectors'
import SingleSessionView from './features/engine/SingleSessionView'
import AppShell from './components/app-shell/AppShell'
import AppStatusBar from './components/app-shell/AppStatusBar'
import BrowserPanel from './features/browser/BrowserPanel'
import ProcessesPanel from './features/processes/ProcessesPanel'
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

const APP_VERSION = '0.1.2'

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
  const toggleBoards = useUIStore((s) => s.toggleBoards)
  const goEngine = useUIStore((s) => s.goEngine)
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
    void listen<{ project: string | null; session: string | null }>(
      'rinari-open-request',
      (wrapper) => void handleOpen(wrapper.payload),
    ).then((stop) => {
      unlisten = stop
    })
    return () => unlisten?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // El motor arranca solo al abrir la app: Rinari nunca parece "apagado".
  // El footer + EngineConsole conservan el estado real y el reintento.
  const autoStarted = useRef(false)
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
            action: {
              label: tr('update.install'),
              onClick: () => {
                toast.loading(tr('update.installing'))
                void installUpdateAndRelaunch().catch((err: unknown) =>
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
    if (action === 'newChat') dispatchAction('new-chat')
  })

  const desktopActionRef = useRef<(action: DesktopAction) => void>(() => {})
  /** Acciones del board (alta/baja de paneles); las registra BoardView cuando existe. */
  const boardActionsRef = useRef<{ addPane: () => void; removePane: () => void }>({ addPane: () => {}, removePane: () => {} })

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
        case 'toggle-boards': toggleBoards(); break
        case 'open-folder': void openFolderDialog({ directory: true }).then(path => { if (typeof path === 'string') void handleOpenProjectPath(path).then(ok => ok && goChat()) }); break
        case 'close-session': {
          // Contextual: en Boards quita el panel enfocado sin cerrar su sesión.
          if (resolveContextualAction('close', { view }) === 'remove-pane') { boardActionsRef.current.removePane(); break }
          if (session.activeSession) void session.closeSession(session.activeSession); break
        }
        case 'settings': goSettings(); break
        case 'appearance': goSettings('appearance'); break
        case 'about': goSettings('about'); break
        case 'engine': goEngine(); break
        case 'sidebar': toggleSidebarCollapsed(); break
        case 'files': window.dispatchEvent(new Event('rinari-files-toggle')); break
        case 'commands': setPaletteOpen(true); break
        case 'undo': case 'redo': document.execCommand(action); break
        case 'updates': void checkForUpdates().then(found => {
          if (!found) { toast.success('Rinari Agent está actualizado.'); return }
          toast(`Nueva versión: ${found.version}`, { action: { label: 'Instalar', onClick: () => void installUpdateAndRelaunch().catch(error => toast.error(String(error))) } })
        }).catch(error => toast.error(String(error))); break
      }
    }
    desktopActionRef.current = handle
  })

  useEffect(() => {
    const local = (event: Event) => desktopActionRef.current((event as CustomEvent<DesktopAction>).detail)
    window.addEventListener('rinari-action', local)
    const native = listen<DesktopAction>('rinari-menu-action', event => desktopActionRef.current(event.payload))
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
      <DesktopContextMenu />
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
            onToggleCollapse={toggleSidebarCollapsed}
            onSearch={() => setPaletteOpen(true)}
            onOpenSettings={() => goSettings()}
            onOpenEngine={goEngine}
            onOpenProjectHome={
              session.activeProjectRoot ? () => goProject(session.activeProjectRoot as string) : null
            }
            onNewProjectChat={(id) => void session.createSession(id).then(created => created && goChat())}
            onMoveSession={(id, projectId) => void desktopApi.moveSession(id, projectId).then(() => session.refreshSessions()).catch(error => toast.error(String(error)))}
            onNewChat={() => dispatchAction('new-chat')}
            onOpenFolder={() =>
              void openFolderDialog({ directory: true }).then((picked) => {
                if (typeof picked === 'string') void handleOpenProjectPath(picked).then((ok) => ok && goChat())
              })
            }
            sessions={session.sessions}
            closedSessions={session.closedSessions}
            archivedSessions={session.archivedSessions}
            projects={session.projects}
            archivedProjects={session.archivedProjects}
            activeId={session.activeSession}
            busySessionIds={session.busySessionIds}
            onSelectSession={(id) => {
              void session.selectSession(id)
              goChat()
            }}
            onOpenProject={(root) => goProject(root)}
            onCloseSession={(id) => void session.closeSession(id)}
            onRenameSession={(id, title) => void session.renameSession(id, title)}
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
              ) : view !== 'chat' && view !== 'board' ? (
                <span className="truncate text-sm font-semibold text-[var(--text)]">{translate(lang, `topbar.view.${view}` as I18nKey)}</span>
              ) : null
            }
            selectedView={view === 'chat' || view === 'board' ? view : null}
            onSelectView={(next) => (next === 'board' ? goBoard() : goNormal())}
            toggleShortcut={shortcutBindings.boards}
            engineState={session.status?.state ?? null}
            workingCount={session.busySessionIds.size}
            attentionCount={attentionSessionCount}
            onOpenMobileSidebar={() => setSidebarOpen(true)}
            onExpandSidebar={toggleSidebarCollapsed}
            sidebarCollapsed={sidebarCollapsed}
          />
        }
      >
        {view === 'chat' && <SingleSessionView onOpenProviders={() => goSettings('providers')} />}
        {view === 'board' && (
          <Suspense fallback={<div className="board-canvas" aria-busy="true" />}>
            <BoardView />
          </Suspense>
        )}
        {view === 'engine' && <EngineConsole session={session} />}
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
            onCatalogChanged={() => void session.refreshCatalog()}
          />
        )}
      </AppShell>

      {view === 'chat' && session.activeSession && <ProcessesPanel key={`processes:${session.activeSession}`} sessionId={session.activeSession} />}
      {view === 'chat' && session.activeSession && <BrowserPanel key={session.activeSession} sessionId={session.activeSession} />}

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
        activeId={session.activeSession || null}
        onSelectSession={(id) => {
          void session.selectSession(id)
          goChat()
        }}
        onNewSession={() => dispatchAction('new-chat')}
        onOpenSettings={(section) => goSettings(section)}
        onOpenEngine={goEngine}
        onOpenWorkspace={goWorkspace}
        onEngineRestart={() => void session.restartEngine()}
        theme={theme}
        onThemeChange={setTheme}
        lang={lang}
        onLanguageChange={setLang}
      />
      </EngineProvider>
    </I18nProvider>
  )
}

export default App
