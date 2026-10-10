import { create } from 'zustand'
import type { Checklist } from '../../types/protocol.generated'

interface Entry {
  /** null = no list to show (none yet, or cleared). */
  checklist: Checklist | null
  /** The list arrived live during this app session (it may animate in). */
  live: boolean
  /** Last revision seen, also after a clear: an older event never comes back. */
  revision: number
}

interface ChecklistState {
  bySession: Record<string, Entry>
  /** Expanded or collapsed, per conversation; collapsed by default. */
  expanded: Record<string, boolean>
  apply(sessionId: string, checklist: Checklist | null, live: boolean): void
  setExpanded(sessionId: string, expanded: boolean): void
}

const visible = (checklist: Checklist | null): Checklist | null =>
  checklist && checklist.state !== 'cleared' && checklist.items.length > 0 ? checklist : null

/**
 * The live checklist of each conversation, as the Engine reports it: the
 * `checklist.updated` events while a turn works, and `session.checklist.get`
 * when a conversation opens. An older revision never overwrites a newer one
 * (two runtimes can see the same event, and a fetch can race an event).
 */
export const useChecklistStore = create<ChecklistState>((set) => ({
  bySession: {},
  expanded: {},
  apply: (sessionId, checklist, live) =>
    set((state) => {
      const current = state.bySession[sessionId]
      const incoming = checklist?.revision ?? -1
      if (current && checklist && incoming < current.revision) return state
      if (current && !checklist && current.checklist === null) return state
      return {
        bySession: {
          ...state.bySession,
          [sessionId]: {
            checklist: visible(checklist),
            live: live || Boolean(current?.live),
            revision: Math.max(incoming, current?.revision ?? -1),
          },
        },
      }
    }),
  setExpanded: (sessionId, expanded) =>
    set((state) => ({ expanded: { ...state.expanded, [sessionId]: expanded } })),
}))

/** Feeds the store from a `checklist.updated` event payload; ignores anything malformed. */
export function applyChecklistEvent(payload: unknown): void {
  if (!payload || typeof payload !== 'object') return
  const { session_id: sessionId, checklist } = payload as Record<string, unknown>
  if (typeof sessionId !== 'string' || !checklist || typeof checklist !== 'object') return
  const list = checklist as Checklist
  if (!Array.isArray(list.items) || typeof list.revision !== 'number') return
  useChecklistStore.getState().apply(sessionId, list, true)
}
