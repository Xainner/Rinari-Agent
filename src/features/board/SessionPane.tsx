import { runUiCommand } from '../engine/slashUi'
import { useConfirm } from '../../components/ui/useConfirm'
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { LoaderCircle } from 'lucide-react'
import { useI18n } from '../../i18n'
import ChatView from '../../components/ChatView'
import QueueBar from '../../components/chat/QueueBar'
import { useEngineCommands, useEngineData } from '../engine/EngineContext'
import { isDraftPane, useBoardStore, type BoardPane } from '../../stores/board'
import { useSessionDockStore } from '../../stores/sessionDock'
import { cn } from '../../lib/utils'
import CollapsedPaneStrip, { COLUMN_WIDTH, STRIP_WIDTH } from './CollapsedPaneStrip'
import PaneHeader from './PaneHeader'
import SessionWorkspace from '../session/SessionWorkspace'
import { usePaneSession } from './usePaneSession'
import { ReadTrackingContext } from './useResultVisibility'
import DraftPane from './DraftPane'
import { ZoneBoundary } from '../../components/ZoneBoundary'

export interface SessionPaneProps {
  pane: BoardPane
  focused: boolean
  sharedRoot: boolean
  canMoveLeft: boolean
  canMoveRight: boolean
  onFocus: (paneId: string) => void
  onOpenSingle: (sessionId: string) => void
  onRemove: (paneId: string) => void
  onOpenProviders: () => void
  /** Cómo se ve plegado: columna con estado (si cabe) o tira de 48 px. */
  collapsedVariant?: 'column' | 'strip'
}

/**
 * Un panel expandido del board: header local y el `SessionWorkspace` de **su**
 * sesión (conversación + dock de archivos/navegador/workspace, el mismo que
 * usa la vista Normal). No monta el Engine ni escucha eventos ajenos: todo
 * llega por selectores de su `sessionId`.
 */
function SessionPane(props: SessionPaneProps) {
  // Un borrador no tiene sesión: ninguno de los hooks de sesión debe correr.
  if (isDraftPane(props.pane)) {
    return <DraftPane pane={props.pane} focused={props.focused} onFocus={props.onFocus} onRemove={props.onRemove} onOpenProviders={props.onOpenProviders} />
  }
  return <LiveSessionPane {...props} />
}

