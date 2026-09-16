import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { commandMessage, engineApi, isCommandError, type SessionSummary } from '../../services/engine'
import { ResizeHandle } from '../../components/ui/resize-handle'
import { useDragResize } from '../../hooks/useDragResize'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog'
import { useEngineCommands, useEngineData, useRuntimeStore } from '../engine/EngineContext'
import { useUIStore } from '../../stores/ui'
import { projectDisplayName } from '../projects/workspaceModel'
import {
  PANE_MAX_WIDTH,
  PANE_MIN_WIDTH,
  useBoardStore,
  type BoardPane,
  type SessionResolution,
} from '../../stores/board'
import AddPaneDialog from './AddPaneDialog'
import BoardEmptyState from './BoardEmptyState'
import SessionPane from './SessionPane'
import { PeerNavigationProvider, type PeerNavigation } from './PeerNavigationContext'
import { usePeerGroup } from './usePeerGroup'
import { usePeerNotifications } from './usePeerNotifications'
import { useBoardAttentionStore } from '../../stores/boardAttention'

export interface BoardActions {
  addPane: () => void
  removePane: () => void
}

function canonicalRoot(session: SessionSummary | undefined): string | null {
  if (!session || session.kind !== 'PROJECT') return null
  return session.project_root ?? null
}

/** Separador entre paneles: ajusta siempre el panel expandido a su izquierda. */
function PaneResizer({ pane }: { pane: BoardPane }) {
  const { t } = useI18n()
  const setPaneWidth = useBoardStore((state) => state.setPaneWidth)
  const [live, setLive] = useState(pane.width)
  useEffect(() => {
    setLive(pane.width)
  }, [pane.width])
  const { handleProps } = useDragResize({
    value: live,
    min: PANE_MIN_WIDTH,
    max: PANE_MAX_WIDTH,
    direction: 'right',
    onChange: (next) => {
      setLive(next)
      setPaneWidth(pane.paneId, next)
    },
  })
  return <ResizeHandle {...handleProps} label={t('board.resize.pane')} className="board-pane-resizer" />
}

/**
 * Lienzo de Boards: fila horizontal de paneles con scroll, alta/baja, foco y
 * reconcile autoritativo de las sesiones persistidas. El runtime no depende
 * de que este componente esté montado.
 */
