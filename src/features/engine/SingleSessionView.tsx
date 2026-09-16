import { useCallback } from 'react'
import ChatView from '../../components/ChatView'
import { ReadTrackingContext } from '../board/useResultVisibility'
import FileWorkspace from '../files/FileWorkspace'
import { useEngineCommands, useEngineData, useRuntimeStore } from './EngineContext'
import { useSessionBusy, useSessionThread, useSessionTimelines } from './sessionSelectors'
import { selectReasoning, useSessionUiStore } from '../../stores/sessionUi'
import type { ReasoningEffort } from '../../lib/reasoning'
import type { ModelSummary } from '../../services/engine'

/**
 * Vista Normal: la sesión activa con las mismas primitivas que usará cada
 * panel del board. Se suscribe únicamente a su sesión, de modo que `App` deja
 * de repintarse por cada token.
 */
export default function SingleSessionView({ onOpenProviders }: { onOpenProviders: () => void }) {
  const commands = useEngineCommands()
  const data = useEngineData()
  const store = useRuntimeStore()
  const sessionId = data.activeSession
  const record = data.sessionsById[sessionId] ?? null
  const messages = useSessionThread(store, sessionId)
  const timelines = useSessionTimelines(store, sessionId)
  const busy = useSessionBusy(store, sessionId)
  const reasoningEffort = useSessionUiStore(selectReasoning(sessionId))
  const setReasoningFor = useSessionUiStore((state) => state.setReasoningFor)
  const onReasoningChange = useCallback(
    (effort: ReasoningEffort) => setReasoningFor(sessionId, effort),
    [sessionId, setReasoningFor],
  )
  const projectRoot = record?.kind === 'PROJECT' ? (record.project_root ?? null) : null
  const project = record?.project_id
    ? data.projects.find((item) => item.id === record.project_id) ?? null
    : data.projects.find((item) => item.root === record?.project_root) ?? null
  const gitStatus = projectRoot ? (data.projectStatusByRoot[projectRoot] ?? null) : null

  return (
    <ReadTrackingContext.Provider value={sessionId ? { sessionId, visible: true } : null}>
    <FileWorkspace sessionId={sessionId}>
      <ChatView
        homeContext={{
          projectName: project?.name ?? projectRoot,
          changedFiles: gitStatus?.status.available ? gitStatus.status.files.length : null,
        }}
        messages={messages}
        sessionId={sessionId}
        isStreaming={busy}
        engineReady={data.ready}
        onSend={commands.send}
        onPrepareAttachments={commands.prepareAttachments}
        onCancelAttachmentPreparation={commands.cancelAttachmentPreparation}
        onImplementPlan={commands.implementPlan}
        onStop={() => void commands.cancelTurn()}
        onOpenProviders={onOpenProviders}
        models={data.models}
        providers={data.providers}
        activeAlias={data.activeModel?.alias ?? null}
        activeModel={data.activeModel}
        onUseModel={(model: ModelSummary) => void commands.useModel(model)}
        onDiscoverModels={() => void commands.discoverCatalog()}
        sessionMode={record?.mode ?? null}
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
        historyNote={sessionId !== '' ? (data.historyInfo[sessionId] ?? null) : null}
      />
    </FileWorkspace>
    </ReadTrackingContext.Provider>
  )
}
