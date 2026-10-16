import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { ResizeHandle } from '../../components/ui/resize-handle'
import { useDragResize } from '../../hooks/useDragResize'
import { useI18n } from '../../i18n'
import { platform } from '../../platform'
import type { SessionSummary } from '../../services/engine'
import {
  CHAT_MIN_DOCKED_WIDTH,
  DOCK_MIN_WIDTH,
  selectDockLayout,
  selectSummaryOpen,
  useSessionDockStore,
  type DockSurface,
} from '../../stores/sessionDock'
import { selectOverlayDepth, useOverlayStore } from '../../stores/overlay'
import { useDockSignalsStore } from '../../stores/dockSignals'
import { automaticBrowserUiEnabled } from '../browser/automaticBrowserUi'
import { useBrowserFrame } from '../browser/useBrowserFrame'
import { FileWorkspaceProvider } from '../files/FileWorkspace'
import { useOptionalEngineData, useOptionalRuntimeStore } from '../engine/EngineContext'
import { useFlow } from '../flow/useFlow'
import type { RuntimeStore } from '../engine/runtimeStore'
import { useSessionTimelines } from '../engine/sessionSelectors'
import { sessionAgents } from '../agents/AgentsPanel'
import { presentedChangeSets } from '../activity/changeSetPresentation'
import { sessionPlans } from '../plan/planModel'
import { useAgentRunningCount } from '../terminal/agentTab'
import SessionDock from './SessionDock'
import SummaryPanel from '../summary/SummaryPanel'
import { ZoneBoundary } from '../../components/ZoneBoundary'

const HANDLE_WIDTH = 6
/** Lo que tarda en irse el Resumen flotante (`summary-float-out`). */
const SUMMARY_LEAVE_MS = 180

/** Acción tipada: alternar/abrir el panel lateral de **una** sesión (nunca de todos los providers montados). */
export const DOCK_TOGGLE_EVENT = 'rinari:dock-toggle'
export interface DockToggleDetail {
  sessionId: string
  /** Sin vista: oculta o muestra el panel (Ctrl+B). Con vista: la revela. */
  surface?: DockSurface
}
export function requestDockToggle(detail: DockToggleDetail): void {
  window.dispatchEvent(new CustomEvent<DockToggleDetail>(DOCK_TOGGLE_EVENT, { detail }))
}

export interface SessionWorkspaceProps {
  sessionId: string
  record: SessionSummary | null
  /** Conversación de la sesión (ChatView y su cola). */
  children: ReactNode
  /** `pane`: densidad de panel del board; `normal`: vista Normal. */
  density: 'normal' | 'pane'
  /** La sesión es la enfocada de su vista: un browser nuevo puede revelarse aquí. */
  focused: boolean
  sharedRoot?: boolean
  /** El Engine anuncia `browser_view_v1`; sin capability no se consulta. */
  browserEnabled?: boolean
  /** El Engine anuncia `desktop_terminal_v1`: el panel suma la vista Terminal. */
  terminalEnabled?: boolean
  /** Generación del Engine: al cambiar, el visor vuelve a inscribir sus watches. */
  engineGeneration?: number
  /** La sesión ejecuta un turno: al terminar se sondea el navegador una vez. */
  busy?: boolean
}

/**
 * Composición de una sesión compartida por Normal (`SingleSessionView`) y por
 * cada panel del board (`SessionPane`): conversación + panel lateral con sus
 * vistas en mosaico (#47). Una sola implementación del visor de archivos y del
 * browser; la disposición es por sesión (`sessionDock`). El panel ocupa ancho
 * real dentro de la sesión, sin tope (#44a): lo limita el chat, que no baja de
 * 300 px; si ni así caben, pasa a un cajón encima del chat. «Ampliar» lo lleva
 * a toda la conversación y deja el chat en una columna.
 */