export default function BoardView({ actionsRef }: { actionsRef?: MutableRefObject<BoardActions> }) {
  const { t } = useI18n()
  const commands = useEngineCommands()
  const data = useEngineData()
  const store = useRuntimeStore()
  const goNormal = useUIStore((state) => state.goNormal)
  const goSettings = useUIStore((state) => state.goSettings)
  const panes = useBoardStore((state) => state.panes)
  const focusedPaneId = useBoardStore((state) => state.focusedPaneId)
  const softLimit = useBoardStore((state) => state.softLimit)
  const addPane = useBoardStore((state) => state.addPane)
  const removePane = useBoardStore((state) => state.removePane)
  const focusPane = useBoardStore((state) => state.focusPane)
  const reconcile = useBoardStore((state) => state.reconcileResolvedSessions)
  const persistError = useBoardStore((state) => state.persistError)
  const attentionPersistError = useBoardAttentionStore((state) => state.persistError)
  const boardId = useBoardStore((state) => state.boardId)
  const messagingEnabled = useBoardStore((state) => state.messagingEnabled)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [closing, setClosing] = useState<{ paneId: string; sessionId: string } | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  // -- alta ----------------------------------------------------------------
  const warnSoftLimit = useCallback(() => {
    if (softLimit > 0 && panes.length >= softLimit) {
      toast.warning(t('board.softLimit', { n: softLimit }), { id: 'board-soft-limit' })
    }
  }, [panes.length, softLimit, t])

  const addSession = useCallback((sessionId: string) => {
    warnSoftLimit()
    addPane(sessionId, { focus: true })
  }, [addPane, warnSoftLimit])

  const openAddDialog = useCallback(() => setDialogOpen(true), [])
  const removeFocused = useCallback(() => {
    if (focusedPaneId) removePane(focusedPaneId)
  }, [focusedPaneId, removePane])

  useEffect(() => {
    if (!actionsRef) return
    actionsRef.current = { addPane: openAddDialog, removePane: removeFocused }
    return () => {
      actionsRef.current = { addPane: () => {}, removePane: () => {} }
    }
  }, [actionsRef, openAddDialog, removeFocused])

  // -- reconcile autoritativo por id ---------------------------------------
  const engineGeneration = data.engineGeneration
  useEffect(() => {
    if (!data.ready || !data.sessionsLoaded) return
    // La generación del Engine es dependencia del efecto: un cambio cancela
    // esta pasada y arranca otra sobre el proceso nuevo.
    let cancelled = false
    void (async () => {
      const resolved: Record<string, SessionResolution> = {}
      for (const pane of useBoardStore.getState().panes) {
        const known = data.sessionsById[pane.sessionId]
        if (known) {
          resolved[pane.sessionId] = { status: known.state === 'active' ? 'active' : known.state }
          continue
        }
        try {
          const row = (await engineApi.sessionGet(pane.sessionId)).session
          resolved[pane.sessionId] = { status: row.state === 'active' ? 'active' : row.state }
        } catch (error) {
          resolved[pane.sessionId] = isCommandError(error) && error.code === 'NOT_FOUND'
            ? { status: 'not_found' }
            : { status: 'unknown', message: commandMessage(error) }
        }
        if (cancelled) return
      }
      if (cancelled) return
      const outcome = reconcile(resolved)
      // Solo la eliminación autoritativa limpia los recibos de lectura; quitar
      // un panel del layout los conserva.
      for (const removed of outcome.removed) {
        if (removed.status === 'not_found') useBoardAttentionStore.getState().forgetSession(removed.sessionId)
      }
      if (outcome.removed.length > 0) {
        toast.info(t('board.panesDropped', { n: outcome.removed.length }), { id: 'board-panes-dropped' })
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.ready, data.sessionsLoaded, data.sessionsById, engineGeneration, reconcile])

  // -- foco: llevar a la vista el panel enfocado ----------------------------
  useEffect(() => {
    if (!focusedPaneId || !canvasRef.current) return
    const element = [...canvasRef.current.querySelectorAll<HTMLElement>('[data-pane-id]')].find((node) => node.dataset.paneId === focusedPaneId)
    const reduced = useUIStore.getState().reduceMotion || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (typeof element?.scrollIntoView === 'function') {
      element.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
    }
  }, [focusedPaneId])

  // -- raíces compartidas ---------------------------------------------------
  const sharedRoots = useMemo(() => {
    const counts = new Map<string, number>()
    for (const pane of panes) {
      const root = canonicalRoot(data.sessionsById[pane.sessionId])
      if (root) counts.set(root, (counts.get(root) ?? 0) + 1)
    }
    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([root]) => root))
  }, [panes, data.sessionsById])

  // -- quitar y cerrar --------------------------------------------------------
  async function confirmClose() {
    if (!closing) return
    const { paneId, sessionId } = closing
    setClosing(null)
    const ok = await commands.closeSession(sessionId)
    if (ok) removePane(paneId)
  }
  const closingBusy = closing ? store.getState().busySessions.has(closing.sessionId) : false

  const openSingle = useCallback((sessionId: string) => {
    void commands.selectSession(sessionId)
    goNormal()
  }, [commands, goNormal])

  const currentSessionOnBoard = data.activeSession !== '' && panes.some((pane) => pane.sessionId === data.activeSession)

  // -- mensajería entre paneles (session_peer_messaging_v1) ------------------
  const peerMessaging = data.status?.capabilities.session_peer_messaging_v1 === true
  const peerLabelFor = useCallback((sessionId: string): string | null => {
    if (!panes.some((pane) => pane.sessionId === sessionId)) return null
    const record = data.sessionsById[sessionId]
    return record?.title || (record?.project_root ? projectDisplayName(record.project_root) : null) || t('sidebar.newChat')
  }, [panes, data.sessionsById, t])
  const focusSessionPane = useCallback((sessionId: string): boolean => {
    const pane = useBoardStore.getState().panes.find((item) => item.sessionId === sessionId)
    if (!pane) return false
    focusPane(pane.paneId)
    return true
  }, [focusPane])
  const peerNavigation = useMemo<PeerNavigation>(
    () => ({ labelFor: peerLabelFor, focusSession: focusSessionPane }),
    [peerLabelFor, focusSessionPane],
  )
  usePeerGroup({
    boardId,
    panes,
    sessionsById: data.sessionsById,
    messagingEnabled,
    supported: peerMessaging,
    engineReady: data.ready && data.sessionsLoaded,
    engineGeneration,
  })
  const focusedSessionId = panes.find((pane) => pane.paneId === focusedPaneId)?.sessionId ?? null
  usePeerNotifications({
    supported: peerMessaging,
    labelFor: peerLabelFor,
    focusedSessionId,
    focusSession: focusSessionPane,
  })

  return (
    <PeerNavigationProvider value={peerNavigation}>
    <div className="board-root">
      {persistError && (
        <div role="alert" className="board-banner">{t('board.persistError')}</div>
      )}
      {attentionPersistError && (
        <div role="status" className="board-banner">{t('board.attention.notPersisted')}</div>
      )}
      <div ref={canvasRef} className="board-canvas" role="region" aria-label={t('board.title')}>
        {panes.length === 0 ? (
          <BoardEmptyState
            onAddPane={openAddDialog}
            onAddCurrent={data.activeSession && !currentSessionOnBoard ? () => addSession(data.activeSession) : undefined}
          />
        ) : (
          <>
            {panes.map((pane, index) => {
              const root = canonicalRoot(data.sessionsById[pane.sessionId])
              return (
                <Fragment key={pane.paneId}>
                  <SessionPane
                    pane={pane}
                    focused={pane.paneId === focusedPaneId}
                    sharedRoot={root !== null && sharedRoots.has(root)}
                    canMoveLeft={index > 0}
                    canMoveRight={index < panes.length - 1}
                    onFocus={focusPane}
                    onOpenSingle={openSingle}
                    onRemove={removePane}
                    onRemoveAndClose={(paneId, sessionId) => setClosing({ paneId, sessionId })}
                    onOpenProviders={() => goSettings('providers')}
                    peerMessaging={peerMessaging}
                    peerLabelFor={peerLabelFor}
                  />
                  {!pane.collapsed && <PaneResizer pane={pane} />}
                </Fragment>
              )
            })}
            <div className="board-add-column">
              <button type="button" onClick={openAddDialog} className="board-add-button" aria-label={t('board.empty.addPane')} title={t('board.empty.addPane')}>
                <Plus size={18} aria-hidden="true" />
                <span>{t('board.empty.addPane')}</span>
              </button>
            </div>
          </>
        )}
      </div>
      <AddPaneDialog open={dialogOpen} onOpenChange={setDialogOpen} onAdded={addSession} />
      <AlertDialog open={closing !== null} onOpenChange={(next) => { if (!next) setClosing(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('board.pane.removeAndClose')}</AlertDialogTitle>
            <AlertDialogDescription>
              {closingBusy ? t('board.pane.removeAndClose.busy') : t('board.pane.removeAndClose.confirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('board.sameProject.cancel')}</AlertDialogCancel>
            <AlertDialogAction disabled={closingBusy} onClick={() => void confirmClose()}>{t('board.pane.removeAndClose')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </PeerNavigationProvider>
  )
}
