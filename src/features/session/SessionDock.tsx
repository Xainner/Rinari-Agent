import { FileText, Globe, LayoutPanelLeft, SquareTerminal, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useI18n } from '../../i18n'
import type { SessionSummary } from '../../services/engine'
import type { BrowserView as BrowserFrame } from '../../types/protocol.generated'
import { FileViewer, useFileWorkspace } from '../files/FileWorkspace'
import BrowserSurface from '../browser/BrowserSurface'
import WorkspaceView from '../workspace/WorkspaceView'
import TerminalPanel from '../terminal/TerminalPanel'
import { useAgentRunningCount } from '../terminal/agentTab'
import { selectOverlayDepth, useOverlayStore } from '../../stores/overlay'
import type { DockSurface, WorkspaceTab } from '../../stores/sessionDock'
import { cn } from '../../lib/utils'

export interface SessionDockProps {
  sessionId: string
  session: SessionSummary | null
  surface: DockSurface
  onSurfaceChange: (surface: DockSurface) => void
  workspaceTab: WorkspaceTab
  onWorkspaceTabChange: (tab: WorkspaceTab) => void
  sharedRoot: boolean
  /** `docked`: columna al lado del chat. `drawer`: superpuesto dentro de la sesión. */
  layout: 'docked' | 'drawer'
  width: number
  onClose: () => void
  browser: { frame: BrowserFrame | null; error: string; targetId: string; onTargetChange: (targetId: string) => void }
  /** El Engine anuncia `desktop_terminal_v1`: sin ella no hay pestaña Terminal. */
  terminalEnabled?: boolean
}

const SURFACES: readonly DockSurface[] = ['files', 'browser', 'workspace', 'terminal']

/**
 * Dock de una sesión con cuatro superficies: **Archivos** (tablist y
 * renderizadores actuales), **Navegador** (toolbar + slot de vista),
 * **Workspace** (cambios, tareas, verificaciones…) y **Terminal** (PTY del
 * Engine, si lo anuncia). Una sola superficie
 * activa; ocupa ancho real dentro de la sesión o, si no cabe, un drawer
 * dentro del mismo contenedor con cierre visible y foco correcto. Cerrarlo
 * no cierra archivos, browser ni procesos.
 */
export default function SessionDock({
  sessionId,
  session,
  surface,
  onSurfaceChange,
  workspaceTab,
  onWorkspaceTabChange,
  sharedRoot,
  layout,
  width,
  onClose,
  browser,
  terminalEnabled = false,
}: SessionDockProps) {
  const { t } = useI18n()
  const overlayDepth = useOverlayStore(selectOverlayDepth)
  const files = useFileWorkspace()
  const openFiles = files?.tabs.length ?? 0
  const browserConnected = browser.frame?.state === 'connected'
  // Lo que Rinari tiene en marcha se anuncia en la pestaña Terminal.
  const agentRunning = useAgentRunningCount(terminalEnabled ? sessionId : '')
  const root = useRef<HTMLElement>(null)
  // Un drawer cubre el chat: el foco entra al dock y vuelve al cerrarlo.
  useEffect(() => {
    if (layout !== 'drawer') return
    const previous = document.activeElement as HTMLElement | null
    root.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus()
    return () => previous?.focus?.()
  }, [layout])

  const labels: Record<DockSurface, string> = { files: t('dock.files'), browser: t('dock.browser'), workspace: t('nav.workspace'), terminal: t('dock.terminal') }
  const icons = { files: FileText, browser: Globe, workspace: LayoutPanelLeft, terminal: SquareTerminal } as const
  const surfaces = terminalEnabled ? SURFACES : SURFACES.filter((item) => item !== 'terminal')

  return (
    <aside
      ref={root}
      aria-label={t('dock.label')}
      data-testid="session-dock"
      data-session-id={sessionId}
      data-layout={layout}
      data-surface={surface}
      className={cn('pane-dock session-dock', layout === 'drawer' && 'pane-dock-drawer')}
      style={layout === 'docked' ? { width } : undefined}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && layout === 'drawer') onClose()
      }}
    >
      <div className="pane-dock-tabs" role="tablist" aria-label={t('dock.label')}>
        {surfaces.map((item) => {
          const Icon = icons[item]
          return (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={surface === item}
              aria-controls={`dock-${sessionId}-${item}`}
              aria-label={labels[item]}
              title={labels[item]}
              onClick={() => onSurfaceChange(item)}
              className={cn('pane-dock-tab', surface === item && 'is-active')}
            >
              <Icon size={13} aria-hidden="true" /><span className="pane-dock-tab-label">{labels[item]}</span>
              {item === 'files' && openFiles > 0 && <span className="pane-dock-count">{openFiles}</span>}
              {item === 'terminal' && agentRunning > 0 && (
                <span className="pane-dock-count" title={t('terminal.agentRunning', { n: agentRunning })}>{agentRunning}</span>
              )}
              {item === 'browser' && browserConnected && (
                <span className="pane-dock-dot" role="img" aria-label={t('browser.live')} title={t('browser.live')} />
              )}
            </button>
          )
        })}
        <span className="flex-1" />
        <button type="button" aria-label={t('dock.close')} title={t('dock.close')} onClick={onClose} className="pane-header-icon">
          <X size={14} />
        </button>
      </div>
      <div id={`dock-${sessionId}-${surface}`} className="pane-dock-body" role="tabpanel" aria-label={labels[surface]}>
        {surface === 'terminal' && terminalEnabled ? (
          <TerminalPanel sessionId={sessionId} />
        ) : surface === 'workspace' || surface === 'terminal' ? (
          <WorkspaceView session={session} embedded tab={workspaceTab} onTabChange={onWorkspaceTabChange} sharedRoot={sharedRoot} />
        ) : surface === 'browser' ? (
          <BrowserSurface
            sessionId={sessionId}
            frame={browser.frame}
            error={browser.error}
            targetId={browser.targetId}
            onTargetChange={browser.onTargetChange}
            // La superficie sólo se presenta cuando es la pestaña a la vista:
            // ocultarla retira la presentación, no cierra el contexto (§8.3).
            shown={surface === 'browser'}
            // Y se retira también mientras haya un modal encima. El recuento
            // es de la ventana, no de la sesión: un diálogo tapa todo.
            overlayDepth={overlayDepth}
          />
        ) : (
          <FileViewer />
        )}
      </div>
    </aside>
  )
}
