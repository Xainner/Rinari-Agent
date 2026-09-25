import { create } from 'zustand'

/**
 * Pestañas de terminal por sesión. Cada una es un PTY del Engine; aquí solo
 * vive la presentación (título, cuál está activa, si ya terminó). No se
 * persiste: los PTY mueren con el Engine, y tras recargar la ventana el panel
 * adopta los que siguen vivos con `pty.list`.
 */
export interface TerminalTab {
  ptyId: string
  title: string
  exited: boolean
  exitCode: number | null
}

interface TerminalState {
  bySession: Record<string, TerminalTab[]>
  active: Record<string, string>
  /** `select: false` la añade sin cambiar la pestaña elegida (aperturas automáticas). */
  add: (sessionId: string, tab: Omit<TerminalTab, 'exited' | 'exitCode'> & Partial<TerminalTab>, options?: { select?: boolean }) => void
  remove: (sessionId: string, ptyId: string) => void
  select: (sessionId: string, ptyId: string) => void
  rename: (sessionId: string, ptyId: string, title: string) => void
  markExited: (ptyId: string, exitCode: number | null) => void
}

export const useTerminalStore = create<TerminalState>((set) => ({
  bySession: {},
  active: {},
  add: (sessionId, tab, options = {}) =>
    set((state) => {
      const tabs = state.bySession[sessionId] ?? []
      if (tabs.some((item) => item.ptyId === tab.ptyId)) return state
      const next: TerminalTab = { exited: false, exitCode: null, ...tab }
      const keep = options.select === false && state.active[sessionId] !== undefined
      return {
        bySession: { ...state.bySession, [sessionId]: [...tabs, next] },
        active: keep ? state.active : { ...state.active, [sessionId]: next.ptyId },
      }
    }),
  remove: (sessionId, ptyId) =>
    set((state) => {
      const tabs = state.bySession[sessionId] ?? []
      const index = tabs.findIndex((item) => item.ptyId === ptyId)
      if (index < 0) return state
      const rest = tabs.filter((item) => item.ptyId !== ptyId)
      const active = { ...state.active }
      if (active[sessionId] === ptyId) {
        // La vecina de la derecha, o la de la izquierda si era la última.
        const neighbour = rest[Math.min(index, rest.length - 1)]
        if (neighbour) active[sessionId] = neighbour.ptyId
        else delete active[sessionId]
      }
      return { bySession: { ...state.bySession, [sessionId]: rest }, active }
    }),
  select: (sessionId, ptyId) => set((state) => ({ active: { ...state.active, [sessionId]: ptyId } })),
  rename: (sessionId, ptyId, title) =>
    set((state) => {
      const clean = title.trim()
      if (!clean) return state
      const tabs = (state.bySession[sessionId] ?? []).map((item) => (item.ptyId === ptyId ? { ...item, title: clean } : item))
      return { bySession: { ...state.bySession, [sessionId]: tabs } }
    }),
  markExited: (ptyId, exitCode) =>
    set((state) => {
      let changed = false
      const bySession: Record<string, TerminalTab[]> = {}
      for (const [sessionId, tabs] of Object.entries(state.bySession)) {
        bySession[sessionId] = tabs.map((item) => {
          if (item.ptyId !== ptyId || item.exited) return item
          changed = true
          return { ...item, exited: true, exitCode }
        })
      }
      return changed ? { bySession } : state
    }),
}))

/** Título de la pestaña n: «PowerShell», «PowerShell 2»… */
export function nextTerminalTitle(label: string, tabs: readonly TerminalTab[]): string {
  const taken = new Set(tabs.map((tab) => tab.title))
  if (!taken.has(label)) return label
  for (let n = 2; ; n += 1) {
    const candidate = `${label} ${n}`
    if (!taken.has(candidate)) return candidate
  }
}

/** Preferencias de presentación de la terminal (solo de este escritorio). */
export interface TerminalPrefs {
  /** `id` de `pty.shells`; vacío = el predeterminado del Engine. */
  shellId: string
  fontSize: number
}

export const TERMINAL_PREFS_KEY = 'rinari.terminal.v1'
export const TERMINAL_FONT_SIZES = [11, 12, 13, 14, 15, 16] as const
const DEFAULT_PREFS: TerminalPrefs = { shellId: '', fontSize: 13 }

export function loadTerminalPrefs(): TerminalPrefs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(TERMINAL_PREFS_KEY) ?? '{}') as Partial<TerminalPrefs>
    return {
      shellId: typeof raw.shellId === 'string' ? raw.shellId : DEFAULT_PREFS.shellId,
      fontSize: TERMINAL_FONT_SIZES.includes(raw.fontSize as (typeof TERMINAL_FONT_SIZES)[number]) ? (raw.fontSize as number) : DEFAULT_PREFS.fontSize,
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function saveTerminalPrefs(prefs: TerminalPrefs): void {
  try {
    window.localStorage.setItem(TERMINAL_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Storage deshabilitado: la preferencia dura lo que la ventana.
  }
}

/** Las preferencias como estado: Ajustes las cambia y las terminales abiertas las ven. */
export const useTerminalPrefs = create<{ prefs: TerminalPrefs; setPrefs: (patch: Partial<TerminalPrefs>) => void }>((set, get) => ({
  prefs: typeof window === 'undefined' ? { ...DEFAULT_PREFS } : loadTerminalPrefs(),
  setPrefs: (patch) => {
    const prefs = { ...get().prefs, ...patch }
    saveTerminalPrefs(prefs)
    set({ prefs })
  },
}))

/** Solo tests. */
export function resetTerminalStoreForTests(): void {
  useTerminalStore.setState({ bySession: {}, active: {} })
  useTerminalPrefs.setState({ prefs: { ...DEFAULT_PREFS } })
}
