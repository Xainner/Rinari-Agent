import { create } from 'zustand'

/** Paquetes de tonos empaquetados en `public/sounds/<pack>/`. */
export type SoundPack = 'soft' | 'rinari'
export const SOUND_PACKS: readonly SoundPack[] = ['soft', 'rinari']

/**
 * Qué suena: atención (aprobación, pregunta, tarea que te necesita), turno
 * terminado, turno fallido y recordatorio.
 */
export type SoundCategory = 'attention' | 'success' | 'error' | 'reminder'
export const SOUND_CATEGORIES: readonly SoundCategory[] = ['attention', 'success', 'error', 'reminder']

export interface SoundPrefs {
  enabled: boolean
  pack: SoundPack
  /** Volumen de los tonos de Rinari (0–1), no el del sistema. */
  volume: number
  categories: Record<SoundCategory, boolean>
  /**
   * También mientras miras esa conversación. Por defecto solo suena lo que
   * ocurre donde no estás mirando; un recordatorio suena siempre.
   */
  whileAttended: boolean
}

const KEY = 'rinari.sounds.v1'

export const DEFAULT_SOUND_PREFS: SoundPrefs = {
  enabled: true,
  pack: 'soft',
  volume: 0.6,
  categories: { attention: true, success: true, error: true, reminder: true },
  whileAttended: false,
}

export function normalizeSoundPrefs(raw: unknown): SoundPrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SOUND_PREFS, categories: { ...DEFAULT_SOUND_PREFS.categories } }
  const input = raw as Partial<SoundPrefs>
  const categories = { ...DEFAULT_SOUND_PREFS.categories }
  if (input.categories && typeof input.categories === 'object') {
    for (const category of SOUND_CATEGORIES) {
      const value = (input.categories as Record<string, unknown>)[category]
      if (typeof value === 'boolean') categories[category] = value
    }
  }
  const volume = typeof input.volume === 'number' && Number.isFinite(input.volume) ? Math.min(1, Math.max(0, input.volume)) : DEFAULT_SOUND_PREFS.volume
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : DEFAULT_SOUND_PREFS.enabled,
    pack: SOUND_PACKS.includes(input.pack as SoundPack) ? input.pack as SoundPack : DEFAULT_SOUND_PREFS.pack,
    volume,
    categories,
    whileAttended: typeof input.whileAttended === 'boolean' ? input.whileAttended : DEFAULT_SOUND_PREFS.whileAttended,
  }
}

function load(): SoundPrefs {
  try {
    const raw = window.localStorage.getItem(KEY)
    return normalizeSoundPrefs(raw ? JSON.parse(raw) : null)
  } catch {
    return normalizeSoundPrefs(null)
  }
}

interface SoundPrefsState extends SoundPrefs {
  update: (patch: Partial<Omit<SoundPrefs, 'categories'>> & { categories?: Partial<Record<SoundCategory, boolean>> }) => void
}

/** Preferencia de esta app de escritorio (presentación), no del Engine. */
export const useSoundPrefs = create<SoundPrefsState>((set, get) => ({
  ...load(),
  update: (patch) => {
    const current = get()
    const next = normalizeSoundPrefs({
      ...current,
      ...patch,
      categories: { ...current.categories, ...(patch.categories ?? {}) },
    })
    set(next)
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // Sin almacenamiento la preferencia vive en memoria.
    }
  },
}))
