import { create } from 'zustand'
import { getProfileKey } from './profileKey'

/**
 * Registro local de **reconocimiento del usuario** sobre resultados de turno y
 * mensajes de otros paneles. No es una segunda base de chat: guarda ids,
 * estados y tiempos, nunca contenido, rutas, tokens ni errores completos. La
 * proyección (qué turnos existen, qué terminaron) siempre puede reconstruirse
 * desde el timeline; aquí solo vive la voluntad "visto".
 *
 * Clave `rinari.board.attention.v1`, indexada por perfil local y sesión.
 */
export const ATTENTION_STORAGE_KEY = 'rinari.board.attention.v1'
export const ATTENTION_SCHEMA_VERSION = 1 as const
export const ATTENTION_PERSIST_DEBOUNCE_MS = 250

export type TerminalOutcome = 'completed' | 'failed' | 'cancelled' | 'stopped'
export type ReceiptState = 'baseline' | 'unread' | 'seen'
export type TerminalSource = 'live' | 'history' | 'snapshot'

export interface TurnReadReceipt {
  turnId: string
  state: ReceiptState
  outcome: TerminalOutcome
  completedAt?: number
  /** Dedupe del *intento* de aviso; no acredita entrega. */
  notificationKey?: string
}

export interface SessionAttention {
  initialized: boolean
  /** Compatibilidad con layouts antiguos; nunca decide unread por desigualdad. */
  lastSeenTurnId: string | null
  /** Turnos activos vistos por este cliente: si terminan sin que lo veamos, quedan unread. */
  trackedActiveTurnIds: string[]
  turns: Record<string, TurnReadReceipt>
  /** Mensajes de otros paneles aceptados y aún no reconocidos (por messageId). */
  unreadPeerMessageIds: string[]
}

interface PersistedAttention {
  version: typeof ATTENTION_SCHEMA_VERSION
  profiles: Record<string, Record<string, SessionAttention>>
}

interface AttentionState {
  profileKey: string
  sessions: Record<string, SessionAttention>
  /** `null` = persistido; texto = último fallo (cuota, storage deshabilitado). */
  persistError: string | null
  /**
   * Primera observación de una sesión: el historial terminado es baseline.
   * `liveTerminalTurnIds` son terminales vistos en vivo durante esa carga: no
   * se degradan a baseline.
   */
  initializeSessionAttention: (
    sessionId: string,
    terminals: Array<{ turnId: string; outcome: TerminalOutcome; completedAt?: number }>,
    options?: { legacyLastSeenTurnId?: string | null; liveTerminalTurnIds?: string[] },
  ) => void
  trackActiveTurn: (sessionId: string, turnId: string) => void
  observeTerminal: (
    sessionId: string,
    turnId: string,
    outcome: TerminalOutcome,
    source: TerminalSource,
    completedAt?: number,
  ) => void
  markTurnSeen: (sessionId: string, turnId: string) => void
  markSessionResultsSeen: (sessionId: string, turnIds: string[]) => void
  markAllBoardResultsSeen: (snapshot: Record<string, string[]>) => void
  claimNotification: (sessionId: string, turnId: string, key: string) => boolean
  observePeerMessage: (sessionId: string, messageId: string) => void
  markPeerMessagesSeen: (sessionId: string, messageIds: string[]) => void
  /** Solo ante eliminación autoritativa de la sesión (no al quitarla del layout). */
  forgetSession: (sessionId: string) => void
  /** Tests y recuperación: sustituye el estado del perfil actual. */
  hydrate: (sessions: Record<string, SessionAttention>) => void
}

const OUTCOMES: readonly TerminalOutcome[] = ['completed', 'failed', 'cancelled', 'stopped']

export function emptySessionAttention(): SessionAttention {
  return { initialized: false, lastSeenTurnId: null, trackedActiveTurnIds: [], turns: {}, unreadPeerMessageIds: [] }
}

function isOutcome(value: unknown): value is TerminalOutcome {
  return typeof value === 'string' && (OUTCOMES as readonly string[]).includes(value)
}

function sanitizeSession(input: unknown): SessionAttention | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const turns: Record<string, TurnReadReceipt> = {}
  if (raw.turns && typeof raw.turns === 'object') {
    for (const [turnId, value] of Object.entries(raw.turns as Record<string, unknown>)) {
      if (!value || typeof value !== 'object' || !turnId) continue
      const receipt = value as Record<string, unknown>
      const state = receipt.state
      if (state !== 'baseline' && state !== 'unread' && state !== 'seen') continue
      if (!isOutcome(receipt.outcome)) continue
      turns[turnId] = {
        turnId,
        state,
        outcome: receipt.outcome,
        completedAt: typeof receipt.completedAt === 'number' && Number.isFinite(receipt.completedAt) ? receipt.completedAt : undefined,
        notificationKey: typeof receipt.notificationKey === 'string' ? receipt.notificationKey : undefined,
      }
    }
  }
  const ids = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [])
  return {
    initialized: raw.initialized === true,
    lastSeenTurnId: typeof raw.lastSeenTurnId === 'string' && raw.lastSeenTurnId ? raw.lastSeenTurnId : null,
    trackedActiveTurnIds: ids(raw.trackedActiveTurnIds),
    turns,
    unreadPeerMessageIds: ids(raw.unreadPeerMessageIds),
  }
}

