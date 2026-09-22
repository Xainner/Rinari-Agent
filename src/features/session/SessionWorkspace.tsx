import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ResizeHandle } from '../../components/ui/resize-handle'
import { useDragResize } from '../../hooks/useDragResize'
import { useI18n } from '../../i18n'
import { platform } from '../../platform'
import type { SessionSummary } from '../../services/engine'
import {
  CHAT_MIN_DOCKED_WIDTH,
  DOCK_MAX_WIDTH,
  DOCK_MIN_WIDTH,
  selectDockLayout,
  useSessionDockStore,
  type DockSurface,
} from '../../stores/sessionDock'
import { useBrowserFrame } from '../browser/useBrowserFrame'
import { FileWorkspaceProvider } from '../files/FileWorkspace'
import SessionDock from './SessionDock'

const HANDLE_WIDTH = 6

/** Acción tipada: alternar/abrir el dock de **una** sesión (nunca de todos los providers montados). */
export const DOCK_TOGGLE_EVENT = 'rinari:dock-toggle'
export interface DockToggleDetail {
  sessionId: string
  /** Sin superficie: alterna visibilidad. Con superficie: la revela. */
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
  /** La sesión ejecuta un turno: al terminar se sondea el navegador una vez. */
  busy?: boolean
}

/**
 * Composición de una sesión compartida por Normal (`SingleSessionView`) y por
 * cada panel del board (`SessionPane`): conversación + dock con Archivos,
 * Navegador y Workspace. Una sola implementación del visor de archivos y del
 * browser; el layout del dock es por sesión (`sessionDock`). El dock ocupa
 * ancho real dentro de la sesión y, cuando no caben chat y dock, pasa a un
 * drawer dentro de este contenedor: no reaparece ninguna superficie flotante
 * global.
 */
