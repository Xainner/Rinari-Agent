import { create } from 'zustand'

/**
 * Lo que pasa en cada vista del panel lateral de una sesión, para los
 * indicadores de sus botones en la barra de título (plan 0.4.0 #47): el
 * navegador en vivo, lo que corre en la terminal, los archivos cambiados, los
 * agentes trabajando, una etapa del Flujo que te necesita, un artefacto nuevo.
 * Lo publica el `SessionWorkspace` de la sesión (el que tiene los datos); la
 * barra de título solo lo lee para la sesión destino.
 */
export interface DockSignals {
  /** `agent`: Rinari está usando la página; `live`: hay una página abierta. */
  browser: 'agent' | 'live' | null
  terminal: number
  changes: number
  agents: number
  flowNeedsYou: boolean
  filesNew: boolean
  /** Planes terminados en la conversación: sin ninguno, la vista «Plan» no tiene botón (#55). */
  plans: number
}

export const EMPTY_SIGNALS: DockSignals = { browser: null, terminal: 0, changes: 0, agents: 0, flowNeedsYou: false, filesNew: false, plans: 0 }

interface DockSignalsState {
  bySession: Record<string, DockSignals>
  publish: (sessionId: string, patch: Partial<DockSignals>) => void
  clear: (sessionId: string) => void
}

export const useDockSignalsStore = create<DockSignalsState>((set) => ({
  bySession: {},
  publish: (sessionId, patch) => set((state) => {
    if (!sessionId) return state
    const current = state.bySession[sessionId] ?? EMPTY_SIGNALS
    const next = { ...current, ...patch }
    if ((Object.keys(next) as (keyof DockSignals)[]).every((key) => next[key] === current[key])) return state
    return { bySession: { ...state.bySession, [sessionId]: next } }
  }),
  clear: (sessionId) => set((state) => {
    if (!state.bySession[sessionId]) return state
    const bySession = { ...state.bySession }
    delete bySession[sessionId]
    return { bySession }
  }),
}))

export function selectDockSignals(sessionId: string | null) {
  return (state: DockSignalsState): DockSignals => (sessionId ? state.bySession[sessionId] ?? EMPTY_SIGNALS : EMPTY_SIGNALS)
}
