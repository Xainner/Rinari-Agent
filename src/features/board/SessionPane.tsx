import { runUiCommand } from '../engine/slashUi'
import { memo, useCallback, useMemo, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { useI18n } from '../../i18n'
import ChatView from '../../components/ChatView'
import QueueBar from '../../components/chat/QueueBar'
import { useEngineCommands, useEngineData } from '../engine/EngineContext'
import { useBoardStore, type BoardPane } from '../../stores/board'
import { useSessionDockStore } from '../../stores/sessionDock'
import { cn } from '../../lib/utils'
import CollapsedPaneStrip from './CollapsedPaneStrip'
import PaneHeader from './PaneHeader'
import SessionWorkspace from '../session/SessionWorkspace'
import PeerForwardDialog, { type PeerForwardTarget } from './PeerForwardDialog'
import { toast } from 'sonner'
import { commandMessage, engineApi } from '../../services/engine'
import type { PaneMentionTarget } from '../../components/composer/paneMention'
import { FOCUS_COMPOSER_EVENT } from '../../components/composer/focusComposer'
import { usePaneSession } from './usePaneSession'
import { ReadTrackingContext } from './useResultVisibility'

export interface SessionPaneProps {
  pane: BoardPane
  focused: boolean
  sharedRoot: boolean
  canMoveLeft: boolean
  canMoveRight: boolean
  onFocus: (paneId: string) => void
  onOpenSingle: (sessionId: string) => void
  onRemove: (paneId: string) => void
  onRemoveAndClose: (paneId: string, sessionId: string) => void
  onOpenProviders: () => void
  /** `session_peer_messaging_v1` anunciada por el Engine. */
  peerMessaging: boolean
  /** Etiqueta de cada sesión del board (para el diálogo de reenvío). */
  peerLabelFor: (sessionId: string) => string | null
}

/**
 * Un panel expandido del board: header local y el `SessionWorkspace` de **su**
 * sesión (conversación + dock de archivos/navegador/workspace, el mismo que
 * usa la vista Normal). No monta el Engine ni escucha eventos ajenos: todo
 * llega por selectores de su `sessionId`.
 */
function SessionPane({
  pane,
  focused,
  sharedRoot,
  canMoveLeft,
  canMoveRight,
  onFocus,
  onOpenSingle,
  onRemove,
  onRemoveAndClose,
  onOpenProviders,
  peerMessaging,
  peerLabelFor,
}: SessionPaneProps) {
  const { t } = useI18n()
  const commands = useEngineCommands()
  const data = useEngineData()
  const session = usePaneSession(pane.sessionId)
  const dockVisible = useSessionDockStore((state) => state.layoutFor(pane.sessionId).visible)
  const setDockVisible = useSessionDockStore((state) => state.setVisible)
  const revealDock = useSessionDockStore((state) => state.reveal)
  const movePane = useBoardStore((state) => state.movePane)
  const setCollapsed = useBoardStore((state) => state.setCollapsed)
  const expandPane = useBoardStore((state) => state.expandPane)
  const panes = useBoardStore((state) => state.panes)
  const paneError = useBoardStore((state) => state.paneErrors[pane.paneId])
  const messagingEnabled = useBoardStore((state) => state.messagingEnabled)
  const setPeerFlags = useBoardStore((state) => state.setPeerFlags)
  const [forwardOpen, setForwardOpen] = useState(false)
  const forwardTargets = useMemo<PeerForwardTarget[]>(
    () => panes
      .filter((item) => item.sessionId !== pane.sessionId)
      .map((item) => ({ sessionId: item.sessionId, label: peerLabelFor(item.sessionId) ?? item.sessionId })),
    [panes, pane.sessionId, peerLabelFor],
  )
  const lastTurn = useMemo(() => {
    let latest: (typeof session.timelines)[string] | null = null
    for (const turn of Object.values(session.timelines)) {
      if (turn.sessionId !== pane.sessionId) continue
      if (!latest || turn.startedAt >= latest.startedAt) latest = turn
    }
    return latest
  }, [session.timelines, pane.sessionId])
  const lastResponse = useMemo(() => {
    if (!lastTurn) return null
    const final = [...lastTurn.items].reverse().find((item) => item.type === 'model' && item.outputKind === 'final')
    return final && final.type === 'model' && final.content ? final.content : null
  }, [lastTurn])
  const readTracking = useMemo(() => ({ sessionId: pane.sessionId, visible: !pane.collapsed }), [pane.sessionId, pane.collapsed])
  // «Revisar cambios»: dock de workspace en la pestaña de cambios (rotulada por proyecto).
  const reviewChanges = useCallback(() => {
    revealDock(pane.sessionId, 'workspace', { workspaceTab: 'changes' })
  }, [pane.sessionId, revealDock])
  // `@Panel mensaje` desde el compositor: reenvío manual (origen `user`, con cita).
  const mentionTargets = useMemo<PaneMentionTarget[] | undefined>(
    () => (peerMessaging && forwardTargets.length > 0 ? forwardTargets.map((item) => ({ id: item.sessionId, label: item.label })) : undefined),
    [peerMessaging, forwardTargets],
  )
  const sendToTarget = useCallback(async (targetId: string, text: string) => {
    const target = forwardTargets.find((item) => item.sessionId === targetId)
    try {
      await engineApi.peerMessageForward({
        target_session_id: targetId,
        message: text,
        source_session_id: pane.sessionId,
        quoted_source: { session_id: pane.sessionId },
      })
      toast.success(t('composer.paneMention.sent', { label: target?.label ?? targetId }))
      return true
    } catch (error) {
      toast.error(commandMessage(error))
      return false
    }
  }, [forwardTargets, pane.sessionId, t])
  const peers = peerMessaging
    ? {
        boardEnabled: messagingEnabled,
        receive: pane.peerReceive,
        send: pane.peerSend,
        onReceiveChange: (value: boolean) => setPeerFlags(pane.paneId, { peerReceive: value }),
        onSendChange: (value: boolean) => setPeerFlags(pane.paneId, { peerSend: value }),
        onForward: () => setForwardOpen(true),
        canForward: forwardTargets.length > 0,
      }
    : undefined

  const focus = useCallback(() => {
    if (!focused) onFocus(pane.paneId)
  }, [focused, onFocus, pane.paneId])

  // «Configurar siguiente mensaje»: enfoca el Composer existente de esta sesión;
  // no abre otro editor de estado. La petición tipada nombra la sesión, así que
  // llega aunque el panel aún no acepte foco global en este mismo tick.
  const configureComposer = useCallback(() => {
    onFocus(pane.paneId)
    window.dispatchEvent(new CustomEvent(FOCUS_COMPOSER_EVENT, { detail: { sessionId: pane.sessionId } }))
  }, [onFocus, pane.paneId, pane.sessionId])

  const index = panes.findIndex((item) => item.paneId === pane.paneId)
  const title = session.record?.title || t('sidebar.newChat')
  const availability = session.availability

  if (pane.collapsed) {
    // Tira: sin chat, composer ni workspace montados; el runtime sigue vivo.
    return (
      <CollapsedPaneStrip
        paneId={pane.paneId}
        session={session}
        focused={focused}
        providers={data.providers}
        onExpand={() => expandPane(pane.paneId, { focus: true })}
        onOpenSingle={() => onOpenSingle(pane.sessionId)}
        onRemove={() => onRemove(pane.paneId)}
      />
    )
  }

  return (
    <section
      aria-label={title}
      data-pane-id={pane.paneId}
      data-focused={focused || undefined}
      data-status={session.status.kind}
      data-unread={session.status.unreadResultCount > 0 || undefined}
      className={cn('session-pane', focused && 'is-focused')}
      style={{ width: pane.width }}
      onPointerDownCapture={focus}
      onFocusCapture={focus}
    >
      <PaneHeader
        session={session}
        focused={focused}
        sharedRoot={sharedRoot}
        workspaceVisible={dockVisible}
        canMoveLeft={canMoveLeft}
        canMoveRight={canMoveRight}
        onToggleWorkspace={() => setDockVisible(pane.sessionId, !dockVisible)}
        onConfigureComposer={configureComposer}
        onOpenSingle={() => onOpenSingle(pane.sessionId)}
        onMoveLeft={() => movePane(pane.paneId, index - 1)}
        onMoveRight={() => movePane(pane.paneId, index + 1)}
        onRemove={() => onRemove(pane.paneId)}
        onRemoveAndClose={() => onRemoveAndClose(pane.paneId, pane.sessionId)}
        onCollapse={() => setCollapsed(pane.paneId, true)}
        peers={peers}
      />
      {peerMessaging && (
        <PeerForwardDialog
          open={forwardOpen}
          onOpenChange={setForwardOpen}
          sourceSessionId={pane.sessionId}
          sourceTurnId={lastTurn?.turnId ?? null}
          lastResponse={lastResponse}
          targets={forwardTargets}
        />
      )}
      {paneError && (
        <div role="alert" className="pane-notice">
          <span className="min-w-0 flex-1 truncate">{paneError}</span>
          <button type="button" className="pane-notice-action" onClick={session.retryPreparation}>{t('board.pane.retry')}</button>
        </div>
      )}
      {availability.state === 'loading' && (
        <div role="status" className="pane-notice">
          <LoaderCircle size={13} aria-hidden="true" className="motion-safe:animate-spin" />
          <span>{t('board.pane.loading')}</span>
        </div>
      )}
      {availability.state !== 'loading' && availability.state !== 'ready' && !paneError && (
        <div role="alert" className="pane-notice">
          <span className="min-w-0 flex-1 truncate">
            {t(`board.pane.unavailable.${availability.state}` as 'board.pane.unavailable.closed')}{availability.message ? ` · ${availability.message}` : ''}
          </span>
          {availability.state === 'unavailable' && (
            <button type="button" className="pane-notice-action" onClick={session.retryPreparation}>{t('board.pane.retry')}</button>
          )}
        </div>
      )}
      <div className="session-pane-body">
        <SessionWorkspace
          sessionId={pane.sessionId}
          record={session.record}
          density="pane"
          focused={focused}
          sharedRoot={sharedRoot}
          browserEnabled={data.status?.capabilities.browser_view_v1 === true}
          terminalEnabled={data.status?.capabilities.desktop_terminal_v1 === true}
          engineGeneration={data.engineGeneration}
          busy={session.busy}
        >
          <ReadTrackingContext.Provider value={readTracking}>
          <div className="session-pane-chat">
            <ChatView
              processesInPanel={data.status?.capabilities.desktop_terminal_v1 === true}
              homeContext={{
                projectName: session.project?.name ?? session.projectRoot,
                changedFiles: session.gitStatus?.status.available ? session.gitStatus.status.files.length : null,
              }}
              homeVariant="pane"
              messages={session.messages}
              sessionId={pane.sessionId}
              isStreaming={session.busy}
              engineReady={data.ready}
              onSend={session.send}
              onUiCommand={(name, text) => runUiCommand(name, text, {
                sessionId: pane.sessionId,
                reveal: revealDock,
                fork: commands.forkSession,
                rename: commands.renameSession,
              })}
              onPrepareAttachments={session.prepareAttachments}
              onCancelAttachmentPreparation={session.cancelAttachmentPreparation}
              onImplementPlan={session.implementPlan}
              onStop={session.stop}
              onOpenProviders={onOpenProviders}
              models={data.models}
              providers={data.providers}
              activeAlias={session.activeModel?.alias ?? null}
              activeModel={session.activeModel}
              onUseModel={session.useModel}
              onDiscoverModels={() => void commands.discoverCatalog()}
              onRefreshModels={commands.refreshModels}
              sessionMode={session.record?.mode ?? null}
              onModeChange={session.setMode}
              reasoningEffort={session.reasoningEffort}
              onReasoningChange={session.setReasoningEffort}
              timelines={session.timelines}
              onResolveApproval={session.resolveApproval}
              permissionProfile={session.record?.permission_profile ?? 'workspace'}
              effectivePermissionProfile={session.record?.effective_permission_profile ?? 'workspace'}
              permissionProfilesV2={data.status?.capabilities.permission_profiles_v2 === true}
              onPermissionChange={session.setPermission}
              onSearchFiles={session.searchFiles}
              historyNote={data.historyInfo[pane.sessionId] ?? null}
              historyPhase={data.historyPhases?.[pane.sessionId] ?? 'unloaded'}
              onRetryHistory={() => void commands.retryHistoryFor(pane.sessionId)}
              composerPrimary={false}
              composerAcceptsGlobalFocus={focused}
              onReviewChanges={reviewChanges}
              mentionTargets={mentionTargets}
              onSendToTarget={peerMessaging ? sendToTarget : undefined}
            />
            <QueueBar sessionId={pane.sessionId} refreshKey={session.busy} peerMessaging={peerMessaging} />
          </div>
          </ReadTrackingContext.Provider>
        </SessionWorkspace>
      </div>
    </section>
  )
}

export default memo(SessionPane)
