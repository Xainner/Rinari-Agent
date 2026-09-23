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

/**
 * `chat` es la vista Normal (nombre interno conservado); `board` es Boards.
 * Ambas son presentaciones del mismo Engine: cambiar de una a otra nunca
 * altera turnos, permisos, modelos ni borradores.
 */
export type View = 'chat' | 'board' | 'flows' | 'settings' | 'engine' | 'workspace' | 'project'
/** Vistas de trabajo: a una de ellas se vuelve al salir de una vista auxiliar. */
export type WorkspaceView = Extract<View, 'chat' | 'board' | 'flows'>

/** Alcance de la vista Flujos: un proyecto registrado o una sesión suelta. Preferencia, no dato. */
export interface FlowScope {
  kind: 'project' | 'session'
  id: string
}

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

export type ShortcutAction = 'newChat' | 'palette' | 'settings' | 'sidebar' | 'boards' | 'flows' | 'collapsePane' | 'expandPane'
export type ShortcutBindings = Record<ShortcutAction, string>

export const DEFAULT_SHORTCUT_BINDINGS: ShortcutBindings = {
  newChat: 'Ctrl+N',
  palette: 'Ctrl+K',
  settings: 'Ctrl+,',
  sidebar: 'Ctrl+B',
  boards: 'Ctrl+Shift+B',
  flows: 'Ctrl+Shift+L',
  // Colapso/expansión del panel enfocado en Boards; sin acelerador nativo.
  collapsePane: 'Ctrl+Alt+[',
  expandPane: 'Ctrl+Alt+]',
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

const FLOW_SCOPE_KEY = 'rinari.flowScope'
/** Namespace mientras el hello no ha dicho cuál es el home real. */
export const DEFAULT_FLOW_HOME = 'default'

/** Alcance guardado por Engine home: dos homes distintos tienen ids distintos. */
export type FlowScopeByHome = Record<string, FlowScope>

function asFlowScope(value: unknown): FlowScope | null {
  const parsed = value as Partial<FlowScope> | null
  if (!parsed || (parsed.kind !== 'project' && parsed.kind !== 'session')) return null
  if (typeof parsed.id !== 'string' || !parsed.id) return null
  return { kind: parsed.kind, id: parsed.id }
}

export function readFlowScopes(): FlowScopeByHome {
  try {
    const parsed = JSON.parse(localStorage.getItem(FLOW_SCOPE_KEY) ?? 'null') as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    // Forma antigua: un único alcance sin home. Se adopta bajo el namespace
    // por defecto en vez de tirarlo, y el hello lo reindexa al home real.
    const flat = asFlowScope(parsed)
    if (flat) return { [DEFAULT_FLOW_HOME]: flat }
    const scopes: FlowScopeByHome = {}
    for (const [home, value] of Object.entries(parsed as Record<string, unknown>)) {
      const scope = asFlowScope(value)
      if (home && scope) scopes[home] = scope
    }
    return scopes
  } catch {
    return {}
  }
}

function writeFlowScopes(scopes: FlowScopeByHome): void {
  try {
    if (Object.keys(scopes).length === 0) localStorage.removeItem(FLOW_SCOPE_KEY)
    else localStorage.setItem(FLOW_SCOPE_KEY, JSON.stringify(scopes))
  } catch {
    /* preferencia opcional */
  }
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
  /**
   * Alcance elegido en Flujos; se persiste como preferencia
   * (`rinari.flowScope`) **por Engine home**: un id de proyecto solo
   * significa algo dentro del home que lo emitió.
   */
  flowScope: FlowScope | null
  /**
   * El alcance lo eligió una persona en esta ejecución («Ver flujo» o el
   * selector). Un alcance sólo restaurado del disco no cuenta: la vista
   * prefiere lo que se está trabajando ahora, y sólo cae en lo persistido
   * cuando no hay nada activo que mostrar. En memoria, no se persiste.
   */
  flowScopeExplicit: boolean
  /** Home al que pertenece el alcance actual; llega con el hello. */
  flowHomeId: string
  flowScopes: FlowScopeByHome
  /** `explicit: false` para el alcance que resuelve la propia vista al abrirse. */
  setFlowScope: (scope: FlowScope | null, explicit?: boolean) => void
  setFlowHomeId: (homeId: string | null) => void
  goFlows: (scope?: FlowScope) => void
  /** Última vista de trabajo (Normal, Boards o Flujos); en memoria, no persistida. */
  lastWorkspaceView: WorkspaceView
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
  goChat: () => void
  /** Selección idempotente de Normal (alias de `goChat`). */
  goNormal: () => void
  /** Selección idempotente de Boards. */
  goBoard: () => void
  /** Alterna Normal ↔ Boards; desde una vista auxiliar entra a la alternativa de la última vista de trabajo. */
  toggleBoards: () => void
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
  lastWorkspaceView: 'chat',
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
  goChat: () => set({ view: 'chat', lastWorkspaceView: 'chat', sidebarOpen: false, projectRoot: null }),
  goNormal: () => set({ view: 'chat', lastWorkspaceView: 'chat', sidebarOpen: false, projectRoot: null }),
  goBoard: () => set({ view: 'board', lastWorkspaceView: 'board', sidebarOpen: false, projectRoot: null }),
  flowHomeId: DEFAULT_FLOW_HOME,
  flowScopes: typeof window === 'undefined' ? {} : readFlowScopes(),
  flowScope:
    typeof window === 'undefined' ? null : readFlowScopes()[DEFAULT_FLOW_HOME] ?? null,
  flowScopeExplicit: false,
  setFlowScope: (flowScope, explicit = true) => set((s) => {
    const scopes = { ...s.flowScopes }
    if (flowScope) scopes[s.flowHomeId] = flowScope
    else delete scopes[s.flowHomeId]
    writeFlowScopes(scopes)
    return { flowScope, flowScopes: scopes, flowScopeExplicit: explicit && flowScope !== null }
  }),
  setFlowHomeId: (homeId) => set((s) => {
    const next = homeId || DEFAULT_FLOW_HOME
    if (s.flowHomeId === next) return s
    const scopes = { ...s.flowScopes }
    // Lo elegido antes del hello quedó bajo el namespace por defecto: se
    // adopta al home real, sin pisar lo que ese home ya tuviera.
    if (s.flowHomeId === DEFAULT_FLOW_HOME && next !== DEFAULT_FLOW_HOME && scopes[DEFAULT_FLOW_HOME]) {
      if (!scopes[next]) scopes[next] = scopes[DEFAULT_FLOW_HOME]
      delete scopes[DEFAULT_FLOW_HOME]
      writeFlowScopes(scopes)
    }
    // El alcance del home nuevo viene del disco, no de una elección de ahora.
    return { flowHomeId: next, flowScopes: scopes, flowScope: scopes[next] ?? null, flowScopeExplicit: false }
  }),
  goFlows: (scope) => set((s) => {
    if (!scope) return { view: 'flows', lastWorkspaceView: 'flows', sidebarOpen: false, projectRoot: null }
    const scopes = { ...s.flowScopes, [s.flowHomeId]: scope }
    writeFlowScopes(scopes)
    return { view: 'flows', lastWorkspaceView: 'flows', sidebarOpen: false, projectRoot: null, flowScope: scope, flowScopes: scopes, flowScopeExplicit: true }
  }),
  toggleBoards: () => set((s) => {
    const current = s.view === 'chat' || s.view === 'board' || s.view === 'flows' ? s.view : s.lastWorkspaceView
    const next: WorkspaceView = current === 'board' ? 'chat' : 'board'
    return { view: next, lastWorkspaceView: next, sidebarOpen: false, projectRoot: null }
  }),
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
