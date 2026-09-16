import { create } from 'zustand'
import { applyTheme, getStoredTheme, storeTheme, type Theme } from '../lib/theme'
import {
  applyAccent,
  applyReduceMotion,
  getStoredAccent,
  getStoredReduceMotion,
  storeAccent,
  storeReduceMotion,
  type Accent,
} from '../lib/appearance'
import type { Language } from '../types'

export type View = 'chat' | 'settings' | 'engine' | 'workspace' | 'project'

/** Secciones de Ajustes. Las marcadas con * llegan en fases posteriores. */
export type SettingsSection =
  | 'general'
  | 'shortcuts'
  | 'appearance'
  | 'providers'
  | 'models'
  | 'vision'
  | 'context'
  | 'agents'
  | 'soul'
  | 'mcp'
  | 'plugins'
  | 'tools'
  | 'profiles'
  | 'terminal'
  | 'advanced'
  | 'about'

export type ShortcutAction = 'newChat' | 'palette' | 'settings' | 'sidebar'
export type ShortcutBindings = Record<ShortcutAction, string>

export const DEFAULT_SHORTCUT_BINDINGS: ShortcutBindings = {
  newChat: 'Ctrl+N',
  palette: 'Ctrl+K',
  settings: 'Ctrl+,',
  sidebar: 'Ctrl+B',
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    if (v === null) return fallback
    return v === '1'
  } catch {
    return fallback
  }
}

function writeBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function readLang(): Language {
  try {
    return localStorage.getItem('rinari.lang') === 'en' ? 'en' : 'es'
  } catch {
    return 'es'
  }
}

function readCollapsed(): boolean {
  return readBool('rinari.sidebarCollapsed', false)
}

function readShortcutBindings(): ShortcutBindings {
  try {
    const stored = JSON.parse(localStorage.getItem('rinari.shortcutBindings') ?? '{}') as Partial<ShortcutBindings>
    return { ...DEFAULT_SHORTCUT_BINDINGS, ...stored }
  } catch {
    return DEFAULT_SHORTCUT_BINDINGS
  }
}

function writeShortcutBindings(bindings: ShortcutBindings): void {
  try {
    localStorage.setItem('rinari.shortcutBindings', JSON.stringify(bindings))
  } catch {
    /* ignore */
  }
}

interface UIState {
  view: View
  settingsSection: SettingsSection
  lang: Language
  sidebarOpen: boolean
  /** Rail colapsado en desktop (solo iconos). Persistido. */
  sidebarCollapsed: boolean
  paletteOpen: boolean
  theme: Theme
  accent: Accent
  reduceMotion: boolean
  /** Preferencias de chat. Persistidas. */
  enterToSend: boolean
  autoFollow: boolean
  showSuggestions: boolean
  /** Revela identificadores de protocolo junto a las etiquetas narrativas. */
  showTechnicalActivityNames: boolean
  shortcutBindings: ShortcutBindings
  /** Home del proyecto abierto (root). Solo con view 'project'. */
  projectRoot: string | null
  /** Sesión con inspector de procesos abierto; el navegador no se autoabre encima. */
  processesInspectorFor: string | null
  setProcessesInspectorFor: (sessionId: string | null) => void
  goChat: () => void
  goEngine: () => void
  goWorkspace: () => void
  goProject: (root: string) => void
  goSettings: (section?: SettingsSection) => void
  setSettingsSection: (section: SettingsSection) => void
  setLang: (lang: Language) => void
  setSidebarOpen: (open: boolean) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebarCollapsed: () => void
  setPaletteOpen: (open: boolean) => void
  togglePalette: () => void
  setTheme: (theme: Theme) => void
  setAccent: (accent: Accent) => void
  setReduceMotion: (reduce: boolean) => void
  setEnterToSend: (on: boolean) => void
  setAutoFollow: (on: boolean) => void
  setShowSuggestions: (on: boolean) => void
  setShowTechnicalActivityNames: (on: boolean) => void
  setShortcutBinding: (action: ShortcutAction, shortcut: string) => void
  resetShortcutBindings: () => void
}

