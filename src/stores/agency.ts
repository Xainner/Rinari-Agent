import { create } from 'zustand'

/**
 * Rinari Agency: en qué espacio está la app y qué página de la Agency se ve.
 *
 * La Agency es un espacio aparte, no una vista más de Normal | Boards: al
 * entrar cambia la barra lateral entera (agentes y equipos en vez de
 * proyectos y conversaciones). Las vistas auxiliares (Ajustes, Motor…) siguen
 * siendo las de siempre. En memoria: al abrir la app se vuelve a Rinari.
 */
export type AgencySpace = 'rinari' | 'agency'

export type AgencyPage =
  | { kind: 'home' }
  | { kind: 'agent'; agentId: string }
  | { kind: 'new-agent' }
  | { kind: 'edit-agent'; agentId: string }

interface AgencyState {
  space: AgencySpace
  page: AgencyPage
  enter: () => void
  leave: () => void
  openAgent: (agentId: string) => void
  newAgent: () => void
  editAgent: (agentId: string) => void
  goHome: () => void
}

export const useAgencyStore = create<AgencyState>((set) => ({
  space: 'rinari',
  page: { kind: 'home' },
  enter: () => set({ space: 'agency' }),
  leave: () => set({ space: 'rinari' }),
  openAgent: (agentId) => set({ space: 'agency', page: { kind: 'agent', agentId } }),
  newAgent: () => set({ space: 'agency', page: { kind: 'new-agent' } }),
  editAgent: (agentId) => set({ space: 'agency', page: { kind: 'edit-agent', agentId } }),
  goHome: () => set({ page: { kind: 'home' } }),
}))

/**
 * El tutorial de la primera vez (D-20) se ve una vez **por perfil de Rinari**:
 * cada perfil tiene su Agency. Visto o saltado, no vuelve solo.
 */
const TUTORIAL_KEY = 'rinari.agency.tutorial.seen'

function readSeen(): string[] {
  try {
    const raw = window.localStorage.getItem(TUTORIAL_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function agencyTutorialSeen(profileId: string | null): boolean {
  return readSeen().includes(profileId ?? 'default')
}

export function markAgencyTutorialSeen(profileId: string | null): void {
  const id = profileId ?? 'default'
  const seen = readSeen()
  if (seen.includes(id)) return
  try {
    window.localStorage.setItem(TUTORIAL_KEY, JSON.stringify([...seen, id]))
  } catch {
    // Sin almacenamiento, el tutorial puede volver a salir; no rompe nada.
  }
}
