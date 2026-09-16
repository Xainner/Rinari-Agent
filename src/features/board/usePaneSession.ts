import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AttachmentRef, ChatMessage, PendingApproval } from '../../types'
import type { ModelSummary, ProjectSummary, ProjectStatus, SessionSummary } from '../../services/engine'
import type { ReasoningEffort } from '../../lib/reasoning'
import type { TurnTimeline } from '../activity/types'
import { useEngineCommands, useEngineData, useRuntimeStore } from '../engine/EngineContext'
import {
  derivePaneStatus,
  samePaneStatus,
  selectSessionModel,
  useSessionApprovals,
  useSessionBusy,
  useSessionThread,
  useSessionTimelines,
  type PaneAvailabilityState,
  type PaneStatus,
} from '../engine/sessionSelectors'
import { unreadPeerCount, unreadResultCount, unreadTurnIds, useBoardAttentionStore } from '../../stores/boardAttention'
import { useProjectRootWatch } from '../projects/useProjectRootWatch'
import { usePendingQuestions } from '../questions/usePendingQuestions'
import { selectReasoning, useSessionUiStore } from '../../stores/sessionUi'
import type { PrepareSessionResult } from '../engine/useSessionList'

export type PaneAvailability =
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'closed' | 'archived' | 'missing' | 'unavailable'; message: string }

export interface PaneSession {
  sessionId: string
  record: SessionSummary | null
  project: ProjectSummary | null
  projectRoot: string | null
  messages: ChatMessage[]
  timelines: Record<string, TurnTimeline>
  busy: boolean
  approvals: PendingApproval[]
  pendingQuestions: number
  /** Modelo fijado en la sesión; `null` si no existe en el catálogo. */
  activeModel: ModelSummary | null
  gitStatus: ProjectStatus | null
  gitError: string | null
  availability: PaneAvailability
  /** Estado derivado (§8.5): actividad, último resultado, lectura y disponibilidad. */
  status: PaneStatus
  /** Ids de turnos con resultado sin leer, en el orden del registro. */
  unreadTurnIds: string[]
  markSeen: (turnId: string) => void
  /** Marca como leídos los resultados conocidos al pulsar; nunca turnos futuros. */
  markAllSeen: () => void
  reasoningEffort: ReasoningEffort
  setReasoningEffort: (effort: ReasoningEffort) => void
  send: (text: string, attachments?: AttachmentRef[]) => Promise<boolean>
  stop: () => void
  setMode: (mode: string) => void
  setPermission: (profile: string) => void
  useModel: (model: ModelSummary) => void
  searchFiles: (query: string) => Promise<{ root: string; files: Array<{ path: string; relative_path: string; name: string }> }>
  prepareAttachments: (attachments: AttachmentRef[]) => Promise<AttachmentRef[]>
  cancelAttachmentPreparation: (attachments: AttachmentRef[]) => Promise<void>
  implementPlan: () => Promise<boolean>
  resolveApproval: (approvalId: string, decision: string) => void
  retryPreparation: () => void
}

// Restauración coordinada: las sesiones del board se resuelven de una en una
// contra el loop stdio del Engine; `prepareSession` deduplica además las
// llamadas concurrentes para el mismo id.
let preparationChain: Promise<unknown> = Promise.resolve()
function enqueuePreparation<T>(job: () => Promise<T>): Promise<T> {
  const next = preparationChain.then(job, job)
  preparationChain = next.then(() => undefined, () => undefined)
  return next
}

/**
 * Proyección y callbacks de **una** sesión para un panel del board. Consume
 * el store del runtime con selectores estables y los comandos por sesión del
 * Engine; nunca usa la sesión Normal activa como fallback.
 */
