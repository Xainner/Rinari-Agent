import { create } from 'zustand'
import type { FollowupSuggestion } from '../../types/protocol.generated'

interface FollowupState {
  /** Pending notes per conversation, newest first. */
  bySession: Record<string, FollowupSuggestion[]>
  loaded: Record<string, boolean>
  /** Ids that arrived live in this app session (they may animate in). */
  live: Record<string, true>
  setPending(sessionId: string, notes: FollowupSuggestion[]): void
  upsert(note: FollowupSuggestion, live: boolean): void
  resolve(note: Pick<FollowupSuggestion, 'id' | 'session_id' | 'status'>): void
}

/**
 * Notes Rinari left, per conversation: only the pending ones are kept. The
 * Engine's events add and resolve them; `followup.list` fills a conversation
 * the first time it is shown.
 */
export const useFollowupStore = create<FollowupState>((set) => ({
  bySession: {},
  loaded: {},
  live: {},
  setPending: (sessionId, notes) =>
    set((state) => {
      // A note that arrived live while the list was being read is newer: keep it.
      const live = state.bySession[sessionId] ?? []
      const read = notes.filter((note) => note.status === 'pending' && !live.some((item) => item.id === note.id))
      return {
        bySession: { ...state.bySession, [sessionId]: [...live, ...read] },
        loaded: { ...state.loaded, [sessionId]: true },
      }
    }),
  upsert: (note, live) =>
    set((state) => {
      const others = (state.bySession[note.session_id] ?? []).filter((item) => item.id !== note.id)
      const next = note.status === 'pending' ? [note, ...others] : others
      return {
        bySession: { ...state.bySession, [note.session_id]: next },
        live: live && note.status === 'pending' ? { ...state.live, [note.id]: true } : state.live,
      }
    }),
  resolve: (note) =>
    set((state) => ({
      bySession: {
        ...state.bySession,
        [note.session_id]: (state.bySession[note.session_id] ?? []).filter((item) => item.id !== note.id),
      },
    })),
}))

/** Feeds the store from `followup.suggested` / `followup.resolved`; ignores anything malformed. */
export function applyFollowupEvent(name: string, payload: unknown): void {
  if (name !== 'followup.suggested' && name !== 'followup.resolved') return
  if (!payload || typeof payload !== 'object') return
  const note = (payload as { suggestion?: FollowupSuggestion }).suggestion
  if (!note || typeof note.id !== 'string' || typeof note.session_id !== 'string') return
  const store = useFollowupStore.getState()
  if (name === 'followup.suggested') store.upsert(note, true)
  else store.resolve(note)
}