export default function SessionWorkspace({ sessionId, record, children, density, focused, sharedRoot = false, browserEnabled = true, terminalEnabled = false, busy = false, engineGeneration }: SessionWorkspaceProps) {
  const { t } = useI18n()
  const layout = useSessionDockStore(selectDockLayout(sessionId))
  const setVisible = useSessionDockStore((state) => state.setVisible)
  const toggleVisible = useSessionDockStore((state) => state.toggleVisible)
  const summaryOpen = useSessionDockStore(selectSummaryOpen(sessionId))
  const setSummary = useSessionDockStore((state) => state.setSummary)
  const setWidth = useSessionDockStore((state) => state.setWidth)
  const setAmp = useSessionDockStore((state) => state.setAmp)
  const reveal = useSessionDockStore((state) => state.reveal)

  // Geometría real del contenedor: decide si el panel cabe al lado o va en cajón.
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
  const room = innerWidth === null ? null : innerWidth - CHAT_MIN_DOCKED_WIDTH - HANDLE_WIDTH
  const placement: 'docked' | 'drawer' = room === null || room >= DOCK_MIN_WIDTH ? 'docked' : 'drawer'

  const [liveWidth, setLiveWidth] = useState(layout.widthPx)
  useEffect(() => {
    setLiveWidth(layout.widthPx)
  }, [layout.widthPx])
  const amplified = layout.amp !== null && layout.visible && placement === 'docked'
  const shownWidth = room === null ? liveWidth : amplified ? room : Math.max(DOCK_MIN_WIDTH, Math.min(liveWidth, room))

  // «Ampliar» y volver: el ancho se anima en lugar de saltar (termina también sin pintar).
  const [animateWidth, setAnimateWidth] = useState(false)
  const widthKey = `${layout.amp}`
  const shownAmp = useRef(widthKey)
  useEffect(() => {
    if (shownAmp.current === widthKey) return
    shownAmp.current = widthKey
    setAnimateWidth(true)
    const timer = window.setTimeout(() => setAnimateWidth(false), 420)
    return () => window.clearTimeout(timer)
  }, [widthKey])
  // Esc devuelve el panel ampliado a su ancho, si nada encima la quiere.
  useEffect(() => {
    if (!amplified || !focused) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || selectOverlayDepth(useOverlayStore.getState()) > 0) return
      setAmp(sessionId, null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [amplified, focused, sessionId, setAmp])

  // Al cerrarse, un fantasma sin contenido con el ancho que tenía se pliega:
  // la salida se ve sin retener el panel real ni su navegador nativo.
  // Al abrirse (por el usuario, no al montar la vista) el panel crece desde 0
  // y el chat se encoge con él: la misma animación que el cierre, al revés.
  const [leaving, setLeaving] = useState<{ width: number; placement: 'docked' | 'drawer' } | null>(null)
  const [entering, setEntering] = useState(false)
  const shown = useRef({ visible: layout.visible, width: shownWidth, placement })
  useEffect(() => {
    const previous = shown.current
    shown.current = { visible: layout.visible, width: shownWidth, placement }
    if (layout.visible) {
      setLeaving(null)
      if (previous.visible) return
      setEntering(true)
      // Termina aunque la animación no avance (ventana sin pintar): el panel queda a su ancho.
      const timer = window.setTimeout(() => setEntering(false), 420)
      return () => window.clearTimeout(timer)
    }
    setEntering(false)
    if (!previous.visible) return
    setLeaving({ width: previous.width, placement: previous.placement })
    const timer = window.setTimeout(() => setLeaving(null), 360)
    return () => window.clearTimeout(timer)
  }, [layout.visible, shownWidth, placement])
  const { handleProps } = useDragResize({
    value: shownWidth,
    min: DOCK_MIN_WIDTH,
    max: () => Math.max(DOCK_MIN_WIDTH, room ?? DOCK_MIN_WIDTH),
    direction: 'left',
    onChange: (next) => {
      if (layout.amp) setAmp(sessionId, null)
      setLiveWidth(next)
    },
    onCommit: (final) => setWidth(sessionId, final),
    disabled: placement === 'drawer',
  })

  // Enlaces de archivo del transcript: revelan Archivos en este mismo panel.
  const revealFile = useCallback(() => reveal(sessionId, 'files'), [reveal, sessionId])

  // Acción tipada con destinatario explícito (atajos, paleta…).
  useEffect(() => {
    function onToggle(event: Event) {
      const detail = (event as CustomEvent<DockToggleDetail>).detail
      if (!detail || detail.sessionId !== sessionId) return
      if (detail.surface) reveal(sessionId, detail.surface)
      else toggleVisible(sessionId)
    }
    window.addEventListener(DOCK_TOGGLE_EVENT, onToggle)
    return () => window.removeEventListener(DOCK_TOGGLE_EVENT, onToggle)
  }, [sessionId, reveal, toggleVisible])

  // Navegador del Engine: se consulta a la cadencia de capturas solo con la
  // vista a la vista. Un browser aparece por actividad del agente, así que
  // fuera de ella basta una sonda al montar y otra al terminar un turno.
  // La pestaña elegida es de su conversación: este componente sigue montado
  // al cambiar de conversación en la vista Normal.
  const [targetOf, setTargetOf] = useState<{ sessionId: string; targetId: string }>({ sessionId, targetId: '' })
  const targetId = targetOf.sessionId === sessionId ? targetOf.targetId : ''
  const setTargetId = useCallback((next: string) => setTargetOf({ sessionId, targetId: next }), [sessionId])
  const [browserProbe, setBrowserProbe] = useState(0)
  const wasBusy = useRef(false)
  useEffect(() => {
    if (wasBusy.current && !busy) setBrowserProbe((value) => value + 1)
    wasBusy.current = busy
  }, [busy])
  const browserActive = layout.visible && layout.views.includes('browser')
  const browser = useBrowserFrame(sessionId, { active: browserActive, targetId, enabled: browserEnabled, probe: browserProbe })
  // Browser nativo: el panel se revela cuando el contexto pasa a estar listo,
  // que es cuando el agente empieza a usarlo de verdad. Una vez por contexto:
  // si el usuario lo cerró después, es su decisión. Con el panel abierto en
  // otra vista (Resumen, Archivos…) el Navegador se apila con ella; antes no
  // se mostraba y parecía que Rinari no había abierto nada.
  //
  // Estado **por conversación**: en la vista Normal este componente sigue
  // montado al cambiar de conversación. Con un solo valor, la conversación
  // nueva heredaba el «listo» de la anterior (y no se revelaba al abrir
  // Rinari una página) y su botón Navegador salía en vivo sin haberlo usado.
  const nativeStates = useRef(new Map<string, string>())
  const [nativeLiveBySession, setNativeLive] = useState<{ sessionId: string; live: 'agent' | 'live' | null } | null>(null)
  const nativeLive = nativeLiveBySession?.sessionId === sessionId ? nativeLiveBySession.live : null
  const focusedRef = useRef(focused)
  focusedRef.current = focused
  useEffect(() => {
    if (!sessionId) return
    let alive = true
    let unsubscribe: (() => void) | undefined
    void platform()
      .browser.onContextChanged((view) => {
        if (!alive || view.session_id !== sessionId) return
        const previous = nativeStates.current.get(sessionId) ?? null
        nativeStates.current.set(sessionId, view.context_state)
        setNativeLive({ sessionId, live: view.context_state === 'ready' ? (view.control_state === 'agent' ? 'agent' : 'live') : null })
        if (view.backend !== 'electron-native' || view.context_state !== 'ready' || previous === 'ready') return
        // Una línea en el registro de la app por cada contexto que pasa a
        // listo: si el panel no aparece, dice por qué.
        const skip = !automaticBrowserUiEnabled() ? 'automatic UI off' : !focusedRef.current ? 'not focused' : null
        const current = useSessionDockStore.getState().layoutFor(sessionId)
        const shown = current.visible && current.views.includes('browser')
        console.info(`[rinari] browser ready: ${sessionId} ${skip ? `not revealed (${skip})` : shown ? 'already shown' : 'revealed'}`)
        if (skip || shown) return
        reveal(sessionId, 'browser')
      })
      .then((stop) => {
        if (alive) unsubscribe = stop
        else stop()
      })
      .catch(() => {
        // Un host sin browser nativo no tiene nada que revelar.
      })
    return () => {
      alive = false
      unsubscribe?.()
    }
  }, [sessionId, reveal])

  const revealedInstance = useRef<string | null>(null)
  useEffect(() => {
    const instance = browser.connectedInstance
    if (!instance || revealedInstance.current === instance) return
    revealedInstance.current = instance
    // Un browser nuevo no roba foco a otro panel ni reemplaza lo que el
    // usuario mira: solo se revela con el panel oculto y la sesión enfocada.
    const current = useSessionDockStore.getState().layoutFor(sessionId)
    if (focused && !current.visible) reveal(sessionId, 'browser')
  }, [browser.connectedInstance, focused, reveal, sessionId])

  // Indicadores de los botones de la barra de título (#47).
  const publish = useDockSignalsStore((state) => state.publish)
  const clearSignals = useDockSignalsStore((state) => state.clear)
  const agentRunning = useAgentRunningCount(terminalEnabled ? sessionId : '')
  const browserSignal = nativeLive ?? (browser.frame?.state === 'connected' ? (busy ? 'agent' : 'live') : null)
  useEffect(() => { publish(sessionId, { browser: browserSignal, terminal: agentRunning }) }, [publish, sessionId, browserSignal, agentRunning])
  useEffect(() => () => clearSignals(sessionId), [clearSignals, sessionId])
  const runtime = useOptionalRuntimeStore()
  const chatRef = useRef<HTMLDivElement>(null)
  const closeSummary = useCallback(() => setSummary(sessionId, false), [setSummary, sessionId])
  const flowSupported = useOptionalEngineData()?.status?.capabilities?.project_flow_v1 === true

  return (
    <FileWorkspaceProvider sessionId={sessionId} onOpen={revealFile} engineGeneration={engineGeneration}>
      {runtime && <TimelineSignals store={runtime} sessionId={sessionId} focused={focused} />}
      {/* Solo la sesión destino de la barra de título pide su flujo. */}
      {focused && flowSupported && <FlowSignals sessionId={sessionId} />}
      <div ref={bodyRef} className="session-workspace" data-density={density} data-dock={layout.visible ? placement : 'hidden'} data-amp={amplified || undefined}>
        <div ref={chatRef} className="session-workspace-chat">
          {children}
          <FloatingSummary sessionId={sessionId} record={record} open={summaryOpen} focused={focused} column={chatRef} onClose={closeSummary} />
        </div>
        {!layout.visible && leaving && <div className="pane-dock-ghost" data-layout={leaving.placement} style={{ width: leaving.width }} aria-hidden="true" />}
        {layout.visible && (
          <>
            {placement === 'docked' && (
              <ResizeHandle
                {...handleProps}
                label={t('board.resize.workspace')}
                // Doble clic en el borde: amplía todo el panel, o lo devuelve.
                onDoubleClick={() => setAmp(sessionId, layout.amp ? null : 'all')}
              />
            )}
            <ZoneBoundary zone="side-panel">
            <SessionDock
              sessionId={sessionId}
              session={record}
              layout={layout}
              sharedRoot={sharedRoot}
              placement={placement}
              width={shownWidth}
              entering={entering}
              animateWidth={animateWidth}
              onHide={() => setVisible(sessionId, false)}
              browser={{ frame: browser.frame, error: browser.error, targetId, onTargetChange: setTargetId }}
              terminalEnabled={terminalEnabled}
              busy={busy}
            />
            </ZoneBoundary>
          </>
        )}
      </div>
    </FileWorkspaceProvider>
  )
}

/**
 * El Resumen (#82) flota sobre el chat, arriba a la derecha: no es parte del
 * panel lateral, así que abrirlo no lo abre, no cambia sus vistas (el
 * navegador nativo sigue donde estaba) ni el ancho del chat. No tapa el
 * composer: su borde de abajo se queda encima de él. Esc o la X lo cierran;
 * lo que lleva a otra vista también.
 */
function FloatingSummary({ sessionId, record, open, focused, column, onClose }: {
  sessionId: string
  record: SessionSummary | null
  open: boolean
  focused: boolean
  column: RefObject<HTMLDivElement | null>
  onClose: () => void
}) {
  const { t } = useI18n()
  // Al cerrarse se queda un momento para irse con su animación.
  const [rendered, setRendered] = useState(open)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    if (open) {
      setRendered(true)
      setLeaving(false)
      return
    }
    if (!rendered) return
    setLeaving(true)
    const timer = window.setTimeout(() => {
      setRendered(false)
      setLeaving(false)
    }, SUMMARY_LEAVE_MS)
    return () => window.clearTimeout(timer)
  }, [open, rendered])

  // Hasta dónde puede bajar: encima del composer (y de lo que va con él).
  const [bottom, setBottom] = useState(10)
  useLayoutEffect(() => {
    const chat = column.current
    if (!rendered || !chat) return
    const update = () => {
      const slot = chat.querySelector('.conversation-composer-slot')
      setBottom(slot ? Math.max(10, Math.round(chat.getBoundingClientRect().bottom - slot.getBoundingClientRect().top) + 10) : 10)
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(chat)
    const slot = chat.querySelector('.conversation-composer-slot')
    if (slot) observer.observe(slot)
    return () => observer.disconnect()
  }, [column, rendered])

  // Esc lo cierra si nada encima lo quiere y no estás escribiendo en otro sitio.
  const self = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!open || !focused) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || selectOverlayDepth(useOverlayStore.getState()) > 0) return
      const active = document.activeElement as HTMLElement | null
      const inside = Boolean(active && self.current?.contains(active))
      if (!inside && active && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, focused, onClose])

  if (!rendered) return null
  return (
    <aside
      ref={self}
      aria-label={t('summary.title')}
      data-testid="summary-dock"
      data-session-id={sessionId}
      className="summary-float"
      data-leaving={leaving || undefined}
      style={{ '--summary-bottom': `${bottom}px` } as CSSProperties}
    >
      <SummaryPanel sessionId={sessionId} record={record} onClose={onClose} />
    </aside>
  )
}

