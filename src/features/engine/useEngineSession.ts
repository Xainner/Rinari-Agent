import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { commandMessage, engineApi, prepareAttachmentRefs, prepareAttachmentRefsWithJob, type ModelSummary } from '../../services/engine'
import type { AttachmentRef } from '../../types'
import { useCatalog } from './useCatalog'
import { useEngineConnection } from './useEngineConnection'
import { useProjects } from '../projects/useProjects'
import { useSessionList } from './useSessionList'
import { useTurnRuntime } from './useTurnRuntime'
import { useComposerStore } from '../../stores/composer'

/**
 * Composición del estado de engine. Cada dominio vive en su hook:
 * conexión, sesiones, runtime de turnos (reducer) y catálogo. Aquí solo
 * queda la orquestación entre dominios (arranque, envío, modelo) con la
 * misma forma de retorno que consumen App y EngineConsole.
 */
export function useEngineSession() {
  const { t } = useI18n()
  const [reasoningEffort, setReasoningEffort] = useState<import('../../lib/reasoning').ReasoningEffort>('off')

  const connection = useEngineConnection()
  // El runtime avisa (turn.completed, mode/model changed) y eso refresca la
  // lista de sesiones. El ref evita la dependencia circular en construcción:
  // sessions necesita dispatch y runtime necesita el refresh de sessions.
  const sessionsChangedRef = useRef<() => void>(() => {})
  const runtime = useTurnRuntime({ onSessionsChanged: () => sessionsChangedRef.current() })
  const sessions = useSessionList({
    dispatch: runtime.dispatch,
    engineReady: connection.ready,
    timelineEnabled: connection.status?.capabilities.activity_timeline_v1 === true,
  })
  const projects = useProjects({ engineReady: connection.ready })
  const catalog = useCatalog()
  const attachmentJobsRef = useRef(new Map<string, string>())

  useEffect(() => {
    sessionsChangedRef.current = sessions.refreshSessions
  }, [sessions.refreshSessions])

  useEffect(() => {
    if (connection.ready) void catalog.refreshCatalog(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.ready])

  const activeRecord = sessions.sessions.find((session) => session.id === sessions.activeSession)
  const activeProjectRoot =
    activeRecord?.kind === 'PROJECT' ? (activeRecord.project_root ?? null) : null

  /** Git vivo: una consulta deduplicada únicamente cuando cambia la raíz activa. */
  useEffect(() => {
    if (connection.ready && activeProjectRoot) void projects.loadStatus(activeProjectRoot)
  }, [activeProjectRoot, connection.ready, projects.loadStatus])

  useEffect(() => {
    if (!activeProjectRoot) return
    const refresh = () => void projects.loadStatus(activeProjectRoot, true)
    window.addEventListener('rinari-workspace-refresh', refresh)
    return () => window.removeEventListener('rinari-workspace-refresh', refresh)
  }, [activeProjectRoot, projects.loadStatus])

  async function startEngine(): Promise<void> {
    const next = await connection.start()
    if (next?.state === 'ready') {
      await sessions.refreshSessions()
      await runtime.restoreSnapshot()
    }
  }

  async function restartEngine(): Promise<void> {
    const next = await connection.restart()
    if (next?.state === 'ready') {
      await sessions.refreshSessions()
      await runtime.restoreSnapshot()
    }
  }

  async function shutdownEngine(): Promise<void> {
    await connection.shutdown()
  }

  /** Envía: crea sesión si no hay activa, añade el mensaje y abre el turno. */
  async function send(text: string, attachments: AttachmentRef[] = []): Promise<boolean> {
    const trimmed = text.trim()
    const currentId = sessions.activeSession
    const busy = currentId !== '' && runtime.busySessions.has(currentId)
    if (trimmed === '' || busy) return false
    let sessionId = currentId
    if (sessionId === '') {
      const created = await sessions.createSession()
      if (!created) return false
      sessionId = created
    }
    if (!sessionId) {
      toast.error(t('chat.noSession'))
      return false
    }
    let preparedAttachments = attachments
    if (attachments.length > 0) {
      try {
        preparedAttachments = await prepareAttachmentRefs(sessionId, attachments)
      } catch (err) {
        toast.error(commandMessage(err))
        return false
      }
    }
    runtime.dispatch({
      type: 'message/sent',
      sessionId,
      message: { id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`, role: 'user', content: trimmed, createdAt: Date.now(), attachments: preparedAttachments },
    })
    runtime.dispatch({ type: 'busy/set', sessionId, busy: true })
    try {
      const started = await engineApi.startTurn(
        sessionId,
        trimmed,
        reasoningEffort === 'off' ? null : reasoningEffort,
        preparedAttachments,
      )
      runtime.dispatch({ type: 'turn/ack', turnId: started.turn_id, sessionId, now: Date.now() })
      return true
    } catch (err) {
      toast.error(commandMessage(err))
      runtime.dispatch({ type: 'busy/set', sessionId, busy: false })
      return false
    }
  }

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
    const ids = attachments.map((attachment) => attachment.id)
    try {
      return await prepareAttachmentRefsWithJob(sessionId, attachments, {
        onJobId: (jobId) => ids.forEach((id) => attachmentJobsRef.current.set(id, jobId)),
      })
    } finally {
      ids.forEach((id) => attachmentJobsRef.current.delete(id))
    }
  }

  async function cancelAttachmentPreparation(attachments: AttachmentRef[]): Promise<void> {
    const jobs = new Set(attachments.map((attachment) => attachmentJobsRef.current.get(attachment.id)).filter((id): id is string => Boolean(id)))
    attachments.forEach((attachment) => attachmentJobsRef.current.delete(attachment.id))
    await Promise.allSettled([...jobs].map((jobId) => engineApi.attachmentPrepareCancel(jobId)))
  }

  async function cancelTurn(): Promise<void> {
    await runtime.cancelTurn(sessions.activeSession)
  }

  async function useModel(model: ModelSummary): Promise<void> {
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
      await engineApi.modelUse(selected.alias, selected.provider ?? undefined)
      if (sessions.activeSession) {
        await engineApi.setSessionModel(sessions.activeSession, selected.id, selected.provider ?? undefined)
      }
      await catalog.refreshCatalog()
      await sessions.refreshSessions()
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  const messages =
    sessions.activeSession !== '' ? (runtime.threads[sessions.activeSession] ?? []) : []
  const busy = sessions.activeSession !== '' && runtime.busySessions.has(sessions.activeSession)
  const activeGitStatus = activeProjectRoot ? (projects.statusByRoot[activeProjectRoot] ?? null) : null
  const activeGitError = activeProjectRoot
    ? (projects.statusErrorByRoot[activeProjectRoot] ?? null)
    : null

  return {
    status: connection.status,
    connectionEpoch: connection.epoch,
    processesCapability: connection.status?.capabilities.desktop_processes_v1 === true,
    sessions: sessions.sessions,
    activeSession: sessions.activeSession,
    setActiveSession: sessions.setActiveSession,
    messages,
    approvals: runtime.approvals,
    busy,
    busySessionIds: runtime.busySessions,
    reasoningEffort,
    setReasoningEffort,
    ready: connection.ready,
    refreshStatus: connection.refreshStatus,
    refreshSessions: sessions.refreshSessions,
    startEngine,
    shutdownEngine,
    restartEngine,
    createSession: sessions.createSession,
    send,
    prepareAttachments,
    cancelAttachmentPreparation,
    implementPlan: async () => {
      if (!sessions.activeSession || runtime.busySessions.has(sessions.activeSession)) return false
      try {
        await engineApi.setSessionMode(sessions.activeSession, 'build')
        await sessions.refreshSessions()
        return await send('Implementa el plan propuesto en el turno anterior. Continúa en BUILD y verifica los cambios.')
      } catch (err) {
        toast.error(commandMessage(err))
        return false
      }
    },
    cancelTurn,
    resolveApproval: runtime.resolveApproval,
    providers: catalog.providers,
    models: catalog.models,
    catalogLoaded: catalog.catalogLoaded,
    sessionsLoaded: sessions.sessionsLoaded,
    sessionsError: sessions.sessionsError,
    catalogError: catalog.catalogError,
    activeModel:
      catalog.models.find(
        (model) => model.id === sessions.sessions.find((session) => session.id === sessions.activeSession)?.model_id,
      ) ??
      catalog.models.find((model) => model.active) ??
      null,
    refreshCatalog: catalog.refreshCatalog,
    discoverCatalog: catalog.discoverCatalog,
    useModel,
    selectSession: sessions.selectSession,
    setMode: sessions.setMode,
    timelines: runtime.timelines,
    setPermission: sessions.setPermission,
    searchFiles: sessions.searchFiles,
    historyInfo: sessions.historyInfo,
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
