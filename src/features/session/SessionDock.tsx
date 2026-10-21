import { AnimatePresence, motion } from 'framer-motion'
import { ListTree, Maximize2, Minimize2, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { useI18n } from '../../i18n'
import type { SessionSummary } from '../../services/engine'
import type { BrowserView as BrowserFrame } from '../../types/protocol.generated'
import { FileViewer, useFileWorkspace } from '../files/FileWorkspace'
import FileTree from '../files/FileTree'
import BrowserSurface from '../browser/BrowserSurface'
import TerminalPanel from '../terminal/TerminalPanel'
import AgentsPanel from '../agents/AgentsPanel'
import TurnChangesView from '../workspace/TurnChangesView'
import CheckpointsPanel from '../workspace/CheckpointsPanel'
import ArtifactsPanel from '../workspace/ArtifactsPanel'
import FlowView from '../flow/FlowView'
import PlanView from '../plan/PlanView'
import { selectOverlayDepth, useOverlayStore } from '../../stores/overlay'
import {
  DOCK_VIEWS,
  FILES_SIDE_MIN_WIDTH,
  FILES_TREE_DEFAULT_WIDTH,
  FILES_TREE_MAX_WIDTH,
  FILES_TREE_MIN_WIDTH,
  dockNamespaceKey,
  selectDockLayout,
  mosaicGeometry,
  mosaicShape,
  type DockBox,
  useSessionDockStore,
  type DockSection,
  type DockSplit,
  type DockView,
  type SessionDockLayout,
} from '../../stores/sessionDock'
import { useDockDragStore } from '../../stores/dockDrag'
import { cn } from '../../lib/utils'
import { useCalmMotion } from '../../lib/motion'
import { DOCK_VIEW_ICONS, DOCK_VIEW_LABELS } from './dockViews'
import RulesView from '../agency/RulesView'
import { PostBoard } from '../agency/Board'

export interface SessionDockProps {
  sessionId: string
  session: SessionSummary | null
  layout: SessionDockLayout
  sharedRoot: boolean
  /** `docked`: columna al lado del chat. `drawer`: superpuesto dentro de la sesión. */
  placement: 'docked' | 'drawer'
  width: number
  /** Recién abierto por el usuario: crece desde 0 (o se desliza si es un drawer). */
  entering?: boolean
  /** El ancho cambia por «Ampliar»: se anima en lugar de saltar. */
  animateWidth?: boolean
  onHide: () => void
  browser: { frame: BrowserFrame | null; error: string; targetId: string; onTargetChange: (targetId: string) => void }
  /** El Engine anuncia `desktop_terminal_v1`: sin ella no hay vista Terminal. */
  terminalEnabled?: boolean
  /** A turn is running: the browser hands control to Rinari, and back when it ends. */
  busy?: boolean
}

const SPLIT_STEP = 0.05
/** Hueco entre las vistas del mosaico: cada una es su propia tarjeta (ronda 1434, D). */
const GAP = 10
const STACK_MIN = 0.12

/**
 * Panel lateral de una sesión (plan 0.4.0 #47): hasta cuatro vistas en
 * mosaico. 1 ocupa todo; 2, una arriba y otra abajo (lado a lado si el panel
 * es muy ancho y bajo); 3, dos apiladas a la izquierda y una alta a la
 * derecha; 4, una cuadrícula de 2×2. Un panel angosto las pone en una sola
 * columna. Cada vista tiene su cabecera (que se arrastra para cambiarla de
 * sitio), «Ampliar» y cerrar; los separadores se arrastran en los dos ejes.
 * Ocupa ancho real dentro de la sesión o, si no cabe, va de cajón encima del
 * chat. Cerrar una vista no cierra archivos, navegador ni procesos.
 */
export default function SessionDock({
  sessionId,
  session,
  layout,
  sharedRoot,
  placement,
  width,
  entering = false,
  animateWidth = false,
  onHide,
  browser,
  terminalEnabled = false,
  busy = false,
}: SessionDockProps) {
  const { t } = useI18n()
  const root = useRef<HTMLElement>(null)
  const mosaic = useRef<HTMLDivElement>(null)
  const setSplit = useSessionDockStore((state) => state.setSplit)
  const setStack = useSessionDockStore((state) => state.setStack)
  const swapViews = useSessionDockStore((state) => state.swapViews)
  const dragging = useDockDragStore((state) => state.active)

  const available = layout.views.filter((view) => view !== 'terminal' || terminalEnabled)
  const views = layout.amp && layout.amp !== 'all' && available.includes(layout.amp) ? [layout.amp] : available
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    const element = mosaic.current
    if (!element) return
    const measure = () => setSize((current) => {
      const next = { width: element.clientWidth, height: element.clientHeight }
      return current && current.width === next.width && current.height === next.height ? current : next
    })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const shape = mosaicShape(views, size)
  const shapeKey = shape.map((column) => column.join('+')).join('|')
  // Al reorganizarse (una vista más o menos, otro sitio, ampliar) las cajas se
  // deslizan a su sitio nuevo; un cambio de tamaño del panel no se anima.
  const [animating, setAnimating] = useState(false)
  const shownShape = useRef(shapeKey)
  useEffect(() => {
    if (shownShape.current === shapeKey) return
    shownShape.current = shapeKey
    setAnimating(true)
    const timer = window.setTimeout(() => setAnimating(false), 320)
    return () => window.clearTimeout(timer)
  }, [shapeKey])

  // Mientras se arrastra un separador, las proporciones viven aquí y se
  // guardan al soltar: el arrastre sigue al puntero sin escribir en disco.
  const [draft, setDraft] = useState<{ split?: DockSplit; stack?: number[] } | null>(null)
  const split = draft?.split ?? layout.split
  const stack = draft?.stack && draft.stack.length === views.length ? draft.stack : fitWeights(views.length === 1 ? [1] : layout.stack, views.length)

  // Un cajón cubre el chat: el foco entra al panel y vuelve al cerrarlo.
  useEffect(() => {
    if (placement !== 'drawer') return
    const previous = document.activeElement as HTMLElement | null
    root.current?.querySelector<HTMLElement>('button')?.focus()
    return () => previous?.focus?.()
  }, [placement])

  const columnWeights = shape.length === 2 ? [split.col, 1 - split.col] : [1]
  const rowWeights = (column: number, count: number): number[] => {
    if (shape.length === 1) return stack
    if (count === 1) return [1]
    const top = column === 0 ? split.left : split.right
    return [top, 1 - top]
  }

  // Todas las vistas abiertas quedan montadas, en un orden fijo; las que no
  // caben a la vista (otra ampliada) solo se ocultan.
  const mounted = DOCK_VIEWS.filter((view) => available.includes(view))
  const geometry = mosaicGeometry(
    shape,
    { columns: columnWeights, rows: shape.map((column, index) => rowWeights(index, column.length)) },
    size ?? { width, height: 600 },
    GAP,
  )

  /** Arrastre de un separador: `axis` x mueve la columna; y, el alto dentro de una columna. */
  function startSplit(event: PointerEvent<HTMLElement>, axis: 'x' | 'y', column: number, index: number) {
    if (event.button !== 0) return
    const container = mosaic.current
    if (!container) return
    event.preventDefault()
    // Se escucha en la ventana, no con captura del puntero: al retirarse el
    // navegador nativo durante el arrastre la captura puede perderse.
    const pointerId = event.pointerId
    useDockDragStore.getState().begin()
    // El separador que se arrastra se ve hasta soltarlo, aunque el puntero se salga de él.
    const handle = event.currentTarget
    handle.dataset.dragging = 'true'
    const rect = container.getBoundingClientRect()
    const startStack = [...stack]
    let latest: { split?: DockSplit; stack?: number[] } = {}
    const move = (moveEvent: globalThis.PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return
      if (axis === 'x') {
        const col = clamp((moveEvent.clientX - rect.left) / rect.width)
        latest = { split: { ...split, col } }
      } else if (shape.length === 1) {
        // Una sola columna: el separador reparte el alto entre sus dos vecinas.
        const pair = startStack[index] + startStack[index + 1]
        const before = startStack.slice(0, index).reduce((sum, value) => sum + value, 0)
        const at = (moveEvent.clientY - rect.top) / rect.height - before
        const first = Math.min(pair - STACK_MIN, Math.max(STACK_MIN, at))
        const next = [...startStack]
        next[index] = first
        next[index + 1] = pair - first
        latest = { stack: next }
      } else {
        const top = clamp((moveEvent.clientY - rect.top) / rect.height)
        latest = { split: { ...split, [column === 0 ? 'left' : 'right']: top } }
      }
      setDraft(latest)
    }
    const end = (commit: boolean) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      useDockDragStore.getState().end()
      delete handle.dataset.dragging
      if (commit && latest.split) setSplit(sessionId, latest.split)
      if (commit && latest.stack) setStack(sessionId, latest.stack)
      setDraft(null)
    }
    const up = () => end(true)
    const cancel = () => end(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }

  function keySplit(event: KeyboardEvent<HTMLElement>, axis: 'x' | 'y', column: number, index: number) {
    const grow = axis === 'x' ? event.key === 'ArrowRight' : event.key === 'ArrowDown'
    const shrink = axis === 'x' ? event.key === 'ArrowLeft' : event.key === 'ArrowUp'
    if (!grow && !shrink) return
    event.preventDefault()
    const delta = grow ? SPLIT_STEP : -SPLIT_STEP
    if (axis === 'x') setSplit(sessionId, { col: clamp(split.col + delta) })
    else if (shape.length === 1) {
      const pair = stack[index] + stack[index + 1]
      const first = Math.min(pair - STACK_MIN, Math.max(STACK_MIN, stack[index] + delta))
      const next = [...stack]
      next[index] = first
      next[index + 1] = pair - first
      setStack(sessionId, next)
    } else {
      const key = column === 0 ? 'left' : 'right'
      setSplit(sessionId, { [key]: clamp(split[key] + delta) })
    }
  }

  // Arrastrar una vista por su cabecera hasta otra: cambian de sitio.
  const [moving, setMoving] = useState<{ view: DockView; over: DockView | null; x: number; y: number } | null>(null)
  function startMove(event: PointerEvent<HTMLElement>, view: DockView) {
    if (event.button !== 0 || views.length < 2) return
    if ((event.target as HTMLElement).closest('button, a, input, select, textarea, [role="radiogroup"]')) return
    const origin = { x: event.clientX, y: event.clientY }
    const pointerId = event.pointerId
    let started = false
    let over: DockView | null = null
    const move = (moveEvent: globalThis.PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return
      if (!started) {
        if (Math.hypot(moveEvent.clientX - origin.x, moveEvent.clientY - origin.y) < 5) return
        started = true
        useDockDragStore.getState().begin()
      }
      const target = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest<HTMLElement>('[data-dock-view]')
      const candidate = target && root.current?.contains(target) ? (target.dataset.dockView as DockView) : null
      over = candidate && candidate !== view ? candidate : null
      setMoving({ view, over, x: moveEvent.clientX, y: moveEvent.clientY })
    }
    const end = (commit: boolean) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', escape, true)
      if (started) useDockDragStore.getState().end()
      if (commit && started && over) swapViews(sessionId, view, over)
      setMoving(null)
    }
    const up = () => end(true)
    const cancel = () => end(false)
    const escape = (keyEvent: globalThis.KeyboardEvent) => {
      if (keyEvent.key !== 'Escape') return
      keyEvent.stopPropagation()
      end(false)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', escape, true)
  }

  return (
    <aside
      ref={root}
      aria-label={t('dock.label')}
      data-testid="session-dock"
      data-session-id={sessionId}
      data-layout={placement}
      data-views={views.join(' ')}
      data-amp={layout.amp ?? undefined}
      className={cn('pane-dock session-dock', placement === 'drawer' && 'pane-dock-drawer')}
      data-entering={entering || undefined}
      data-animate-width={animateWidth || undefined}
      style={placement === 'docked' ? { width } : undefined}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && placement === 'drawer' && !event.defaultPrevented) onHide()
      }}
    >
      <div ref={mosaic} className="dock-mosaic" data-shape={shape.map((column) => column.length).join('')} data-dragging={dragging || draft ? true : undefined} data-animating={animating || undefined}>
        {mounted.map((view) => {
          const box = geometry.tiles[view]
          return (
            <DockTile
              key={view}
              sessionId={sessionId}
              view={view}
              box={box ?? null}
              amplified={layout.amp === view}
              dropTarget={moving?.over === view}
              lifted={moving?.view === view && moving.over !== null}
              onHeaderPointerDown={(event) => startMove(event, view)}
            >
              <DockViewBody
                view={view}
                sessionId={sessionId}
                session={session}
                sharedRoot={sharedRoot}
                browser={browser}
                busy={busy}
                terminalEnabled={terminalEnabled}
                shown={box !== undefined}
                width={box?.width ?? null}
              />
            </DockTile>
          )
        })}
        {geometry.splitters.map((splitter) => (
          <DockSplitter
            key={`${splitter.axis}-${splitter.column}-${splitter.index}`}
            axis={splitter.axis}
            box={splitter.box}
            label={t(splitter.axis === 'x' ? 'dock.resizeColumns' : 'dock.resizeRows')}
            value={splitter.axis === 'x' ? split.col : rowWeights(splitter.column, shape[splitter.column]?.length ?? 1)[splitter.index] ?? 0.5}
            onPointerDown={(event) => startSplit(event, splitter.axis, splitter.column, splitter.index)}
            onKeyDown={(event) => keySplit(event, splitter.axis, splitter.column, splitter.index)}
          />
        ))}
      </div>
      {moving?.over && (
        <div className="dock-move-ghost" style={{ transform: `translate(${moving.x + 12}px, ${moving.y + 10}px)` }} aria-hidden="true">
          {t(DOCK_VIEW_LABELS[moving.view])}
        </div>
      )}
    </aside>
  )
}