function loadAll(): PersistedAttention {
  const empty: PersistedAttention = { version: ATTENTION_SCHEMA_VERSION, profiles: {} }
  if (typeof window === 'undefined') return empty
  try {
    const raw = window.localStorage.getItem(ATTENTION_STORAGE_KEY)
    if (!raw) return empty
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || parsed.version !== ATTENTION_SCHEMA_VERSION) return empty
    const profiles: PersistedAttention['profiles'] = {}
    if (parsed.profiles && typeof parsed.profiles === 'object') {
      for (const [profile, sessions] of Object.entries(parsed.profiles as Record<string, unknown>)) {
        if (!sessions || typeof sessions !== 'object') continue
        const clean: Record<string, SessionAttention> = {}
        for (const [sessionId, value] of Object.entries(sessions as Record<string, unknown>)) {
          const session = sanitizeSession(value)
          if (session) clean[sessionId] = session
        }
        profiles[profile] = clean
      }
    }
    return { version: ATTENTION_SCHEMA_VERSION, profiles }
  } catch {
    return empty
  }
}

function loadProfile(profileKey: string): Record<string, SessionAttention> {
  return loadAll().profiles[profileKey] ?? {}
}

/** Lectura saneada del almacenamiento (arranque y tests). */
export function readPersistedAttention(profileKey: string): Record<string, SessionAttention> {
  return loadProfile(profileKey)
}

function withSession(
  state: AttentionState,
  sessionId: string,
  update: (session: SessionAttention) => SessionAttention | null,
): Partial<AttentionState> | AttentionState {
  const current = state.sessions[sessionId] ?? emptySessionAttention()
  const next = update(current)
  if (next === null || next === current) return state
  return { sessions: { ...state.sessions, [sessionId]: next } }
}

function seen(session: SessionAttention, turnIds: Iterable<string>): SessionAttention {
  let turns = session.turns
  for (const turnId of turnIds) {
    const receipt = turns[turnId]
    if (!receipt || receipt.state === 'seen') continue
    if (turns === session.turns) turns = { ...turns }
    turns[turnId] = { ...receipt, state: 'seen' }
  }
  return turns === session.turns ? session : { ...session, turns }
}

