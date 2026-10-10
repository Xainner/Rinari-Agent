import { create } from 'zustand'
import { engineApi, type ProfileBundle } from '../../services/engine'

/** Engine events that change which profile is active or what belongs to each. */
export const PROFILE_EVENTS = new Set(['profile_bundle.activated', 'profile_bundle.changed', 'project.moved', 'session.moved'])

interface ProfileState {
  /** null until loaded, or with an Engine that has no active profile. */
  activeId: string | null
  profiles: ProfileBundle[]
  loaded: boolean
  /** Bumps whenever what each profile holds may have changed (refetch lists). */
  revision: number
  load(): Promise<void>
  activate(id: string): Promise<boolean>
  touch(): void
}

/**
 * The active Rinari profile and the list of profiles. The Engine owns it
 * (shared with the CLI); the desktop reads it, reloads it on the Engine's
 * events and when the window regains focus (the CLI may have switched).
 */
export const useProfileStore = create<ProfileState>((set, get) => ({
  activeId: null,
  profiles: [],
  loaded: false,
  revision: 0,
  load: async () => {
    try {
      const result = await engineApi.bundleList()
      set({ profiles: result.profiles, activeId: result.active_id ?? null, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },
  activate: async (id) => {
    if (get().activeId === id) return true
    const result = await engineApi.bundleActivate(id)
    set((state) => ({
      activeId: result.active_id,
      profiles: state.profiles.map((profile) => ({ ...profile, active: profile.id === result.active_id })),
      revision: state.revision + 1,
    }))
    void get().load()
    return true
  },
  touch: () => set((state) => ({ revision: state.revision + 1 })),
}))

/** The active profile, or null when the Engine does not organize work by profile. */
export function useActiveProfile(): ProfileBundle | null {
  return useProfileStore((state) => state.profiles.find((profile) => profile.id === state.activeId) ?? null)
}

/**
 * Whether a project or conversation belongs to the active profile. Anything
 * without a profile (an older Engine) or no active profile at all is shown,
 * so nothing disappears by mistake.
 */
export function inProfile(item: { rinari_profile_id?: string | null }, activeId: string | null): boolean {
  if (!activeId) return true
  return (item.rinari_profile_id ?? 'default') === activeId
}

/** Reacts to an Engine event that can change profiles or their contents. */
export function onProfileEvent(name: string): void {
  if (!PROFILE_EVENTS.has(name)) return
  const store = useProfileStore.getState()
  store.touch()
  if (name.startsWith('profile_bundle.')) void store.load()
}
