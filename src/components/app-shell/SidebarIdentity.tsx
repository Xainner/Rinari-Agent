import { useEffect, useRef } from 'react'
import { Check, ChevronsUpDown, Plus, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { commandMessage, type ProfileBundle } from '../../services/engine'
import { useUIStore } from '../../stores/ui'
import { RinariAvatar, rinariStateLabel, type RinariState } from '../../features/rinari/RinariAvatar'
import { useProfileStore } from '../../features/profiles/profileStore'
import { useTitleMotionStore } from '../../stores/titleMotion'
import { TitleSwap } from '../TitleSwap'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

/** The visible name of a profile: the built-in default is named in the app's language. */
export function useProfileName(): (profile: Pick<ProfileBundle, 'name' | 'builtin'>) => string {
  const { t } = useI18n()
  return (profile) => (profile.builtin && profile.name === 'Default' ? t('profiles.defaultName') : profile.name)
}

/**
 * Cabecera de la barra lateral: Rinari con su estado real y el perfil en el
 * que se está trabajando. El perfil activo es del Engine (lo comparten la CLI
 * y la app): elegir otro cambia el espacio de trabajo entero, con sus
 * proyectos y conversaciones.
 */
export default function SidebarIdentity({ busy, waiting }: { busy: number; waiting: number; activeSessionId?: string | null }) {
  const { t } = useI18n()
  const goSettings = useUIStore((state) => state.goSettings)
  const profiles = useProfileStore((state) => state.profiles)
  const activeId = useProfileStore((state) => state.activeId)
  const load = useProfileStore((state) => state.load)
  const activate = useProfileStore((state) => state.activate)
  const nameOf = useProfileName()
  const active = profiles.find((profile) => profile.id === activeId) ?? null
  const state: RinariState = waiting > 0 ? 'waiting' : busy > 0 ? 'working' : 'idle'
  const detail = waiting > 0 ? t('sidebar.identityWaiting', { n: waiting }) : busy > 0 ? t('sidebar.identityBusy', { n: busy }) : t('sidebar.identityIdle')
  const title = active ? nameOf(active) : t('rinari.name')

  // The header's name changes in place, like a renamed conversation.
  const previous = useRef(activeId)
  useEffect(() => {
    if (previous.current && activeId && previous.current !== activeId) {
      useTitleMotionStore.getState().mark('profile-switcher', title, 'generated')
    }
    previous.current = activeId
  }, [activeId, title])

  async function choose(profile: ProfileBundle) {
    if (profile.id === activeId) return
    try {
      await activate(profile.id)
    } catch (error) {
      toast.error(commandMessage(error))
    }
  }

  return (
    <DropdownMenu onOpenChange={(open) => { if (open) void load() }}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="sidebar-identity" aria-label={t('profiles.switcher', { name: title })} data-testid="profile-switcher">
          <RinariAvatar state={state} size={34} />
          <span className="min-w-0 flex-1 text-left">
            <TitleSwap sessionId="profile-switcher" text={title} className="font-display text-[14px] font-bold leading-tight text-[var(--text)]" />
            <span className="block truncate text-[11.5px] text-[var(--text-muted)]">{detail}</span>
          </span>
          <ChevronsUpDown size={15} aria-hidden="true" className="shrink-0 text-[var(--text-subtle)]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[17rem]">
        <DropdownMenuLabel className="text-[11px] text-[var(--text-subtle)]">{t(rinariStateLabel(state))}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] font-semibold tracking-wider text-[var(--text-subtle)] uppercase">{t('profiles.label')}</DropdownMenuLabel>
        {profiles.length === 0 && <div className="px-2.5 py-1.5 text-xs text-[var(--text-subtle)]">{t('providers.loading')}</div>}
        {profiles.map((profile) => {
          const current = profile.id === activeId
          const counts = profile.counts
          return (
            <DropdownMenuItem key={profile.id} onSelect={() => void choose(profile)} aria-current={current || undefined} data-profile-id={profile.id}>
              <span className="profile-menu-mark" data-active={current || undefined} aria-hidden="true">{current && <Check size={12} />}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{nameOf(profile)}</span>
                {counts && <span className="block truncate text-[11px] text-[var(--text-subtle)]">{t('profiles.counts', { projects: counts.projects, sessions: counts.sessions })}</span>}
              </span>
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => goSettings('profiles')}><Plus size={14} /> {t('profiles.new')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => goSettings('profiles')}><Settings2 size={14} /> {t('sidebar.manageProfiles')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
