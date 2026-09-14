import { MoreVertical } from 'lucide-react'
import { dispatchAction, type DesktopAction } from '../../services/actions'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

const entries: Array<[DesktopAction, string]> = [
  ['settings', 'Configuración'],
  ['appearance', 'Apariencia'],
  ['engine', 'Estado del motor'],
  ['updates', 'Buscar actualizaciones'],
  ['about', 'Acerca de Rinari Agent'],
]
export default function ApplicationMenu({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Menú de Rinari Agent"
          className="relative flex w-full items-center justify-center gap-2 rounded-lg px-2 py-3 text-sm hover:bg-[var(--bg-hover)]"
        >
          {!collapsed && (
            <span className="w-full text-center text-xs tracking-wide text-[var(--text-muted)]">Code · Create · Explore</span>
          )}
          <MoreVertical size={16} className={collapsed ? undefined : "absolute right-1"} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        {entries.map(([action, label]) => (
          <DropdownMenuItem key={action} onSelect={() => dispatchAction(action)}>
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
