import { useStore } from 'zustand'
import type { ChatMessage, PendingApproval } from '../../types'
import type { ModelSummary, SessionSummary } from '../../services/engine'
import type { TurnTimeline, TurnTimelineState } from '../activity/types'
import type { RuntimeStore } from './runtimeStore'

/**
 * Selectores por sesión sobre la proyección del runtime.
 *
 * Cada selector devuelve la **misma referencia** mientras los datos de esa
 * sesión no cambien, aunque el reducer haya producido un objeto de estado nuevo
 * por un delta de otra sesión. Así un panel del board o la vista Normal no se
 * repinta por tokens ajenos.
 */

export const EMPTY_MESSAGES: readonly ChatMessage[] = Object.freeze([]) as readonly ChatMessage[]
export const EMPTY_TIMELINES: Readonly<Record<string, TurnTimeline>> = Object.freeze({})
export const EMPTY_APPROVALS: readonly PendingApproval[] = Object.freeze([]) as readonly PendingApproval[]

type TimelineSource = Pick<TurnTimelineState, 'timelines'>

interface TimelineCacheEntry {
  source: Record<string, TurnTimeline>
  result: Record<string, TurnTimeline>
}

const timelineCache = new Map<string, TimelineCacheEntry>()

function sameTimelines(previous: Record<string, TurnTimeline>, next: Record<string, TurnTimeline>): boolean {
  const previousKeys = Object.keys(previous)
  const nextKeys = Object.keys(next)
  if (previousKeys.length !== nextKeys.length) return false
  for (const key of nextKeys) if (previous[key] !== next[key]) return false
  return true
}

/** Timelines de una sesión, como mapa por `turnId`; referencia estable entre deltas ajenos. */
export function selectSessionTimelines(
  state: TimelineSource,
  sessionId: string,
): Record<string, TurnTimeline> {
  if (!sessionId) return EMPTY_TIMELINES as Record<string, TurnTimeline>
  const cached = timelineCache.get(sessionId)
  if (cached && cached.source === state.timelines) return cached.result
  const filtered: Record<string, TurnTimeline> = {}
  for (const [turnId, turn] of Object.entries(state.timelines)) {
    if (turn.sessionId === sessionId) filtered[turnId] = turn
  }
  const result = cached && sameTimelines(cached.result, filtered) ? cached.result : filtered
  timelineCache.set(sessionId, { source: state.timelines, result })
  return result
}

export function selectSessionTimelineList(state: TimelineSource, sessionId: string): TurnTimeline[] {
  return Object.values(selectSessionTimelines(state, sessionId))
}

export function selectThread(state: Pick<TurnTimelineState, 'threads'>, sessionId: string): ChatMessage[] {
  if (!sessionId) return EMPTY_MESSAGES as ChatMessage[]
  return state.threads[sessionId] ?? (EMPTY_MESSAGES as ChatMessage[])
}

export function selectBusy(state: Pick<TurnTimelineState, 'busySessions'>, sessionId: string): boolean {
  return sessionId !== '' && state.busySessions.has(sessionId)
}

const approvalCache = new Map<string, { source: PendingApproval[]; result: PendingApproval[] }>()

export function selectSessionApprovals(
  state: Pick<TurnTimelineState, 'approvals'>,
  sessionId: string,
): PendingApproval[] {
  if (!sessionId) return EMPTY_APPROVALS as PendingApproval[]
  const cached = approvalCache.get(sessionId)
  if (cached && cached.source === state.approvals) return cached.result
  const filtered = state.approvals.filter((item) => item.session_id === sessionId)
  const result =
    cached && cached.result.length === filtered.length && cached.result.every((item, index) => item === filtered[index])
      ? cached.result
      : filtered.length === 0
        ? (EMPTY_APPROVALS as PendingApproval[])
        : filtered
  approvalCache.set(sessionId, { source: state.approvals, result })
  return result
}

/** ¿La sesión tiene algo que mostrar (mensajes o turnos)? Booleano estable. */
export function selectHasContent(state: TurnTimelineState, sessionId: string): boolean {
  if (!sessionId) return false
  if ((state.threads[sessionId]?.length ?? 0) > 0) return true
  for (const turn of Object.values(state.timelines)) if (turn.sessionId === sessionId) return true
  return false
}

/**
 * Último turno de una sesión. Prefiere `turnIndex` autoritativo; sin él usa
 * `startedAt` con desempate estable por id. Los ids opacos no se comparan como
 * cronología.
 */
