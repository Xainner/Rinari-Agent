import { create } from 'zustand'

/**
 * Composición visual de Boards.
 *
 * El panel (`paneId`) es presentación; la sesión (`sessionId`) es la identidad
 * de ejecución y pertenece al Engine. Aquí solo viven orden, anchos, dock,
 * foco, límite suave y preferencias deseadas. Nunca busy, grants,
 * capabilities, mensajes ni resultados de tools.
 *
 * Clave de almacenamiento `rinari.board.v1` con `version` interno 2 (la clave
 * no es la versión del schema). La lectura de resultados vive aparte
 * (`boardAttention`).
 */
export const BOARD_STORAGE_KEY = 'rinari.board.v1'
export const BOARD_SCHEMA_VERSION = 2

export const PANE_MIN_WIDTH = 480
export const PANE_DEFAULT_WIDTH = 760
export const PANE_MAX_WIDTH = 1600
export const WORKSPACE_MIN_WIDTH = 280
export const WORKSPACE_DEFAULT_WIDTH = 360
export const WORKSPACE_MAX_WIDTH = 800
/** Ancho mínimo del chat para acoplar el dock al lado; si no cabe, el dock es un drawer. */
export const CHAT_MIN_DOCKED_WIDTH = 480
export const SOFT_LIMIT_DEFAULT = 6

export type DockTab = 'workspace' | 'file'
export type WorkspaceTab = 'changes' | 'tasks' | 'verification' | 'checkpoints' | 'artifacts' | 'insight'
const WORKSPACE_TABS: readonly WorkspaceTab[] = ['changes', 'tasks', 'verification', 'checkpoints', 'artifacts', 'insight']

export interface BoardPane {
  paneId: string
  sessionId: string
  width: number
  workspaceVisible: boolean
  workspaceWidth: number
  collapsed: boolean
  dockTab: DockTab
  workspaceTab: WorkspaceTab
  peerReceive: boolean
  peerSend: boolean
}

export interface BoardNotificationPrefs {
  toasts: boolean
  system: boolean
  needsYou: boolean
  systemDetails: boolean
}

export interface PersistedBoard {
  version: typeof BOARD_SCHEMA_VERSION
  boardId: string
  panes: BoardPane[]
  focusedPaneId: string | null
  lastExpandedPaneId: string | null
  focusMode: boolean
  focusModeSnapshot: Record<string, boolean> | null
  softLimit: number
  messagingEnabled: boolean
  notifications: BoardNotificationPrefs
}

export type SessionResolution =
  | { status: 'active' }
  | { status: 'closed' }
  | { status: 'archived' }
  | { status: 'not_found' }
  | { status: 'unknown'; message: string }

export interface ReconcileOutcome {
  /** Paneles retirados (sesión cerrada/archivada/eliminada confirmada). */
  removed: Array<{ paneId: string; sessionId: string; status: 'closed' | 'archived' | 'not_found' }>
  /** Paneles conservados con error temporal. */
  unresolved: Array<{ paneId: string; sessionId: string; message: string }>
}

interface BoardState extends PersistedBoard {
  /** Errores de resolución por panel (efímero). */
  paneErrors: Record<string, string>
  /** Última vez que no se pudo persistir (cuota/storage). */
  persistError: string | null
  addPane: (sessionId: string, options?: { focus?: boolean; afterPaneId?: string }) => BoardPane
  removePane: (paneId: string) => void
  movePane: (paneId: string, toIndex: number) => void
  focusPane: (paneId: string | null) => void
  setPaneWidth: (paneId: string, width: number) => void
  setWorkspaceWidth: (paneId: string, width: number) => void
  setWorkspaceVisible: (paneId: string, visible: boolean) => void
  setDockTab: (paneId: string, tab: DockTab) => void
  setWorkspaceTab: (paneId: string, tab: WorkspaceTab) => void
  setSoftLimit: (limit: number) => void
  setPeerFlags: (paneId: string, flags: Partial<Pick<BoardPane, 'peerReceive' | 'peerSend'>>) => void
  setMessagingEnabled: (enabled: boolean) => void
  // -- colapso y modo foco (§7.6): presentación, nunca la vida de la sesión --
  setCollapsed: (paneId: string, collapsed: boolean) => void
  /** Expande sin robar foco (fuera de modo foco); en modo foco equivale a enfocar. */
  expandPane: (paneId: string, options?: { focus?: boolean }) => void
  collapseAll: () => void
  expandAll: () => void
  /**
   * Colapsa los paneles no enfocados cuyo estado es `done`, `idle` o `cancelled`
   * según la instantánea que aporta el controlador. Deshabilitado en modo foco.
   */
  collapseFinished: (statusByPane: Record<string, CollapsibleStatus>) => number
  setFocusMode: (enabled: boolean) => void
  setNotifications: (patch: Partial<BoardNotificationPrefs>) => void
  reconcileResolvedSessions: (resolved: Record<string, SessionResolution>) => ReconcileOutcome
  hasSession: (sessionId: string) => boolean
  paneForSession: (sessionId: string) => BoardPane | undefined
  /** Reemplaza la composición (tests y recuperación); valida como una carga. */
  hydrate: (layout: unknown) => void
}

