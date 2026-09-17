import { create } from 'zustand'

/**
 * Layout del dock de una sesión (Archivos / Navegador / Workspace), compartido
 * por la vista Normal y por su panel del board: un solo modelo persistido de
 * presentación. Contrato nuevo de UI; no es un DTO del Engine.
 *
 * Namespace: perfil de instalación (el propio almacenamiento del WebView) +
 * identidad estable del Engine home (`EngineStatus.home_id`; `engine_instance_id`
 * cambia en cada arranque y no sirve) + sesión. Nunca se persisten
 * `webContentsId`, grants, `busy`, handles CDP ni generaciones: nada de eso
 * es autoridad recuperable.
 */
export type DockSurface = 'files' | 'browser' | 'workspace'
export type WorkspaceTab = 'changes' | 'tasks' | 'verification' | 'checkpoints' | 'artifacts' | 'insight'

export interface SessionDockLayout {
  schemaVersion: 1
  visible: boolean
  activeSurface: DockSurface
  widthPx: number
  workspaceTab: WorkspaceTab
}

export const SESSION_DOCK_STORAGE_KEY = 'rinari.sessionDock.v1'
export const SESSION_DOCK_SCHEMA_VERSION = 1 as const
export const DOCK_MIN_WIDTH = 280
export const DOCK_DEFAULT_WIDTH = 360
export const DOCK_MAX_WIDTH = 800
/** Ancho mínimo del chat para acoplar el dock al lado; si no cabe, el dock es un drawer. */
export const CHAT_MIN_DOCKED_WIDTH = 480
export const DOCK_SURFACES: readonly DockSurface[] = ['files', 'browser', 'workspace']
export const WORKSPACE_TABS: readonly WorkspaceTab[] = ['changes', 'tasks', 'verification', 'checkpoints', 'artifacts', 'insight']
const DEFAULT_HOME = 'default'

export function defaultDockLayout(): SessionDockLayout {
  return { schemaVersion: SESSION_DOCK_SCHEMA_VERSION, visible: false, activeSurface: 'workspace', widthPx: DOCK_DEFAULT_WIDTH, workspaceTab: 'changes' }
}

function clampWidth(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(DOCK_MAX_WIDTH, Math.max(DOCK_MIN_WIDTH, Math.round(value))) : fallback
}

export function normalizeDockLayout(raw: unknown): SessionDockLayout | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Partial<SessionDockLayout>
  const base = defaultDockLayout()
  return {
    schemaVersion: SESSION_DOCK_SCHEMA_VERSION,
    visible: typeof item.visible === 'boolean' ? item.visible : base.visible,
    activeSurface: DOCK_SURFACES.includes(item.activeSurface as DockSurface) ? (item.activeSurface as DockSurface) : base.activeSurface,
    widthPx: clampWidth(item.widthPx, base.widthPx),
    workspaceTab: WORKSPACE_TABS.includes(item.workspaceTab as WorkspaceTab) ? (item.workspaceTab as WorkspaceTab) : base.workspaceTab,
  }
}

interface StoredFile {
  layouts: Record<string, SessionDockLayout>
  /** Entradas de un schema futuro: se conservan tal cual, nunca se reescriben. */
  foreign: Record<string, unknown>
}

function load(): StoredFile {
  const empty: StoredFile = { layouts: {}, foreign: {} }
  if (typeof window === 'undefined') return empty
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SESSION_DOCK_STORAGE_KEY) ?? '{}') as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return empty
    for (const [key, value] of Object.entries(parsed)) {
      if (!key || !value || typeof value !== 'object') continue
      const version = (value as { schemaVersion?: unknown }).schemaVersion
      if (typeof version === 'number' && version > SESSION_DOCK_SCHEMA_VERSION) {
        empty.foreign[key] = value
        continue
      }
      const layout = normalizeDockLayout(value)
      if (layout) empty.layouts[key] = layout
    }
    return empty
  } catch {
    return empty
  }
}

function persist(file: StoredFile) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SESSION_DOCK_STORAGE_KEY, JSON.stringify({ ...file.foreign, ...file.layouts }))
  } catch {
    // Quota o storage deshabilitado: el layout sigue vivo en memoria.
  }
}

export function dockNamespaceKey(homeId: string | null | undefined, sessionId: string): string {
  return `${homeId || DEFAULT_HOME}::${sessionId}`
}

