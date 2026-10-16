import { create } from 'zustand'

/**
 * Panel lateral de una sesión (plan 0.4.0 #47): hasta cuatro vistas en
 * mosaico, compartido por la vista Normal y por su panel del board. Un solo
 * modelo persistido de presentación por sesión; no es un DTO del Engine.
 *
 * Namespace: perfil de instalación (el propio almacenamiento del WebView) +
 * identidad estable del Engine home (`EngineStatus.home_id`; `engine_instance_id`
 * cambia en cada arranque y no sirve) + sesión. Nunca se persisten
 * `webContentsId`, grants, `busy`, handles CDP ni generaciones: nada de eso
 * es autoridad recuperable.
 */
export type DockView = 'browser' | 'terminal' | 'files' | 'changes' | 'agents' | 'flow' | 'tasks' | 'verification' | 'insight'
/** Las vistas con botón propio en la barra de título, en su orden. */
export const PRIMARY_VIEWS: readonly DockView[] = ['browser', 'terminal', 'files', 'changes', 'agents', 'flow']
/** Las que van en «Más»; cuentan para el límite como las demás. */
export const MORE_VIEWS: readonly DockView[] = ['tasks', 'verification', 'insight']
export const DOCK_VIEWS: readonly DockView[] = [...PRIMARY_VIEWS, ...MORE_VIEWS]
export const MAX_VIEWS = 4

/** Nombres de antes (una superficie a la vez, Workspace con pestañas): se aceptan al revelar. */
export type LegacySurface = 'workspace'
export type DockSurface = DockView | LegacySurface
export type WorkspaceTab = 'changes' | 'tasks' | 'verification' | 'checkpoints' | 'artifacts' | 'insight'
export const WORKSPACE_TABS: readonly WorkspaceTab[] = ['changes', 'tasks', 'verification', 'checkpoints', 'artifacts', 'insight']

/** Proporciones del mosaico: ancho de la columna izquierda y alto de la vista de arriba en cada columna. */
export interface DockSplit { col: number; left: number; right: number }

export interface SessionDockLayout {
  schemaVersion: 2
  /** Ctrl+B lo oculta sin cerrar sus vistas. */
  visible: boolean
  /** En el orden del mosaico: 1 → 2 → 3 → 4. */
  views: DockView[]
  widthPx: number
  split: DockSplit
  /** Pesos de cada vista cuando el panel es angosto y va en una sola columna. */
  stack: number[]
  /**
   * Ampliado (#44a): el panel ocupa la conversación y el chat queda en una
   * columna. Una vista (su «Ampliar») o todo el mosaico (doble clic en el borde).
   */
  amp: DockAmp
  /** La última vista abierta: la abre el botón de un panel sin vistas, o Ctrl+B. */
  lastView: DockView | null
  /**
   * El Resumen (#82) a la vista en lugar del mosaico: o está el resumen, o las
   * vistas. Abrir una vista lo cierra; volver a pulsarlo trae el mosaico de antes.
   */
  summary: boolean
}

export type DockAmp = DockView | 'all' | null

/** Una sección dentro de una vista a la que llevar al revelarla (Checkpoints en Cambios, Artefactos en Archivos). */
export type DockSection = 'checkpoints' | 'artifacts'

export const SESSION_DOCK_STORAGE_KEY = 'rinari.sessionDock.v1'
export const SESSION_DOCK_SCHEMA_VERSION = 2 as const
export const DOCK_MIN_WIDTH = 280
export const DOCK_DEFAULT_WIDTH = 420
/** Sin tope práctico (#44a): lo limita el chat, no el panel. */
export const DOCK_MAX_WIDTH = 4000
/** El chat no baja de aquí con el panel al lado; si no cabe, el panel es un cajón. */
export const CHAT_MIN_DOCKED_WIDTH = 300
/** Por debajo de este ancho de panel, el mosaico pasa a una sola columna. */
export const MOSAIC_MIN_WIDTH = 640
const SPLIT_MIN = 0.15
const DEFAULT_SPLIT: DockSplit = { col: 0.5, left: 0.5, right: 0.5 }
const DEFAULT_HOME = 'default'

export function defaultDockLayout(): SessionDockLayout {
  return { schemaVersion: SESSION_DOCK_SCHEMA_VERSION, visible: false, views: [], widthPx: DOCK_DEFAULT_WIDTH, split: { ...DEFAULT_SPLIT }, stack: [], amp: null, lastView: null, summary: false }
}

const clampFraction = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1 - SPLIT_MIN, Math.max(SPLIT_MIN, value)) : fallback

