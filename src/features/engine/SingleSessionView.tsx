import { useCallback } from 'react'
import ChatView from '../../components/ChatView'
import QueueBar from '../../components/chat/QueueBar'
import { ReadTrackingContext } from '../board/useResultVisibility'
import SessionWorkspace from '../session/SessionWorkspace'
import { useEngineCommands, useEngineData, useRuntimeStore } from './EngineContext'
import { selectSessionModel, useSessionBusy, useSessionThread, useSessionTimelines } from './sessionSelectors'
import { selectReasoning, useSessionUiStore } from '../../stores/sessionUi'
import { useSessionDockStore } from '../../stores/sessionDock'
import type { ReasoningEffort } from '../../lib/reasoning'
import type { ModelSummary } from '../../services/engine'
import { runUiCommand } from './slashUi'
import { useConfirm } from '../../components/ui/useConfirm'
import { useConversationDraftStore } from '../../stores/conversationDraft'
import { ZoneBoundary } from '../../components/ZoneBoundary'
import { moveNormalDraft } from '../projects/draftProject'
import type { HomePersona } from '../home/HomeWelcome'
import { PauseCircle } from 'lucide-react'
import { useI18n } from '../../i18n'

/**
 * El agente de la Agency dueño de la conversación abierta: su saludo en el
 * chat vacío y lo que el composer dice de él (su nombre, su esfuerzo y su
 * modelo cuando la conversación no eligió otros).
 */
export type AgencyPersona = HomePersona & {
  sessionId: string
  agentName?: string
  agentEffort?: ReasoningEffort | null
  agentModel?: string | null
  /** D-32: la Agency está detenida; solo corre lo que escribe el dueño. */
  halted?: boolean
}

/**
 * Vista Normal: la sesión activa con las mismas primitivas y el mismo
 * `SessionWorkspace` (conversación + dock) que cada panel del board. Se
 * suscribe únicamente a su sesión, de modo que `App` deja de repintarse por
 * cada token.
 */
