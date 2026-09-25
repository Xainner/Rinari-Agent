import { useCallback } from 'react'
import ChatView from '../../components/ChatView'
import QueueBar from '../../components/chat/QueueBar'
import { ReadTrackingContext } from '../board/useResultVisibility'
import SessionWorkspace from '../session/SessionWorkspace'
import { useEngineCommands, useEngineData, useRuntimeStore } from './EngineContext'
import { useSessionBusy, useSessionThread, useSessionTimelines } from './sessionSelectors'
import { selectReasoning, useSessionUiStore } from '../../stores/sessionUi'
import { useSessionDockStore } from '../../stores/sessionDock'
import type { ReasoningEffort } from '../../lib/reasoning'
import type { ModelSummary } from '../../services/engine'
import { runUiCommand } from './slashUi'

/**
 * Vista Normal: la sesión activa con las mismas primitivas y el mismo
 * `SessionWorkspace` (conversación + dock) que cada panel del board. Se
 * suscribe únicamente a su sesión, de modo que `App` deja de repintarse por
 * cada token.
 */
export default function SingleSessionView({
  onOpenProviders,
  processesOpenSignal,
}: {
  onOpenProviders: () => void
  /** Contador que abre el inspector de procesos de la sesión (acción "processes"). */
  processesOpenSignal?: number
}) {
  const commands = useEngineCommands()
  const data = useEngineData()
  const store = useRuntimeStore()
  const sessionId = data.activeSession
  const record = data.sessionsById[sessionId] ?? null
  const messages = useSessionThread(store, sessionId)
  const timelines = useSessionTimelines(store, sessionId)
  const busy = useSessionBusy(store, sessionId)
  const steering = data.status?.capabilities.turn_steering_v1 === true
  const reasoningEffort = useSessionUiStore(selectReasoning(sessionId))
  const setReasoningFor = useSessionUiStore((state) => state.setReasoningFor)
  const onReasoningChange = useCallback(
    (effort: ReasoningEffort) => setReasoningFor(sessionId, effort),
    [sessionId, setReasoningFor],
  )
  const revealDock = useSessionDockStore((state) => state.reveal)
  const reviewChanges = useCallback(() => revealDock(sessionId, 'workspace', { workspaceTab: 'changes' }), [revealDock, sessionId])
  const projectRoot = record?.kind === 'PROJECT' ? (record.project_root ?? null) : null
  const project = record?.project_id
    ? data.projects.find((item) => item.id === record.project_id) ?? null
    : data.projects.find((item) => item.root === record?.project_root) ?? null
  const gitStatus = projectRoot ? (data.projectStatusByRoot[projectRoot] ?? null) : null

  return (
    <ReadTrackingContext.Provider value={sessionId ? { sessionId, visible: true } : null}>
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
      <ChatView
        queue={steering ? <QueueBar sessionId={sessionId} refreshKey={busy} showInput={false} /> : undefined}
        processesInPanel={data.status?.capabilities.desktop_terminal_v1 === true}
        homeContext={{
          projectName: project?.name ?? projectRoot,
          changedFiles: gitStatus?.status.available ? gitStatus.status.files.length : null,
        }}
        messages={messages}
        sessionId={sessionId}
        isStreaming={busy}
        engineReady={data.ready}
        onSend={commands.send}
        onUiCommand={(name, text) => runUiCommand(name, text, {
          sessionId,
          reveal: revealDock,
          fork: commands.forkSession,
          rename: commands.renameSession,
        })}
        onPrepareAttachments={commands.prepareAttachments}
        onCancelAttachmentPreparation={commands.cancelAttachmentPreparation}
        onImplementPlan={commands.implementPlan}
        onStop={() => void commands.cancelTurn()}
        onSteer={steering ? (text) => commands.steerTo(sessionId, text) : undefined}
        onQueue={steering ? (text) => commands.queueTo(sessionId, text) : undefined}
        onOpenProviders={onOpenProviders}
        models={data.models}
        providers={data.providers}
        activeAlias={data.activeModel?.alias ?? null}
        activeModel={data.activeModel}
        onUseModel={(model: ModelSummary) => void commands.useModel(model)}
        onDiscoverModels={() => void commands.discoverCatalog()}
        onRefreshModels={commands.refreshModels}
        sessionMode={record?.mode ?? null}
        historyPhase={data.historyPhase}
        onRetryHistory={() => void commands.retryHistory()}
        onModeChange={(mode) => void commands.setMode(mode)}
        reasoningEffort={reasoningEffort}
        onReasoningChange={onReasoningChange}
        timelines={timelines}
        onResolveApproval={(id, decision) => void commands.resolveApproval(id, decision)}
        permissionProfile={record?.permission_profile ?? 'workspace'}
        effectivePermissionProfile={record?.effective_permission_profile ?? 'workspace'}
        permissionProfilesV2={data.status?.capabilities.permission_profiles_v2 === true}
        onPermissionChange={(profile) => void commands.setPermission(profile)}
        onSearchFiles={commands.searchFiles}
        processesOpenSignal={processesOpenSignal}
        historyNote={sessionId !== '' ? (data.historyInfo[sessionId] ?? null) : null}
        onReviewChanges={sessionId ? reviewChanges : undefined}
      />
    </SessionWorkspace>
    </ReadTrackingContext.Provider>
  )
}
