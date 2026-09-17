import { create } from 'zustand'
import { REASONING_LEVELS, type ReasoningEffort } from '../lib/reasoning'

/**
 * Preferencias visuales por sesión compartidas por Normal y Boards: el
 * razonamiento de la siguiente petición y, más adelante, anclas de scroll y
 * estado de retorno. No duplica modelo, permisos ni modo: esos viven en el
 * Engine y se leen de `SessionSummary`.
 */
interface SessionUiPrefs {
  reasoningEffort: ReasoningEffort
}

interface SessionUiState {
  bySession: Record<string, SessionUiPrefs>
  reasoningFor: (sessionId: string) => ReasoningEffort
  setReasoningFor: (sessionId: string, effort: ReasoningEffort) => void
  /** Quitar un panel o cerrar una sesión no borra sus preferencias; borrarla sí. */
  forget: (sessionId: string) => void
}

export const SESSION_UI_STORAGE_KEY = 'rinari.sessionUi.v1'
const DEFAULT_PREFS: SessionUiPrefs = { reasoningEffort: 'off' }

function isEffort(value: unknown): value is ReasoningEffort {
  return typeof value === 'string' && (REASONING_LEVELS as readonly string[]).includes(value)
}

function load(): Record<string, SessionUiPrefs> {
  if (typeof window === 'undefined') return {}
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SESSION_UI_STORAGE_KEY) ?? '{}') as Record<string, Partial<SessionUiPrefs>>
    if (!parsed || typeof parsed !== 'object') return {}
    const result: Record<string, SessionUiPrefs> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (!key || !value || typeof value !== 'object') continue
      result[key] = { reasoningEffort: isEffort(value.reasoningEffort) ? value.reasoningEffort : 'off' }
    }
    return result
  } catch {
    return {}
  }
}

function persist(bySession: Record<string, SessionUiPrefs>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SESSION_UI_STORAGE_KEY, JSON.stringify(bySession))
  } catch {
    // Quota o storage deshabilitado: la preferencia sigue viva en memoria.
  }
}

export const useSessionUiStore = create<SessionUiState>((set, get) => ({
  bySession: load(),
  reasoningFor: (sessionId) => (get().bySession[sessionId] ?? DEFAULT_PREFS).reasoningEffort,
  setReasoningFor: (sessionId, effort) => set((state) => {
    const key = sessionId || 'draft'
    const current = state.bySession[key] ?? DEFAULT_PREFS
    if (current.reasoningEffort === effort) return state
    return { bySession: { ...state.bySession, [key]: { ...current, reasoningEffort: effort } } }
  }),
  forget: (sessionId) => set((state) => {
    if (!(sessionId in state.bySession)) return state
    const bySession = { ...state.bySession }
    delete bySession[sessionId]
    return { bySession }
  }),
}))

useSessionUiStore.subscribe((state) => persist(state.bySession))

/** Selector para hooks: `useSessionUiStore(selectReasoning(sessionId))`. */
export const selectReasoning = (sessionId: string) => (state: SessionUiState): ReasoningEffort =>
  (state.bySession[sessionId || 'draft'] ?? DEFAULT_PREFS).reasoningEffort
