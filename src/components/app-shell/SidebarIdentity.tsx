import { useState } from 'react'
import { ChevronsUpDown, Layers, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { commandMessage, engineApi, type ProfileBundle } from '../../services/engine'
import { useUIStore } from '../../stores/ui'
import { RinariAvatar, rinariStateLabel, type RinariState } from '../../features/rinari/RinariAvatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

/**
 * Cabecera de la barra lateral: Rinari con su estado real (espera una
 * decisión, trabajando, lista) y los perfiles a mano. Un perfil se aplica a la
 * conversación abierta; el Engine no guarda un «perfil activo», así que aquí
 * no se presume ninguno.
 */
export default function SidebarIdentity({ busy, waiting, activeSessionId }: { busy: number; waiting: number; activeSessionId: string | null }) {
  const { t } = useI18n()
  const goSettings = useUIStore((state) => state.goSettings)
  const [profiles, setProfiles] = useState<ProfileBundle[] | null>(null)
  const state: RinariState = waiting > 0 ? 'waiting' : busy > 0 ? 'working' : 'idle'
  const detail = waiting > 0 ? t('sidebar.identityWaiting', { n: waiting }) : busy > 0 ? t('sidebar.identityBusy', { n: busy }) : t('sidebar.identityIdle')

  async function load(open: boolean) {
    if (!open) return
    try {
      setProfiles((await engineApi.bundleList()).profiles)
    } catch {
      setProfiles([])
    }
  }

  async function apply(profile: ProfileBundle) {
    try {
      await engineApi.bundleApply(profile.id, activeSessionId ?? undefined)
      toast.success(t('sidebar.profileApplied', { name: profile.name }))
    } catch (error) {
      toast.error(commandMessage(error))
    }
  }

  return (
    <DropdownMenu onOpenChange={(open) => void load(open)}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="sidebar-identity" aria-label={t('sidebar.identityMenu')}>
          <RinariAvatar state={state} size={34} />
          <span className="min-w-0 flex-1 text-left">
            <span className="block font-display text-[14px] font-bold leading-tight text-[var(--text)]">{t('rinari.name')}</span>
            <span className="block truncate text-[11.5px] text-[var(--text-muted)]">{detail}</span>
          </span>
          <ChevronsUpDown size={15} aria-hidden="true" className="shrink-0 text-[var(--text-subtle)]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[16.5rem]">
        <DropdownMenuLabel className="text-[11px] text-[var(--text-subtle)]">{t(rinariStateLabel(state))}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] font-semibold tracking-wider text-[var(--text-subtle)] uppercase">{t('sidebar.applyProfile')}</DropdownMenuLabel>
        {profiles === null && <div className="px-2.5 py-1.5 text-xs text-[var(--text-subtle)]">{t('providers.loading')}</div>}
        {profiles?.length === 0 && <div className="px-2.5 py-1.5 text-xs text-[var(--text-subtle)]">{t('sidebar.noProfiles')}</div>}
        {profiles?.map((profile) => (
          <DropdownMenuItem key={profile.id} disabled={!activeSessionId} onSelect={() => void apply(profile)}>
            <Layers size={14} />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{profile.name}</span>
              {(profile.mode || profile.soul_id) && <span className="block truncate text-[11px] text-[var(--text-subtle)]">{[profile.mode?.toUpperCase(), profile.soul_id].filter(Boolean).join(' · ')}</span>}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => goSettings('profiles')}><Settings2 size={14} /> {t('sidebar.manageProfiles')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
