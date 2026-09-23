import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { commandMessage, engineApi, prepareAttachmentRefs, prepareAttachmentRefsWithJob, type ModelSummary } from '../../services/engine'
import type { AttachmentRef } from '../../types'
import type { ReasoningEffort } from '../../lib/reasoning'
import { useCatalog } from './useCatalog'
import { useEngineConnection } from './useEngineConnection'
import { useProjects } from '../projects/useProjects'
import { useProjectRootWatch } from '../projects/useProjectRootWatch'
import { useSessionList } from './useSessionList'
import { useTurnRuntime } from './useTurnRuntime'
import { selectSessionModel } from './sessionSelectors'
import { useComposerStore } from '../../stores/composer'
import { useSessionUiStore } from '../../stores/sessionUi'

export interface SendOptions {
  reasoningEffort?: ReasoningEffort
}

export interface UseModelOptions {
  /** Solo la vista Normal fija además el default global del Engine. */
  setGlobalDefault?: boolean
}

const IMPLEMENT_PLAN_PROMPT =
  'Implementa el plan propuesto en el turno anterior. Continúa en BUILD y verifica los cambios.'

/**
 * Composición del estado de engine. Cada dominio vive en su hook:
 * conexión, sesiones, runtime de turnos (store + reducer) y catálogo. Aquí
 * queda la orquestación entre dominios (arranque, envío, modelo).
 *
 * Toda operación existe con `sessionId` explícito (`sendTo`, `useModelFor`,
 * `cancelTurnFor`, …). Las funciones sin sufijo son wrappers sobre la sesión
 * Normal activa, cuya identidad se captura al iniciar cada operación.
 */
