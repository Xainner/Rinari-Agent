import { create } from 'zustand'
import type { SessionResume } from '../../types/protocol.generated'

interface ResumeState {
  bySession: Record<string, SessionResume | null>
  apply(sessionId: string, resume: SessionResume | null): void
}

/**
 * Whether each conversation waits to continue by itself when its provider
 * limit resets (plan 0.4.0 #24): `session.resume.updated` and
 * `session.resume.get`. An older revision never overwrites a newer one.
 */
export const useResumeStore = create<ResumeState>((set) => ({
  bySession: {},
  apply: (sessionId, resume) =>
    set((state) => {
      const current = state.bySession[sessionId]
      if (current && resume && resume.revision < current.revision) return state
      return { bySession: { ...state.bySession, [sessionId]: resume } }
    }),
}))

const resumedListeners = new Set<(sessionId: string) => void>()

/** Rinari continued a conversation by itself (the notifier says so, #24). */
export function onResumed(callback: (sessionId: string) => void): () => void {
  resumedListeners.add(callback)
  return () => resumedListeners.delete(callback)
}

/** Feeds the store from a `session.resume.updated` payload; returns it when a turn continued. */
export function applyResumeEvent(payload: unknown): { sessionId: string; continued: boolean } | null {
  if (!payload || typeof payload !== 'object') return null
  const { session_id: sessionId, resume, continued } = payload as Record<string, unknown>
  if (typeof sessionId !== 'string' || !resume || typeof resume !== 'object') return null
  if (typeof (resume as SessionResume).revision !== 'number') return null
  useResumeStore.getState().apply(sessionId, resume as SessionResume)
  if (continued === true) for (const listener of [...resumedListeners]) listener(sessionId)
  return { sessionId, continued: continued === true }
}