export function usePaneSession(sessionId: string): PaneSession {
  const commands = useEngineCommands()
  const data = useEngineData()
  const store = useRuntimeStore()
  const record = data.sessionsById[sessionId] ?? null
  const messages = useSessionThread(store, sessionId)
  const timelines = useSessionTimelines(store, sessionId)
  const busy = useSessionBusy(store, sessionId)
  const approvals = useSessionApprovals(store, sessionId)
  const questions = usePendingQuestions(sessionId)
  const reasoningEffort = useSessionUiStore(selectReasoning(sessionId))
  const setReasoningFor = useSessionUiStore((state) => state.setReasoningFor)
  const [availability, setAvailability] = useState<PaneAvailability>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setAvailability({ state: 'loading' })
    void enqueuePreparation(() => commands.ensureSessionReady(sessionId)).then((result: PrepareSessionResult) => {
      if (cancelled) return
      if (result.ok) setAvailability({ state: 'ready' })
      else setAvailability({ state: result.reason, message: result.message })
    })
    return () => {
      cancelled = true
    }
  }, [commands, sessionId, attempt, data.engineGeneration])

  const projectRoot = record?.kind === 'PROJECT' ? (record.project_root ?? null) : null
  useProjectRootWatch(projectRoot, commands.loadProjectStatus, { enabled: data.ready })
  const project = useMemo(() => {
    if (!record) return null
    if (record.project_id) return data.projects.find((item) => item.id === record.project_id) ?? null
    return data.projects.find((item) => item.root === record.project_root) ?? null
  }, [data.projects, record])
  const gitStatus = projectRoot ? (data.projectStatusByRoot[projectRoot] ?? null) : null
  const gitError = projectRoot ? (data.projectStatusErrorByRoot[projectRoot] ?? null) : null
  const activeModel = useMemo(() => selectSessionModel(data.models, record), [data.models, record])

  const send = useCallback(
    (text: string, attachments: AttachmentRef[] = []) => commands.sendTo(sessionId, text, attachments),
    [commands, sessionId],
  )
  const stop = useCallback(() => void commands.cancelTurnFor(sessionId), [commands, sessionId])
  const setMode = useCallback((mode: string) => void commands.setModeFor(sessionId, mode), [commands, sessionId])
  const setPermission = useCallback((profile: string) => void commands.setPermissionFor(sessionId, profile), [commands, sessionId])
  const useModel = useCallback(
    (model: ModelSummary) => void commands.useModelFor(sessionId, model, { setGlobalDefault: false }),
    [commands, sessionId],
  )
  const searchFiles = useCallback((query: string) => commands.searchFilesFor(sessionId, query), [commands, sessionId])
  const prepareAttachments = useCallback(
    (attachments: AttachmentRef[]) => commands.prepareAttachmentsFor(sessionId, attachments),
    [commands, sessionId],
  )
  const cancelAttachmentPreparation = useCallback(
    (attachments: AttachmentRef[]) => commands.cancelAttachmentPreparationFor(sessionId, attachments),
    [commands, sessionId],
  )
  const implementPlan = useCallback(() => commands.implementPlanFor(sessionId), [commands, sessionId])
  const resolveApproval = useCallback(
    (approvalId: string, decision: string) => void commands.resolveApproval(approvalId, decision),
    [commands],
  )
  const setReasoningEffort = useCallback(
    (effort: ReasoningEffort) => setReasoningFor(sessionId, effort),
    [sessionId, setReasoningFor],
  )
  const retryPreparation = useCallback(() => setAttempt((value) => value + 1), [])

  // -- estado derivado y lectura -------------------------------------------
  const attention = useBoardAttentionStore((state) => state.sessions[sessionId])
  const markTurnSeen = useBoardAttentionStore((state) => state.markTurnSeen)
  const markSessionResultsSeen = useBoardAttentionStore((state) => state.markSessionResultsSeen)
  const unread = useMemo(() => unreadTurnIds(attention), [attention])
  const availabilityState: PaneAvailabilityState = !data.ready
    ? 'disconnected'
    : availability.state === 'loading' ? 'loading' : availability.state === 'ready' ? 'ready' : 'error'
  const previousStatus = useRef<PaneStatus | null>(null)
  const status = useMemo(() => {
    const next = derivePaneStatus({
      sessionId,
      timelines,
      pendingApprovals: approvals.length,
      pendingQuestions: questions.length,
      unreadResultCount: unreadResultCount(attention),
      unreadPeerCount: unreadPeerCount(attention),
      availability: availabilityState,
    })
    if (samePaneStatus(previousStatus.current, next)) return previousStatus.current as PaneStatus
    previousStatus.current = next
    return next
  }, [sessionId, timelines, approvals.length, questions.length, attention, availabilityState])
  const markSeen = useCallback((turnId: string) => markTurnSeen(sessionId, turnId), [markTurnSeen, sessionId])
  const markAllSeen = useCallback(() => {
    const ids = unreadTurnIds(useBoardAttentionStore.getState().sessions[sessionId])
    if (ids.length > 0) markSessionResultsSeen(sessionId, ids)
  }, [markSessionResultsSeen, sessionId])

  return useMemo<PaneSession>(() => ({
    sessionId,
    record,
    project,
    projectRoot,
    messages,
    timelines,
    busy,
    approvals,
    pendingQuestions: questions.length,
    activeModel,
    gitStatus,
    gitError,
    availability,
    status,
    unreadTurnIds: unread,
    markSeen,
    markAllSeen,
    reasoningEffort,
    setReasoningEffort,
    send,
    stop,
    setMode,
    setPermission,
    useModel,
    searchFiles,
    prepareAttachments,
    cancelAttachmentPreparation,
    implementPlan,
    resolveApproval,
    retryPreparation,
  }), [
    sessionId, record, project, projectRoot, messages, timelines, busy, approvals, questions.length,
    activeModel, gitStatus, gitError, availability, status, unread, markSeen, markAllSeen, reasoningEffort, setReasoningEffort,
    send, stop, setMode, setPermission, useModel, searchFiles, prepareAttachments,
    cancelAttachmentPreparation, implementPlan, resolveApproval, retryPreparation,
  ])
}