interface SessionDockState {
  homeId: string | null
  layouts: Record<string, SessionDockLayout>
  foreign: Record<string, unknown>
  /** Identidad del Engine home actual (de `EngineStatus.home_id`). */
  setHomeId: (homeId: string | null) => void
  layoutFor: (sessionId: string) => SessionDockLayout
  update: (sessionId: string, patch: Partial<Omit<SessionDockLayout, 'schemaVersion'>>) => void
  setVisible: (sessionId: string, visible: boolean) => void
  setActiveSurface: (sessionId: string, surface: DockSurface) => void
  setWidth: (sessionId: string, widthPx: number) => void
  setWorkspaceTab: (sessionId: string, tab: WorkspaceTab) => void
  /** Abre el dock en una superficie concreta (enlace de archivo, browser del Engine, «Revisar cambios»). */
  reveal: (sessionId: string, surface: DockSurface, options?: { workspaceTab?: WorkspaceTab }) => void
  /** Adopta un layout inicial (panel nuevo, migración del schema 2 del board) solo si la sesión no tiene uno propio. */
  adoptIfAbsent: (sessionId: string, legacy: { visible?: boolean; widthPx?: number; surface?: DockSurface; workspaceTab?: WorkspaceTab }) => void
  /** Quitar un panel no borra el layout; borrar la sesión sí. */
  forget: (sessionId: string) => void
}

const initial = load()

export const useSessionDockStore = create<SessionDockState>((set, get) => ({
  homeId: null,
  layouts: initial.layouts,
  foreign: initial.foreign,
  setHomeId: (homeId) => set((state) => (state.homeId === (homeId || null) ? state : { homeId: homeId || null })),
  layoutFor: (sessionId) => get().layouts[dockNamespaceKey(get().homeId, sessionId)] ?? defaultDockLayout(),
  update: (sessionId, patch) => set((state) => {
    if (!sessionId) return state
    const key = dockNamespaceKey(state.homeId, sessionId)
    const current = state.layouts[key] ?? defaultDockLayout()
    const next = normalizeDockLayout({ ...current, ...patch })
    if (!next || (next.visible === current.visible && next.activeSurface === current.activeSurface && next.widthPx === current.widthPx && next.workspaceTab === current.workspaceTab && state.layouts[key])) return state
    const layouts = { ...state.layouts, [key]: next }
    persist({ layouts, foreign: state.foreign })
    return { layouts }
  }),
  setVisible: (sessionId, visible) => get().update(sessionId, { visible }),
  setActiveSurface: (sessionId, activeSurface) => get().update(sessionId, { activeSurface }),
  setWidth: (sessionId, widthPx) => get().update(sessionId, { widthPx }),
  setWorkspaceTab: (sessionId, workspaceTab) => get().update(sessionId, { workspaceTab }),
  reveal: (sessionId, surface, options = {}) =>
    get().update(sessionId, { visible: true, activeSurface: surface, ...(options.workspaceTab ? { workspaceTab: options.workspaceTab } : {}) }),
  adoptIfAbsent: (sessionId, legacy) => {
    const key = dockNamespaceKey(get().homeId, sessionId)
    if (get().layouts[key]) return
    get().update(sessionId, {
      visible: legacy.visible ?? true,
      widthPx: legacy.widthPx ?? DOCK_DEFAULT_WIDTH,
      activeSurface: legacy.surface ?? 'workspace',
      workspaceTab: legacy.workspaceTab ?? 'changes',
    })
  },
  forget: (sessionId) => set((state) => {
    const key = dockNamespaceKey(state.homeId, sessionId)
    if (!state.layouts[key]) return state
    const layouts = { ...state.layouts }
    delete layouts[key]
    persist({ layouts, foreign: state.foreign })
    return { layouts }
  }),
}))

/** Selector estable del layout de una sesión (por defecto sin persistir). */
export function selectDockLayout(sessionId: string) {
  return (state: SessionDockState): SessionDockLayout => state.layouts[dockNamespaceKey(state.homeId, sessionId)] ?? DEFAULT_LAYOUT
}
const DEFAULT_LAYOUT = defaultDockLayout()

/** Solo tests. */
export function resetSessionDockForTests(): void {
  useSessionDockStore.setState({ homeId: null, layouts: {}, foreign: {} })
}
