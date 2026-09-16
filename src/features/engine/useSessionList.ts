import { useCallback, useEffect, useRef, useState, type Dispatch } from 'react'
import { toast } from 'sonner'
import { commandMessage, engineApi, type SessionDeleteResult, type SessionSummary } from '../../services/engine'
import { translate } from '../../i18n'
import { useUIStore } from '../../stores/ui'
import { historyToMessages } from './history'
import type { TimelineAction } from '../activity/turnTimelineReducer'
import { partitionSessions } from './sessionVisibility'

/**
 * SessionController: lista de sesiones, sesión activa, historial persistente
 * y mutación de sesión (modo, permiso, crear, seleccionar). Reporta su error
 * por separado para que el shell degrade sin atraparse en el splash.
 */
export function useSessionList(options: {
  dispatch: Dispatch<TimelineAction>
  engineReady: boolean
  timelineEnabled: boolean
}) {
  const { dispatch, engineReady, timelineEnabled } = options
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [activeSession, setActiveSession] = useState<string>('')
  const [sessionsLoaded, setSessionsLoaded] = useState(false)
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  /** Cerradas: ocultas del listado; abrir una la restaura. */
  const [closedSessions, setClosedSessions] = useState<SessionSummary[]>([])
  /** Archivadas: ciclo de vida explícito, separado de "cerrar". */
  const [archivedSessions, setArchivedSessions] = useState<SessionSummary[]>([])
  /** Total/has_more del historial cargado por sesión. */
  const [historyInfo, setHistoryInfo] = useState<Record<string, { total: number; hasMore: boolean }>>({})
  /** Sesiones con historial ya cargado o hilo vivo (no recargar encima). */
  const historyLoaded = useRef(new Set<string>())
  /** Un refresco obsoleto que resuelve tarde no debe sobrescribir uno más nuevo. */
  const refreshSeq = useRef(0)
  /** Cargas de historial en curso por sesión (estado: la UI distingue
   * "cargando" de "vacía" y no muestra el home de forma transitoria). */
  const [historyPending, setHistoryPending] = useState<Record<string, boolean>>({})
  /** Activa sesión marcando carga pendiente en el mismo tick cuando su
   * historial no está cargado: así el primer pintado ya muestra
   * esqueleto y nunca el home transitorio. Único cuello de botella
   * para cambios de sesión (ver select/restore/fork/create). */
  const activate = useCallback((id: string) => {
    if (id !== '' && !historyLoaded.current.has(id)) {
      setHistoryPending((prev) => (prev[id] ? prev : { ...prev, [id]: true }))
    }
    setActiveSession(id)
  }, [])

  const refreshSessions = useCallback(async (): Promise<void> => {
    const seq = ++refreshSeq.current
    try {
      const result = await engineApi.sessions(undefined, true)
      if (refreshSeq.current !== seq) return
      // El engine expone estados de runtime (active/interrupted/stopped): solo
      // closed/archived se ocultan. Filtrar por `active` hacía que una sesión
      // interrumpida (p. ej. timeout de provider) desapareciera del sidebar al
      // refrescar, como ocurre tras un cambio de modelo.
      const { visible, closed, archived } = partitionSessions(result.sessions)
      const normalized = visible
      setSessions(normalized)
      setClosedSessions(closed)
      setArchivedSessions(archived)
      setSessionsError(null)
      setActiveSession((current) => {
        if (current !== '' && normalized.some((s) => s.id === current)) return current
        return normalized[0]?.id ?? ''
      })
    } catch (err) {
      if (refreshSeq.current !== seq) return
      setSessionsError(commandMessage(err))
      toast.error(commandMessage(err))
    } finally {
      if (refreshSeq.current === seq) setSessionsLoaded(true)
    }
  }, [])

  const loadSessionHistory = useCallback(
    async (id: string): Promise<void> => {
      if (historyLoaded.current.has(id)) return
      historyLoaded.current.add(id)
      setHistoryPending((prev) => (prev[id] ? prev : { ...prev, [id]: true }))
      try {
        const [history, timeline] = await Promise.all([
          engineApi.sessionHistory(id),
          timelineEnabled ? engineApi.sessionTimeline(id).catch(() => null) : Promise.resolve(null),
        ])
        setHistoryInfo((prev) => ({
          ...prev,
          [id]: { total: history.total, hasMore: history.has_more },
        }))
        const persisted = historyToMessages(history.messages)
        // Lo vivo siempre gana a un fetch de historial que llega tarde.
        dispatch({ type: 'history/loaded', sessionId: id, messages: persisted })
        if (timeline) dispatch({ type: 'timeline/loaded', sessionId: id, turns: timeline.turns })
      } catch (err) {
        historyLoaded.current.delete(id)
        toast.error(commandMessage(err))
      } finally {
        setHistoryPending((prev) => {
          if (!prev[id]) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
      }
    },
    [dispatch, timelineEnabled],
  )

  useEffect(() => {
    if (!engineReady || activeSession === '') return
    void loadSessionHistory(activeSession)
  }, [engineReady, activeSession, loadSessionHistory])

  /** Selecciona sesión: reconcile (open) + historial persistente una vez. */
  const selectSession = useCallback(
    async (id: string): Promise<void> => {
      const previous = activeSession
      activate(id)
      try {
        const opened = await engineApi.openSession(id)

        // La respuesta del engine es autoritativa: no inventar state: 'active'.
        setSessions((current) => {
          const exists = current.some((item) => item.id === opened.session.id)
          const next = exists
            ? current.map((item) =>
                item.id === opened.session.id ? opened.session : item,
              )
            : [opened.session, ...current]

          return partitionSessions(next).visible
        })

        // session.open reanuda/restaura la sesión; evitar duplicados en las bandejas.
        setClosedSessions((current) =>
          current.filter((item) => item.id !== opened.session.id),
        )
        setArchivedSessions((current) =>
          current.filter((item) => item.id !== opened.session.id),
        )

        for (const warning of new Set(opened.warnings ?? [])) {
          // Working-tree drift is normal project state and already appears in
          // the Git surface. Do not present it as an application error.
          if (warning.startsWith('[working-tree]')) continue
          if (warning.startsWith('[trust]')) {
            toast.warning('Proyecto no confiado: las instrucciones locales están desactivadas.', {
              id: `project-trust-${opened.session.project_id ?? opened.session.project_root ?? id}`,
            })
            continue
          }
          toast.warning(warning, { id: `session-warning-${id}-${warning}` })
        }
      } catch (err) {
        setActiveSession(previous)
        setHistoryPending((prev) => {
          if (!prev[id]) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        toast.error(commandMessage(err))
        return
      }
      await loadSessionHistory(id)
    },
    [activeSession, activate, loadSessionHistory],
  )

  const createSession = useCallback(async (projectId?: string): Promise<string | null> => {
    try {
      const result = await engineApi.createSession({
        project_id: projectId,
        chat: !projectId,
        title: translate(useUIStore.getState().lang, 'sidebar.newChat'),
        mode: 'build',
        permission_profile: 'workspace',
      })
      setSessions((current) => [result.session, ...current.filter((item) => item.id !== result.session.id)])
      historyLoaded.current.add(result.session.id)
      activate(result.session.id)
      void refreshSessions()
      return result.session.id
    } catch (err) {
      toast.error(commandMessage(err))
      return null
    }
  }, [activate, refreshSessions])

  /** Cierra: oculta del listado; volver a abrirla la restaura. */
  const closeSession = useCallback(
    async (id: string): Promise<void> => {
      try {
        await engineApi.closeSession(id)
        await refreshSessions()
      } catch (err) {
        toast.error(commandMessage(err))
      }
    },
    [refreshSessions],
  )

  const renameSession = useCallback(async (id: string, title: string): Promise<void> => {
    try {
      await engineApi.renameSession(id, title)
      await refreshSessions()
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }, [refreshSessions])

  const archiveSession = useCallback(async (id: string): Promise<void> => {
    try {
      await engineApi.archiveSession(id)
      await refreshSessions()
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }, [refreshSessions])

  const restoreSession = useCallback(async (id: string): Promise<void> => {
    try {
      const result = await engineApi.restoreSession(id)
      await refreshSessions()
      activate(result.session.id)
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }, [activate, refreshSessions])

  const forkSession = useCallback(async (id: string): Promise<string | null> => {
    try {
      const result = await engineApi.forkSession(id)
      await refreshSessions()
      activate(result.session.id)
      return result.session.id
    } catch (err) {
      toast.error(commandMessage(err))
      return null
    }
  }, [activate, refreshSessions])

  /** Eliminación permanente con cascada explícita del engine. */
  const deleteSession = useCallback(
    async (id: string, cascade: boolean): Promise<SessionDeleteResult | null> => {
      try {
        const result = await engineApi.deleteSession(id, cascade)
        await refreshSessions()
        return result
      } catch (err) {
        toast.error(commandMessage(err))
        return null
      }
    },
    [refreshSessions],
  )

  /** Cambia PLAN/BUILD/REVIEW. Misma sesión, tareas y contexto intactos. */
  const setMode = useCallback(
    async (mode: string): Promise<void> => {
      if (activeSession === '') return
      try {
        await engineApi.setSessionMode(activeSession, mode)
        await refreshSessions()
      } catch (err) {
        toast.error(commandMessage(err))
      }
    },
    [activeSession, refreshSessions],
  )

  const setPermission = useCallback(
    async (profile: string): Promise<void> => {
      if (activeSession === '') return
      try {
        await engineApi.setSessionPermission(activeSession, profile)
        await refreshSessions()
      } catch (err) {
        toast.error(commandMessage(err))
      }
    },
    [activeSession, refreshSessions],
  )

  const searchFiles = useCallback(
    (query: string) =>
      activeSession
        ? engineApi.searchWorkspaceFiles(activeSession, query)
        : Promise.resolve({ root: '', files: [] }),
    [activeSession],
  )

  return {
    sessions,
    activeSession,
    setActiveSession,
    sessionsLoaded,
    sessionsError,
    historyInfo,
    closedSessions,
    archivedSessions,
    refreshSessions,
    loadSessionHistory,
    selectSession,
    historyPending,
    createSession,
    closeSession,
    renameSession,
    archiveSession,
    restoreSession,
    forkSession,
    deleteSession,
    setMode,
    setPermission,
    searchFiles,
  }
}

export type SessionList = ReturnType<typeof useSessionList>