function LiveSessionPane({
  pane,
  focused,
  sharedRoot,
  canMoveLeft,
  canMoveRight,
  onFocus,
  onOpenSingle,
  onRemove,
  onOpenProviders,
  collapsedVariant = 'strip',
}: SessionPaneProps) {
  const { t } = useI18n()
  const commands = useEngineCommands()
  const data = useEngineData()
  const { ask: confirm, dialog: confirmDialog } = useConfirm()
  const steering = data.status?.capabilities.turn_steering_v1 === true
  const session = usePaneSession(pane.sessionId)
  const dockVisible = useSessionDockStore((state) => state.layoutFor(pane.sessionId).visible)
  const setDockVisible = useSessionDockStore((state) => state.setVisible)
  const revealDock = useSessionDockStore((state) => state.reveal)
  const movePane = useBoardStore((state) => state.movePane)
  const setCollapsed = useBoardStore((state) => state.setCollapsed)
  const expandPane = useBoardStore((state) => state.expandPane)
  const panes = useBoardStore((state) => state.panes)
  const paneError = useBoardStore((state) => state.paneErrors[pane.paneId])
  // Plegar y desplegar se animan solo cuando cambian aquí, no al montar el board.
  const [fold, setFold] = useState<{ collapsed: boolean; motion: 'expand' | 'collapse' | null }>({ collapsed: pane.collapsed, motion: null })
  if (fold.collapsed !== pane.collapsed) setFold({ collapsed: pane.collapsed, motion: pane.collapsed ? 'collapse' : 'expand' })
  // Ancho real en pantalla (con «Ajustar a la vista» no es el guardado): la
  // tira se encoge desde él al plegar.
  const shownWidth = useRef(pane.width)
  const observed = useRef<ResizeObserver | null>(null)
  const measure = useCallback((element: HTMLElement | null) => {
    observed.current?.disconnect()
    observed.current = null
    if (!element) return
    shownWidth.current = element.getBoundingClientRect().width || pane.width
    if (typeof ResizeObserver === 'undefined') return
    observed.current = new ResizeObserver(([entry]) => { if (entry) shownWidth.current = entry.target.getBoundingClientRect().width })
    observed.current.observe(element)
  }, [pane.width])
  const endFold = useCallback(() => setFold((current) => current.motion ? { ...current, motion: null } : current), [])
  // `animationend` no llega si la ventana no pinta (oculta, minimizada, en
  // segundo plano): sin este tope el panel se quedaría en el primer fotograma,
  // a 48 px y con overflow oculto. Margen sobre la animación más larga (0,4 s).
  useEffect(() => {
    if (!fold.motion) return
    const timer = window.setTimeout(endFold, 600)
    return () => window.clearTimeout(timer)
  }, [fold.motion, endFold])
  const readTracking = useMemo(() => ({ sessionId: pane.sessionId, visible: !pane.collapsed }), [pane.sessionId, pane.collapsed])
  // «Revisar cambios»: dock de workspace en la pestaña de cambios (rotulada por proyecto).
  const reviewChanges = useCallback(() => {
    revealDock(pane.sessionId, 'workspace', { workspaceTab: 'changes' })
  }, [pane.sessionId, revealDock])
  const focus = useCallback(() => {
    if (!focused) onFocus(pane.paneId)
  }, [focused, onFocus, pane.paneId])

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
        variant={collapsedVariant}
        onExpand={() => expandPane(pane.paneId, { focus: true })}
        onOpenSingle={() => onOpenSingle(pane.sessionId)}
        onRemove={() => onRemove(pane.paneId)}
        foldFrom={fold.motion === 'collapse' ? shownWidth.current : undefined}
        onFoldEnd={endFold}
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
      ref={measure}
      data-motion={fold.motion ?? undefined}
      onAnimationEnd={(event) => { if (event.target === event.currentTarget) endFold() }}
      style={{ width: pane.width, ...(fold.motion === 'expand' ? { '--unfold-from': `${collapsedVariant === 'column' ? COLUMN_WIDTH : STRIP_WIDTH}px` } : {}) } as CSSProperties}
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
        onOpenSingle={() => onOpenSingle(pane.sessionId)}
        onMoveLeft={() => movePane(pane.paneId, index - 1)}
        onMoveRight={() => movePane(pane.paneId, index + 1)}
        onRemove={() => onRemove(pane.paneId)}
        onCollapse={() => setCollapsed(pane.paneId, true)}
      />
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
            {/* Si el chat del panel falla, el panel sigue con su cabecera (#58).
                Dentro del panel: un envoltorio alrededor del panel rompía la
                medición del tablero. */}
            <ZoneBoundary zone="board-pane">
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
                confirm,
                hasProject: session.record?.kind === 'PROJECT',
              })}
              onPrepareAttachments={session.prepareAttachments}
              onCancelAttachmentPreparation={session.cancelAttachmentPreparation}
              onImplementPlan={session.implementPlan}
              onStop={session.stop}
              onSteer={steering ? (text, files, now) => commands.steerTo(pane.sessionId, text, files, now) : undefined}
              onQueue={steering ? (text) => commands.queueTo(pane.sessionId, text) : undefined}
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
              onLoadEarlier={() => commands.loadEarlierFor(pane.sessionId)}
              composerPrimary={false}
              composerAcceptsGlobalFocus={focused}
              onReviewChanges={reviewChanges}
            />
            </ZoneBoundary>
            <QueueBar sessionId={pane.sessionId} refreshKey={session.busy} showInput={!steering} />
          </div>
          </ReadTrackingContext.Provider>
        </SessionWorkspace>
      </div>
      {confirmDialog}
    </section>
  )
}

export default memo(SessionPane)