const clamp = (value: number) => Math.min(0.85, Math.max(0.15, value))
function fitWeights(weights: number[], count: number): number[] {
  if (weights.length !== count) return Array.from({ length: count }, () => 1 / Math.max(1, count))
  return weights
}

function DockSplitter({ axis, box, label, value, onPointerDown, onKeyDown }: {
  axis: 'x' | 'y'
  box: DockBox
  label: string
  value: number
  onPointerDown: (event: PointerEvent<HTMLElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}) {
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-valuemin={15}
      aria-valuemax={85}
      aria-valuenow={Math.round(value * 100)}
      className="dock-splitter"
      data-axis={axis}
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  )
}

/**
 * Una vista del mosaico con su cabecera. Si se abrió desde su botón de la
 * barra de título, un fantasma vacío viaja de ese botón a su sitio y el
 * contenido aparece con opacidad al llegar: la vista nunca se mueve con
 * `transform` (el navegador nativo no lo admite, §5).
 */
function DockTile({ sessionId, view, box, amplified, dropTarget, lifted, onHeaderPointerDown, children }: {
  sessionId: string
  view: DockView
  /** Sin caja: otra vista está ampliada; esta queda montada pero oculta. */
  box: DockBox | null
  amplified: boolean
  dropTarget: boolean
  lifted: boolean
  onHeaderPointerDown: (event: PointerEvent<HTMLElement>) => void
  children: ReactNode
}) {
  const { t } = useI18n()
  const calm = useCalmMotion()
  const closeView = useSessionDockStore((state) => state.closeView)
  const setAmp = useSessionDockStore((state) => state.setAmp)
  const element = useRef<HTMLElement>(null)
  const [arriving, setArriving] = useState(false)
  const Icon = DOCK_VIEW_ICONS[view]
  const label = t(DOCK_VIEW_LABELS[view])

  useLayoutEffect(() => {
    const state = useSessionDockStore.getState()
    const key = dockNamespaceKey(state.homeId, sessionId)
    const launch = state.launches[key]
    const tile = element.current
    if (!launch || launch.view !== view || Date.now() - launch.at > 800 || !tile || !box) return
    useSessionDockStore.setState((current) => {
      const launches = { ...current.launches }
      delete launches[key]
      return { launches }
    })
    if (calm) return
    // La caja se mide dos cuadros después: el efecto de la vista corre antes
    // que el del panel que mide el mosaico, y hasta entonces la caja usa un
    // alto provisional (con una sola vista el realce acababa a media altura).
    let ghost: HTMLDivElement | null = null
    let timer = 0
    let frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => {
        // Con el panel recién abierto, su despliegue ya es el movimiento de entrada.
        if (!tile.isConnected || tile.closest('[data-entering]')) return
        const target = tile.getBoundingClientRect()
        ghost = document.createElement('div')
        ghost.className = 'dock-launch-ghost'
        ghost.setAttribute('aria-hidden', 'true')
        document.body.appendChild(ghost)
        setArriving(true)
        const from = launch.rect
        const animation = ghost.animate?.([
          { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, opacity: 0.5 },
          { left: `${target.left}px`, top: `${target.top}px`, width: `${target.width}px`, height: `${target.height}px`, opacity: 1 },
        ], { duration: 330, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' })
        // Termina también con un temporizador: si la ventana no pinta, la animación no avanza (§5).
        const finish = () => { ghost?.remove(); setArriving(false) }
        timer = window.setTimeout(finish, 420)
        if (animation) animation.onfinish = finish
        else finish()
      })
    })
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer); ghost?.remove() }
    // Solo al montarse la vista (abierta desde su botón), no al moverse su caja.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calm, sessionId, view])

  return (
    <section
      ref={element}
      className="dock-tile"
      data-dock-view={view}
      data-testid="dock-view"
      data-arriving={arriving || undefined}
      data-drop-target={dropTarget || undefined}
      data-lifted={lifted || undefined}
      aria-label={label}
      aria-hidden={box ? undefined : true}
      data-hidden={box ? undefined : true}
      style={(box ? { left: box.left, top: box.top, width: box.width, height: box.height } : { left: 0, top: 0, width: 0, height: 0 }) as CSSProperties}
    >
      <header className="dock-tile-head" onPointerDown={onHeaderPointerDown}>
        <Icon size={14} aria-hidden="true" className="dock-tile-icon" />
        <h2 className="dock-tile-title">{label}</h2>
        <span className="flex-1" />
        {view === 'files' && box && box.width >= FILES_SIDE_MIN_WIDTH && <FilesTreeToggle sessionId={sessionId} />}
        <button
          type="button"
          className="pane-header-icon"
          aria-label={amplified ? t('dock.restore', { view: label }) : t('dock.amplify', { view: label })}
          title={amplified ? t('dock.restoreHint') : t('dock.amplifyHint')}
          aria-pressed={amplified}
          onClick={() => setAmp(sessionId, amplified ? null : view)}
        >
          {amplified ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
        <button type="button" className="pane-header-icon" aria-label={t('dock.closeView', { view: label })} title={t('dock.closeView', { view: label })} onClick={() => closeView(sessionId, view)}>
          <X size={14} />
        </button>
      </header>
      <div className="dock-tile-body">{children}</div>
    </section>
  )
}