function clampWidth(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(DOCK_MAX_WIDTH, Math.max(DOCK_MIN_WIDTH, Math.round(value))) : fallback
}

const isView = (value: unknown): value is DockView => DOCK_VIEWS.includes(value as DockView)

/** La vista que corresponde a una superficie o pestaña de antes. */
export function viewForSurface(surface: DockSurface, workspaceTab?: WorkspaceTab): { view: DockView; section?: DockSection } {
  if (surface !== 'workspace') return { view: surface }
  if (workspaceTab === 'checkpoints') return { view: 'changes', section: 'checkpoints' }
  if (workspaceTab === 'artifacts') return { view: 'files', section: 'artifacts' }
  if (workspaceTab === 'tasks' || workspaceTab === 'verification' || workspaceTab === 'insight') return { view: workspaceTab }
  return { view: 'changes' }
}

/** Pesos iguales, o los que había ajustados a la cantidad de vistas. */
function fitStack(stack: unknown, count: number): number[] {
  const list = Array.isArray(stack) ? stack.filter((value): value is number => typeof value === 'number' && value > 0) : []
  if (list.length !== count) return Array.from({ length: count }, () => 1 / Math.max(1, count))
  const total = list.reduce((sum, value) => sum + value, 0)
  return list.map((value) => value / total)
}

export function normalizeDockLayout(raw: unknown): SessionDockLayout | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const base = defaultDockLayout()
  // Schema 1: una superficie activa y la pestaña de Workspace.
  if (item.schemaVersion === 1 || (item.views === undefined && item.activeSurface !== undefined)) {
    const surface = (isView(item.activeSurface) || item.activeSurface === 'workspace' ? item.activeSurface : 'workspace') as DockSurface
    const { view } = viewForSurface(surface, WORKSPACE_TABS.includes(item.workspaceTab as WorkspaceTab) ? (item.workspaceTab as WorkspaceTab) : undefined)
    const visible = item.visible === true
    return { ...base, visible, views: visible ? [view] : [], stack: visible ? [1] : [], widthPx: clampWidth(item.widthPx, base.widthPx), lastView: view }
  }
  const views = (Array.isArray(item.views) ? item.views : []).filter(isView).filter((view, index, list) => list.indexOf(view) === index).slice(0, MAX_VIEWS)
  const split = (item.split && typeof item.split === 'object' ? item.split : {}) as Partial<DockSplit>
  const summary = item.summary === true
  return {
    schemaVersion: SESSION_DOCK_SCHEMA_VERSION,
    visible: (views.length > 0 || summary) && item.visible !== false,
    views,
    widthPx: clampWidth(item.widthPx, base.widthPx),
    split: { col: clampFraction(split.col, DEFAULT_SPLIT.col), left: clampFraction(split.left, DEFAULT_SPLIT.left), right: clampFraction(split.right, DEFAULT_SPLIT.right) },
    stack: fitStack(item.stack, views.length),
    amp: item.amp === 'all' && views.length > 0 ? 'all' : isView(item.amp) && views.includes(item.amp) ? item.amp : null,
    lastView: isView(item.lastView) ? item.lastView : item.lastView === null ? null : views.at(-1) ?? null,
    summary,
  }
}

/** Cómo se reparte el mosaico: columnas de vistas, según cuántas haya y el tamaño del panel. */
export type MosaicShape = DockView[][]
export function mosaicShape(views: readonly DockView[], size: { width: number; height: number } | null): MosaicShape {
  if (views.length === 0) return []
  const narrow = size !== null && size.width < MOSAIC_MIN_WIDTH
  if (narrow || views.length === 1) return [[...views]]
  if (views.length === 2) {
    // Lado a lado solo si el panel es muy ancho y bajo.
    const wide = size !== null && size.width >= 900 && size.width >= size.height * 1.6
    return wide ? [[views[0]], [views[1]]] : [[views[0], views[1]]]
  }
  // 3: dos apiladas a la izquierda y una alta a la derecha. 4: cuadrícula 2×2.
  return [[views[0], views[1]], views.slice(2)]
}

export interface DockBox { left: number; top: number; width: number; height: number }
export interface DockSplitterBox { axis: 'x' | 'y'; column: number; index: number; box: DockBox }

/**
 * Dónde va cada vista y cada separador dentro del mosaico, en píxeles. Las
 * vistas se colocan con posición absoluta y siempre en el mismo orden del
 * DOM: reorganizar (2 → 3, cambiar de sitio, ampliar) solo cambia su caja y
 * nunca vuelve a montar una vista (ni su terminal ni su navegador).
 */
