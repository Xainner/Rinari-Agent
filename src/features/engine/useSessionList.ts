import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from 'react'
import { toast } from 'sonner'
import {
  commandMessage,
  engineApi,
  isCommandError,
  type SessionDeleteResult,
  type SessionSummary,
  type TrustState,
  type BranchChange,
} from '../../services/engine'
import { translate } from '../../i18n'
import type { Language } from '../../types'
import { warnUntrusted } from '../projects/trustWarning'
import { useUIStore } from '../../stores/ui'
import { useActivityDisclosure } from '../../stores/activityDisclosure'
import { revealSessionProject } from '../projects/revealSessionProject'
import { useConversationDraftStore } from '../../stores/conversationDraft'
import { historyToMessages } from './history'
import type { TimelineAction } from '../activity/turnTimelineReducer'
import { isSessionHidden, partitionSessions } from './sessionVisibility'

/**
 * The Engine lists 50 sessions unless asked for more, and the sidebar only
 * showed those: older chats vanished from it. Its ceiling is 500.
 */
export const SESSION_LIST_LIMIT = 500


export type PrepareSessionResult =
  | { ok: true; session: SessionSummary }
  | { ok: false; reason: 'missing' | 'closed' | 'archived' | 'unavailable'; message: string }

export interface CreateSessionOptions {
  /** `false`: la sesión se crea sin convertirse en la sesión Normal activa (Boards). */
  activate?: boolean
  title?: string
  /** Modo y permisos elegidos en el borrador antes del primer envío. */
  mode?: string
  permissionProfile?: string
}

export type HistoryPhase = 'unloaded' | 'loading' | 'loaded' | 'error'

const EMPTY_SEARCH = { root: '', files: [] as Array<{ path: string; relative_path: string; name: string }> }

/**
 * SessionController: índice de sesiones, sesión Normal activa, historial
 * persistente y mutaciones (modo, permiso, crear, seleccionar).
 *
 * Todas las mutaciones existen en versión con `sessionId` explícito (`*For`);
 * las versiones sin sufijo operan sobre la sesión Normal y son wrappers.
 * Reporta su error por separado para que el shell degrade sin atraparse en el
 * splash.
 */
/** El cambio de rama, medido desde el último trabajo en ese checkout, en el idioma de la app. */
export function branchChangeText(change: BranchChange, lang: Language): string {
  const since = change.since ? new Date(change.since) : null
  const when = since && !Number.isNaN(since.getTime())
    ? since.toLocaleString(lang === 'es' ? 'es' : 'en', { dateStyle: 'medium', timeStyle: 'short' })
    : '—'
  return translate(lang, change.reference === 'last_work' ? 'git.branchChanged.lastWork' : 'git.branchChanged.firstSeen', { from: change.from, to: change.to, when })
}

