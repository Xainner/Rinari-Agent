import { useEffect, useRef, useState } from 'react'
import { Check, ChevronsUpDown, LoaderCircle, Plus, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { commandMessage, type ProfileBundle } from '../../services/engine'
import { useUIStore } from '../../stores/ui'
import { RinariAvatar, rinariStateLabel, type RinariState } from '../../features/rinari/RinariAvatar'
import { useProfileStore } from '../../features/profiles/profileStore'
import { useProfilePending, useProfileWorking } from '../../features/profiles/profilePending'
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
  // Lo que espera en los otros perfiles (#34); el activo ya lo dicen la barra y la campana.
  const pending = useProfilePending()
  // Cuáles trabajan, cada uno con sus conversaciones (la cabecera cuenta todas las que están en curso).
  const working = useProfileWorking()
  const active = profiles.find((profile) => profile.id === activeId) ?? null
  const state: RinariState = waiting > 0 ? 'waiting' : busy > 0 ? 'working' : 'idle'
  const detail = waiting > 0 ? t('sidebar.identityWaiting', { n: waiting }) : busy > 0 ? t('sidebar.identityBusy', { n: busy }) : t('sidebar.identityIdle')
  const title = active ? nameOf(active) : t('rinari.name')

  // The header's name changes in place, like a renamed conversation, and a
  // light passes over the card: the whole workspace just changed.
  const previous = useRef(activeId)
  const [switched, setSwitched] = useState(0)
  useEffect(() => {
    if (previous.current && activeId && previous.current !== activeId) {
      useTitleMotionStore.getState().mark('profile-switcher', title, 'generated')
      setSwitched((value) => value + 1)
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
          {switched > 0 && <span key={switched} className="sidebar-identity-sweep" aria-hidden="true" />}
          <span className="relative shrink-0">
            <RinariAvatar state={state} size={34} />
            {pending.others.count > 0 && (
              <span
                className="profile-pending-badge"
                data-needs-you={pending.others.needsYou || undefined}
                data-testid="profile-pending-badge"
                role="status"
                aria-label={t(pending.others.needsYou ? 'profiles.pendingNeedsYou' : 'profiles.pendingOther', { n: pending.others.count })}
                title={t(pending.others.needsYou ? 'profiles.pendingNeedsYou' : 'profiles.pendingOther', { n: pending.others.count })}
              >
                {pending.others.count > 9 ? '9+' : pending.others.count}
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1 text-left">
            <TitleSwap sessionId="profile-switcher" text={title} className="font-display text-[14px] font-bold leading-tight text-[var(--text)]" />
            <span className="block truncate text-[11.5px] text-[var(--text-muted)]">{detail}</span>
          </span>
          <ChevronsUpDown size={15} aria-hidden="true" className="shrink-0 text-[var(--text-subtle)]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="profile-menu w-[18rem]">
        <DropdownMenuLabel className="text-[11px] text-[var(--text-subtle)]">{t(rinariStateLabel(state))}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] font-semibold tracking-wider text-[var(--text-subtle)] uppercase">{t('profiles.label')}</DropdownMenuLabel>
        {profiles.length === 0 && <div className="px-2.5 py-1.5 text-xs text-[var(--text-subtle)]">{t('providers.loading')}</div>}
        {profiles.map((profile) => {
          const current = profile.id === activeId
          const counts = profile.counts
          const busyHere = working[profile.id] ?? 0
          const busyLabel = t(busyHere === 1 ? 'profiles.workingOne' : 'profiles.working', { n: busyHere })
          return (
            <DropdownMenuItem key={profile.id} onSelect={() => void choose(profile)} aria-current={current || undefined} data-profile-id={profile.id} className="profile-menu-item">
              <span className="profile-menu-monogram" data-hue={profileHue(profile.id)} aria-hidden="true">{monogram(nameOf(profile))}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{nameOf(profile)}</span>
                {counts && <span className="block truncate text-[11px] text-[var(--text-subtle)]">{t('profiles.counts', { projects: counts.projects, sessions: counts.sessions })}</span>}
              </span>
              {busyHere > 0 && (
                <span className="r-chip profile-working-count" data-tone="accent" data-testid="profile-working" title={busyLabel} aria-label={busyLabel}>
                  <LoaderCircle size={11} className="motion-safe:animate-spin" aria-hidden="true" />{busyHere}
                </span>
              )}
              {!current && (pending.byProfile[profile.id]?.count ?? 0) > 0 && (
                <span
                  className="r-chip profile-pending-count"
                  data-tone={pending.byProfile[profile.id].needsYou ? 'warning' : 'accent'}
                  data-needs-you={pending.byProfile[profile.id].needsYou || undefined}
                  data-testid="profile-pending-count"
                  title={t(pending.byProfile[profile.id].needsYou ? 'profiles.pendingNeedsYou' : 'profiles.pendingOther', { n: pending.byProfile[profile.id].count })}
                >
                  {pending.byProfile[profile.id].count}
                </span>
              )}
              <span className="profile-menu-mark" data-active={current || undefined} aria-hidden="true">{current && <Check size={12} strokeWidth={3} />}</span>
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

/** Una o dos iniciales para el monograma del perfil. */
function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const letters = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)
  return letters.toUpperCase()
}

/** Color estable por perfil (uno de cuatro degradados de la paleta), para reconocerlo de un vistazo. */
function profileHue(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return hash % 4
}