export function selectLatestTurn(state: TimelineSource, sessionId: string): TurnTimeline | null {
  let latest: TurnTimeline | null = null
  for (const turn of selectSessionTimelineList(state, sessionId)) {
    if (latest === null || compareTurns(turn, latest) > 0) latest = turn
  }
  return latest
}

function compareTurns(a: TurnTimeline, b: TurnTimeline): number {
  if (typeof a.turnIndex === 'number' && typeof b.turnIndex === 'number' && a.turnIndex !== b.turnIndex) {
    return a.turnIndex - b.turnIndex
  }
  if (a.startedAt !== b.startedAt) return a.startedAt - b.startedAt
  return a.turnId < b.turnId ? -1 : a.turnId > b.turnId ? 1 : 0
}

/**
 * Modelo efectivo de una sesión: el fijado en su registro. Sin coincidencia en
 * el catálogo devuelve `null`; nunca el default global, que es otra decisión.
 */
export function selectSessionModel(
  models: readonly ModelSummary[],
  record: SessionSummary | null | undefined,
): ModelSummary | null {
  if (!record?.model_id) return null
  return models.find((model) => model.id === record.model_id) ?? null
}

// -- hooks --------------------------------------------------------------------

export function useSessionThread(store: RuntimeStore, sessionId: string): ChatMessage[] {
  return useStore(store, (state) => selectThread(state, sessionId))
}

export function useSessionTimelines(store: RuntimeStore, sessionId: string): Record<string, TurnTimeline> {
  return useStore(store, (state) => selectSessionTimelines(state, sessionId))
}

export function useSessionBusy(store: RuntimeStore, sessionId: string): boolean {
  return useStore(store, (state) => selectBusy(state, sessionId))
}

export function useSessionApprovals(store: RuntimeStore, sessionId: string): PendingApproval[] {
  return useStore(store, (state) => selectSessionApprovals(state, sessionId))
}

export function useSessionHasContent(store: RuntimeStore, sessionId: string): boolean {
  return useStore(store, (state) => selectHasContent(state, sessionId))
}

export function useBusySessions(store: RuntimeStore): Set<string> {
  return useStore(store, (state) => state.busySessions)
}

export function useAllApprovals(store: RuntimeStore): PendingApproval[] {
  return useStore(store, (state) => state.approvals)
}

// -- estado derivado por sesión/panel (§8.5) ------------------------------------

export type TerminalOutcome = 'completed' | 'failed' | 'cancelled' | 'stopped'
export type PaneStatusKind =
  | 'loading' | 'unavailable' | 'needs_you' | 'working' | 'cancelling'
  | 'done' | 'failed' | 'cancelled' | 'stopped' | 'idle'
export type PaneAvailabilityState = 'loading' | 'ready' | 'disconnected' | 'recovering' | 'error'

/**
 * Proyección compacta de una sesión para header, tira, toolbar, sidebar y
 * avisos. Separa actividad actual, último resultado, lectura y disponibilidad:
 * un panel puede trabajar en T2 y conservar T1 sin leer. No incluye texto del
 * modelo: una palabra nueva no repinta badges ni dispara persistencia.
 */
export interface PaneStatus {
  kind: PaneStatusKind
  sessionId: string
  /** Turno que determina la actividad actual (activo o último terminal). */
  turnId: string | null
  latestTerminalTurnId: string | null
  latestOutcome: TerminalOutcome | null
  unread: boolean
  unreadResultCount: number
  /** `null` = colección no reconciliada (no afirmar cero). */
  pendingApprovals: number | null
  pendingQuestions: number | null
  unreadPeerCount: number | null
  startedAt?: number
  completedAt?: number
  error?: string
  stopReason?: { code: string; message: string }
  availability: PaneAvailabilityState
}

const ACTIVE_STATUSES = new Set(['running', 'approval', 'cancelling'])
const TERMINAL_OUTCOMES: Record<string, TerminalOutcome> = {
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
  stopped: 'stopped',
}

export function terminalOutcomeOf(turn: Pick<TurnTimeline, 'status'>): TerminalOutcome | null {
  return TERMINAL_OUTCOMES[turn.status] ?? null
}

/** Último turno terminado (completed/failed/cancelled/stopped) de la sesión. */
export function selectLatestTerminalTurn(state: TimelineSource, sessionId: string): TurnTimeline | null {
  let latest: TurnTimeline | null = null
  for (const turn of selectSessionTimelineList(state, sessionId)) {
    if (!terminalOutcomeOf(turn)) continue
    if (latest === null || compareTurns(turn, latest) > 0) latest = turn
  }
  return latest
}

