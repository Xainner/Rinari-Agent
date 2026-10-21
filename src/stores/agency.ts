import { create } from 'zustand'
import type { ScheduledTaskInput } from '../services/engine'

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
  /** Ajustes de la Agency (D-24), con el agente o el equipo que estaba abierto si había uno. */
  | { kind: 'settings'; agentId: string | null; teamId?: string | null }
  /** A2: la oficina de un equipo (su chat de grupo, no una conversación con un modelo). */
  | { kind: 'office'; teamId: string }
  /** A2: el puesto de un agente en un equipo, su conversación ahí. */
  | { kind: 'post'; teamId: string; agentId: string }
  | { kind: 'new-team' }
  | { kind: 'edit-team'; teamId: string }

interface AgencyState {
  space: AgencySpace
  page: AgencyPage
  /**
   * Entrar a la Agency. Un chat o un puesto abiertos antes se vuelven a
   * seleccionar fuera de aquí; si no, se vuelve al inicio, para no mostrar
   * la conversación de Rinari como si fuera la del agente.
   */
  enter: () => void
  leave: () => void
  /** La conversación de Rinari a la que volver al salir de la Agency. */
  returnTo: string | null
  rememberRinari: (sessionId: string | null) => void
  openAgent: (agentId: string) => void
  newAgent: () => void
  editAgent: (agentId: string) => void
  openSettings: (agentId?: string | null, teamId?: string | null) => void
  openOffice: (teamId: string) => void
  openPost: (teamId: string, agentId: string) => void
  newTeam: () => void
  editTeam: (teamId: string) => void
  goHome: () => void
  /**
   * Reglas que un agente propuso en su chat y esperan al dueño (D-18): una
   * regla nunca se crea sola. En memoria; el Engine no guarda nada hasta
   * que el dueño la activa.
   */
  proposals: ScheduledTaskInput[]
  addProposal: (proposal: ScheduledTaskInput) => void
  dropProposal: (proposal: ScheduledTaskInput) => void
  /** Al cambiar de perfil: las propuestas eran de los agentes del otro. */
  clearProposals: () => void
  /** De quién es cada chat directo: sesión → agente (para «Reglas» en el panel lateral). */
  agentSessions: Record<string, string>
  setAgentSessions: (agents: { id: string; session_id: string | null }[]) => void
  /** De quién es cada puesto: sesión → equipo y agente (para «Pizarra» en el panel lateral). */
  postSessions: Record<string, { teamId: string; agentId: string }>
  setPostSessions: (teams: { id: string; posts: { agent_id: string; session_id: string }[] }[]) => void
  /**
   * Cómo se llama cada conversación de la Agency (chat directo: el agente;
   * puesto: «agente · equipo»): no están en la lista de Rinari, y los avisos
   * y la campana las nombran con esto.
   */
  sessionLabels: Record<string, string>
  setSessionLabels: (labels: Record<string, string>) => void
}

export const useAgencyStore = create<AgencyState>((set) => ({
  space: 'rinari',
  page: { kind: 'home' },
  enter: () => set((state) => ({
    space: 'agency',
    page: state.page.kind === 'agent' || state.page.kind === 'post' ? { kind: 'home' } : state.page,
  })),
  leave: () => set({ space: 'rinari' }),
  returnTo: null,
  rememberRinari: (sessionId) => set({ returnTo: sessionId }),
  openAgent: (agentId) => set({ space: 'agency', page: { kind: 'agent', agentId } }),
  newAgent: () => set({ space: 'agency', page: { kind: 'new-agent' } }),
  editAgent: (agentId) => set({ space: 'agency', page: { kind: 'edit-agent', agentId } }),
  openSettings: (agentId = null, teamId = null) => set({ space: 'agency', page: { kind: 'settings', agentId, teamId } }),
  openOffice: (teamId) => set({ space: 'agency', page: { kind: 'office', teamId } }),
  openPost: (teamId, agentId) => set({ space: 'agency', page: { kind: 'post', teamId, agentId } }),
  newTeam: () => set({ space: 'agency', page: { kind: 'new-team' } }),
  editTeam: (teamId) => set({ space: 'agency', page: { kind: 'edit-team', teamId } }),
  goHome: () => set({ page: { kind: 'home' } }),
  proposals: [],
  // La misma regla propuesta dos veces es una sola tarjeta.
  addProposal: (proposal) => set((state) => (
    state.proposals.some((item) => proposalKey(item) === proposalKey(proposal))
      ? state
      : { proposals: [...state.proposals, proposal] }
  )),
  clearProposals: () => set({ proposals: [] }),
  dropProposal: (proposal) => set((state) => ({ proposals: state.proposals.filter((item) => item !== proposal) })),
  agentSessions: {},
  setAgentSessions: (agents) => set({
    agentSessions: Object.fromEntries(
      agents.filter((agent) => agent.session_id).map((agent) => [agent.session_id as string, agent.id]),
    ),
  }),
  postSessions: {},
  sessionLabels: {},
  setSessionLabels: (sessionLabels) => set({ sessionLabels }),
  setPostSessions: (teams) => set({
    postSessions: Object.fromEntries(
      teams.flatMap((team) => team.posts.map((post) => [post.session_id, { teamId: team.id, agentId: post.agent_id }])),
    ),
  }),
}))

/** Lo que identifica una regla propuesta (el Engine no le da id). */
function proposalKey(proposal: ScheduledTaskInput): string {
  return JSON.stringify([proposal.agent_id ?? null, proposal.name, proposal.kind, proposal.schedule, proposal.tool ?? null, proposal.prompt ?? '', proposal.watch ?? null])
}

/**
 * Una conversación de la Agency (chat directo o puesto): no está en la lista
 * de Rinari, y eso no la hace desaparecer.
 */
export function isAgencySession(sessionId: string): boolean {
  if (!sessionId) return false
  const state = useAgencyStore.getState()
  return Boolean(state.agentSessions[sessionId] || state.postSessions[sessionId] || state.sessionLabels[sessionId])
}

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