const initialAccent = typeof window === 'undefined' ? 'nebula' : getStoredAccent()
const initialMotion = typeof window === 'undefined' ? false : getStoredReduceMotion()
if (typeof window !== 'undefined') {
  applyAccent(initialAccent)
  applyReduceMotion(initialMotion)
}

/** Estado de shell (vista, sidebar, paleta, tema, prefs). Lo caliente (sesiones, streaming) sigue en los servicios. */
export const useUIStore = create<UIState>((set) => ({
  view: 'chat',
  projectRoot: null,
  settingsSection: 'general',
  lang: typeof window === 'undefined' ? 'es' : readLang(),
  sidebarOpen: false,
  sidebarCollapsed: typeof window === 'undefined' ? false : readCollapsed(),
  paletteOpen: false,
  theme: typeof window === 'undefined' ? 'system' : getStoredTheme(),
  accent: initialAccent,
  reduceMotion: initialMotion,
  enterToSend: typeof window === 'undefined' ? true : readBool('rinari.enterToSend', true),
  autoFollow: typeof window === 'undefined' ? true : readBool('rinari.autoFollow', true),
  showSuggestions:
    typeof window === 'undefined' ? true : readBool('rinari.showSuggestions', true),
  showTechnicalActivityNames:
    typeof window === 'undefined' ? false : readBool('rinari.showTechnicalActivityNames', false),
  shortcutBindings: typeof window === 'undefined' ? DEFAULT_SHORTCUT_BINDINGS : readShortcutBindings(),
  processesInspectorFor: null,
  setProcessesInspectorFor: (processesInspectorFor) => set({ processesInspectorFor }),
  goChat: () => set({ view: 'chat', sidebarOpen: false, projectRoot: null }),
  goEngine: () => set({ view: 'engine', sidebarOpen: false, projectRoot: null }),
  goWorkspace: () => set({ view: 'workspace', sidebarOpen: false, projectRoot: null }),
  goProject: (root) => set({ view: 'project', sidebarOpen: false, projectRoot: root }),
  goSettings: (section = 'general') =>
    set({ view: 'settings', sidebarOpen: false, settingsSection: section, projectRoot: null }),
  setSettingsSection: (settingsSection) => set({ settingsSection }),
  setLang: (lang) => {
    try {
      localStorage.setItem('rinari.lang', lang)
    } catch {
      /* ignore */
    }
    set({ lang })
  },
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSidebarCollapsed: (collapsed) => {
    writeBool('rinari.sidebarCollapsed', collapsed)
    set({ sidebarCollapsed: collapsed })
  },
  toggleSidebarCollapsed: () =>
    set((s) => {
      writeBool('rinari.sidebarCollapsed', !s.sidebarCollapsed)
      return { sidebarCollapsed: !s.sidebarCollapsed }
    }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  setTheme: (theme) => {
    storeTheme(theme)
    applyTheme(theme)
    set({ theme })
  },
  setAccent: (accent) => {
    storeAccent(accent)
    applyAccent(accent)
    set({ accent })
  },
  setReduceMotion: (reduce) => {
    storeReduceMotion(reduce)
    applyReduceMotion(reduce)
    set({ reduceMotion: reduce })
  },
  setEnterToSend: (on) => {
    writeBool('rinari.enterToSend', on)
    set({ enterToSend: on })
  },
  setAutoFollow: (on) => {
    writeBool('rinari.autoFollow', on)
    set({ autoFollow: on })
  },
  setShowSuggestions: (on) => {
    writeBool('rinari.showSuggestions', on)
    set({ showSuggestions: on })
  },
  setShowTechnicalActivityNames: (on) => {
    writeBool('rinari.showTechnicalActivityNames', on)
    set({ showTechnicalActivityNames: on })
  },
  setShortcutBinding: (action, shortcut) => set((state) => {
    const shortcutBindings = { ...state.shortcutBindings, [action]: shortcut }
    writeShortcutBindings(shortcutBindings)
    return { shortcutBindings }
  }),
  resetShortcutBindings: () => {
    writeShortcutBindings(DEFAULT_SHORTCUT_BINDINGS)
    set({ shortcutBindings: DEFAULT_SHORTCUT_BINDINGS })
  },
}))
