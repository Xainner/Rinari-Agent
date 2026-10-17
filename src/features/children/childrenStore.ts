import { create } from 'zustand'
import type { ChildSession } from '../../services/engine'

interface ChildrenState {
  /** The child sessions of each mother conversation, oldest first. */
  byParent: Record<string, ChildSession[]>
  loaded: Record<string, boolean>
  /** Cards the owner closed in this app session (the child stays). */
  hidden: Record<string, true>
  setChildren(parentId: string, children: ChildSession[]): void
  upsert(child: ChildSession): void
  hide(childId: string): void
}

/**
 * The children a conversation opened (plan-sesiones-hijas 5.5): filled by
 * `session.children.list` the first time the mother is shown and kept
 * current by `session.child.updated`.
 */
export const useChildrenStore = create<ChildrenState>((set) => ({
  byParent: {},
  loaded: {},
  hidden: {},
  setChildren: (parentId, children) =>
    set((state) => ({
      byParent: { ...state.byParent, [parentId]: children },
      loaded: { ...state.loaded, [parentId]: true },
    })),
  upsert: (child) =>
    set((state) => {
      const current = state.byParent[child.parent_session_id] ?? []
      const at = current.findIndex((item) => item.child_session_id === child.child_session_id)
      const next = at === -1 ? [...current, child] : current.map((item, index) => (index === at ? { ...item, ...child } : item))
      return { byParent: { ...state.byParent, [child.parent_session_id]: next } }
    }),
  hide: (childId) => set((state) => ({ hidden: { ...state.hidden, [childId]: true } })),
}))

function isChild(value: unknown): value is ChildSession {
  if (!value || typeof value !== 'object') return false
  const child = value as Partial<ChildSession>
  return typeof child.child_session_id === 'string' && typeof child.parent_session_id === 'string' && typeof child.state === 'string'
}

/** Feeds the store from `session.child.updated`; ignores anything malformed. */
export function applyChildEvent(name: string, payload: unknown): void {
  if (name !== 'session.child.updated' || !payload || typeof payload !== 'object') return
  const child = (payload as { child?: unknown }).child
  if (isChild(child)) useChildrenStore.getState().upsert(child)
}

/** A card worth showing: still working, with a report, or a branch to decide. */
export function visibleChild(child: ChildSession, hidden: Record<string, true>): boolean {
  if (hidden[child.child_session_id]) return false
  if (child.state === 'working' || child.state === 'waiting') return true
  if (child.branch && !child.resolution) return true
  return Boolean(child.report)
}
