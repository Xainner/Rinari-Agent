import { useSyncExternalStore, type ReactNode } from 'react'
import { Menu, PanelRight } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { WorkspaceView } from '../../stores/ui'
import WorkspaceViewSwitcher from './WorkspaceViewSwitcher'

interface AppStatusBarProps {
  /** Contenido contextual (título/proyecto de la conversación, nombre de la vista auxiliar…). */
  context?: ReactNode
  selectedView: WorkspaceView | null
  onSelectView: (view: WorkspaceView) => void
  toggleShortcut: string
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
  /** El panel lateral de la sesión destino está abierto. */
  dockOpen?: boolean
  /** Hay sesión sobre la que actuar: la activa en Normal, el panel enfocado en Boards. */
  dockTargetAvailable?: boolean
  /** Abre el panel lateral en su última pestaña, o lo cierra. */
  onToggleDock?: () => void
  /** Durante el splash la barra puede pintarse con controles deshabilitados. */
  disabled?: boolean
  /** Lista de pendientes del board (menú accesible), junto al resumen. */
  attentionMenu?: ReactNode
}

/** El mismo punto que `lg:` en `AppShell`: por debajo el sidebar es un cajón. */
const DESKTOP_QUERY = '(min-width: 1024px)'

function subscribeDesktop(change: () => void): () => void {
  const query = typeof window.matchMedia === 'function' ? window.matchMedia(DESKTOP_QUERY) : null
  query?.addEventListener('change', change)
  return () => query?.removeEventListener('change', change)
}

function isDesktop(): boolean {
  return typeof window.matchMedia !== 'function' || window.matchMedia(DESKTOP_QUERY).matches
}

/**
 * Barra superior de estado de la aplicación (48–52 px), bajo la decoración
 * nativa. Persiste en home, conversación, Boards y vistas auxiliares; nunca
 * depende de que la conversación tenga mensajes.
 *
 * Su fondo es la zona para arrastrar la ventana; los controles no (CSS).
 */
export default function AppStatusBar({
  context,
  selectedView,
  onSelectView,
  toggleShortcut,
  workingCount,
  attentionCount,
  boardAttentionCount = 0,
  onOpenMobileSidebar,
  onToggleSidebar,
  sidebarCollapsed,
  dockOpen = false,
  dockTargetAvailable = false,
  onToggleDock,
  disabled = false,
  attentionMenu,
}: AppStatusBarProps) {
  const { t } = useI18n()
  // Un solo control para el sidebar. Antes había dos, uno oculto por anchura
  // con utilidades de Tailwind que `.app-topbar-icon` anulaba, y se veían ambos.
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktop, () => true)
  const sidebarLabel = !desktop ? t('chat.openMenu') : sidebarCollapsed ? t('shell.expand') : t('shell.collapse')
  const summary = [
    workingCount > 0 ? t('topbar.working', { n: workingCount }) : null,
    attentionCount > 0 ? t('topbar.attention', { n: attentionCount }) : null,
  ].filter(Boolean)
  return (
    <header className="app-topbar" aria-label={t('topbar.label')}>
      <div className="app-topbar-leading">
        <button
          type="button"
          onClick={desktop ? onToggleSidebar : onOpenMobileSidebar}
          aria-label={sidebarLabel}
          title={sidebarLabel}
          aria-pressed={desktop ? !sidebarCollapsed : undefined}
          className="app-topbar-icon"
          disabled={disabled}
        >
          <Menu size={18} />
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
      <div className="app-topbar-trailing">
        {summary.length > 0 && (
          <span className="app-topbar-summary" role="status" aria-live="polite">{summary.join(' · ')}</span>
        )}
        {attentionMenu}
        <button
          type="button"
          onClick={() => onToggleDock?.()}
          aria-label={t('topbar.sidePanel')}
          // Sin sesión destino se dice por qué, en vez de dejar un botón
          // apagado que no explica nada.
          title={dockTargetAvailable ? t('topbar.sidePanel') : t('topbar.dockNeedsSession')}
          aria-pressed={dockOpen}
          data-active={dockOpen || undefined}
          className="app-topbar-icon app-topbar-dock-button"
          disabled={disabled || !dockTargetAvailable}
        >
          <PanelRight size={16} />
        </button>
      </div>
    </header>
  )
}
