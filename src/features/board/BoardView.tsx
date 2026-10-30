import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { commandMessage, engineApi, isCommandError, type SessionSummary } from '../../services/engine'
import { ResizeHandle } from '../../components/ui/resize-handle'
import { useDragResize } from '../../hooks/useDragResize'
import { useEngineCommands, useEngineData } from '../engine/EngineContext'
import { isSessionHidden } from '../engine/sessionVisibility'
import { useUIStore } from '../../stores/ui'
import {
  PANE_MAX_WIDTH,
  PANE_MIN_WIDTH,
  isDraftPane,
  useBoardStore,
  type BoardPane,
  type SessionResolution,
} from '../../stores/board'
import AddPaneDialog from './AddPaneDialog'
import BoardEmptyState from './BoardEmptyState'
import BoardToolbar from './BoardToolbar'
import SessionPane from './SessionPane'
import { COLUMN_WIDTH } from './CollapsedPaneStrip'
import { useBoardNavigation } from './useBoardNavigation'
import { SESSION_DRAG_TYPE, dropIndex, isSessionDrag } from './boardDrag'
import { useBoardAttentionStore } from '../../stores/boardAttention'

export interface BoardActions {
  addPane: () => void
  removePane: () => void
}

/** Ancho mínimo de un panel desplegado con «Ajustar a la vista» (CSS `.is-fit-to-view`). */
const FIT_MIN_PANE_WIDTH = 320
/**
 * Plegado, un panel es una columna con su estado (~200 px) si caben todas
 * junto a los desplegados; si no, todos caen a la tira de 48 px (plan-boards
 * B.2). Sin medida todavía (primer cuadro, jsdom), la tira de siempre.
 */
