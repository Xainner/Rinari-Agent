import { FileText, Globe, LayoutPanelLeft, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useI18n } from '../../i18n'
import type { SessionSummary } from '../../services/engine'
import type { BrowserView as BrowserFrame } from '../../types/protocol.generated'
import { FileViewer, useFileWorkspace } from '../files/FileWorkspace'
import BrowserSurface from '../browser/BrowserSurface'
import WorkspaceView from '../workspace/WorkspaceView'
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
}

const SURFACES: readonly DockSurface[] = ['files', 'browser', 'workspace']

/**
 * Dock de una sesión con tres superficies: **Archivos** (tablist y
 * renderizadores actuales), **Navegador** (toolbar + slot de vista) y
 * **Workspace** (cambios, tareas, verificaciones…). Una sola superficie
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
}: SessionDockProps) {
  const { t } = useI18n()
  const files = useFileWorkspace()
  const openFiles = files?.tabs.length ?? 0
  const browserConnected = browser.frame?.state === 'connected'
  const root = useRef<HTMLElement>(null)
  // Un drawer cubre el chat: el foco entra al dock y vuelve al cerrarlo.
  useEffect(() => {
    if (layout !== 'drawer') return
    const previous = document.activeElement as HTMLElement | null
    root.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus()
    return () => previous?.focus?.()
  }, [layout])

  const labels: Record<DockSurface, string> = { files: t('dock.files'), browser: t('dock.browser'), workspace: t('nav.workspace') }
  const icons = { files: FileText, browser: Globe, workspace: LayoutPanelLeft } as const

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
        {SURFACES.map((item) => {
          const Icon = icons[item]
          return (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={surface === item}
              aria-controls={`dock-${sessionId}-${item}`}
              onClick={() => onSurfaceChange(item)}
              className={cn('pane-dock-tab', surface === item && 'is-active')}
            >
              <Icon size={13} aria-hidden="true" />{labels[item]}
              {item === 'files' && openFiles > 0 && <span className="pane-dock-count">{openFiles}</span>}
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
        {surface === 'workspace' ? (
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
          />
        ) : (
          <FileViewer />
        )}
      </div>
    </aside>
  )
}
