import type { ReactNode } from 'react'
import { FileText, Globe, LayoutPanelLeft, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { EngineState } from '../../services/engine'
import type { DockSurface } from '../../stores/sessionDock'
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
  /**
   * Alterna el sidebar. Es la **única** autoridad visible en desktop: antes la
   * barra sólo sabía expandir y colapsar estaba escondido dentro del campo de
   * búsqueda, así que el control que se espera aquí parecía roto.
   */
  onToggleSidebar: () => void
  sidebarCollapsed: boolean
  /**
   * Superficie del dock visible ahora mismo en la sesión destino, o `null` si
   * el dock está cerrado. Llega resuelta: este componente no lee el store.
   */
  dockSurface?: DockSurface | null
  /** Hay sesión sobre la que actuar: la activa en Normal, el panel enfocado en Boards. */
  dockTargetAvailable?: boolean
  onToggleDockSurface?: (surface: DockSurface) => void
  /** Durante el splash la barra puede pintarse con controles deshabilitados. */
  disabled?: boolean
  /** Lista de pendientes del board (menú accesible), junto al resumen. */
  attentionMenu?: ReactNode
}

/**
 * Las tres superficies del dock de sesión, en el orden del propio dock.
 *
 * «Workspace» aquí es `DockSurface = 'workspace'`, la pestaña del dock — no la
 * vista global de Workspace. Son cosas distintas y comparten nombre, así que
 * el tooltip lo dice: «Panel de Workspace».
 */
const DOCK_LAUNCHERS = [
  { surface: 'files', icon: FileText, label: 'dock.files' },
  { surface: 'browser', icon: Globe, label: 'dock.browser' },
  { surface: 'workspace', icon: LayoutPanelLeft, label: 'dock.workspacePanel' },
] as const

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
  onToggleSidebar,
  sidebarCollapsed,
  dockSurface = null,
  dockTargetAvailable = false,
  onToggleDockSurface,
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
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? t('shell.expand') : t('shell.collapse')}
          title={sidebarCollapsed ? t('shell.expand') : t('shell.collapse')}
          aria-pressed={!sidebarCollapsed}
          className="app-topbar-icon hidden lg:inline-flex"
          disabled={disabled}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
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
      <div className="app-topbar-dock" role="group" aria-label={t('topbar.dockGroup')}>
        {DOCK_LAUNCHERS.map(({ surface, icon: Icon, label }) => {
          const active = dockSurface === surface
          return (
            <button
              key={surface}
              type="button"
              onClick={() => onToggleDockSurface?.(surface)}
              aria-label={t(label)}
              // Sin sesión destino se dice por qué, en vez de dejar un botón
              // apagado que no explica nada.
              title={dockTargetAvailable ? t(label) : t('topbar.dockNeedsSession')}
              aria-pressed={active}
              data-active={active || undefined}
              className="app-topbar-icon app-topbar-dock-button"
              disabled={disabled || !dockTargetAvailable}
            >
              <Icon size={16} />
            </button>
          )
        })}
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
