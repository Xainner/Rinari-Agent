import type { ReactNode } from 'react'
import { Menu, PanelLeft } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { EngineState } from '../../services/engine'
import type { WorkspaceView } from '../../stores/ui'
import WorkspaceViewSwitcher from './WorkspaceViewSwitcher'

interface AppStatusBarProps {
  /** Contenido contextual (título/proyecto de la conversación, nombre de la vista auxiliar…). */
  context?: ReactNode
  selectedView: WorkspaceView | null
  onSelectView: (view: WorkspaceView) => void
  toggleShortcut: string
  engineState: EngineState | null
  /** Sesiones ejecutando un turno. */
  workingCount: number
  /** Sesiones que requieren intervención (aprobaciones, preguntas). */
  attentionCount: number
  /** Sesiones del board con atención pendiente (badge del selector). */
  boardAttentionCount?: number
  onOpenMobileSidebar: () => void
  onExpandSidebar: () => void
  sidebarCollapsed: boolean
  /** Durante el splash la barra puede pintarse con controles deshabilitados. */
  disabled?: boolean
  /** Lista de pendientes del board (menú accesible), junto al resumen. */
  attentionMenu?: ReactNode
}

/**
 * Barra superior de estado de la aplicación (48–52 px), bajo la decoración
 * nativa. Persiste en home, conversación, Boards y vistas auxiliares; nunca
 * depende de que la conversación tenga mensajes.
 */
export default function AppStatusBar({
  context,
  selectedView,
  onSelectView,
  toggleShortcut,
  engineState,
  workingCount,
  attentionCount,
  boardAttentionCount = 0,
  onOpenMobileSidebar,
  onExpandSidebar,
  sidebarCollapsed,
  disabled = false,
  attentionMenu,
}: AppStatusBarProps) {
  const { t } = useI18n()
  const engineLabel =
    engineState === 'ready' ? t('topbar.engine.ready')
      : engineState === 'failed' || engineState === 'degraded' ? t('topbar.engine.failed')
        : t('topbar.engine.starting')
  const summary = [
    workingCount > 0 ? t('topbar.working', { n: workingCount }) : null,
    attentionCount > 0 ? t('topbar.attention', { n: attentionCount }) : null,
  ].filter(Boolean)
  return (
    <header className="app-topbar" aria-label={t('topbar.label')}>
      <div className="app-topbar-leading">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          aria-label={t('chat.openMenu')}
          className="app-topbar-icon lg:hidden"
          disabled={disabled}
        >
          <Menu size={18} />
        </button>
        {sidebarCollapsed && (
          <button
            type="button"
            onClick={onExpandSidebar}
            aria-label={t('shell.expand')}
            title={t('shell.expand')}
            className="app-topbar-icon hidden lg:inline-flex"
            disabled={disabled}
          >
            <PanelLeft size={17} />
          </button>
        )}
        <div className="app-topbar-context">{context}</div>
      </div>
      <div className="app-topbar-center">
        <WorkspaceViewSwitcher
          selected={selectedView}
          onSelect={onSelectView}
          toggleShortcut={toggleShortcut}
          attentionCount={boardAttentionCount}
          disabled={disabled}
        />
      </div>
      <div className="app-topbar-trailing" role="status" aria-live="polite">
        <span className={engineState === 'ready' ? 'engine-dot ready' : 'engine-dot'} aria-hidden="true" />
        <span className="app-topbar-engine">{engineLabel}</span>
        {summary.length > 0 && (
          <span className="app-topbar-summary">{summary.join(' · ')}</span>
        )}
        {attentionMenu}
      </div>
    </header>
  )
}
