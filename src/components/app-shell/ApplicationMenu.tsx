import { Info, MoreHorizontal, Palette, RefreshCw, Settings, Stethoscope } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useI18n, type I18nKey } from '../../i18n'
import { dispatchAction, type DesktopAction } from '../../services/actions'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

const entries: Array<[DesktopAction, I18nKey, LucideIcon] | null> = [
  ['settings', 'app.settings', Settings],
  ['appearance', 'app.appearance', Palette],
  null,
  ['engine', 'app.engineStatus', Stethoscope],
  ['updates', 'app.checkUpdates', RefreshCw],
  ['about', 'app.about', Info],
]

function MenuItems() {
  const { t } = useI18n()
  return <>{entries.map((entry, index) => entry === null
    ? <DropdownMenuSeparator key={`sep-${index}`} />
    : <DropdownMenuItem key={entry[0]} onSelect={() => dispatchAction(entry[0])}>{(() => { const Icon = entry[2]; return <Icon size={14} /> })()}{t(entry[1])}</DropdownMenuItem>)}</>
}

/** Menú de la aplicación (ajustes, diagnóstico, actualizaciones, acerca de). */
export default function ApplicationMenu({ collapsed = false }: { collapsed?: boolean }) {
  const { t } = useI18n()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={t('app.menuLabel')}
          title={t('app.menuLabel')}
          className={collapsed ? 'flex size-10 items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]' : 'btn btn-quiet btn-icon btn-sm'}
        >
          <MoreHorizontal size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align={collapsed ? 'start' : 'end'} className="w-60">
        <MenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Pie de la barra lateral: Ajustes a un clic y el resto en el menú. */
export function SidebarFooter() {
  const { t } = useI18n()
  return (
    <div className="sidebar-footer">
      <button type="button" className="sidebar-link min-w-0 flex-1" onClick={() => dispatchAction('settings')}>
        <Settings size={15} aria-hidden="true" />
        <span className="truncate">{t('app.settings')}</span>
      </button>
      <ApplicationMenu />
    </div>
  )
}
