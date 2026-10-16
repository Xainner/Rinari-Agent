import { create } from 'zustand'
import type { Goal } from '../../types/protocol.generated'

interface Entry {
  /** null = no goal to show (none yet, or ended with «Terminar»). */
  goal: Goal | null
  /** Last revision seen: an older event never comes back. */
  revision: number
}

interface GoalState {
  bySession: Record<string, Entry>
  apply(sessionId: string, goal: Goal | null): void
}

const visible = (goal: Goal | null): Goal | null => (goal && goal.state !== 'cleared' ? goal : null)

/**
 * The goal of each conversation, as the Engine reports it (plan 0.4.0 #23):
 * `goal.updated` events and `session.goal.get` when a conversation opens.
 */
export const useGoalStore = create<GoalState>((set) => ({
  bySession: {},
  apply: (sessionId, goal) =>
    set((state) => {
      const current = state.bySession[sessionId]
      const incoming = goal?.revision ?? -1
      if (current && goal && goal.goal_id === current.goal?.goal_id && incoming < current.revision) return state
      return {
        bySession: {
          ...state.bySession,
          [sessionId]: { goal: visible(goal), revision: Math.max(incoming, goal ? incoming : current?.revision ?? -1) },
        },
      }
    }),
}))

/** Feeds the store from a `goal.updated` event payload; ignores anything malformed. */
export function applyGoalEvent(payload: unknown): void {
  if (!payload || typeof payload !== 'object') return
  const { session_id: sessionId, goal } = payload as Record<string, unknown>
  if (typeof sessionId !== 'string') return
  if (goal !== null && (typeof goal !== 'object' || typeof (goal as Goal).revision !== 'number')) return
  useGoalStore.getState().apply(sessionId, goal as Goal | null)
}