export function collapsedVariantFor(panes: BoardPane[], fitToView: boolean, available: number): 'column' | 'strip' {
  const columns = panes.filter((pane) => pane.collapsed && !isDraftPane(pane)).length
  if (columns === 0 || available <= 0) return 'strip'
  const strips = panes.filter((pane) => pane.collapsed && isDraftPane(pane)).length * 48
  const expanded = panes.filter((pane) => !pane.collapsed).reduce((sum, pane) => sum + (fitToView ? FIT_MIN_PANE_WIDTH : pane.width), 0)
  return expanded + strips + columns * COLUMN_WIDTH <= available ? 'column' : 'strip'
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
/** Un panel solo se retira por un estado de archivo (closed/archived) o por
 * inexistencia. `interrupted`/`stopped` son estados de runtime: la sesión
 * sigue visible y `session.open` la reanuda, igual que en el sidebar. */
function resolutionForState(state: SessionSummary['state']): SessionResolution {
  return isSessionHidden({ state }) ? { status: state as 'closed' | 'archived' } : { status: 'active' }
}

export default function BoardView({ actionsRef }: { actionsRef?: MutableRefObject<BoardActions> }) {
  const { t } = useI18n()
  const commands = useEngineCommands()
  const data = useEngineData()
  const goNormal = useUIStore((state) => state.goNormal)
  const goSettings = useUIStore((state) => state.goSettings)
  const panes = useBoardStore((state) => state.panes)
  const fitToView = useBoardStore((state) => state.fitToView)
  const focusedPaneId = useBoardStore((state) => state.focusedPaneId)
  const softLimit = useBoardStore((state) => state.softLimit)
  const addPane = useBoardStore((state) => state.addPane)
  const removePane = useBoardStore((state) => state.removePane)
  const focusPane = useBoardStore((state) => state.focusPane)
  const reconcile = useBoardStore((state) => state.reconcileResolvedSessions)
  const persistError = useBoardStore((state) => state.persistError)
  const attentionPersistError = useBoardAttentionStore((state) => state.persistError)
  const [dialogOpen, setDialogOpen] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)
  const paneRowRef = useRef<HTMLDivElement>(null)
  const [fitOverflow, setFitOverflow] = useState(false)
  const [canvasWidth, setCanvasWidth] = useState(0)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const measure = () => setCanvasWidth(canvas.clientWidth)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])
  const collapsedVariant = collapsedVariantFor(panes, fitToView, canvasWidth)
  // Ctrl+1…9 y Ctrl+J (plan-boards B.4.1).
  useBoardNavigation()

  // Flex reparte el espacio real después de reservar Añadir y las tiras. Solo
  // observamos si se alcanzó la densidad mínima: nunca persistimos geometría.
  useEffect(() => {
    const row = paneRowRef.current
    if (!fitToView || !row) {
      setFitOverflow(false)
      return
    }
    const measure = () => {
      const overflow = row.scrollWidth > row.clientWidth + 1
      setFitOverflow(overflow)
      if (!overflow) row.scrollLeft = 0
      if (canvasRef.current) canvasRef.current.scrollLeft = 0
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    // El aviso cambia la altura de la fila. Publicarlo fuera del ciclo del
    // observer evita realimentar su propia entrega de notificaciones.
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    })
    observer.observe(row)
    for (const child of row.children) observer.observe(child)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [fitToView, panes])

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
  const addDraftPane = useBoardStore((state) => state.addDraftPane)
  const addDraft = useCallback((projectId: string | null) => {
    warnSoftLimit()
    addDraftPane(projectId, { focus: true })
  }, [addDraftPane, warnSoftLimit])

  // -- soltar una conversación de la barra lateral (B.4.2) -------------------
  const [drop, setDrop] = useState<{ index: number; x: number } | null>(null)
  const dropAt = useCallback((clientX: number) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const nodes = [...canvas.querySelectorAll<HTMLElement>('.board-pane-row > [data-pane-id]')]
    const rects = nodes.map((node) => node.getBoundingClientRect())
    const index = dropIndex(clientX, rects)
    const box = canvas.getBoundingClientRect()
    const edge = index < rects.length ? rects[index].left : (rects.at(-1)?.right ?? box.left)
    return { index, x: edge - box.left + canvas.scrollLeft }
  }, [])
  const onDragOver = useCallback((event: React.DragEvent) => {
    if (!isSessionDrag(event.dataTransfer.types)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    const next = dropAt(event.clientX)
    setDrop((current) => (current && next && current.index === next.index && current.x === next.x ? current : next))
  }, [dropAt])
  const onDragLeave = useCallback((event: React.DragEvent) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setDrop(null)
  }, [])
  const onDrop = useCallback((event: React.DragEvent) => {
    const sessionId = event.dataTransfer.getData(SESSION_DRAG_TYPE)
    setDrop(null)
    if (!sessionId) return
    event.preventDefault()
    const target = dropAt(event.clientX)?.index ?? useBoardStore.getState().panes.length
    const existing = useBoardStore.getState().panes.findIndex((pane) => pane.sessionId === sessionId)
    if (existing >= 0) {
      const pane = useBoardStore.getState().panes[existing]
      // Quitarlo de su sitio corre una posición lo que estaba detrás.
      useBoardStore.getState().movePane(pane.paneId, target > existing ? target - 1 : target)
      focusPane(pane.paneId)
      return
    }
    warnSoftLimit()
    addPane(sessionId, { focus: true, atIndex: target })
  }, [addPane, dropAt, focusPane, warnSoftLimit])

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
        // Un borrador aún no tiene sesión que resolver.
        if (isDraftPane(pane)) continue
        const known = data.sessionsById[pane.sessionId]
        if (known) {
          resolved[pane.sessionId] = resolutionForState(known.state)
          continue
        }
        try {
          const row = (await engineApi.sessionGet(pane.sessionId)).session
          resolved[pane.sessionId] = resolutionForState(row.state)
        } catch (error) {
          resolved[pane.sessionId] = isCommandError(error) && (error.code === 'NOT_FOUND' || error.code === 'SESSION_NOT_FOUND')
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

  const openSingle = useCallback((sessionId: string) => {
    void commands.selectSession(sessionId)
    goNormal()
  }, [commands, goNormal])

  const currentSessionOnBoard = data.activeSession !== '' && panes.some((pane) => pane.sessionId === data.activeSession)

  return (
    <div className={fitToView ? 'board-root is-fit-to-view' : 'board-root'}>
      {persistError && (
        <div role="alert" className="board-banner">{t('board.persistError')}</div>
      )}
      {attentionPersistError && (
        <div role="status" className="board-banner">{t('board.attention.notPersisted')}</div>
      )}
      {panes.length > 0 && <BoardToolbar onAddPane={openAddDialog} />}
      {fitToView && fitOverflow && <div role="status" className="board-banner">{t('board.fitOverflow')}</div>}
      <div ref={canvasRef} className="board-canvas" role="region" aria-label={t('board.title')} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} data-dropping={drop ? '' : undefined}>
        {drop && <span className="board-drop-guide" aria-hidden="true" data-testid="board-drop-guide" style={{ left: drop.x }} />}
        {panes.length === 0 ? (
          <BoardEmptyState
            onAddPane={openAddDialog}
            onAddCurrent={data.activeSession && !currentSessionOnBoard ? () => addSession(data.activeSession) : undefined}
          />
        ) : (
          <>
            <div ref={paneRowRef} className="board-pane-row">
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
                      onOpenProviders={() => goSettings('providers')}
                      collapsedVariant={collapsedVariant}
                    />
                    {!pane.collapsed && !fitToView && <PaneResizer pane={pane} />}
                  </Fragment>
                )
              })}
            </div>
          </>
        )}
      </div>
      <AddPaneDialog open={dialogOpen} onOpenChange={setDialogOpen} onAdded={addSession} onAddDraft={addDraft} />
    </div>
  )
}
