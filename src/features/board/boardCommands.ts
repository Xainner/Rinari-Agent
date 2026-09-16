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