/** Una etapa del Flujo que te necesita enciende el botón Flujo en ámbar (#43). */
function FlowSignals({ sessionId }: { sessionId: string }) {
  const scope = useMemo(() => ({ kind: 'session' as const, id: sessionId }), [sessionId])
  const flow = useFlow(scope)
  const publish = useDockSignalsStore((state) => state.publish)
  const needsYou = (flow.data?.stages ?? []).some((stage) => stage.status === 'needs_you')
  useEffect(() => {
    publish(sessionId, { flowNeedsYou: needsYou })
    return () => publish(sessionId, { flowNeedsYou: false })
  }, [publish, sessionId, needsYou])
  return null
}

/** Agentes trabajando y archivos cambiados en el último turno con cambios, para sus botones. */
function TimelineSignals({ store, sessionId, focused }: { store: RuntimeStore; sessionId: string; focused: boolean }) {
  const timelines = useSessionTimelines(store, sessionId)
  const publish = useDockSignalsStore((state) => state.publish)
  const plans = sessionPlans(timelines).length
  // Cada vez que termina un plan, su vista se abre sola (#55); no al abrir una conversación que ya los tenía.
  // Se cuenta por conversación: al cambiar a una con más planes no se abría por error.
  const seenPlans = useRef<{ sessionId: string; plans: number } | null>(null)
  useEffect(() => {
    const previous = seenPlans.current?.sessionId === sessionId ? seenPlans.current.plans : null
    seenPlans.current = { sessionId, plans }
    if (previous !== null && plans > previous && focused) useSessionDockStore.getState().openView(sessionId, 'plan')
  }, [plans, focused, sessionId])
  useEffect(() => { publish(sessionId, { plans }) }, [publish, sessionId, plans])
  const agents = sessionAgents(timelines).filter((entry) => entry.live).length
  let changes = 0
  let latestAt = -Infinity
  for (const timeline of Object.values(timelines)) {
    const { latest } = presentedChangeSets(timeline)
    if (latest && timeline.startedAt > latestAt) {
      latestAt = timeline.startedAt
      changes = latest.files.length
    }
  }
  useEffect(() => { publish(sessionId, { agents, changes }) }, [publish, sessionId, agents, changes])
  return null
}