/** Lo que muestra cada vista. Checkpoints va al pie de Cambios y Artefactos al pie de Archivos (#47). */
function DockViewBody({ view, sessionId, session, sharedRoot, browser, busy, terminalEnabled, shown, width }: {
  view: DockView
  sessionId: string
  session: SessionSummary | null
  sharedRoot: boolean
  browser: SessionDockProps['browser']
  busy: boolean
  terminalEnabled: boolean
  /** A la vista (no oculta detrás de otra ampliada). */
  shown: boolean
  /** Ancho de su caja en el mosaico; sin caja, null. */
  width: number | null
}) {
  const { t } = useI18n()
  const overlayDepth = useOverlayStore(selectOverlayDepth)
  const dragging = useDockDragStore((state) => state.active)
  const path = session?.project_root ?? session?.current_cwd ?? null
  switch (view) {
    case 'browser':
      return (
        <BrowserSurface
          sessionId={sessionId}
          frame={browser.frame}
          error={browser.error}
          targetId={browser.targetId}
          onTargetChange={browser.onTargetChange}
          shown={shown}
          // Un modal encima, o un arrastre que cruza la página, retira la
          // vista nativa: el puntero tiene que seguir llegando a la app.
          overlayDepth={overlayDepth + (dragging ? 1 : 0)}
          busy={busy}
          projectId={session?.project_id ?? null}
        />
      )
    case 'terminal':
      return terminalEnabled ? <TerminalPanel sessionId={sessionId} /> : null
    case 'agents':
      return <AgentsPanel sessionId={sessionId} />
    case 'files':
      return <FilesView sessionId={sessionId} width={width} />
    case 'changes':
      return path === null ? <TurnChangesView sessionId={sessionId} path={null} /> : (
        <div className="dock-stack">
          <div className="dock-stack-main"><TurnChangesView sessionId={sessionId} path={path} /></div>
          <DockSection sessionId={sessionId} view="changes" section="checkpoints" title={t('workspace.tab.checkpoints')}>
            <CheckpointsPanel key={path} path={path} />
          </DockSection>
        </div>
      )
    case 'flow':
      return <FlowView sessionId={sessionId} embedded />
    case 'plan':
      return <PlanView sessionId={sessionId} />
    case 'rules':
      return <RulesView sessionId={sessionId} />
    case 'board':
      return <PostBoard sessionId={sessionId} />
  }
  void sharedRoot
}

