import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react'
import type { EngineSession } from './useEngineSession'
import type { RuntimeStore } from './runtimeStore'

/**
 * Dos contextos con distinta frecuencia de cambio:
 *
 * - `EngineCommandsContext`: handle **estable** (misma referencia durante toda
 *   la vida del shell) con el store del runtime y todos los comandos. Sus
 *   métodos delegan siempre en la última instancia de `useEngineSession`, así
 *   que un consumidor memoizado nunca re-renderiza por recibir comandos.
 * - `EngineDataContext`: dominios de lectura de baja frecuencia (sesiones,
 *   catálogo, proyectos, estado del Engine). Cambia cuando cambian esos datos,
 *   nunca por un delta de contenido: lo caliente se lee del store con
 *   `sessionSelectors`.
 */

type CommandKeys =
  | 'startEngine' | 'shutdownEngine' | 'restartEngine' | 'refreshStatus' | 'refreshSessions'
  | 'createSession' | 'prepareSession' | 'ensureSessionReady' | 'ensureHistoryLoaded' | 'retryHistoryFor' | 'retryHistory'
  | 'send' | 'sendTo' | 'prepareAttachments' | 'prepareAttachmentsFor'
  | 'cancelAttachmentPreparation' | 'cancelAttachmentPreparationFor'
  | 'implementPlan' | 'implementPlanFor' | 'cancelTurn' | 'cancelTurnFor' | 'steerTo' | 'queueTo' | 'resolveApproval'
  | 'refreshCatalog' | 'discoverCatalog' | 'refreshModels' | 'useModel' | 'useModelFor'
  | 'selectSession' | 'setActiveSession' | 'setMode' | 'setModeFor' | 'setPermission' | 'setPermissionFor'
  | 'searchFiles' | 'searchFilesFor'
  | 'closeSession' | 'renameSession' | 'pinSession' | 'archiveSession' | 'restoreSession' | 'forkSession' | 'deleteSession'
  | 'refreshProjects' | 'openProject' | 'updateProject' | 'removeProject'
  | 'loadProjectStatus' | 'loadProjectIntelligence' | 'trustProject'
  | 'activeModelFor' | 'isBusy'

const COMMAND_KEYS: readonly CommandKeys[] = [
  'startEngine', 'shutdownEngine', 'restartEngine', 'refreshStatus', 'refreshSessions',
  'createSession', 'prepareSession', 'ensureSessionReady', 'ensureHistoryLoaded', 'retryHistoryFor', 'retryHistory',
  'send', 'sendTo', 'prepareAttachments', 'prepareAttachmentsFor',
  'cancelAttachmentPreparation', 'cancelAttachmentPreparationFor',
  'implementPlan', 'implementPlanFor', 'cancelTurn', 'cancelTurnFor', 'steerTo', 'queueTo', 'resolveApproval',
  'refreshCatalog', 'discoverCatalog', 'refreshModels', 'useModel', 'useModelFor',
  'selectSession', 'setActiveSession', 'setMode', 'setModeFor', 'setPermission', 'setPermissionFor',
  'searchFiles', 'searchFilesFor',
  'closeSession', 'renameSession', 'pinSession', 'archiveSession', 'restoreSession', 'forkSession', 'deleteSession',
  'refreshProjects', 'openProject', 'updateProject', 'removeProject',
  'loadProjectStatus', 'loadProjectIntelligence', 'trustProject',
  'activeModelFor', 'isBusy',
]

export type EngineCommands = Pick<EngineSession, CommandKeys> & { runtime: RuntimeStore }

type DataKeys =
  | 'status' | 'ready' | 'engineGeneration'
  | 'sessions' | 'sessionsById' | 'activeSession' | 'sessionsLoaded' | 'sessionsError'
  | 'historyInfo' | 'historyPhases' | 'historyPhase' | 'closedSessions' | 'archivedSessions'
  | 'providers' | 'models' | 'catalogLoaded' | 'catalogError' | 'activeModel'
  | 'projects' | 'archivedProjects' | 'projectsError'
  | 'projectStatusByRoot' | 'projectStatusErrorByRoot' | 'projectIntelByRoot'
  | 'activeProjectRoot' | 'activeGitStatus' | 'activeGitError'
  | 'busySessionIds' | 'approvals'

