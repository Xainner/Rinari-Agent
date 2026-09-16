import { create } from 'zustand'
import type { PaneStatus } from '../features/engine/sessionSelectors'

/**
 * Cache efímera del estado derivado por panel, publicada por
 * `BoardActivityController` a partir de runtime + preguntas + lectura +
 * disponibilidad. No se persiste ni la escriben los componentes; su autoridad
 * sigue siendo el runtime. Sirve a toolbar, barra superior, sidebar, título de
 * ventana y `collapseFinished`, también con `BoardView` desmontado.
 */
interface BoardStatusState {
  byPane: Record<string, PaneStatus>
  publish: (byPane: Record<string, PaneStatus>) => void
}

export const useBoardStatusStore = create<BoardStatusState>((set) => ({
  byPane: {},
  publish: (byPane) => set({ byPane }),
}))

export interface BoardAttentionCounts {
  workingPaneCount: number
  needsYouPaneCount: number
  unreadResultPaneCount: number
  unreadPeerPaneCount: number
  /** Unión de las tres categorías de atención: una sesión cuenta una sola vez. */
  attentionPaneCount: number
  unreadResultCount: number
}

const EMPTY_COUNTS: BoardAttentionCounts = {
  workingPaneCount: 0, needsYouPaneCount: 0, unreadResultPaneCount: 0, unreadPeerPaneCount: 0, attentionPaneCount: 0, unreadResultCount: 0,
}

/** Contadores de §8.8 por **sesión** (dos paneles de la misma sesión no duplican). */
export function attentionCounts(byPane: Record<string, PaneStatus>): BoardAttentionCounts {
  const working = new Set<string>()
  const needsYou = new Set<string>()
  const unread = new Set<string>()
  const peers = new Set<string>()
  const seenSessions = new Set<string>()
  let unreadResultCount = 0
  for (const status of Object.values(byPane)) {
    if (status.kind === 'working' || status.kind === 'cancelling') working.add(status.sessionId)
    if (status.kind === 'needs_you') needsYou.add(status.sessionId)
    if (status.unreadResultCount > 0) unread.add(status.sessionId)
    if ((status.unreadPeerCount ?? 0) > 0) peers.add(status.sessionId)
    if (!seenSessions.has(status.sessionId)) {
      seenSessions.add(status.sessionId)
      unreadResultCount += status.unreadResultCount
    }
  }
  if (seenSessions.size === 0) return EMPTY_COUNTS
  return {
    workingPaneCount: working.size,
    needsYouPaneCount: needsYou.size,
    unreadResultPaneCount: unread.size,
    unreadPeerPaneCount: peers.size,
    attentionPaneCount: new Set([...needsYou, ...unread, ...peers]).size,
    unreadResultCount,
  }
}

let countsCache: { source: Record<string, PaneStatus>; counts: BoardAttentionCounts } | null = null

export function selectAttentionCounts(state: BoardStatusState): BoardAttentionCounts {
  if (countsCache && countsCache.source === state.byPane) return countsCache.counts
  const counts = attentionCounts(state.byPane)
  countsCache = { source: state.byPane, counts }
  return counts
}
