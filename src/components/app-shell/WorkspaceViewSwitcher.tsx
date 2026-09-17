import { Columns3, MessageSquare } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { WorkspaceView } from '../../stores/ui'
import { cn } from '../../lib/utils'

interface WorkspaceViewSwitcherProps {
  /** Vista de trabajo seleccionada; `null` cuando la vista actual es auxiliar (Ajustes, Motor…). */
  selected: WorkspaceView | null
  onSelect: (view: WorkspaceView) => void
  /** Atajo configurado para alternar, mostrado en el tooltip. */
  toggleShortcut: string
  /** Sesiones del board que requieren atención (intervención, resultado sin leer…). */
  attentionCount?: number
  disabled?: boolean
}

/**
 * Selector Normal / Boards: grupo accesible de dos botones con selección
 * idempotente (pulsar el activo no alterna). Su estado viene de la
 * navegación, nunca de una preferencia aparte.
 */
export default function WorkspaceViewSwitcher({
  selected,
  onSelect,
  toggleShortcut,
  attentionCount = 0,
  disabled = false,
}: WorkspaceViewSwitcherProps) {
  const { t } = useI18n()
  const options: Array<{ view: WorkspaceView; label: string; icon: typeof MessageSquare }> = [
    { view: 'chat', label: t('nav.normal'), icon: MessageSquare },
    { view: 'board', label: t('nav.boards'), icon: Columns3 },
  ]
  return (
    <div role="group" aria-label={t('topbar.workspaceView')} className="view-switcher">
      {options.map(({ view, label, icon: Icon }) => {
        const active = selected === view
        const badge = view === 'board' && attentionCount > 0 ? attentionCount : 0
        return (
          <button
            key={view}
            type="button"
            aria-pressed={active}
            aria-label={badge > 0 ? `${label} · ${t('topbar.attentionCount', { n: badge })}` : label}
            title={`${label} · ${toggleShortcut}`}
            disabled={disabled}
            onClick={() => onSelect(view)}
            className={cn('view-switcher-button', active && 'is-active')}
          >
            <Icon size={14} aria-hidden="true" />
            <span>{label}</span>
            {badge > 0 && <span className="view-switcher-badge" aria-hidden="true">{badge > 99 ? '99+' : badge}</span>}
          </button>
        )
      })}
    </div>
  )
}