export function mosaicGeometry(
  shape: MosaicShape,
  weights: { columns: number[]; rows: number[][] },
  size: { width: number; height: number },
  gap: number,
): { tiles: Partial<Record<DockView, DockBox>>; splitters: DockSplitterBox[] } {
  const tiles: Partial<Record<DockView, DockBox>> = {}
  const splitters: DockSplitterBox[] = []
  const usableWidth = Math.max(0, size.width - gap * (shape.length - 1))
  let x = 0
  shape.forEach((column, columnIndex) => {
    const width = usableWidth * (weights.columns[columnIndex] ?? 1 / shape.length)
    const usableHeight = Math.max(0, size.height - gap * (column.length - 1))
    let y = 0
    column.forEach((view, rowIndex) => {
      const height = usableHeight * (weights.rows[columnIndex]?.[rowIndex] ?? 1 / column.length)
      tiles[view] = { left: x, top: y, width, height }
      y += height
      if (rowIndex < column.length - 1) {
        splitters.push({ axis: 'y', column: columnIndex, index: rowIndex, box: { left: x, top: y, width, height: gap } })
        y += gap
      }
    })
    x += width
    if (columnIndex < shape.length - 1) {
      splitters.push({ axis: 'x', column: columnIndex, index: 0, box: { left: x, top: 0, width: gap, height: size.height } })
      x += gap
    }
  })
  return { tiles, splitters }
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

/** Qué pasó al pedir una vista desde su botón. */
export type ToggleOutcome = 'opened' | 'shown' | 'closed' | 'full'

/** De dónde sale una vista que se abre: su botón de la barra de título (para el movimiento). */
export interface DockLaunch { view: DockView; rect: { left: number; top: number; width: number; height: number }; at: number }

export interface SessionDockState {
  homeId: string | null
  layouts: Record<string, SessionDockLayout>
  foreign: Record<string, unknown>
  /** Transitorio: la sección a la que llevar en una vista recién revelada. */
  sections: Record<string, { view: DockView; section: DockSection; at: number }>
  /** Transitorio: el botón desde el que se abrió la última vista, por sesión. */
  launches: Record<string, DockLaunch>
  /** Transitorio: el turno (y el archivo) que la vista Cambios debe enseñar (#41). */
  changesFocus: Record<string, { turnId: string; path?: string; at: number }>
  /** «Revisar» de los cambios de un turno: abre Cambios en ese turno (y en ese archivo). */
  reviewTurn: (sessionId: string, turnId: string, path?: string) => void
  /** Transitorio: el alcance de la vista Flujo de cada sesión (#43). */
  flowScope: Record<string, 'session' | 'project'>
  setFlowScope: (sessionId: string, scope: 'session' | 'project') => void
  setHomeId: (homeId: string | null) => void
  layoutFor: (sessionId: string) => SessionDockLayout
  /** Botón de una vista: abierta y a la vista → la cierra; oculta → muestra el panel; cerrada → la abre (o dice que no cabe). */
  toggleView: (sessionId: string, view: DockView, launch?: DockLaunch['rect']) => ToggleOutcome
  /** Abre una vista; con el mosaico lleno reemplaza `replace` (o la última). */
  openView: (sessionId: string, view: DockView, options?: { replace?: DockView; launch?: DockLaunch['rect']; section?: DockSection }) => void
  closeView: (sessionId: string, view: DockView) => void
  /** Cambia de sitio dos vistas (arrastrar una por su cabecera sobre otra). */
  swapViews: (sessionId: string, a: DockView, b: DockView) => void
  /** Ctrl+B: oculta o vuelve a mostrar el panel con la misma disposición; sin vistas, abre la última. */
  toggleVisible: (sessionId: string) => void
  /** El botón «Resumen»: lo muestra en lugar de las vistas, o lo quita y vuelve el mosaico. */
  toggleSummary: (sessionId: string) => void
  setVisible: (sessionId: string, visible: boolean) => void
  setWidth: (sessionId: string, widthPx: number) => void
  setSplit: (sessionId: string, patch: Partial<DockSplit>) => void
  setStack: (sessionId: string, stack: number[]) => void
  setAmp: (sessionId: string, amp: DockAmp) => void
  /** Abre el panel en una vista concreta (enlace de archivo, browser del Engine, «Revisar cambios»). Acepta los nombres de antes. */
  reveal: (sessionId: string, surface: DockSurface, options?: { workspaceTab?: WorkspaceTab }) => void
  /** Adopta un layout inicial (panel nuevo, migración del schema 2 del board) solo si la sesión no tiene uno propio. */
  adoptIfAbsent: (sessionId: string, legacy: { visible?: boolean; widthPx?: number; surface?: DockSurface; workspaceTab?: WorkspaceTab }) => void
  /** Quitar un panel no borra el layout; borrar la sesión sí. */
  forget: (sessionId: string) => void
}

const initial = load()

export const useSessionDockStore = create<SessionDockState>((set, get) => {
  /** Aplica un cambio al layout de una sesión, lo normaliza y lo guarda. */
  const change = (sessionId: string, mutate: (current: SessionDockLayout) => SessionDockLayout | null) => set((state) => {
    if (!sessionId) return state
    const key = dockNamespaceKey(state.homeId, sessionId)
    const current = state.layouts[key] ?? defaultDockLayout()
    const mutated = mutate(current)
    const next = mutated && normalizeDockLayout(mutated)
    if (!next || (JSON.stringify(next) === JSON.stringify(current) && state.layouts[key])) return state
    const layouts = { ...state.layouts, [key]: next }
    persist({ layouts, foreign: state.foreign })
    return { layouts }
  })
  const remember = (sessionId: string, launch: DockLaunch['rect'] | undefined, view: DockView, section?: DockSection) => set((state) => {
    const key = dockNamespaceKey(state.homeId, sessionId)
    return {
      launches: launch ? { ...state.launches, [key]: { view, rect: launch, at: Date.now() } } : state.launches,
      sections: section ? { ...state.sections, [key]: { view, section, at: Date.now() } } : state.sections,
    }
  })
  /** La vista nueva ocupa el siguiente lugar; la que reemplaza, el sitio de la reemplazada. */
  const withView = (current: SessionDockLayout, view: DockView, replace?: DockView): SessionDockLayout => {
    if (current.views.includes(view)) return { ...current, visible: true, summary: false, lastView: view, amp: current.amp && current.amp !== view ? null : current.amp }
    let views = [...current.views]
    let stack = [...current.stack]
    if (views.length >= MAX_VIEWS) {
      const index = replace && views.includes(replace) ? views.indexOf(replace) : views.length - 1
      views[index] = view
    } else {
      // Las demás ceden una parte proporcional del alto (en una sola columna).
      const share = 1 / (views.length + 1)
      stack = stack.map((weight) => weight * (1 - share))
      views = [...views, view]
      stack.push(share)
    }
    return { ...current, visible: true, summary: false, views, stack, amp: null, lastView: view }
  }
  return {
    homeId: null,
    layouts: initial.layouts,
    foreign: initial.foreign,
    sections: {},
    launches: {},
    changesFocus: {},
    reviewTurn: (sessionId, turnId, path) => {
      if (!sessionId) return
      set((state) => ({ changesFocus: { ...state.changesFocus, [dockNamespaceKey(state.homeId, sessionId)]: { turnId, path, at: Date.now() } } }))
      get().openView(sessionId, 'changes')
    },
    flowScope: {},
    setFlowScope: (sessionId, scope) => set((state) => ({ flowScope: { ...state.flowScope, [dockNamespaceKey(state.homeId, sessionId)]: scope } })),
    setHomeId: (homeId) => set((state) => {
      const next = homeId || null
      if (state.homeId === next) return state
      // El `home_id` llega con el hello: lo que se guardó antes quedó bajo el
      // namespace por defecto. Se reindexa al home real en lugar de perderse,
      // sin pisar un layout que esa sesión ya tenga en el home de destino.
      if (state.homeId !== null || next === null || next === DEFAULT_HOME) return { homeId: next }
      const prefix = `${DEFAULT_HOME}::`
      const pending = Object.keys(state.layouts).filter((key) => key.startsWith(prefix))
      if (pending.length === 0) return { homeId: next }
      const layouts: Record<string, SessionDockLayout> = {}
      for (const [key, layout] of Object.entries(state.layouts)) {
        if (!key.startsWith(prefix)) layouts[key] = layout
      }
      for (const key of pending) {
        const target = `${next}::${key.slice(prefix.length)}`
        if (!(target in layouts)) layouts[target] = state.layouts[key]
      }
      persist({ layouts, foreign: state.foreign })
      return { homeId: next, layouts }
    }),
    layoutFor: (sessionId) => get().layouts[dockNamespaceKey(get().homeId, sessionId)] ?? defaultDockLayout(),
    toggleView: (sessionId, view, launch) => {
      const current = get().layoutFor(sessionId)
      if (current.views.includes(view)) {
        if (current.visible && current.summary) {
          // Con el Resumen a la vista, el botón de una vista abierta vuelve al mosaico.
          change(sessionId, (layout) => ({ ...layout, summary: false, lastView: view }))
          return 'shown'
        }
        if (current.visible) {
          get().closeView(sessionId, view)
          return 'closed'
        }
        change(sessionId, (layout) => ({ ...layout, visible: true, lastView: view }))
        return 'shown'
      }
      if (current.views.length >= MAX_VIEWS) return 'full'
      get().openView(sessionId, view, { launch })
      return 'opened'
    },
    openView: (sessionId, view, options = {}) => {
      if (!sessionId) return
      const current = get().layoutFor(sessionId)
      if (!current.views.includes(view) || !current.visible) remember(sessionId, options.launch, view)
      if (options.section) remember(sessionId, undefined, view, options.section)
      change(sessionId, (layout) => withView(layout, view, options.replace))
    },
    closeView: (sessionId, view) => change(sessionId, (layout) => {
      const index = layout.views.indexOf(view)
      if (index < 0) return layout
      const views = layout.views.filter((item) => item !== view)
      const stack = layout.stack.filter((_, position) => position !== index)
      return { ...layout, views, stack, visible: (views.length > 0 || layout.summary) && layout.visible, amp: layout.amp === view ? null : layout.amp, lastView: view }
    }),
    swapViews: (sessionId, a, b) => change(sessionId, (layout) => {
      const from = layout.views.indexOf(a)
      const to = layout.views.indexOf(b)
      if (from < 0 || to < 0 || from === to) return layout
      const views = [...layout.views]
      views[from] = b
      views[to] = a
      return { ...layout, views }
    }),
    toggleVisible: (sessionId) => {
      const current = get().layoutFor(sessionId)
      if (current.views.length === 0 && !current.summary) {
        get().openView(sessionId, current.lastView ?? 'browser')
        return
      }
      change(sessionId, (layout) => ({ ...layout, visible: !layout.visible }))
    },
    toggleSummary: (sessionId) => change(sessionId, (layout) => {
      if (layout.visible && layout.summary) return { ...layout, summary: false, visible: layout.views.length > 0 }
      return { ...layout, summary: true, visible: true }
    }),
    setVisible: (sessionId, visible) => {
      const current = get().layoutFor(sessionId)
      if (visible && current.views.length === 0 && !current.summary) {
        get().openView(sessionId, current.lastView ?? 'browser')
        return
      }
      change(sessionId, (layout) => ({ ...layout, visible }))
    },
    setWidth: (sessionId, widthPx) => change(sessionId, (layout) => ({ ...layout, widthPx })),
    setSplit: (sessionId, patch) => change(sessionId, (layout) => ({ ...layout, split: { ...layout.split, ...patch } })),
    setStack: (sessionId, stack) => change(sessionId, (layout) => ({ ...layout, stack })),
    setAmp: (sessionId, amp) => change(sessionId, (layout) => ({ ...layout, amp: amp === 'all' || (amp && layout.views.includes(amp)) ? amp : null })),
    reveal: (sessionId, surface, options = {}) => {
      const { view, section } = viewForSurface(surface, options.workspaceTab)
      get().openView(sessionId, view, { section })
    },
    adoptIfAbsent: (sessionId, legacy) => {
      const key = dockNamespaceKey(get().homeId, sessionId)
      if (get().layouts[key]) return
      const { view } = viewForSurface(legacy.surface ?? 'workspace', legacy.workspaceTab)
      const visible = legacy.visible ?? true
      // Sin una superficie de antes, no se inventa «la última usada»: el panel
      // abrirá el Navegador, como uno que nunca abrió ninguna.
      const lastView = legacy.surface || legacy.workspaceTab ? view : null
      change(sessionId, (layout) => ({ ...layout, visible, views: visible ? [view] : [], stack: visible ? [1] : [], widthPx: legacy.widthPx ?? DOCK_DEFAULT_WIDTH, lastView }))
    },
    forget: (sessionId) => set((state) => {
      const key = dockNamespaceKey(state.homeId, sessionId)
      if (!state.layouts[key]) return state
      const layouts = { ...state.layouts }
      delete layouts[key]
      persist({ layouts, foreign: state.foreign })
      return { layouts }
    }),
  }
})

/** Selector estable del layout de una sesión (por defecto sin persistir). */
export function selectDockLayout(sessionId: string) {
  return (state: SessionDockState): SessionDockLayout => state.layouts[dockNamespaceKey(state.homeId, sessionId)] ?? DEFAULT_LAYOUT
}
const DEFAULT_LAYOUT = defaultDockLayout()

/** Solo tests. */
export function resetSessionDockForTests(): void {
  useSessionDockStore.setState({ homeId: null, layouts: {}, foreign: {}, sections: {}, launches: {}, changesFocus: {}, flowScope: {} })
}
