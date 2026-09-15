import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { useI18n } from '../../i18n'
import ChatView from '../../components/ChatView'
import QueueBar from '../../components/chat/QueueBar'
import { ResizeHandle } from '../../components/ui/resize-handle'
import { useDragResize } from '../../hooks/useDragResize'
import { useEngineCommands, useEngineData } from '../engine/EngineContext'
import { FileWorkspaceProvider } from '../files/FileWorkspace'
import {
  CHAT_MIN_DOCKED_WIDTH,
  WORKSPACE_MAX_WIDTH,
  WORKSPACE_MIN_WIDTH,
  useBoardStore,
  type BoardPane,
} from '../../stores/board'
import { cn } from '../../lib/utils'
import PaneDock from './PaneDock'
import PaneHeader from './PaneHeader'
import PeerForwardDialog, { type PeerForwardTarget } from './PeerForwardDialog'
import { usePaneSession } from './usePaneSession'

const HANDLE_WIDTH = 6

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
 * Un panel expandido del board: header local, conversación de **su** sesión y
 * dock (workspace/archivo). No monta el Engine ni escucha eventos ajenos: todo
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
  const setWorkspaceVisible = useBoardStore((state) => state.setWorkspaceVisible)
  const setWorkspaceWidth = useBoardStore((state) => state.setWorkspaceWidth)
  const setDockTab = useBoardStore((state) => state.setDockTab)
  const setWorkspaceTab = useBoardStore((state) => state.setWorkspaceTab)
  const movePane = useBoardStore((state) => state.movePane)
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

  // Geometría real del panel: decide si el dock cabe al lado o va en drawer.
  const bodyRef = useRef<HTMLDivElement>(null)
  const [innerWidth, setInnerWidth] = useState<number | null>(null)
  useEffect(() => {
    const element = bodyRef.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (typeof width === 'number') setInnerWidth(width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const canDock = innerWidth === null || innerWidth >= CHAT_MIN_DOCKED_WIDTH + pane.workspaceWidth + HANDLE_WIDTH
  const dockLayout: 'docked' | 'drawer' = canDock ? 'docked' : 'drawer'

  const [liveWorkspaceWidth, setLiveWorkspaceWidth] = useState(pane.workspaceWidth)
  useEffect(() => {
    setLiveWorkspaceWidth(pane.workspaceWidth)
  }, [pane.workspaceWidth])
  const { handleProps } = useDragResize({
    value: liveWorkspaceWidth,
    min: WORKSPACE_MIN_WIDTH,
    max: () => Math.min(WORKSPACE_MAX_WIDTH, Math.max(WORKSPACE_MIN_WIDTH, (innerWidth ?? WORKSPACE_MAX_WIDTH) - CHAT_MIN_DOCKED_WIDTH - HANDLE_WIDTH)),
    direction: 'left',
    onChange: setLiveWorkspaceWidth,
    onCommit: (final) => setWorkspaceWidth(pane.paneId, final),
    disabled: dockLayout === 'drawer',
  })

  const revealFile = useCallback(() => {
    setDockTab(pane.paneId, 'file')
    setWorkspaceVisible(pane.paneId, true)
  }, [pane.paneId, setDockTab, setWorkspaceVisible])

  const focus = useCallback(() => {
    if (!focused) onFocus(pane.paneId)
  }, [focused, onFocus, pane.paneId])

  const index = panes.findIndex((item) => item.paneId === pane.paneId)
  const title = session.record?.title || t('sidebar.newChat')
  const availability = session.availability

  return (
    <section
      aria-label={title}
      data-pane-id={pane.paneId}
      data-focused={focused || undefined}
      className={cn('session-pane', focused && 'is-focused')}
      style={{ width: pane.width }}
      onPointerDownCapture={focus}
      onFocusCapture={focus}
    >
      <PaneHeader
        session={session}
        focused={focused}
        sharedRoot={sharedRoot}
        workspaceVisible={pane.workspaceVisible}
        models={data.models}
        providers={data.providers}
        canMoveLeft={canMoveLeft}
        canMoveRight={canMoveRight}
        onOpenProviders={onOpenProviders}
        onDiscoverModels={() => void commands.discoverCatalog()}
        onToggleWorkspace={() => setWorkspaceVisible(pane.paneId, !pane.workspaceVisible)}
        onOpenSingle={() => onOpenSingle(pane.sessionId)}
        onMoveLeft={() => movePane(pane.paneId, index - 1)}
        onMoveRight={() => movePane(pane.paneId, index + 1)}
        onRemove={() => onRemove(pane.paneId)}
        onRemoveAndClose={() => onRemoveAndClose(pane.paneId, pane.sessionId)}
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
      <div ref={bodyRef} className="session-pane-body">
        <FileWorkspaceProvider sessionId={pane.sessionId} onOpen={revealFile}>
          <div className="session-pane-chat">
            <ChatView
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
              composerPrimary={false}
              composerAcceptsGlobalFocus={focused}
            />
            <QueueBar sessionId={pane.sessionId} refreshKey={session.busy} peerMessaging={peerMessaging} />
          </div>
          {pane.workspaceVisible && (
            <>
              {dockLayout === 'docked' && (
                <ResizeHandle {...handleProps} label={t('board.resize.workspace')} />
              )}
              <PaneDock
                session={session.record}
                tab={pane.dockTab}
                onTabChange={(tab) => setDockTab(pane.paneId, tab)}
                workspaceTab={pane.workspaceTab}
                onWorkspaceTabChange={(tab) => setWorkspaceTab(pane.paneId, tab)}
                sharedRoot={sharedRoot}
                layout={dockLayout}
                width={liveWorkspaceWidth}
                onClose={() => setWorkspaceVisible(pane.paneId, false)}
              />
            </>
          )}
        </FileWorkspaceProvider>
      </div>
    </section>
  )
}

export default memo(SessionPane)