/** El visor no baja de aquí con el árbol al lado. */
const FILES_VIEWER_MIN = 320
const TREE_STEP = 16
const TREE_EASE = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const }

/**
 * La vista Archivos (P9): con ancho de sobra, el visor a la izquierda y el
 * árbol del proyecto en una columna a la derecha, como en Claude Code. Su
 * borde se arrastra (el ancho se guarda por sesión) y el botón de la cabecera
 * la pliega. Angosta, el árbol va encima del visor. Artefactos sigue al pie
 * del visor en los dos casos.
 */
function FilesView({ sessionId, width }: { sessionId: string; width: number | null }) {
  const { t } = useI18n()
  const calm = useCalmMotion()
  const tree = useSessionDockStore((state) => selectDockLayout(sessionId)(state).tree)
  const setFilesTree = useSessionDockStore((state) => state.setFilesTree)
  const [draft, setDraft] = useState<number | null>(null)
  // Solo mostrar u ocultar la columna se anima; un cambio de ancho del panel la sigue al momento.
  const [seenOpen, setSeenOpen] = useState(tree.open)
  const [opening, setOpening] = useState(false)
  if (seenOpen !== tree.open) {
    setSeenOpen(tree.open)
    setOpening(tree.open)
  }
  const artifacts = (
    <DockSection sessionId={sessionId} view="files" section="artifacts" title={t('workspace.tab.artifacts')}>
      <ArtifactsPanel sessionId={sessionId} />
    </DockSection>
  )
  if (width === null || width < FILES_SIDE_MIN_WIDTH) {
    return (
      <div className="dock-stack">
        <FileTreeSection sessionId={sessionId} />
        <FileViewer className="dock-stack-main" />
        {artifacts}
      </div>
    )
  }
  const max = Math.max(FILES_TREE_MIN_WIDTH, Math.min(FILES_TREE_MAX_WIDTH, width - FILES_VIEWER_MIN))
  const fit = (value: number) => Math.round(Math.min(max, Math.max(FILES_TREE_MIN_WIDTH, value)))
  const treeWidth = fit(draft ?? tree.widthPx)

  function startResize(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) return
    const aside = event.currentTarget.parentElement
    if (!aside) return
    event.preventDefault()
    const pointerId = event.pointerId
    const right = aside.getBoundingClientRect().right
    const handle = event.currentTarget
    handle.dataset.dragging = 'true'
    useDockDragStore.getState().begin()
    let latest: number | null = null
    const move = (moveEvent: globalThis.PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return
      latest = fit(right - moveEvent.clientX)
      setDraft(latest)
    }
    const end = (commit: boolean) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      useDockDragStore.getState().end()
      delete handle.dataset.dragging
      if (commit && latest !== null) setFilesTree(sessionId, { widthPx: latest })
      setDraft(null)
    }
    const up = () => end(true)
    const cancel = () => end(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }

  function keyResize(event: KeyboardEvent<HTMLElement>) {
    // La columna está a la derecha: la flecha izquierda la ensancha.
    const delta = event.key === 'ArrowLeft' ? TREE_STEP : event.key === 'ArrowRight' ? -TREE_STEP : 0
    if (!delta) return
    event.preventDefault()
    setFilesTree(sessionId, { widthPx: fit(treeWidth + delta) })
  }

  return (
    <div className="files-split">
      <div className="dock-stack files-split-main">
        <FileViewer className="dock-stack-main" />
        {artifacts}
      </div>
      <AnimatePresence initial={false}>
        {tree.open && (
          <motion.aside
            key="tree"
            className="files-side"
            data-testid="files-side"
            aria-label={t('files.tree.title')}
            initial={{ width: 0 }}
            animate={{ width: treeWidth }}
            exit={{ width: 0, transition: calm ? { duration: 0 } : TREE_EASE }}
            transition={opening && !calm ? TREE_EASE : { duration: 0 }}
            onAnimationComplete={() => setOpening(false)}
          >
            <div
              role="separator"
              tabIndex={0}
              aria-label={t('files.tree.resize')}
              aria-orientation="vertical"
              aria-valuemin={FILES_TREE_MIN_WIDTH}
              aria-valuemax={max}
              aria-valuenow={treeWidth}
              title={t('files.tree.resizeHint')}
              className="dock-splitter files-side-divider"
              data-axis="x"
              onPointerDown={startResize}
              onKeyDown={keyResize}
              onDoubleClick={() => setFilesTree(sessionId, { widthPx: FILES_TREE_DEFAULT_WIDTH })}
            />
            <div className="files-side-scroll" style={{ width: treeWidth }}>
              <FileTree sessionId={sessionId} />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  )
}

/** El botón de la cabecera de Archivos que muestra u oculta la columna del árbol. */
function FilesTreeToggle({ sessionId }: { sessionId: string }) {
  const { t } = useI18n()
  const open = useSessionDockStore((state) => selectDockLayout(sessionId)(state).tree.open)
  const setFilesTree = useSessionDockStore((state) => state.setFilesTree)
  const label = t(open ? 'files.tree.hide' : 'files.tree.show')
  return (
    <button
      type="button"
      className="pane-header-icon"
      data-testid="files-tree-toggle"
      aria-label={label}
      title={label}
      aria-pressed={open}
      onClick={() => setFilesTree(sessionId, { open: !open })}
    >
      <ListTree size={14} />
    </button>
  )
}

/**
 * El árbol del proyecto encima del archivo abierto (#98), en la vista
 * angosta: desplegado mientras no hay nada abierto; con un archivo abierto
 * se puede plegar.
 */
function FileTreeSection({ sessionId }: { sessionId: string }) {
  const { t } = useI18n()
  const files = useFileWorkspace()
  const hasFile = Boolean(files?.selected)
  const [open, setOpen] = useState(!hasFile)
  useEffect(() => { if (!hasFile) setOpen(true) }, [hasFile])
  return (
    <details className="dock-section file-tree-section" open={open} onToggle={(event) => setOpen(event.currentTarget.open)} data-section="tree" data-full={!hasFile || undefined}>
      <summary className="dock-section-head">{t('files.tree.title')}</summary>
      {open && <FileTree sessionId={sessionId} />}
    </details>
  )
}

/** Sección plegable al pie de una vista; se abre sola si la revelaron hacia ella. */
function DockSection({ sessionId, view, section, title, children }: { sessionId: string; view: DockView; section: DockSection; title: string; children: ReactNode }) {
  const hint = useSessionDockStore((state) => state.sections[dockNamespaceKey(state.homeId, sessionId)])
  const [open, setOpen] = useState(false)
  const element = useRef<HTMLDetailsElement>(null)
  const seen = useRef(0)
  useEffect(() => {
    if (!hint || hint.view !== view || hint.section !== section || hint.at === seen.current) return
    seen.current = hint.at
    setOpen(true)
    element.current?.scrollIntoView?.({ block: 'nearest' })
  }, [hint, view, section])
  return (
    <details ref={element} className="dock-section" open={open} onToggle={(event) => setOpen(event.currentTarget.open)} data-section={section}>
      <summary className="dock-section-head">{title}</summary>
      {open && <div className="dock-section-body">{children}</div>}
    </details>
  )
}