/** Turno activo confirmado (running/approval/cancelling), si existe. */
export function selectActiveTurn(state: TimelineSource, sessionId: string): TurnTimeline | null {
  let active: TurnTimeline | null = null
  for (const turn of selectSessionTimelineList(state, sessionId)) {
    if (!ACTIVE_STATUSES.has(turn.status)) continue
    if (active === null || compareTurns(turn, active) > 0) active = turn
  }
  return active
}

/** Texto final del modelo para un turno: el item `final`, o nada. */
export function selectTurnFinalText(timeline: TurnTimeline | null | undefined): string | null {
  if (!timeline) return null
  for (let index = timeline.items.length - 1; index >= 0; index -= 1) {
    const item = timeline.items[index]
    if (item.type === 'model' && item.outputKind === 'final' && item.content) return item.content
  }
  return null
}

export interface PaneStatusInput {
  sessionId: string
  timelines: Record<string, TurnTimeline>
  /** Aprobaciones pendientes autoritativas; `null` si no se pudo reconciliar. */
  pendingApprovals: number | null
  pendingQuestions: number | null
  unreadResultCount: number
  unreadPeerCount: number | null
  availability: PaneAvailabilityState
}

/**
 * Deriva el estado con la precedencia de §8.5. Función pura; la estabilidad
 * de referencia la aporta `useStablePaneStatus`.
 */
export function derivePaneStatus(input: PaneStatusInput): PaneStatus {
  const source = { timelines: input.timelines }
  const active = selectActiveTurn(source, input.sessionId)
  const terminal = selectLatestTerminalTurn(source, input.sessionId)
  const latestOutcome = terminal ? terminalOutcomeOf(terminal) : null
  const interventions = (input.pendingApprovals ?? 0) + (input.pendingQuestions ?? 0)
  const base = {
    sessionId: input.sessionId,
    latestTerminalTurnId: terminal?.turnId ?? null,
    latestOutcome,
    unread: input.unreadResultCount > 0,
    unreadResultCount: input.unreadResultCount,
    pendingApprovals: input.pendingApprovals,
    pendingQuestions: input.pendingQuestions,
    unreadPeerCount: input.unreadPeerCount,
    availability: input.availability,
  }
  if (input.availability === 'loading') {
    return { ...base, kind: 'loading', turnId: active?.turnId ?? terminal?.turnId ?? null }
  }
  if (input.availability !== 'ready') {
    return { ...base, kind: 'unavailable', turnId: active?.turnId ?? terminal?.turnId ?? null }
  }
  if (active?.status === 'cancelling') {
    return { ...base, kind: 'cancelling', turnId: active.turnId, startedAt: active.startedAt }
  }
  if (interventions > 0 || active?.status === 'approval') {
    return { ...base, kind: 'needs_you', turnId: active?.turnId ?? null, startedAt: active?.startedAt }
  }
  if (active) {
    return { ...base, kind: 'working', turnId: active.turnId, startedAt: active.startedAt }
  }
  if (terminal && latestOutcome) {
    const kind: PaneStatusKind = latestOutcome === 'completed' ? 'done' : latestOutcome
    return {
      ...base,
      kind,
      turnId: terminal.turnId,
      startedAt: terminal.startedAt || undefined,
      completedAt: terminal.completedAt,
      error: latestOutcome === 'failed' ? terminal.error : undefined,
      stopReason: latestOutcome === 'stopped' ? terminal.stopReason : undefined,
    }
  }
  return { ...base, kind: 'idle', turnId: null }
}

export function samePaneStatus(a: PaneStatus | null, b: PaneStatus): boolean {
  if (a === null) return false
  return (
    a.kind === b.kind && a.sessionId === b.sessionId && a.turnId === b.turnId &&
    a.latestTerminalTurnId === b.latestTerminalTurnId && a.latestOutcome === b.latestOutcome &&
    a.unread === b.unread && a.unreadResultCount === b.unreadResultCount &&
    a.pendingApprovals === b.pendingApprovals && a.pendingQuestions === b.pendingQuestions &&
    a.unreadPeerCount === b.unreadPeerCount && a.startedAt === b.startedAt && a.completedAt === b.completedAt &&
    a.error === b.error && a.availability === b.availability &&
    a.stopReason?.code === b.stopReason?.code && a.stopReason?.message === b.stopReason?.message
  )
}
