import { create } from 'zustand'

/** How long after `session.renamed` a title change still counts as "just now". */
export const TITLE_MOTION_WINDOW_MS = 8_000

interface Rename {
  title: string
  source: string
  at: number
}

interface TitleMotionState {
  renamed: Record<string, Rename>
  /** A live `session.renamed`: the next time this title shows up, it may animate once. */
  mark(sessionId: string, title: string, source: string, at?: number): void
}

/**
 * Renames Rinari just made, as they arrived from the Engine. A title only
 * animates when a surface already showing the conversation sees its text
 * change to one recorded here: opening the conversation later, switching
 * between conversations or a refresh never replays it. Manual renames are
 * the user's own action and don't animate.
 */
export const useTitleMotionStore = create<TitleMotionState>((set) => ({
  renamed: {},
  mark: (sessionId, title, source, at = Date.now()) =>
    set((state) => {
      const renamed: Record<string, Rename> = {}
      for (const [id, entry] of Object.entries(state.renamed)) {
        if (at - entry.at < TITLE_MOTION_WINDOW_MS) renamed[id] = entry
      }
      renamed[sessionId] = { title, source, at }
      return { renamed }
    }),
}))

/** Whether this conversation's title just became `title` through Rinari. */
export function freshRename(sessionId: string, title: string, now = Date.now()): boolean {
  const entry = useTitleMotionStore.getState().renamed[sessionId]
  return Boolean(entry && entry.title === title && entry.source !== 'manual' && now - entry.at < TITLE_MOTION_WINDOW_MS)
}

/** Feeds the store from a `session.renamed` payload; ignores anything malformed. */
export function markRenamedFromEvent(payload: unknown): void {
  if (!payload || typeof payload !== 'object') return
  const { session_id: sessionId, title, source } = payload as Record<string, unknown>
  if (typeof sessionId !== 'string' || typeof title !== 'string') return
  useTitleMotionStore.getState().mark(sessionId, title, typeof source === 'string' ? source : 'generated')
}
