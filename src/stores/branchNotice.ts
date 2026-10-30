import { create } from 'zustand'
import type { BranchChange } from '../services/engine'

/**
 * El último cambio de rama avisado al abrir cada conversación (plan 0.4.0
 * #83). El aviso sigue saliendo como siempre; además enciende el botón
 * «Resumen» y deja una línea ámbar en Entorno, para no perderlo si se cerró.
 */
export const useBranchNoticeStore = create<{
  bySession: Record<string, BranchChange>
  set: (sessionId: string, change: BranchChange) => void
  clear: (sessionId: string) => void
}>((set) => ({
  bySession: {},
  set: (sessionId, change) => set((state) => ({ bySession: { ...state.bySession, [sessionId]: change } })),
  clear: (sessionId) => set((state) => {
    if (!state.bySession[sessionId]) return state
    const bySession = { ...state.bySession }
    delete bySession[sessionId]
    return { bySession }
  }),
}))