export type EngineData = Pick<EngineSession, DataKeys>

const EngineCommandsContext = createContext<EngineCommands | null>(null)
const EngineDataContext = createContext<EngineData | null>(null)

/** Handle estable: cada método delega en la instancia más reciente. */
function useStableCommands(session: EngineSession): EngineCommands {
  const latest = useRef(session)
  latest.current = session
  const handleRef = useRef<EngineCommands | null>(null)
  if (handleRef.current === null) {
    const handle = { runtime: session.runtime } as Record<string, unknown>
    for (const key of COMMAND_KEYS) {
      handle[key] = (...args: unknown[]) => (latest.current[key] as (...params: unknown[]) => unknown)(...args)
    }
    handleRef.current = handle as unknown as EngineCommands
  }
  return handleRef.current
}

export function EngineProvider({ session, children }: { session: EngineSession; children: ReactNode }) {
  const commands = useStableCommands(session)
  const data = useMemo<EngineData>(() => ({
    status: session.status,
    ready: session.ready,
    engineGeneration: session.engineGeneration,
    sessions: session.sessions,
    sessionsById: session.sessionsById,
    activeSession: session.activeSession,
    sessionsLoaded: session.sessionsLoaded,
    sessionsError: session.sessionsError,
    historyInfo: session.historyInfo,
    historyPhases: session.historyPhases,
    historyPhase: session.historyPhase,
    closedSessions: session.closedSessions,
    archivedSessions: session.archivedSessions,
    providers: session.providers,
    models: session.models,
    catalogLoaded: session.catalogLoaded,
    catalogError: session.catalogError,
    activeModel: session.activeModel,
    projects: session.projects,
    archivedProjects: session.archivedProjects,
    projectsError: session.projectsError,
    projectStatusByRoot: session.projectStatusByRoot,
    projectStatusErrorByRoot: session.projectStatusErrorByRoot,
    projectIntelByRoot: session.projectIntelByRoot,
    activeProjectRoot: session.activeProjectRoot,
    activeGitStatus: session.activeGitStatus,
    activeGitError: session.activeGitError,
    busySessionIds: session.busySessionIds,
    approvals: session.approvals,
  }), [
    session.status, session.ready, session.engineGeneration,
    session.sessions, session.sessionsById, session.activeSession, session.sessionsLoaded, session.sessionsError,
    session.historyInfo, session.historyPhases, session.historyPhase, session.closedSessions, session.archivedSessions,
    session.providers, session.models, session.catalogLoaded, session.catalogError, session.activeModel,
    session.projects, session.archivedProjects, session.projectsError,
    session.projectStatusByRoot, session.projectStatusErrorByRoot, session.projectIntelByRoot,
    session.activeProjectRoot, session.activeGitStatus, session.activeGitError,
    session.busySessionIds, session.approvals,
  ])
  return (
    <EngineCommandsContext.Provider value={commands}>
      <EngineDataContext.Provider value={data}>{children}</EngineDataContext.Provider>
    </EngineCommandsContext.Provider>
  )
}

export function useEngineCommands(): EngineCommands {
  const value = useContext(EngineCommandsContext)
  if (!value) throw new Error('useEngineCommands must be used inside <EngineProvider>')
  return value
}

/** Como useEngineData, pero null fuera del proveedor (vistas que también se prueban solas). */
export function useOptionalEngineData(): EngineData | null {
  return useContext(EngineDataContext)
}

export function useEngineData(): EngineData {
  const value = useContext(EngineDataContext)
  if (!value) throw new Error('useEngineData must be used inside <EngineProvider>')
  return value
}

export function useRuntimeStore(): RuntimeStore {
  return useEngineCommands().runtime
}