export function useEngineSession() {
  const { t } = useI18n()

  const connection = useEngineConnection()
  // El runtime avisa (turn.completed, mode/model changed) y eso refresca la
  // lista de sesiones. El ref evita la dependencia circular en construcción:
  // sessions necesita dispatch y runtime necesita el refresh de sessions.
  const sessionsChangedRef = useRef<() => void>(() => {})
  const runtime = useTurnRuntime({ onSessionsChanged: () => sessionsChangedRef.current() })
  const [engineGeneration, setEngineGeneration] = useState(0)
  const sessions = useSessionList({
    dispatch: runtime.dispatch,
    engineReady: connection.ready,
    timelineEnabled: connection.status?.capabilities.activity_timeline_v1 === true,
    engineGeneration,
  })
  const projects = useProjects({ engineReady: connection.ready })
  const catalog = useCatalog()
  const attachmentJobsRef = useRef(new Map<string, string>())
  /** Admisión de envío por sesión: dos clics antes del siguiente render no crean dos turnos. */
  const sendLocks = useRef(new Set<string>())
  /** Cambios de modelo serializados por sesión: no aplicar respuestas en orden inverso. */
  const modelChangeChain = useRef(new Map<string, Promise<void>>())

  useEffect(() => {
    sessionsChangedRef.current = sessions.refreshSessions
  }, [sessions.refreshSessions])

  useEffect(() => {
    if (connection.ready) void catalog.refreshCatalog(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.ready])

  const activeRecord = sessions.sessionsById[sessions.activeSession]
  const activeProjectRoot =
    activeRecord?.kind === 'PROJECT' ? (activeRecord.project_root ?? null) : null

  /** Git vivo de la raíz Normal activa; los paneles del board vigilan la suya. */
  useProjectRootWatch(activeProjectRoot, projects.loadStatus, { enabled: connection.ready })

  const afterEngineReady = useCallback(async () => {
    runtime.resetForNewEngine()
    setEngineGeneration((value) => value + 1)
    await sessions.refreshSessions()
    await runtime.restoreSnapshot()
  }, [runtime, sessions.refreshSessions])

  async function startEngine(): Promise<void> {
    const next = await connection.start()
    if (next?.state === 'ready') await afterEngineReady()
  }

  async function restartEngine(): Promise<void> {
    const next = await connection.restart()
    if (next?.state === 'ready') await afterEngineReady()
  }

  async function shutdownEngine(): Promise<void> {
    await connection.shutdown()
  }

  // -- envío -------------------------------------------------------------------

  /**
   * Envía a una sesión concreta. Captura la identidad al inicio; un cambio de
   * foco posterior no redirige el resultado. El Engine sigue teniendo la
   * última palabra (`TURN_RUNNING`).
   */
  const sendTo = useCallback(async (
    sessionId: string,
    text: string,
    attachments: AttachmentRef[] = [],
    options: SendOptions = {},
  ): Promise<boolean> => {
    const trimmed = text.trim()
    if (!sessionId) {
      toast.error(t('chat.noSession'))
      return false
    }
    if (trimmed === '' && attachments.length === 0) return false
    if (runtime.store.getState().busySessions.has(sessionId) || sendLocks.current.has(sessionId)) return false
    sendLocks.current.add(sessionId)
    const effort = options.reasoningEffort ?? useSessionUiStore.getState().reasoningFor(sessionId)
    try {
      let preparedAttachments = attachments
      if (attachments.length > 0) {
        try {
          preparedAttachments = await prepareAttachmentRefs(sessionId, attachments)
        } catch (err) {
          toast.error(commandMessage(err))
          return false
        }
      }
      // Re-check after the await: another caller may have started a turn.
      if (runtime.store.getState().busySessions.has(sessionId)) return false
      const optimisticId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
      runtime.dispatch({
        type: 'message/sent',
        sessionId,
        message: { id: optimisticId, role: 'user', content: trimmed, createdAt: Date.now(), attachments: preparedAttachments },
      })
      runtime.dispatch({ type: 'busy/set', sessionId, busy: true })
      try {
        const started = await engineApi.startTurn(
          sessionId,
          trimmed,
          effort === 'off' ? null : effort,
          preparedAttachments,
        )
        runtime.dispatch({ type: 'turn/ack', turnId: started.turn_id, sessionId, now: Date.now() })
        return true
      } catch (err) {
        toast.error(commandMessage(err))
        runtime.dispatch({ type: 'busy/set', sessionId, busy: false })
        return false
      }
    } finally {
      sendLocks.current.delete(sessionId)
    }
  }, [runtime, t])

  /** Envía a la sesión Normal: crea sesión si no hay activa. */
  async function send(text: string, attachments: AttachmentRef[] = []): Promise<boolean> {
    let sessionId = sessions.activeSession
    if (sessionId === '') {
      if (text.trim() === '' && attachments.length === 0) return false
      const created = await sessions.createSession()
      if (!created) return false
      sessionId = created
    }
    return sendTo(sessionId, text, attachments)
  }

  const prepareAttachmentsFor = useCallback(async (sessionId: string, attachments: AttachmentRef[]): Promise<AttachmentRef[]> => {
    if (attachments.length === 0 || !sessionId) return attachments
    const ids = attachments.map((attachment) => attachment.id)
    try {
      return await prepareAttachmentRefsWithJob(sessionId, attachments, {
        onJobId: (jobId) => ids.forEach((id) => attachmentJobsRef.current.set(id, jobId)),
      })
    } finally {
      ids.forEach((id) => attachmentJobsRef.current.delete(id))
    }
  }, [])

  async function prepareAttachments(attachments: AttachmentRef[]): Promise<AttachmentRef[]> {
    if (attachments.length === 0) return attachments
    let sessionId = sessions.activeSession
    if (!sessionId) {
      const draftSessionKey = useComposerStore.getState().sessionKey
      const created = await sessions.createSession()
      if (!created) return attachments
      sessionId = created
      // Attachments can be selected from the start screen before a session
      // exists. Move that draft into the newly created session immediately;
      // otherwise the Composer's session effect could replace it during the
      // asynchronous preparation job.
      useComposerStore.getState().moveDraft(draftSessionKey, created)
    }
    return prepareAttachmentsFor(sessionId, attachments)
  }

  const cancelAttachmentPreparationFor = useCallback(async (_sessionId: string, attachments: AttachmentRef[]): Promise<void> => {
    const jobs = new Set(attachments.map((attachment) => attachmentJobsRef.current.get(attachment.id)).filter((id): id is string => Boolean(id)))
    attachments.forEach((attachment) => attachmentJobsRef.current.delete(attachment.id))
    await Promise.allSettled([...jobs].map((jobId) => engineApi.attachmentPrepareCancel(jobId)))
  }, [])

  async function cancelAttachmentPreparation(attachments: AttachmentRef[]): Promise<void> {
    await cancelAttachmentPreparationFor(sessions.activeSession, attachments)
  }

  const cancelTurnFor = useCallback(async (sessionId: string): Promise<void> => {
    await runtime.cancelTurn(sessionId)
  }, [runtime])

  async function cancelTurn(): Promise<void> {
    await cancelTurnFor(sessions.activeSession)
  }

  // -- modelo ------------------------------------------------------------------

  /**
   * Fija el modelo de una sesión. Con `setGlobalDefault` (solo Normal) también
   * cambia el default del Engine para sesiones nuevas. Serializado por sesión.
   */
  const useModelFor = useCallback((sessionId: string, model: ModelSummary, options: UseModelOptions = {}): Promise<boolean> => {
    const previous = modelChangeChain.current.get(sessionId) ?? Promise.resolve()
    const job = previous.then(async () => {
      try {
        let selected = model
        if (model.saved === false) {
          if (!model.provider) throw new Error('Provider missing for discovered model')
          const added = await engineApi.modelAdd({
            provider: model.provider,
            provider_model_id: model.provider_model_id,
            alias: model.provider_model_id,
          })
          selected = added.model
        }
        if (options.setGlobalDefault) await engineApi.modelUse(selected.alias, selected.provider ?? undefined)
        if (sessionId) await engineApi.setSessionModel(sessionId, selected.id, selected.provider ?? undefined)
        if (options.setGlobalDefault || model.saved === false) await catalog.refreshCatalog()
        await sessions.refreshSessions()
        return true
      } catch (err) {
        toast.error(commandMessage(err))
        return false
      }
    })
    const chained = job.then(() => undefined, () => undefined)
    modelChangeChain.current.set(sessionId, chained)
    void chained.finally(() => {
      if (modelChangeChain.current.get(sessionId) === chained) modelChangeChain.current.delete(sessionId)
    })
    return job
  }, [catalog, sessions.refreshSessions])

  /** Vista Normal: conserva el comportamiento histórico (default global + sesión activa). */
  async function useModel(model: ModelSummary): Promise<void> {
    await useModelFor(sessions.activeSession, model, { setGlobalDefault: true })
  }

  // -- plan --------------------------------------------------------------------

  const implementPlanFor = useCallback(async (sessionId: string): Promise<boolean> => {
    if (!sessionId || runtime.store.getState().busySessions.has(sessionId)) return false
    try {
      const ok = await sessions.setModeFor(sessionId, 'build')
      if (!ok) return false
      return await sendTo(sessionId, IMPLEMENT_PLAN_PROMPT)
    } catch (err) {
      toast.error(commandMessage(err))
      return false
    }
  }, [runtime, sendTo, sessions.setModeFor])

  // -- lectura por sesión -------------------------------------------------------

  const activeModelFor = useCallback((sessionId: string): ModelSummary | null =>
    selectSessionModel(catalog.models, sessions.sessionsById[sessionId]), [catalog.models, sessions.sessionsById])

  const isBusy = useCallback((sessionId: string): boolean =>
    sessionId !== '' && runtime.store.getState().busySessions.has(sessionId), [runtime])

  /** Vista Normal: "cargando historial" se distingue de "vacía" para no
   * mostrar el home de forma transitoria (esqueleto de sesión). */
  const historyPhase = sessions.activeSession !== ''
    ? (sessions.historyPhases[sessions.activeSession] ?? 'unloaded')
    : 'loaded'
  const activeGitStatus = activeProjectRoot ? (projects.statusByRoot[activeProjectRoot] ?? null) : null
  const activeGitError = activeProjectRoot
    ? (projects.statusErrorByRoot[activeProjectRoot] ?? null)
    : null

  // Normal keeps its historical semantics: a session with no explicit model
  // shows the global default as the effective choice.
  const activeModel = useMemo(
    () => selectSessionModel(catalog.models, activeRecord) ?? catalog.models.find((model) => model.active) ?? null,
    [catalog.models, activeRecord],
  )

  return {
    status: connection.status,
    connectionEpoch: connection.epoch,
    processesCapability: connection.status?.capabilities.desktop_processes_v1 === true,
    processesIdentityCapability: connection.status?.capabilities.process_identity_v1 === true,
    runtime: runtime.store,
    engineGeneration,
    sessions: sessions.sessions,
    sessionsById: sessions.sessionsById,
    activeSession: sessions.activeSession,
    setActiveSession: sessions.setActiveSession,
    approvals: runtime.approvals,
    busySessionIds: runtime.busySessions,
    ready: connection.ready,
    refreshStatus: connection.refreshStatus,
    refreshSessions: sessions.refreshSessions,
    startEngine,
    shutdownEngine,
    restartEngine,
    createSession: sessions.createSession,
    prepareSession: sessions.prepareSession,
    ensureSessionReady: sessions.prepareSession,
    ensureHistoryLoaded: sessions.ensureHistoryLoaded,
    retryHistoryFor: sessions.retrySessionHistory,
    retryHistory: () => sessions.retrySessionHistory(sessions.activeSession),
    send,
    sendTo,
    prepareAttachments,
    prepareAttachmentsFor,
    cancelAttachmentPreparation,
    cancelAttachmentPreparationFor,
    implementPlan: () => implementPlanFor(sessions.activeSession),
    implementPlanFor,
    cancelTurn,
    cancelTurnFor,
    resolveApproval: runtime.resolveApproval,
    providers: catalog.providers,
    models: catalog.models,
    catalogLoaded: catalog.catalogLoaded,
    sessionsLoaded: sessions.sessionsLoaded,
    sessionsError: sessions.sessionsError,
    catalogError: catalog.catalogError,
    activeModel,
    activeModelFor,
    isBusy,
    refreshCatalog: catalog.refreshCatalog,
    discoverCatalog: catalog.discoverCatalog,
    useModel,
    useModelFor,
    selectSession: sessions.selectSession,
    setMode: sessions.setMode,
    setModeFor: sessions.setModeFor,
    setPermission: sessions.setPermission,
    setPermissionFor: sessions.setPermissionFor,
    searchFiles: sessions.searchFiles,
    searchFilesFor: sessions.searchFilesFor,
    historyInfo: sessions.historyInfo,
    historyPhases: sessions.historyPhases,
    historyPhase,
    closedSessions: sessions.closedSessions,
    archivedSessions: sessions.archivedSessions,
    closeSession: sessions.closeSession,
    renameSession: sessions.renameSession,
    archiveSession: sessions.archiveSession,
    restoreSession: sessions.restoreSession,
    forkSession: sessions.forkSession,
    deleteSession: sessions.deleteSession,
    projects: projects.projects,
    archivedProjects: projects.archivedProjects,
    projectsError: projects.projectsError,
    refreshProjects: projects.refreshProjects,
    openProject: projects.openProject,
    updateProject: projects.updateProject,
    removeProject: projects.removeProject,
    loadProjectStatus: projects.loadStatus,
    loadProjectIntelligence: projects.loadIntelligence,
    trustProject: projects.trustProject,
    projectStatusByRoot: projects.statusByRoot,
    projectStatusErrorByRoot: projects.statusErrorByRoot,
    projectIntelByRoot: projects.intelByRoot,
    activeProjectRoot,
    activeGitStatus,
    activeGitError,
  }
}

export type EngineSession = ReturnType<typeof useEngineSession>
