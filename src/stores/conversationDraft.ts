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
  /** El dueño eligió los permisos a mano: el valor del proyecto ya no los cambia. */
  permissionPicked?: boolean
}

/** Un borrador por destino: el del proyecto A no se mezcla con el de B ni con el general. */
export function draftKeyFor(projectId: string | null): string {
  return projectId ? `draft:project:${projectId}` : 'draft'
}

/**
 * Modo de permisos con el que nace una conversación de cada proyecto
 * (permisos v4 P-5). Lo llena `useProjects` con lo que dice el Engine; sin
 * valor, Proyecto.
 */
const projectPermissions = new Map<string, DraftPermission>()

export function setProjectPermissionDefaults(projects: { id: string; permission_profile?: string | null }[]): void {
  projectPermissions.clear()
  for (const project of projects) {
    const value = project.permission_profile
    if (value === 'read-only' || value === 'workspace' || value === 'full-access') projectPermissions.set(project.id, value)
  }
  // Los borradores abiertos siguen el valor nuevo mientras nadie los cambió.
  const follow = (draft: ConversationDraft): ConversationDraft => {
    if (draft.permissionPicked || draft.sessionId || !draft.projectId) return draft
    const permissionProfile = projectPermissionDefault(draft.projectId)
    return draft.permissionProfile === permissionProfile ? draft : { ...draft, permissionProfile }
  }
  useConversationDraftStore.setState((state) => {
    const byKey = Object.fromEntries(Object.entries(state.byKey).map(([key, draft]) => [key, follow(draft)]))
    return { normal: state.normal ? follow(state.normal) : null, byKey }
  })
}

export function projectPermissionDefault(projectId: string | null): DraftPermission {
  return (projectId && projectPermissions.get(projectId)) || 'workspace'
}

export function newDraft(projectId: string | null, key = draftKeyFor(projectId)): ConversationDraft {
  return { key, projectId, mode: 'build', permissionProfile: projectPermissionDefault(projectId) }
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
  /**
   * Cambia el proyecto del borrador de la vista Normal antes del primer envío
   * (#42). Modo, permisos y modelo viajan con él; el texto y los adjuntos los
   * mueve quien llama (viven en el composer). Devuelve la clave anterior y la
   * nueva, o `null` si no se puede: ya hay una sesión creada o en camino.
   */
  moveNormal: (projectId: string | null) => { from: string; to: string } | null
}

export const useConversationDraftStore = create<ConversationDraftState>((set, get) => ({
  normal: null,
  byKey: {},
  openNormal: (projectId) => {
    const key = draftKeyFor(projectId)
    const kept = get().byKey[key]
    // Un borrador guardado sigue el valor del proyecto mientras nadie lo cambió.
    const draft = kept
      ? (kept.permissionPicked ? kept : { ...kept, permissionProfile: projectPermissionDefault(projectId) })
      : newDraft(projectId, key)
    set((state) => ({ normal: draft, byKey: { ...state.byKey, [key]: draft } }))
    return draft
  },
  updateNormal: (patch) => set((state) => {
    if (!state.normal) return state
    const next = { ...state.normal, ...patch, ...('permissionProfile' in patch ? { permissionPicked: true } : {}) }
    return { normal: next, byKey: { ...state.byKey, [next.key]: next } }
  }),
  moveNormal: (projectId) => {
    const current = get().normal
    if (!current || current.sessionId || inflight.has(current.key)) return null
    const to = draftKeyFor(projectId)
    if (to === current.key) return { from: to, to }
    const existing = get().byKey[to]
    const moved: ConversationDraft = {
      ...(existing ?? newDraft(projectId, to)),
      mode: current.mode,
      // Elegidos a mano viajan; si no, mandan los del proyecto nuevo (P-5).
      permissionProfile: current.permissionPicked ? current.permissionProfile : projectPermissionDefault(projectId),
      permissionPicked: current.permissionPicked,
      model: current.model,
      projectId,
      key: to,
      sessionId: undefined,
    }
    set((state) => {
      const byKey = { ...state.byKey, [to]: moved }
      delete byKey[current.key]
      return { normal: moved, byKey }
    })
    return { from: current.key, to }
  },
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
