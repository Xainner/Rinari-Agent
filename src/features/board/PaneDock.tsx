import { FileText, LayoutPanelLeft, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { SessionSummary } from '../../services/engine'
import { FileViewer, useFileWorkspace } from '../files/FileWorkspace'
import WorkspaceView from '../workspace/WorkspaceView'
import type { DockTab, WorkspaceTab } from '../../stores/board'
import { cn } from '../../lib/utils'

export interface PaneDockProps {
  session: SessionSummary | null
  tab: DockTab
  onTabChange: (tab: DockTab) => void
  workspaceTab: WorkspaceTab
  onWorkspaceTabChange: (tab: WorkspaceTab) => void
  sharedRoot: boolean
  /** `docked`: columna al lado del chat. `drawer`: superpuesto dentro del panel. */
  layout: 'docked' | 'drawer'
  width: number
  onClose: () => void
}

/**
 * Dock derecho compartido de un panel: superficies **Workspace** y **Archivo**.
 * Los enlaces de archivo activan Archivo en este mismo dock; no se abre una
 * tercera columna. Cuando el chat no conserva su ancho mínimo, el dock se
 * presenta como drawer dentro del panel con cierre visible.
 */
export default function PaneDock({
  session,
  tab,
  onTabChange,
  workspaceTab,
  onWorkspaceTabChange,
  sharedRoot,
  layout,
  width,
  onClose,
}: PaneDockProps) {
  const { t } = useI18n()
  const files = useFileWorkspace()
  const openFiles = files?.tabs.length ?? 0
  return (
    <aside
      aria-label={t('board.dock.label')}
      className={cn('pane-dock', layout === 'drawer' && 'pane-dock-drawer')}
      style={layout === 'docked' ? { width } : undefined}
    >
      <div className="pane-dock-tabs" role="tablist" aria-label={t('board.dock.label')}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'workspace'}
          onClick={() => onTabChange('workspace')}
          className={cn('pane-dock-tab', tab === 'workspace' && 'is-active')}
        >
          <LayoutPanelLeft size={13} aria-hidden="true" />{t('nav.workspace')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'file'}
          onClick={() => onTabChange('file')}
          className={cn('pane-dock-tab', tab === 'file' && 'is-active')}
        >
          <FileText size={13} aria-hidden="true" />{t('board.dock.file')}
          {openFiles > 0 && <span className="pane-dock-count">{openFiles}</span>}
        </button>
        <span className="flex-1" />
        <button type="button" aria-label={t('board.dock.close')} title={t('board.dock.close')} onClick={onClose} className="pane-header-icon">
          <X size={14} />
        </button>
      </div>
      <div className="pane-dock-body" role="tabpanel">
        {tab === 'workspace' ? (
          <WorkspaceView
            session={session}
            embedded
            tab={workspaceTab}
            onTabChange={onWorkspaceTabChange}
            sharedRoot={sharedRoot}
          />
        ) : (
          <FileViewer />
        )}
      </div>
    </aside>
  )
}