export default function SessionWorkspace({ sessionId, record, children, density, focused, sharedRoot = false, browserEnabled = true, busy = false }: SessionWorkspaceProps) {
  const { t } = useI18n()
  const layout = useSessionDockStore(selectDockLayout(sessionId))
  const setVisible = useSessionDockStore((state) => state.setVisible)
  const setActiveSurface = useSessionDockStore((state) => state.setActiveSurface)
  const setWidth = useSessionDockStore((state) => state.setWidth)
  const setWorkspaceTab = useSessionDockStore((state) => state.setWorkspaceTab)
  const reveal = useSessionDockStore((state) => state.reveal)

  // Geometría real del contenedor: decide si el dock cabe al lado o va en drawer.
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
  const canDock = innerWidth === null || innerWidth >= CHAT_MIN_DOCKED_WIDTH + layout.widthPx + HANDLE_WIDTH
  const dockLayout: 'docked' | 'drawer' = canDock ? 'docked' : 'drawer'

  const [liveWidth, setLiveWidth] = useState(layout.widthPx)
  useEffect(() => {
    setLiveWidth(layout.widthPx)
  }, [layout.widthPx])
  const { handleProps } = useDragResize({
    value: liveWidth,
    min: DOCK_MIN_WIDTH,
    max: () => Math.min(DOCK_MAX_WIDTH, Math.max(DOCK_MIN_WIDTH, (innerWidth ?? DOCK_MAX_WIDTH) - CHAT_MIN_DOCKED_WIDTH - HANDLE_WIDTH)),
    direction: 'left',
    onChange: setLiveWidth,
    onCommit: (final) => setWidth(sessionId, final),
    disabled: dockLayout === 'drawer',
  })

  // Enlaces de archivo del transcript: revelan Archivos en este mismo dock.
  const revealFile = useCallback(() => reveal(sessionId, 'files'), [reveal, sessionId])

  // Acción tipada con destinatario explícito (atajo «archivos», paleta…).
  useEffect(() => {
    function onToggle(event: Event) {
      const detail = (event as CustomEvent<DockToggleDetail>).detail
      if (!detail || detail.sessionId !== sessionId) return
      if (detail.surface) reveal(sessionId, detail.surface)
      else setVisible(sessionId, !useSessionDockStore.getState().layoutFor(sessionId).visible)
    }
    window.addEventListener(DOCK_TOGGLE_EVENT, onToggle)
    return () => window.removeEventListener(DOCK_TOGGLE_EVENT, onToggle)
  }, [sessionId, reveal, setVisible])

  // Navegador del Engine: se consulta a la cadencia de capturas solo con la
  // superficie a la vista. Un browser aparece por actividad del agente, así
  // que fuera de esa superficie basta una sonda al montar y otra al terminar
  // un turno: oculto no genera poll de capturas.
  const [targetId, setTargetId] = useState('')
  const [browserProbe, setBrowserProbe] = useState(0)
  const wasBusy = useRef(false)
  useEffect(() => {
    if (wasBusy.current && !busy) setBrowserProbe((value) => value + 1)
    wasBusy.current = busy
  }, [busy])
  const browserActive = layout.visible && layout.activeSurface === 'browser'
  const browser = useBrowserFrame(sessionId, { active: browserActive, targetId, enabled: browserEnabled, probe: browserProbe })
  // Browser nativo: el panel se revela cuando el contexto pasa a estar listo,
  // que es cuando el agente empieza a usarlo de verdad. Antes había que abrirlo
  // a mano y no había forma de saber que hacía falta.
  //
  // Se revela **una vez por contexto**, no en cada aviso: si el usuario lo
  // cierra, esa es su decisión y no se le vuelve a abrir hasta que haya un
  // browser nuevo. Y sólo si el dock está cerrado: con el dock abierto en otra
  // superficie, quitarle lo que está mirando sería peor. Presentarlo no es
  // requisito para que las herramientas funcionen —la vista maqueta igual—,
  // así que esto es comodidad, no corrección.
  const nativeState = useRef<string | null>(null)
  // El foco se lee por referencia: cambia a menudo y no puede resuscribir el
  // aviso cada vez, que es justo cuando se pierde el que importa.
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
        if (view.backend !== 'electron-native' || view.context_state !== 'ready') return
        if (previous === 'ready') return
        const current = useSessionDockStore.getState().layoutFor(sessionId)
        if (focusedRef.current && !current.visible) reveal(sessionId, 'browser')
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
    // Un browser nuevo no roba foco a otro panel, no cambia Normal/Boards y no
    // reemplaza un archivo que el usuario esté leyendo: solo se revela con el
    // dock cerrado y la sesión enfocada; en otro caso queda el indicador.
    const current = useSessionDockStore.getState().layoutFor(sessionId)
    if (focused && !current.visible) reveal(sessionId, 'browser')
  }, [browser.connectedInstance, focused, reveal, sessionId])

  return (
    <FileWorkspaceProvider sessionId={sessionId} onOpen={revealFile}>
      <div ref={bodyRef} className="session-workspace" data-density={density} data-dock={layout.visible ? dockLayout : 'hidden'}>
        <div className="session-workspace-chat">{children}</div>
        {layout.visible && (
          <>
            {dockLayout === 'docked' && <ResizeHandle {...handleProps} label={t('board.resize.workspace')} />}
            <SessionDock
              sessionId={sessionId}
              session={record}
              surface={layout.activeSurface}
              onSurfaceChange={(surface) => setActiveSurface(sessionId, surface)}
              workspaceTab={layout.workspaceTab}
              onWorkspaceTabChange={(tab) => setWorkspaceTab(sessionId, tab)}
              sharedRoot={sharedRoot}
              layout={dockLayout}
              width={liveWidth}
              onClose={() => setVisible(sessionId, false)}
              browser={{ frame: browser.frame, error: browser.error, targetId, onTargetChange: setTargetId }}
            />
          </>
        )}
      </div>
    </FileWorkspaceProvider>
  )
}
