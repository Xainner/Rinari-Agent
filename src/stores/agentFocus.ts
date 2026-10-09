import { create } from 'zustand'

/**
 * Subagente que se inspecciona en el panel «Agentes» de cada sesión. Es solo
 * presentación: no se persiste ni toca al Engine.
 */
interface AgentFocusState {
  bySession: Record<string, string>
  focus: (sessionId: string, agentId: string | null) => void
}

export const useAgentFocusStore = create<AgentFocusState>((set) => ({
  bySession: {},
  focus: (sessionId, agentId) => set((state) => {
    const bySession = { ...state.bySession }
    if (agentId) bySession[sessionId] = agentId
    else delete bySession[sessionId]
    return { bySession }
  }),
}))
