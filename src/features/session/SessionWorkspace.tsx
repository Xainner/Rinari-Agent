import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ResizeHandle } from '../../components/ui/resize-handle'
import { useDragResize } from '../../hooks/useDragResize'
import { useI18n } from '../../i18n'
import { platform } from '../../platform'
import type { SessionSummary } from '../../services/engine'
import {
  CHAT_MIN_DOCKED_WIDTH,
  DOCK_MIN_WIDTH,
  selectDockLayout,
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
import { cn } from '../../lib/utils'
import { ZoneBoundary } from '../../components/ZoneBoundary'

const HANDLE_WIDTH = 6
/** El Resumen es un mini panel angosto: el chat casi no se encoge (#82). */
export const SUMMARY_WIDTH = 320

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
  const toggleSummary = useSessionDockStore((state) => state.toggleSummary)
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
  const summary = layout.summary
  const placement: 'docked' | 'drawer' = room === null || room >= (summary ? SUMMARY_WIDTH : DOCK_MIN_WIDTH) ? 'docked' : 'drawer'

  const [liveWidth, setLiveWidth] = useState(layout.widthPx)
  useEffect(() => {
    setLiveWidth(layout.widthPx)
  }, [layout.widthPx])
  const amplified = layout.amp !== null && layout.visible && !summary && placement === 'docked'
  const shownWidth = summary ? SUMMARY_WIDTH : room === null ? liveWidth : amplified ? room : Math.max(DOCK_MIN_WIDTH, Math.min(liveWidth, room))

  // «Ampliar» y volver: el ancho se anima en lugar de saltar (termina también sin pintar).
  const [animateWidth, setAnimateWidth] = useState(false)
  // También al pasar entre el Resumen y las vistas, que tienen otro ancho.
  const widthKey = `${layout.amp}|${summary}`
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
  const [targetId, setTargetId] = useState('')
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
  const nativeState = useRef<string | null>(null)
  const [nativeLive, setNativeLive] = useState<'agent' | 'live' | null>(null)
  const focusedRef = useRef(focused)
  focusedRef.current = focused
  useEffect(() => {
    if (!sessionId) return
    let alive = true
    let unsubscribe: (() => void) | undefined
    void platform()
      .browser.onContextChanged((view) => {
        if (!alive || view.session_id !== sessionId) return
        const previous = nativeState.current
        nativeState.current = view.context_state
        setNativeLive(view.context_state === 'ready' ? (view.control_state === 'agent' ? 'agent' : 'live') : null)
        if (view.backend !== 'electron-native' || view.context_state !== 'ready') return
        if (previous === 'ready' || !automaticBrowserUiEnabled()) return
        const current = useSessionDockStore.getState().layoutFor(sessionId)
        if (focusedRef.current && (!current.visible || !current.views.includes('browser'))) reveal(sessionId, 'browser')
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
  const flowSupported = useOptionalEngineData()?.status?.capabilities?.project_flow_v1 === true

  return (
    <FileWorkspaceProvider sessionId={sessionId} onOpen={revealFile} engineGeneration={engineGeneration}>
      {runtime && <TimelineSignals store={runtime} sessionId={sessionId} focused={focused} />}
      {/* Solo la sesión destino de la barra de título pide su flujo. */}
      {focused && flowSupported && <FlowSignals sessionId={sessionId} />}
      <div ref={bodyRef} className="session-workspace" data-density={density} data-dock={layout.visible ? placement : 'hidden'} data-amp={amplified || undefined}>
        <div className="session-workspace-chat">{children}</div>
        {!layout.visible && leaving && <div className="pane-dock-ghost" data-layout={leaving.placement} style={{ width: leaving.width }} aria-hidden="true" />}
        {layout.visible && summary && (
          <aside
            aria-label={t('summary.title')}
            data-testid="summary-dock"
            data-session-id={sessionId}
            data-layout={placement}
            className={cn('pane-dock summary-dock', placement === 'drawer' && 'pane-dock-drawer')}
            data-entering={entering || undefined}
            data-animate-width={animateWidth || undefined}
            style={placement === 'docked' ? { width: SUMMARY_WIDTH } : undefined}
            onKeyDown={(event) => { if (event.key === 'Escape' && placement === 'drawer') setVisible(sessionId, false) }}
          >
            <SummaryPanel sessionId={sessionId} record={record} onClose={() => toggleSummary(sessionId)} />
          </aside>
        )}
        {layout.visible && !summary && (
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
  const seenPlans = useRef<number | null>(null)
  useEffect(() => {
    const previous = seenPlans.current
    seenPlans.current = plans
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
