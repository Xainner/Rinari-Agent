import { useBoardStore, type CollapsibleStatus } from '../../stores/board'
import { unreadTurnIds, useBoardAttentionStore } from '../../stores/boardAttention'
import { useBoardStatusStore } from '../../stores/boardStatus'

/**
 * Comandos del board con destino estable (los stores). Toolbar, menú, paleta y
 * atajos despachan estas mismas funciones; ninguna toca el Engine ni marca
 * lecturas como efecto secundario de colapsar o expandir.
 */

export function collapseFocusedPane(): boolean {
  const state = useBoardStore.getState()
  if (!state.focusedPaneId) return false
  state.setCollapsed(state.focusedPaneId, true)
  return true
}

/**
 * `expandPane`: el enfocado si lo hay; con foco null, `lastExpandedPaneId`
 * válido o la primera tira. Así "colapsar todo" no bloquea el teclado.
 */
export function expandPaneShortcut(): boolean {
  const state = useBoardStore.getState()
  const target = state.focusedPaneId
    ?? (state.panes.some((pane) => pane.paneId === state.lastExpandedPaneId) ? state.lastExpandedPaneId : null)
    ?? state.panes.find((pane) => pane.collapsed)?.paneId
    ?? null
  if (!target) return false
  state.expandPane(target, { focus: true })
  return true
}

export function collapseAllPanes(): void {
  useBoardStore.getState().collapseAll()
}

export function expandAllPanes(): void {
  useBoardStore.getState().expandAll()
}

/** Instantánea del controlador con la forma mínima que acepta el store. */
export function collapsibleSnapshot(): Record<string, CollapsibleStatus> {
  const byPane = useBoardStatusStore.getState().byPane
  return Object.fromEntries(
    Object.entries(byPane).map(([paneId, status]) => [
      paneId,
      {
        kind: status.kind,
        pendingInterventions: (status.pendingApprovals ?? 1) + (status.pendingQuestions ?? 1),
        availabilityReady: status.availability === 'ready',
      },
    ]),
  )
}

export type CollapseFinishedResult = { outcome: 'collapsed'; count: number } | { outcome: 'nothing' } | { outcome: 'focus-mode' }

export function collapseFinishedPanes(): CollapseFinishedResult {
  const state = useBoardStore.getState()
  if (state.focusMode) return { outcome: 'focus-mode' }
  const count = state.collapseFinished(collapsibleSnapshot())
  return count > 0 ? { outcome: 'collapsed', count } : { outcome: 'nothing' }
}

export function toggleFocusMode(): boolean {
  const state = useBoardStore.getState()
  state.setFocusMode(!state.focusMode)
  return useBoardStore.getState().focusMode
}

/** Captura los ids de resultados conocidos al pulsar; nunca turnos futuros. */
export function markAllBoardResultsRead(): number {
  const sessions = useBoardAttentionStore.getState().sessions
  const snapshot: Record<string, string[]> = {}
  let total = 0
  for (const pane of useBoardStore.getState().panes) {
    if (snapshot[pane.sessionId]) continue
    const ids = unreadTurnIds(sessions[pane.sessionId])
    if (ids.length === 0) continue
    snapshot[pane.sessionId] = ids
    total += ids.length
  }
  if (total > 0) useBoardAttentionStore.getState().markAllBoardResultsSeen(snapshot)
  return total
}

export interface BoardAttentionTarget {
  sessionId: string
  turnId?: string
  requestId?: string
}

export const REVEAL_TURN_EVENT = 'rinari:reveal-turn'

let queuedReveal: { sessionId: string; turnId: string } | null = null

/**
 * Pedir que el transcript de Normal muestre un turno. Si esa sesión ya está
 * montada, el evento basta; si la app aún está cambiando de sesión (p. ej.
 * «Ir al turno» desde Flujos), la petición queda en cola y `ChatView` la
 * consume al montar esa sesión, con lo que no se pierde por la carrera.
 */
export function requestTurnReveal(detail: { sessionId: string; turnId: string }): void {
  queuedReveal = detail
  window.dispatchEvent(new CustomEvent(REVEAL_TURN_EVENT, { detail }))
}

/** Consumir (y vaciar) la petición en cola dirigida a `sessionId`, si la hay. */
export function takeQueuedTurnReveal(sessionId: string): string | null {
  if (!queuedReveal || queuedReveal.sessionId !== sessionId) return null
  const { turnId } = queuedReveal
  queuedReveal = null
  return turnId
}

/**
 * Acción tipada de un aviso interno: comprobar pertenencia, ir a Boards,
 * expandir/enfocar el panel y pedir al transcript que muestre el turno. La
 * lectura solo se aplica cuando el bloque queda visible (regla de §8.6), no
 * por pulsar el aviso. Devuelve `false` si la sesión ya no está en el board.
 */
export function revealBoardAttention(target: BoardAttentionTarget, navigate: { goBoard: () => void }): boolean {
  const board = useBoardStore.getState()
  const pane = board.panes.find((item) => item.sessionId === target.sessionId)
  if (!pane) return false
  navigate.goBoard()
  board.expandPane(pane.paneId, { focus: true })
  if (target.turnId) {
    const detail = { sessionId: target.sessionId, turnId: target.turnId, requestId: target.requestId }
    // Tras el repintado del panel (puede venir de una tira).
    window.setTimeout(() => window.dispatchEvent(new CustomEvent(REVEAL_TURN_EVENT, { detail })), 0)
  }
  return true
}
