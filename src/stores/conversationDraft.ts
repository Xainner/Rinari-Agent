import { create } from 'zustand'
import type { ModelSummary } from '../services/engine'

export type DraftPermission = 'read-only' | 'workspace' | 'full-access'

/**
 * Conversación nueva que aún no existe en el Engine.
 *
 * «Nueva conversación», el «+» de un proyecto o «Añadir panel» abren un
 * borrador: composer, modo, permisos y modelo listos, pero sin `session.create`.
 * La sesión se crea al primer envío, vinculada a `projectId` (o como chat
 * general). Pulsar veinte veces «+» no deja veinte sesiones vacías.
 */
export interface ConversationDraft {
  /** Clave del composer (texto, adjuntos) y de las preferencias del turno. */
  key: string
  projectId: string | null
  mode: string
  permissionProfile: DraftPermission
  /** Modelo elegido en un panel antes del primer envío; Normal usa el global. */
  model?: ModelSummary | null
  /**
   * Sesión ya creada cuyo primer envío falló: el reintento la reutiliza en vez
   * de crear otra.
   */
  sessionId?: string
}

/** Un borrador por destino: el del proyecto A no se mezcla con el de B ni con el general. */
export function draftKeyFor(projectId: string | null): string {
  return projectId ? `draft:project:${projectId}` : 'draft'
}

export function newDraft(projectId: string | null, key = draftKeyFor(projectId)): ConversationDraft {
  return { key, projectId, mode: 'build', permissionProfile: 'workspace' }
}

interface ConversationDraftState {
  /** El borrador de la vista Normal, si la vista no tiene sesión activa. */
  normal: ConversationDraft | null
  /** Borradores conservados por destino: volver al «+» de A recupera el de A. */
  byKey: Record<string, ConversationDraft>
  openNormal: (projectId: string | null) => ConversationDraft
  updateNormal: (patch: Partial<ConversationDraft>) => void
  /** El borrador se convirtió en sesión: se olvida su destino. */
  consumeNormal: (key: string) => void
}

export const useConversationDraftStore = create<ConversationDraftState>((set, get) => ({
  normal: null,
  byKey: {},
  openNormal: (projectId) => {
    const key = draftKeyFor(projectId)
    const draft = get().byKey[key] ?? newDraft(projectId, key)
    set((state) => ({ normal: draft, byKey: { ...state.byKey, [key]: draft } }))
    return draft
  },
  updateNormal: (patch) => set((state) => {
    if (!state.normal) return state
    const next = { ...state.normal, ...patch }
    return { normal: next, byKey: { ...state.byKey, [next.key]: next } }
  }),
  consumeNormal: (key) => set((state) => {
    const byKey = { ...state.byKey }
    delete byKey[key]
    return { normal: state.normal?.key === key ? null : state.normal, byKey }
  }),
}))

const inflight = new Map<string, Promise<string | null>>()

/**
 * Crea la sesión de un borrador una sola vez: dos envíos concurrentes del
 * mismo borrador comparten el alta. Si el borrador ya tiene sesión (un primer
 * envío que falló después de crearla), la devuelve sin crear otra.
 */
export function sessionForDraft(
  draft: ConversationDraft,
  create: (draft: ConversationDraft) => Promise<string | null>,
): Promise<string | null> {
  if (draft.sessionId) return Promise.resolve(draft.sessionId)
  const running = inflight.get(draft.key)
  if (running) return running
  const job = create(draft).finally(() => inflight.delete(draft.key))
  inflight.set(draft.key, job)
  return job
}

export function resetConversationDraftsForTests(): void {
  inflight.clear()
  useConversationDraftStore.setState({ normal: null, byKey: {} })
}