export default function SingleSessionView({
  onOpenProviders,
  processesOpenSignal,
  persona,
}: {
  onOpenProviders: () => void
  /** Contador que abre el inspector de procesos de la sesión (acción "processes"). */
  processesOpenSignal?: number
  /** El agente de la Agency dueño de esta conversación (su saludo en el chat vacío). */
  persona?: AgencyPersona
}) {
  const { t } = useI18n()
  const commands = useEngineCommands()
  const data = useEngineData()
  const store = useRuntimeStore()
  const { ask: confirm, dialog: confirmDialog } = useConfirm()
  const sessionId = data.activeSession
  const record = data.sessionsById[sessionId] ?? null
  // Sin sesión activa, la vista es el borrador de una conversación nueva.
  const draft = useConversationDraftStore((state) => (sessionId ? null : state.normal))
  const preferenceKey = sessionId || draft?.key || ''
  const messages = useSessionThread(store, sessionId)
  const timelines = useSessionTimelines(store, sessionId)
  const busy = useSessionBusy(store, sessionId)
  const steering = data.status?.capabilities.turn_steering_v1 === true
  const reasoningEffort = useSessionUiStore(selectReasoning(preferenceKey))
  const setReasoningFor = useSessionUiStore((state) => state.setReasoningFor)
  const onReasoningChange = useCallback(
    (effort: ReasoningEffort) => setReasoningFor(preferenceKey, effort),
    [preferenceKey, setReasoningFor],
  )
  const revealDock = useSessionDockStore((state) => state.reveal)
  const reviewChanges = useCallback(() => revealDock(sessionId, 'workspace', { workspaceTab: 'changes' }), [revealDock, sessionId])
  const projectRoot = record?.kind === 'PROJECT' ? (record.project_root ?? null) : null
  const project = record?.project_id
    ? data.projects.find((item) => item.id === record.project_id) ?? null
    : record
      ? data.projects.find((item) => item.root === record.project_root) ?? null
      : draft?.projectId ? data.projects.find((item) => item.id === draft.projectId) ?? null : null
  const gitStatus = projectRoot ? (data.projectStatusByRoot[projectRoot] ?? null) : null
  // An agent's conversation without its own choice runs with the agent's
  // effort and model: the composer says so instead of «Predeterminado».
  const agent = persona && persona.sessionId === sessionId ? persona : undefined
  const shownEffort: ReasoningEffort = reasoningEffort === 'off' && agent?.agentEffort ? agent.agentEffort : reasoningEffort
  const sessionModel = selectSessionModel(data.models, record)
  const agentModel = agent?.agentModel ? data.models.find((model) => model.id === agent.agentModel) : undefined
  const shownModel = sessionModel ?? agentModel ?? data.activeModel
  const haltedNote = agent?.halted ? (
    <div className="agency-halted-note is-chat" role="status" data-testid="agency-chat-halted">
      <PauseCircle size={14} aria-hidden="true" />
      <span>{t('agency.halted.chat')}</span>
    </div>
  ) : null
  const queueBar = steering ? <QueueBar sessionId={sessionId} refreshKey={busy} showInput={false} /> : null

  return (
    <ReadTrackingContext.Provider value={sessionId ? { sessionId, visible: true, returnMark: false } : null}>
    <SessionWorkspace
      sessionId={sessionId}
      record={record}
      density="normal"
      focused
      browserEnabled={data.status?.capabilities.browser_view_v1 === true}
      terminalEnabled={data.status?.capabilities.desktop_terminal_v1 === true}
      engineGeneration={data.engineGeneration}
      busy={busy}
    >
      <ZoneBoundary zone="chat">
      <ChatView
        queue={haltedNote || queueBar ? <>{haltedNote}{queueBar}</> : undefined}
        assistantName={agent?.agentName}
        processesInPanel={data.status?.capabilities.desktop_terminal_v1 === true}
        homePersona={agent}
        homeContext={{
          projectName: project?.name ?? projectRoot ?? project?.root ?? null,
          changedFiles: gitStatus?.status.available ? gitStatus.status.files.length : null,
        }}
        messages={messages}
        sessionId={sessionId}
        composerDraftKey={draft?.key}
        draftProject={draft ? { projectId: draft.projectId, onChange: (projectId) => { moveNormalDraft(projectId) } } : undefined}
        isStreaming={busy}
        engineReady={data.ready}
        onSend={commands.send}
        onUiCommand={(name, text) => runUiCommand(name, text, {
          sessionId,
          reveal: revealDock,
          fork: commands.forkSession,
          rename: commands.renameSession,
          confirm,
          hasProject: Boolean(project),
          ensureSession: commands.startDraftSession,
        })}
        onPrepareAttachments={sessionId ? commands.prepareAttachments : undefined}
        onCancelAttachmentPreparation={commands.cancelAttachmentPreparation}
        onImplementPlan={commands.implementPlan}
        onStop={() => void commands.cancelTurn()}
        onSteer={steering ? (text, files, now) => commands.steerTo(sessionId, text, files, now) : undefined}
        onQueue={steering ? (text) => commands.queueTo(sessionId, text) : undefined}
        onOpenProviders={onOpenProviders}
        models={data.models}
        providers={data.providers}
        activeAlias={shownModel?.alias ?? null}
        activeModel={shownModel}
        onUseModel={(model: ModelSummary) => void commands.useModel(model)}
        onDiscoverModels={() => void commands.discoverCatalog()}
        onRefreshModels={commands.refreshModels}
        sessionMode={record?.mode ?? draft?.mode ?? null}
        historyPhase={data.historyPhase}
        onRetryHistory={() => void commands.retryHistory()}
        onModeChange={(mode) => void commands.setMode(mode)}
        reasoningEffort={shownEffort}
        onReasoningChange={onReasoningChange}
        timelines={timelines}
        onResolveApproval={(id, decision) => void commands.resolveApproval(id, decision)}
        permissionProfile={record?.permission_profile ?? draft?.permissionProfile ?? 'workspace'}
        effectivePermissionProfile={record?.effective_permission_profile ?? draft?.permissionProfile ?? 'workspace'}
        permissionProfilesV2={data.status?.capabilities.permission_profiles_v2 === true}
        onPermissionChange={(profile) => void commands.setPermission(profile)}
        onSearchFiles={commands.searchFiles}
        processesOpenSignal={processesOpenSignal}
        historyNote={sessionId !== '' ? (data.historyInfo[sessionId] ?? null) : null}
        onLoadEarlier={sessionId !== '' ? () => commands.loadEarlierFor(sessionId) : undefined}
        onReviewChanges={sessionId ? reviewChanges : undefined}
      />
      </ZoneBoundary>
    </SessionWorkspace>
    {confirmDialog}
    </ReadTrackingContext.Provider>
  )
}