export function useSessionList(options: {
  dispatch: Dispatch<TimelineAction>
  engineReady: boolean
  timelineEnabled: boolean
  /** Generación del Engine: al cambiar se invalidan cachés de carga. */
  engineGeneration?: number
}) {
  const { dispatch, engineReady, timelineEnabled, engineGeneration = 0 } = options
  /** Filas conocidas por id, en cualquier estado. Una consulta de recientes actualiza pero no borra. */
  const [sessionsById, setSessionsById] = useState<Record<string, SessionSummary>>({})
  /** Orden del último listado (visibles), tal como lo devolvió el Engine. */
  const [recentSessionIds, setRecentSessionIds] = useState<string[]>([])
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
  /** Estado autoritativo de hidratación por sesión. Vacío no significa cargado. */
  const [historyPhases, setHistoryPhases] = useState<Record<string, HistoryPhase>>({})
  /** Cargas de historial en vuelo, compartidas entre callers. */
  const historyInFlight = useRef(new Map<string, Promise<void>>())
  const historyRequests = useRef(new Map<string, symbol>())
  /** Preparaciones en vuelo, compartidas entre la vista Normal y los paneles. */
  const prepareInFlight = useRef(new Map<string, Promise<PrepareSessionResult>>())
  /** Generación de selección Normal: una respuesta tardía no revierte una selección posterior. */
  const selectionGeneration = useRef(0)
  const generationRef = useRef(engineGeneration)

  useEffect(() => {
    if (generationRef.current === engineGeneration) return
    generationRef.current = engineGeneration
    ++selectionGeneration.current
    historyLoaded.current.clear()
    historyInFlight.current.clear()
    historyRequests.current.clear()
    prepareInFlight.current.clear()
    setHistoryPhases({})
    setHistoryInfo({})
  }, [engineGeneration])

  const clearHistoryPhase = useCallback((id: string) => {
    setHistoryPhases((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  /** Activa la sesión Normal marcando carga pendiente en el mismo tick cuando su
   * historial no está cargado: así el primer pintado ya muestra
   * esqueleto y nunca el home transitorio. Único cuello de botella
   * para cambios de sesión Normal (ver select/restore/fork/create). */
  const activate = useCallback((id: string) => {
    if (id !== '' && !historyLoaded.current.has(id)) {
      setHistoryPhases((prev) => ({ ...prev, [id]: 'loading' }))
    }
    setActiveSession(id)
  }, [])

  const sessions = useMemo(
    () =>
      recentSessionIds
        .map((id) => sessionsById[id])
        .filter((row): row is SessionSummary => Boolean(row) && !isSessionHidden(row)),
    [recentSessionIds, sessionsById],
  )

  // Sessions learnt while a listing was in flight (created, opened): that
  // listing may predate them, so it cannot prove they are gone.
  const learntDuring = useRef(new Map<string, number>())
  const rememberRows = useCallback((rows: SessionSummary[]) => {
    for (const row of rows) learntDuring.current.set(row.id, refreshSeq.current)
    if (rows.length === 0) return
    setSessionsById((current) => {
      let changed = false
      const next = { ...current }
      for (const row of rows) {
        if (next[row.id] !== row) {
          next[row.id] = row
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [])

  const forgetMissing = useCallback((rows: SessionSummary[], seq: number) => {
    const present = new Set(rows.map((row) => row.id))
    setSessionsById((current) => {
      const stale = Object.keys(current).filter(
        (id) => !present.has(id) && (learntDuring.current.get(id) ?? 0) < seq,
      )
      if (stale.length === 0) return current
      const next = { ...current }
      for (const id of stale) delete next[id]
      return next
    })
  }, [])

  /** Una sesión que el Engine confirmó que no existe deja de estar en caché. */
  const forgetRow = useCallback((id: string) => {
    learntDuring.current.delete(id)
    setSessionsById((current) => {
      if (!(id in current)) return current
      const next = { ...current }
      delete next[id]
      return next
    })
  }, [])

  const refreshSessions = useCallback(async (): Promise<void> => {
    const seq = ++refreshSeq.current
    try {
      const result = await engineApi.sessions(undefined, true, undefined, undefined, SESSION_LIST_LIMIT)
      if (refreshSeq.current !== seq) return
      // A complete list (under the limit) is authoritative: a session missing
      // from it was deleted —from here or with the Engine command— and its
      // cached row must go, or Boards kept its pane as if it still existed.
      if (result.sessions.length < SESSION_LIST_LIMIT) forgetMissing(result.sessions, seq)
      // El engine expone estados de runtime (active/interrupted/stopped): solo
      // closed/archived se ocultan. Filtrar por `active` hacía que una sesión
      // interrumpida (p. ej. timeout de provider) desapareciera del sidebar al
      // refrescar, como ocurre tras un cambio de modelo.
      const { visible, closed, archived } = partitionSessions(result.sessions)
      const normalized = visible
      rememberRows(result.sessions)
      setHistoryPhases((current) => {
        const next = { ...current }
        for (const row of result.sessions) {
          if (!(row.id in next) && !historyLoaded.current.has(row.id)) next[row.id] = 'unloaded'
        }
        return next
      })
      setRecentSessionIds(normalized.map((item) => item.id))
      setClosedSessions(closed)
      setArchivedSessions(archived)
      setSessionsError(null)
      setActiveSession((current) => {
        if (current !== '' && normalized.some((s) => s.id === current)) return current
        // Una conversación nueva en borrador no es «ninguna sesión»: se queda.
        if (current === '' && useConversationDraftStore.getState().normal) return ''
        return normalized[0]?.id ?? ''
      })
    } catch (err) {
      if (refreshSeq.current !== seq) return
      setSessionsError(commandMessage(err))
      toast.error(commandMessage(err))
    } finally {
      if (refreshSeq.current === seq) setSessionsLoaded(true)
    }
  }, [forgetMissing, rememberRows])

  const loadSessionHistory = useCallback(
    (id: string): Promise<void> => {
      if (!id) return Promise.resolve()
      if (historyLoaded.current.has(id)) return historyInFlight.current.get(id) ?? Promise.resolve()
      historyLoaded.current.add(id)
      const generation = generationRef.current
      const request = Symbol(id)
      historyRequests.current.set(id, request)
      const isCurrent = () => generationRef.current === generation && historyRequests.current.get(id) === request
      setHistoryPhases((prev) => ({ ...prev, [id]: 'loading' }))
      const job = (async () => {
        try {
          const [history, timeline] = await Promise.all([
            engineApi.sessionHistory(id),
            timelineEnabled ? engineApi.sessionTimeline(id).catch(() => null) : Promise.resolve(null),
          ])
          if (!isCurrent()) return
          setHistoryInfo((prev) => ({
            ...prev,
            [id]: { total: history.total, hasMore: history.has_more },
          }))
          const persisted = historyToMessages(history.messages)
          // Lo vivo siempre gana a un fetch de historial que llega tarde.
          dispatch({ type: 'history/loaded', sessionId: id, messages: persisted })
          if (timeline) dispatch({ type: 'timeline/loaded', sessionId: id, turns: timeline.turns })
          setHistoryPhases((prev) => ({ ...prev, [id]: 'loaded' }))
        } catch (err) {
          if (!isCurrent()) return
          historyLoaded.current.delete(id)
          setHistoryPhases((prev) => ({ ...prev, [id]: 'error' }))
          toast.error(commandMessage(err))
        }
      })()
      historyInFlight.current.set(id, job)
      void job.finally(() => {
        if (historyInFlight.current.get(id) === job) historyInFlight.current.delete(id)
      })
      return job
    },
    [dispatch, timelineEnabled],
  )

  const retrySessionHistory = useCallback((id: string): Promise<void> => {
    historyLoaded.current.delete(id)
    historyInFlight.current.delete(id)
    return loadSessionHistory(id)
  }, [loadSessionHistory])

  useEffect(() => {
    if (!engineReady || activeSession === '') return
    void loadSessionHistory(activeSession)
  }, [engineReady, activeSession, engineGeneration, loadSessionHistory])

  // Folders whose trust is being asked right now: the dialog explains it, and
  // the warning only makes sense if the answer is "later".
  const trustAsked = useRef(new Set<string>())
  const deferTrustWarning = useCallback((root: string) => {
    trustAsked.current.add(root)
    return () => { trustAsked.current.delete(root) }
  }, [])

  const reportWarnings = useCallback((id: string, opened: { session: SessionSummary; warnings?: string[]; trust_state?: TrustState | null; branch_change?: BranchChange | null }) => {
    for (const warning of new Set(opened.warnings ?? [])) {
      // Working-tree drift is normal project state and already appears in
      // the Git surface. Do not present it as an application error.
      if (warning.startsWith('[working-tree]')) continue
      if (warning.startsWith('[trust]')) {
        const root = opened.session.project_root
        if (root && trustAsked.current.has(root)) continue
        warnUntrusted(root, opened.trust_state, `project-trust-${opened.session.project_id ?? opened.session.project_root ?? id}`)
        continue
      }
      if (warning.startsWith('[git-branch]') && opened.branch_change) {
        toast.warning(branchChangeText(opened.branch_change, useUIStore.getState().lang), { id: `session-warning-${id}-${warning}` })
        continue
      }
      toast.warning(warning, { id: `session-warning-${id}-${warning}` })
    }
  }, [])

  /** `session.open` reanuda/restaura: la fila del engine es autoritativa (no
   * inventar `state: 'active'`) y no puede quedar duplicada en las bandejas. */
  const rememberOpened = useCallback(
    (opened: { session: SessionSummary }) => {
      rememberRows([opened.session])
      if (!isSessionHidden(opened.session)) {
        setRecentSessionIds((current) =>
          current.includes(opened.session.id) ? current : [opened.session.id, ...current],
        )
      }
      setClosedSessions((current) => current.filter((item) => item.id !== opened.session.id))
      setArchivedSessions((current) => current.filter((item) => item.id !== opened.session.id))
    },
    [rememberRows],
  )

  /**
   * Resuelve una sesión de forma autoritativa (`session.get`), la reconcilia
   * (`session.open`) solo si está activa y carga su historial. No modifica la
   * sesión Normal activa, el foco del board ni el borrador. Las llamadas
   * concurrentes para el mismo id comparten la misma promesa.
   */
  const prepareSession = useCallback(
    (id: string): Promise<PrepareSessionResult> => {
      const pending = prepareInFlight.current.get(id)
      if (pending) return pending
      const generation = generationRef.current
      const stale = (): PrepareSessionResult => ({ ok: false, reason: 'unavailable', message: translate(useUIStore.getState().lang, 'engine.restarted') })
      const job = (async (): Promise<PrepareSessionResult> => {
        let row: SessionSummary
        try {
          row = (await engineApi.sessionGet(id)).session
        } catch (err) {
          if (isCommandError(err) && (err.code === 'NOT_FOUND' || err.code === 'SESSION_NOT_FOUND')) {
            // Se borró por fuera de esta lista (el CLI, otra ventana, el
            // bridge): dejarla como activa conservaba sus paneles de Boards
            // como «Session not found». Sin ella, Boards la reconcilia.
            forgetRow(id)
            return { ok: false, reason: 'missing', message: commandMessage(err) }
          }
          return { ok: false, reason: 'unavailable', message: commandMessage(err) }
        }
        if (generationRef.current !== generation) return stale()
        rememberRows([row])
        if (row.state === 'closed') return { ok: false, reason: 'closed', message: row.title ?? row.id }
        if (row.state === 'archived') return { ok: false, reason: 'archived', message: row.title ?? row.id }
        try {
          const opened = await engineApi.openSession(id)
          if (generationRef.current !== generation) return stale()
          rememberOpened(opened)
          reportWarnings(id, opened)
          await loadSessionHistory(id)
          if (generationRef.current !== generation) return stale()
          return { ok: true, session: opened.session }
        } catch (err) {
          return { ok: false, reason: 'unavailable', message: commandMessage(err) }
        }
      })()
      prepareInFlight.current.set(id, job)
      void job.finally(() => {
        if (prepareInFlight.current.get(id) === job) prepareInFlight.current.delete(id)
      })
      return job
    },
    [forgetRow, loadSessionHistory, rememberOpened, rememberRows, reportWarnings],
  )

  /** Selecciona la sesión Normal: reconcile (open) + historial persistente una vez. */
  const selectSession = useCallback(
    async (id: string): Promise<void> => {
      const previous = activeSession
      const generation = ++selectionGeneration.current
      const engine = generationRef.current
      activate(id)
      try {
        const opened = await engineApi.openSession(id)
        if (generationRef.current !== engine) return
        rememberOpened(opened)
        reportWarnings(id, opened)
      } catch (err) {
        if (generationRef.current !== engine) return
        // A stale failure must not undo a newer selection.
        if (selectionGeneration.current === generation) {
          setActiveSession(previous)
          clearHistoryPhase(id)
        }
        toast.error(commandMessage(err))
        return
      }
      await loadSessionHistory(id)
    },
    [activate, activeSession, clearHistoryPhase, loadSessionHistory, rememberOpened, reportWarnings],
  )

  const createSession = useCallback(async (projectId?: string, options: CreateSessionOptions = {}): Promise<string | null> => {
    const shouldActivate = options.activate ?? true
    try {
      const result = await engineApi.createSession({
        project_id: projectId,
        chat: !projectId,
        title: options.title ?? translate(useUIStore.getState().lang, 'sidebar.newChat'),
        mode: options.mode ?? 'build',
        permission_profile: options.permissionProfile ?? 'workspace',
      })
      rememberRows([result.session])
      setRecentSessionIds((current) => [result.session.id, ...current.filter((item) => item !== result.session.id)])
      historyLoaded.current.add(result.session.id)
      setHistoryPhases((current) => ({ ...current, [result.session.id]: 'loaded' }))
      if (shouldActivate) activate(result.session.id)
      await revealSessionProject(result.session)
      void refreshSessions()
      return result.session.id
    } catch (err) {
      toast.error(commandMessage(err))
      return null
    }
  }, [activate, refreshSessions, rememberRows])

  /** Cierra: oculta del listado; volver a abrirla la restaura. Resultado explícito. */
  const closeSession = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await engineApi.closeSession(id)
        await refreshSessions()
        return true
      } catch (err) {
        toast.error(commandMessage(err))
        return false
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

  const pinSession = useCallback(async (id: string, pinned: boolean): Promise<void> => {
    try {
      await engineApi.pinSession(id, pinned)
      await refreshSessions()
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }, [refreshSessions])

  const archiveSession = useCallback(async (id: string): Promise<boolean> => {
    try {
      await engineApi.archiveSession(id)
      await refreshSessions()
      return true
    } catch (err) {
      toast.error(commandMessage(err))
      return false
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
        useActivityDisclosure.getState().forgetSession(id)
        forgetRow(id)
        await refreshSessions()
        return result
      } catch (err) {
        toast.error(commandMessage(err))
        return null
      }
    },
    [forgetRow, refreshSessions],
  )

  /** Cambia PLAN/BUILD/REVIEW de una sesión concreta. Tareas y contexto intactos. */
  const setModeFor = useCallback(
    async (sessionId: string, mode: string): Promise<boolean> => {
      if (sessionId === '') return false
      try {
        const result = await engineApi.setSessionMode(sessionId, mode)
        if (result?.session) rememberRows([result.session])
        await refreshSessions()
        return true
      } catch (err) {
        toast.error(commandMessage(err))
        return false
      }
    },
    [refreshSessions, rememberRows],
  )

  const setPermissionFor = useCallback(
    async (sessionId: string, profile: string): Promise<boolean> => {
      if (sessionId === '') return false
      try {
        const result = await engineApi.setSessionPermission(sessionId, profile)
        if (result?.session) rememberRows([result.session])
        await refreshSessions()
        return true
      } catch (err) {
        toast.error(commandMessage(err))
        return false
      }
    },
    [refreshSessions, rememberRows],
  )

  const searchFilesFor = useCallback(
    (sessionId: string, query: string) =>
      sessionId ? engineApi.searchWorkspaceFiles(sessionId, query) : Promise.resolve(EMPTY_SEARCH),
    [],
  )

  const setMode = useCallback((mode: string) => setModeFor(activeSession, mode).then(() => undefined), [activeSession, setModeFor])
  const setPermission = useCallback((profile: string) => setPermissionFor(activeSession, profile).then(() => undefined), [activeSession, setPermissionFor])
  const searchFiles = useCallback((query: string) => searchFilesFor(activeSession, query), [activeSession, searchFilesFor])

  return {
    sessions,
    sessionsById,
    activeSession,
    setActiveSession,
    sessionsLoaded,
    sessionsError,
    historyInfo,
    historyPhases,
    closedSessions,
    archivedSessions,
    refreshSessions,
    loadSessionHistory,
    retrySessionHistory,
    ensureHistoryLoaded: loadSessionHistory,
    deferTrustWarning,
    prepareSession,
    selectSession,
    createSession,
    closeSession,
    renameSession,
    pinSession,
    archiveSession,
    restoreSession,
    forkSession,
    deleteSession,
    setModeFor,
    setPermissionFor,
    searchFilesFor,
    setMode,
    setPermission,
    searchFiles,
  }
}

export type SessionList = ReturnType<typeof useSessionList>