export const useBoardAttentionStore = create<AttentionState>((set, get) => ({
  profileKey: typeof window === 'undefined' ? 'profile_test' : getProfileKey(),
  sessions: typeof window === 'undefined' ? {} : loadProfile(getProfileKey()),
  persistError: null,

  initializeSessionAttention: (sessionId, terminals, options = {}) => set((state) => withSession(state, sessionId, (session) => {
    if (session.initialized) return session
    const live = new Set(options.liveTerminalTurnIds ?? [])
    const turns: Record<string, TurnReadReceipt> = { ...session.turns }
    for (const terminal of terminals) {
      if (turns[terminal.turnId]) continue
      const tracked = session.trackedActiveTurnIds.includes(terminal.turnId)
      turns[terminal.turnId] = {
        turnId: terminal.turnId,
        state: live.has(terminal.turnId) || tracked ? (terminal.outcome === 'cancelled' ? 'seen' : 'unread') : 'baseline',
        outcome: terminal.outcome,
        completedAt: terminal.completedAt,
      }
    }
    // Layout legacy: una coincidencia exacta registra "seen"; nada más se deduce.
    const legacy = options.legacyLastSeenTurnId ?? session.lastSeenTurnId
    if (legacy && turns[legacy] && turns[legacy].state !== 'seen') turns[legacy] = { ...turns[legacy], state: 'seen' }
    const terminalIds = new Set(terminals.map((item) => item.turnId))
    return {
      ...session,
      initialized: true,
      lastSeenTurnId: legacy && !turns[legacy] ? legacy : null,
      trackedActiveTurnIds: session.trackedActiveTurnIds.filter((id) => !terminalIds.has(id)),
      turns,
    }
  })),

  trackActiveTurn: (sessionId, turnId) => set((state) => withSession(state, sessionId, (session) => {
    if (session.trackedActiveTurnIds.includes(turnId) || session.turns[turnId]) return session
    return { ...session, trackedActiveTurnIds: [...session.trackedActiveTurnIds, turnId] }
  })),

  observeTerminal: (sessionId, turnId, outcome, source, completedAt) => set((state) => withSession(state, sessionId, (session) => {
    const existing = session.turns[turnId]
    const tracked = session.trackedActiveTurnIds.includes(turnId)
    if (existing) {
      if (existing.outcome === outcome && (completedAt === undefined || existing.completedAt !== undefined)) return session
      return { ...session, turns: { ...session.turns, [turnId]: { ...existing, outcome, completedAt: existing.completedAt ?? completedAt } } }
    }
    // Cancelar a mano no es un resultado a revisar; terminales que solo
    // aparecen en historia/snapshot sin haber sido rastreados son baseline.
    const isNew = source === 'live' || tracked
    const stateValue: ReceiptState = !isNew ? 'baseline' : outcome === 'cancelled' ? 'seen' : 'unread'
    return {
      ...session,
      trackedActiveTurnIds: tracked ? session.trackedActiveTurnIds.filter((id) => id !== turnId) : session.trackedActiveTurnIds,
      turns: { ...session.turns, [turnId]: { turnId, state: stateValue, outcome, completedAt } },
    }
  })),

  markTurnSeen: (sessionId, turnId) => set((state) => withSession(state, sessionId, (session) => seen(session, [turnId]))),

  markSessionResultsSeen: (sessionId, turnIds) => set((state) => withSession(state, sessionId, (session) => seen(session, turnIds))),

  markAllBoardResultsSeen: (snapshot) => set((state) => {
    let sessions = state.sessions
    for (const [sessionId, turnIds] of Object.entries(snapshot)) {
      const current = sessions[sessionId]
      if (!current) continue
      const next = seen(current, turnIds)
      if (next === current) continue
      if (sessions === state.sessions) sessions = { ...sessions }
      sessions[sessionId] = next
    }
    return sessions === state.sessions ? state : { sessions }
  }),

  claimNotification: (sessionId, turnId, key) => {
    const receipt = get().sessions[sessionId]?.turns[turnId]
    if (!receipt || receipt.notificationKey === key) return false
    set((state) => withSession(state, sessionId, (session) => {
      const current = session.turns[turnId]
      if (!current || current.notificationKey === key) return session
      return { ...session, turns: { ...session.turns, [turnId]: { ...current, notificationKey: key } } }
    }))
    return true
  },

  observePeerMessage: (sessionId, messageId) => set((state) => withSession(state, sessionId, (session) => {
    if (session.unreadPeerMessageIds.includes(messageId)) return session
    return { ...session, unreadPeerMessageIds: [...session.unreadPeerMessageIds, messageId] }
  })),

  markPeerMessagesSeen: (sessionId, messageIds) => set((state) => withSession(state, sessionId, (session) => {
    const drop = new Set(messageIds)
    const remaining = session.unreadPeerMessageIds.filter((id) => !drop.has(id))
    return remaining.length === session.unreadPeerMessageIds.length ? session : { ...session, unreadPeerMessageIds: remaining }
  })),

  forgetSession: (sessionId) => set((state) => {
    if (!state.sessions[sessionId]) return state
    const sessions = { ...state.sessions }
    delete sessions[sessionId]
    return { sessions }
  }),

  hydrate: (sessions) => set({ sessions }),
}))

// -- selectores puros -----------------------------------------------------------

export function unreadTurnIds(session: SessionAttention | undefined): string[] {
  if (!session) return []
  return Object.values(session.turns).filter((receipt) => receipt.state === 'unread').map((receipt) => receipt.turnId)
}

export function unreadResultCount(session: SessionAttention | undefined): number {
  return unreadTurnIds(session).length
}

export function unreadPeerCount(session: SessionAttention | undefined): number {
  return session?.unreadPeerMessageIds.length ?? 0
}

// -- persistencia agrupada: solo al cambiar recibos, nunca por token ---------

let persistTimer: number | null = null
let lastSerialized = ''

function persistNow(state: AttentionState) {
  if (typeof window === 'undefined') return
  const document = loadAll()
  document.profiles[state.profileKey] = state.sessions
  const payload = JSON.stringify(document)
  if (payload === lastSerialized) return
  try {
    window.localStorage.setItem(ATTENTION_STORAGE_KEY, payload)
    lastSerialized = payload
    if (useBoardAttentionStore.getState().persistError !== null) useBoardAttentionStore.setState({ persistError: null })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (useBoardAttentionStore.getState().persistError !== message) useBoardAttentionStore.setState({ persistError: message })
  }
}

useBoardAttentionStore.subscribe((state, previous) => {
  if (typeof window === 'undefined' || state.sessions === previous.sessions) return
  if (persistTimer !== null) window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => {
    persistTimer = null
    persistNow(useBoardAttentionStore.getState())
  }, ATTENTION_PERSIST_DEBOUNCE_MS)
})

export function flushAttentionPersistence(): void {
  if (typeof window === 'undefined') return
  if (persistTimer !== null) {
    window.clearTimeout(persistTimer)
    persistTimer = null
  }
  persistNow(useBoardAttentionStore.getState())
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushAttentionPersistence)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAttentionPersistence()
  })
}