const DEFAULT_NOTIFICATIONS: BoardNotificationPrefs = { toasts: true, system: false, needsYou: true, systemDetails: false }

/** Instantánea mínima que `collapseFinished` acepta del controlador. */
export interface CollapsibleStatus {
  kind: string
  pendingInterventions: number
  availabilityReady: boolean
}
const COLLAPSIBLE_KINDS = new Set(['done', 'idle', 'cancelled'])

function newId(prefix: string): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}_${random}`
}

const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizePane(raw: unknown, seen: Set<string>): BoardPane | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Partial<BoardPane>
  if (typeof item.sessionId !== 'string' || item.sessionId === '') return null
  if (seen.has(item.sessionId)) return null
  seen.add(item.sessionId)
  const paneId = typeof item.paneId === 'string' && item.paneId ? item.paneId : newId('pane')
  return {
    paneId,
    sessionId: item.sessionId,
    width: clamp(item.width, PANE_MIN_WIDTH, PANE_MAX_WIDTH, PANE_DEFAULT_WIDTH),
    workspaceVisible: bool(item.workspaceVisible, true),
    workspaceWidth: clamp(item.workspaceWidth, WORKSPACE_MIN_WIDTH, WORKSPACE_MAX_WIDTH, WORKSPACE_DEFAULT_WIDTH),
    collapsed: bool(item.collapsed, false),
    dockTab: item.dockTab === 'file' ? 'file' : 'workspace',
    workspaceTab: WORKSPACE_TABS.includes(item.workspaceTab as WorkspaceTab) ? (item.workspaceTab as WorkspaceTab) : 'changes',
    peerReceive: bool(item.peerReceive, true),
    peerSend: bool(item.peerSend, true),
  }
}

export function defaultBoard(): PersistedBoard {
  return {
    version: BOARD_SCHEMA_VERSION,
    boardId: newId('board'),
    panes: [],
    focusedPaneId: null,
    lastExpandedPaneId: null,
    focusMode: false,
    focusModeSnapshot: null,
    softLimit: SOFT_LIMIT_DEFAULT,
    messagingEnabled: true,
    notifications: { ...DEFAULT_NOTIFICATIONS },
  }
}

/**
 * Valida un layout persistido (v1 del plan original o v2) y devuelve uno
 * completo. Datos ausentes → defaults; entradas inválidas se descartan;
 * ids de pane duplicados y sesiones repetidas se deduplican. Nunca lanza.
 */
export function normalizeBoard(raw: unknown): PersistedBoard {
  const base = defaultBoard()
  if (!raw || typeof raw !== 'object') return base
  const input = raw as Partial<PersistedBoard> & { version?: unknown }
  const version = typeof input.version === 'number' ? input.version : 1
  if (version > BOARD_SCHEMA_VERSION) {
    // Versiones futuras: no se reescriben; se arranca con un board vacío en
    // memoria y la copia original queda intacta hasta que el usuario decida.
    return { ...base, boardId: typeof input.boardId === 'string' && input.boardId ? input.boardId : base.boardId }
  }
  const seenSessions = new Set<string>()
  const seenPaneIds = new Set<string>()
  const panes: BoardPane[] = []
  for (const item of Array.isArray(input.panes) ? input.panes : []) {
    const pane = normalizePane(item, seenSessions)
    if (!pane) continue
    if (seenPaneIds.has(pane.paneId)) pane.paneId = newId('pane')
    seenPaneIds.add(pane.paneId)
    panes.push(pane)
  }
  const focusedPaneId =
    typeof input.focusedPaneId === 'string' && panes.some((pane) => pane.paneId === input.focusedPaneId)
      ? input.focusedPaneId
      : null
  const lastExpandedPaneId =
    typeof input.lastExpandedPaneId === 'string' && panes.some((pane) => pane.paneId === input.lastExpandedPaneId)
      ? input.lastExpandedPaneId
      : focusedPaneId
  const focusMode = bool(input.focusMode, false)
  let focusModeSnapshot: Record<string, boolean> | null = null
  if (focusMode) {
    const snapshot = input.focusModeSnapshot && typeof input.focusModeSnapshot === 'object' ? input.focusModeSnapshot : null
    focusModeSnapshot = Object.fromEntries(
      panes.map((pane) => [pane.paneId, snapshot ? bool(snapshot[pane.paneId], pane.collapsed) : pane.collapsed]),
    )
  }
  const notificationsInput = (input.notifications && typeof input.notifications === 'object' ? input.notifications : {}) as Partial<BoardNotificationPrefs>
  const board: PersistedBoard = {
    version: BOARD_SCHEMA_VERSION,
    boardId: typeof input.boardId === 'string' && input.boardId ? input.boardId : base.boardId,
    panes,
    focusedPaneId,
    lastExpandedPaneId,
    focusMode,
    focusModeSnapshot,
    softLimit: clamp(input.softLimit, 0, 100, SOFT_LIMIT_DEFAULT),
    messagingEnabled: bool(input.messagingEnabled, true),
    notifications: {
      toasts: bool(notificationsInput.toasts, DEFAULT_NOTIFICATIONS.toasts),
      system: bool(notificationsInput.system, DEFAULT_NOTIFICATIONS.system),
      needsYou: bool(notificationsInput.needsYou, DEFAULT_NOTIFICATIONS.needsYou),
      systemDetails: bool(notificationsInput.systemDetails, DEFAULT_NOTIFICATIONS.systemDetails),
    },
  }
  // Invariante: el foco apunta a un panel expandido o es null.
  const focused = board.panes.find((pane) => pane.paneId === board.focusedPaneId)
  if (focused?.collapsed) board.focusedPaneId = null
  return board
}

export function serializeBoardLayout(state: PersistedBoard): PersistedBoard {
  return {
    version: BOARD_SCHEMA_VERSION,
    boardId: state.boardId,
    panes: state.panes.map((pane) => ({ ...pane })),
    focusedPaneId: state.focusedPaneId,
    lastExpandedPaneId: state.lastExpandedPaneId,
    focusMode: state.focusMode,
    focusModeSnapshot: state.focusModeSnapshot ? { ...state.focusModeSnapshot } : null,
    softLimit: state.softLimit,
    messagingEnabled: state.messagingEnabled,
    notifications: { ...state.notifications },
  }
}

const CORRUPT_BACKUP_KEY = `${BOARD_STORAGE_KEY}.corrupt`
/** Un layout de una versión futura no se reescribe: la persistencia queda bloqueada. */
let persistBlocked = false

function loadBoard(): PersistedBoard {
  if (typeof window === 'undefined') return defaultBoard()
  try {
    const raw = window.localStorage.getItem(BOARD_STORAGE_KEY)
    if (raw === null) return defaultBoard()
    const parsed = JSON.parse(raw) as { version?: unknown } | null
    if (parsed && typeof parsed === 'object' && typeof parsed.version === 'number' && parsed.version > BOARD_SCHEMA_VERSION) {
      persistBlocked = true
    }
    return normalizeBoard(parsed)
  } catch {
    // JSON corrupto: conservar una copia diagnóstica sin bloquear el arranque.
    try {
      const raw = window.localStorage.getItem(BOARD_STORAGE_KEY)
      if (raw !== null) window.localStorage.setItem(CORRUPT_BACKUP_KEY, raw)
    } catch {
      /* ignore */
    }
    return defaultBoard()
  }
}

/**
 * Vecino expandido más cercano en el orden del board: primero derecha, luego
 * izquierda. `eligible` excluye paneles que se están retirando.
 */
export function nearestExpandedNeighbor(
  panes: BoardPane[],
  paneId: string,
  eligible: (pane: BoardPane) => boolean = () => true,
): string | null {
  const ok = (pane: BoardPane | undefined): pane is BoardPane => Boolean(pane) && !pane!.collapsed && eligible(pane!)
  const index = panes.findIndex((pane) => pane.paneId === paneId)
  if (index < 0) return panes.find(ok)?.paneId ?? null
  for (let offset = 1; offset < panes.length; offset += 1) {
    const right = panes[index + offset]
    if (ok(right)) return right.paneId
    const left = panes[index - offset]
    if (ok(left)) return left.paneId
  }
  return null
}

/** Vecino más cercano en el orden del board, colapsado o no. */
function nearestNeighbor(panes: BoardPane[], paneId: string): string | null {
  const index = panes.findIndex((pane) => pane.paneId === paneId)
  if (index < 0) return panes[0]?.paneId ?? null
  for (let offset = 1; offset < panes.length; offset += 1) {
    const right = panes[index + offset]
    if (right) return right.paneId
    const left = panes[index - offset]
    if (left) return left.paneId
  }
  return null
}

export const useBoardStore = create<BoardState>((set, get) => ({
  ...loadBoard(),
  paneErrors: {},
  persistError: null,

  addPane: (sessionId, options = {}) => {
    const existing = get().panes.find((pane) => pane.sessionId === sessionId)
    if (existing) {
      if (options.focus !== false) get().focusPane(existing.paneId)
      return existing
    }
    const pane: BoardPane = {
      paneId: newId('pane'),
      sessionId,
      width: PANE_DEFAULT_WIDTH,
      workspaceVisible: true,
      workspaceWidth: WORKSPACE_DEFAULT_WIDTH,
      collapsed: false,
      dockTab: 'workspace',
      workspaceTab: 'changes',
      peerReceive: true,
      peerSend: true,
    }
    set((state) => {
      const panes = [...state.panes]
      const at = options.afterPaneId ? panes.findIndex((item) => item.paneId === options.afterPaneId) : -1
      if (at >= 0) panes.splice(at + 1, 0, pane)
      else panes.push(pane)
      const focus = options.focus !== false
      let next: Partial<BoardState> = { panes }
      if (focus) next = { ...next, focusedPaneId: pane.paneId, lastExpandedPaneId: pane.paneId }
      if (state.focusMode) {
        // Alta en modo foco: el nuevo panel queda expandido y enfocado; el resto colapsa.
        next = {
          ...next,
          panes: panes.map((item) => (item.paneId === pane.paneId ? item : { ...item, collapsed: focus ? true : item.collapsed })),
          focusModeSnapshot: { ...(state.focusModeSnapshot ?? {}), [pane.paneId]: false },
          focusedPaneId: focus ? pane.paneId : state.focusedPaneId,
        }
      }
      return next
    })
    return pane
  },

  removePane: (paneId) => set((state) => {
    if (!state.panes.some((pane) => pane.paneId === paneId)) return state
    const panes = state.panes.filter((pane) => pane.paneId !== paneId)
    let focusedPaneId = state.focusedPaneId
    if (focusedPaneId === paneId) {
      // En modo foco el resto está colapsado por diseño: el vecino más cercano
      // (derecha, luego izquierda) pasa a ser el foco y se expande abajo.
      focusedPaneId = state.focusMode
        ? nearestExpandedNeighbor(state.panes, paneId, () => true) ?? nearestNeighbor(state.panes, paneId)
        : nearestExpandedNeighbor(state.panes, paneId)
      if (focusedPaneId === paneId) focusedPaneId = null
    }
    if (focusedPaneId && !panes.some((pane) => pane.paneId === focusedPaneId)) focusedPaneId = null
    let next: Partial<BoardState> = {
      panes,
      focusedPaneId,
      lastExpandedPaneId: state.lastExpandedPaneId === paneId ? focusedPaneId : state.lastExpandedPaneId,
    }
    if (state.focusModeSnapshot) {
      const snapshot = { ...state.focusModeSnapshot }
      delete snapshot[paneId]
      next = { ...next, focusModeSnapshot: snapshot }
    }
    if (state.focusMode && focusedPaneId) {
      // Baja del foco en modo foco: el vecino elegido queda expandido.
      next = { ...next, panes: panes.map((pane) => (pane.paneId === focusedPaneId ? { ...pane, collapsed: false } : pane)) }
    }
    const paneErrors = { ...state.paneErrors }
    delete paneErrors[paneId]
    return { ...next, paneErrors }
  }),

  movePane: (paneId, toIndex) => set((state) => {
    const from = state.panes.findIndex((pane) => pane.paneId === paneId)
    if (from < 0) return state
    const target = Math.max(0, Math.min(state.panes.length - 1, toIndex))
    if (target === from) return state
    const panes = [...state.panes]
    const [pane] = panes.splice(from, 1)
    panes.splice(target, 0, pane)
    return { panes }
  }),

  focusPane: (paneId) => set((state) => {
    if (paneId === null) return state.focusedPaneId === null ? state : { focusedPaneId: null }
    const pane = state.panes.find((item) => item.paneId === paneId)
    if (!pane) return state
    let panes = state.panes
    if (state.focusMode) {
      panes = state.panes.map((item) => ({ ...item, collapsed: item.paneId !== paneId }))
    } else if (pane.collapsed) {
      panes = state.panes.map((item) => (item.paneId === paneId ? { ...item, collapsed: false } : item))
    }
    if (panes === state.panes && state.focusedPaneId === paneId) return state
    return { panes, focusedPaneId: paneId, lastExpandedPaneId: paneId }
  }),

  setPaneWidth: (paneId, width) => set((state) => ({
    panes: state.panes.map((pane) => pane.paneId === paneId
      ? { ...pane, width: clamp(width, PANE_MIN_WIDTH, PANE_MAX_WIDTH, pane.width) }
      : pane),
  })),
  setWorkspaceWidth: (paneId, width) => set((state) => ({
    panes: state.panes.map((pane) => pane.paneId === paneId
      ? { ...pane, workspaceWidth: clamp(width, WORKSPACE_MIN_WIDTH, WORKSPACE_MAX_WIDTH, pane.workspaceWidth) }
      : pane),
  })),
  setWorkspaceVisible: (paneId, visible) => set((state) => ({
    panes: state.panes.map((pane) => pane.paneId === paneId && pane.workspaceVisible !== visible ? { ...pane, workspaceVisible: visible } : pane),
  })),
  setDockTab: (paneId, tab) => set((state) => ({
    panes: state.panes.map((pane) => pane.paneId === paneId && pane.dockTab !== tab ? { ...pane, dockTab: tab } : pane),
  })),
  setWorkspaceTab: (paneId, tab) => set((state) => ({
    panes: state.panes.map((pane) => pane.paneId === paneId && pane.workspaceTab !== tab ? { ...pane, workspaceTab: tab } : pane),
  })),
  setSoftLimit: (limit) => set({ softLimit: clamp(limit, 0, 100, SOFT_LIMIT_DEFAULT) }),
  setPeerFlags: (paneId, flags) => set((state) => ({
    panes: state.panes.map((pane) => (pane.paneId === paneId ? { ...pane, ...flags } : pane)),
  })),
  setMessagingEnabled: (enabled) => set({ messagingEnabled: enabled }),
  setNotifications: (patch) => set((state) => ({ notifications: { ...state.notifications, ...patch } })),

  setCollapsed: (paneId, collapsed) => set((state) => {
    const pane = state.panes.find((item) => item.paneId === paneId)
    if (!pane || pane.collapsed === collapsed) return state
    if (!collapsed) {
      if (state.focusMode) {
        // En modo foco solo queda expandido uno: expandir es enfocar.
        return {
          panes: state.panes.map((item) => ({ ...item, collapsed: item.paneId !== paneId })),
          focusedPaneId: paneId,
          lastExpandedPaneId: paneId,
        }
      }
      return { panes: state.panes.map((item) => (item.paneId === paneId ? { ...item, collapsed: false } : item)) }
    }
    // Colapsar: el ancho preferido se conserva; el foco pasa al vecino expandido.
    const panes = state.panes.map((item) => (item.paneId === paneId ? { ...item, collapsed: true } : item))
    let focusedPaneId = state.focusedPaneId
    if (focusedPaneId === paneId) focusedPaneId = nearestExpandedNeighbor(panes, paneId)
    const next: Partial<BoardState> = { panes, focusedPaneId, lastExpandedPaneId: paneId }
    if (state.focusMode && state.focusedPaneId === paneId) {
      // Colapsar el foco a mano sale del modo sin restaurar el snapshot: nada se
      // expande por sorpresa; puede quedar todo colapsado.
      return { ...next, focusMode: false, focusModeSnapshot: null }
    }
    return next
  }),

  expandPane: (paneId, options = {}) => {
    const state = get()
    if (!state.panes.some((item) => item.paneId === paneId)) return
    if (state.focusMode || options.focus) {
      get().focusPane(paneId)
      return
    }
    get().setCollapsed(paneId, false)
  },

  collapseAll: () => set((state) => {
    if (state.panes.length === 0 && !state.focusMode) return state
    const cursor = state.focusedPaneId ?? state.lastExpandedPaneId ?? state.panes[0]?.paneId ?? null
    return {
      panes: state.panes.map((pane) => (pane.collapsed ? pane : { ...pane, collapsed: true })),
      focusedPaneId: null,
      lastExpandedPaneId: cursor,
      focusMode: false,
      focusModeSnapshot: null,
    }
  }),

  expandAll: () => set((state) => {
    const panes = state.panes.map((pane) => (pane.collapsed ? { ...pane, collapsed: false } : pane))
    const focusedPaneId = state.focusedPaneId && panes.some((pane) => pane.paneId === state.focusedPaneId)
      ? state.focusedPaneId
      : panes.some((pane) => pane.paneId === state.lastExpandedPaneId) ? state.lastExpandedPaneId : panes[0]?.paneId ?? null
    return { panes, focusedPaneId, focusMode: false, focusModeSnapshot: null }
  }),

  collapseFinished: (statusByPane) => {
    const state = get()
    if (state.focusMode) return 0
    const targets = state.panes.filter((pane) => {
      if (pane.collapsed || pane.paneId === state.focusedPaneId) return false
      const status = statusByPane[pane.paneId]
      return Boolean(status) && COLLAPSIBLE_KINDS.has(status.kind) && status.pendingInterventions === 0 && status.availabilityReady
    })
    if (targets.length === 0) return 0
    const ids = new Set(targets.map((pane) => pane.paneId))
    set({ panes: state.panes.map((pane) => (ids.has(pane.paneId) ? { ...pane, collapsed: true } : pane)) })
    return targets.length
  },

  setFocusMode: (enabled) => set((state) => {
    if (enabled === state.focusMode) return state
    if (enabled) {
      const snapshot = Object.fromEntries(state.panes.map((pane) => [pane.paneId, pane.collapsed]))
      const focus = state.focusedPaneId && state.panes.some((pane) => pane.paneId === state.focusedPaneId)
        ? state.focusedPaneId
        : state.panes.some((pane) => pane.paneId === state.lastExpandedPaneId) ? state.lastExpandedPaneId : state.panes[0]?.paneId ?? null
      return {
        focusMode: true,
        focusModeSnapshot: snapshot,
        focusedPaneId: focus,
        lastExpandedPaneId: focus ?? state.lastExpandedPaneId,
        panes: state.panes.map((pane) => ({ ...pane, collapsed: focus !== null && pane.paneId !== focus })),
      }
    }
    const snapshot = state.focusModeSnapshot ?? {}
    const panes = state.panes.map((pane) => ({ ...pane, collapsed: pane.paneId in snapshot ? snapshot[pane.paneId] : false }))
    let focusedPaneId = state.focusedPaneId
    const focused = panes.find((pane) => pane.paneId === focusedPaneId)
    if (!focused || focused.collapsed) focusedPaneId = focusedPaneId ? nearestExpandedNeighbor(panes, focusedPaneId) : null
    return { focusMode: false, focusModeSnapshot: null, panes, focusedPaneId }
  }),

  reconcileResolvedSessions: (resolved) => {
    const outcome: ReconcileOutcome = { removed: [], unresolved: [] }
    const state = get()
    const keep: BoardPane[] = []
    const paneErrors: Record<string, string> = {}
    for (const pane of state.panes) {
      const resolution = resolved[pane.sessionId]
      if (!resolution || resolution.status === 'active') {
        keep.push(pane)
        continue
      }
      if (resolution.status === 'unknown') {
        keep.push(pane)
        paneErrors[pane.paneId] = resolution.message
        outcome.unresolved.push({ paneId: pane.paneId, sessionId: pane.sessionId, message: resolution.message })
        continue
      }
      outcome.removed.push({ paneId: pane.paneId, sessionId: pane.sessionId, status: resolution.status })
    }
    if (outcome.removed.length === 0 && Object.keys(paneErrors).length === 0 && Object.keys(state.paneErrors).length === 0) {
      return outcome
    }
    let focusedPaneId = state.focusedPaneId
    if (focusedPaneId && !keep.some((pane) => pane.paneId === focusedPaneId)) {
      const kept = new Set(keep.map((pane) => pane.paneId))
      focusedPaneId = nearestExpandedNeighbor(state.panes, focusedPaneId, (pane) => kept.has(pane.paneId))
    }
    const snapshot = state.focusModeSnapshot
      ? Object.fromEntries(Object.entries(state.focusModeSnapshot).filter(([id]) => keep.some((pane) => pane.paneId === id)))
      : null
    set({
      panes: keep,
      focusedPaneId,
      lastExpandedPaneId: keep.some((pane) => pane.paneId === state.lastExpandedPaneId) ? state.lastExpandedPaneId : focusedPaneId,
      focusModeSnapshot: snapshot,
      paneErrors,
    })
    return outcome
  },

  hasSession: (sessionId) => get().panes.some((pane) => pane.sessionId === sessionId),
  paneForSession: (sessionId) => get().panes.find((pane) => pane.sessionId === sessionId),
  hydrate: (layout) => set({ ...normalizeBoard(layout), paneErrors: {} }),
}))

// -- persistencia: solo preferencias, agrupada, nunca por pixel -------------

let persistTimer: number | null = null
let lastSerialized = ''

function persistNow(state: PersistedBoard) {
  if (typeof window === 'undefined') return
  if (persistBlocked) {
    if (useBoardStore.getState().persistError !== 'newer-layout') useBoardStore.setState({ persistError: 'newer-layout' })
    return
  }
  const payload = JSON.stringify(serializeBoardLayout(state))
  if (payload === lastSerialized) return
  try {
    window.localStorage.setItem(BOARD_STORAGE_KEY, payload)
    lastSerialized = payload
    if (useBoardStore.getState().persistError !== null) useBoardStore.setState({ persistError: null })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (useBoardStore.getState().persistError !== message) useBoardStore.setState({ persistError: message })
  }
}

export const BOARD_PERSIST_DEBOUNCE_MS = 250

useBoardStore.subscribe((state) => {
  if (typeof window === 'undefined') return
  if (persistTimer !== null) window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => {
    persistTimer = null
    persistNow(useBoardStore.getState())
  }, BOARD_PERSIST_DEBOUNCE_MS)
  void state
})

if (typeof window !== 'undefined') {
  const flush = () => {
    if (persistTimer !== null) {
      window.clearTimeout(persistTimer)
      persistTimer = null
    }
    persistNow(useBoardStore.getState())
  }
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
}

/** Fuerza la escritura pendiente (tests y cierre). */
export function flushBoardPersistence(): void {
  if (typeof window === 'undefined') return
  if (persistTimer !== null) {
    window.clearTimeout(persistTimer)
    persistTimer = null
  }
  persistNow(useBoardStore.getState())
}
