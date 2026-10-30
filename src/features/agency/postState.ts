import type { AgencyStatus, AgencyTeam } from './types'

/** Lo que hace una conversación de la Agency ahora: nada, trabaja o espera al dueño. */
export type PostState = 'idle' | 'working' | 'needs_you'

/**
 * El estado de una conversación (un chat directo o un puesto) según
 * `agency.status`. Sin `session_ids` (un Engine sin `agency_audit_v1`) no se
 * sabe por conversación y se dice «nada»: el estado del agente en otro sitio
 * no se pinta en un puesto que no trabaja.
 */
export function sessionState(sessionId: string | null | undefined, status: AgencyStatus | null | undefined): PostState {
  if (!sessionId || !status?.session_ids) return 'idle'
  if (status.session_ids.needs_you.includes(sessionId)) return 'needs_you'
  if (status.session_ids.working.includes(sessionId)) return 'working'
  return 'idle'
}

/** El estado del puesto de un agente en un equipo. */
export function postState(team: AgencyTeam, agentId: string, status: AgencyStatus | null | undefined): PostState {
  return sessionState(team.posts.find((post) => post.agent_id === agentId)?.session_id, status)
}

/** El de un equipo entero: espera si algún puesto espera; si no, trabaja si alguno trabaja. */
export function teamState(team: AgencyTeam, status: AgencyStatus | null | undefined): PostState {
  const states = team.posts.map((post) => sessionState(post.session_id, status))
  return states.includes('needs_you') ? 'needs_you' : states.includes('working') ? 'working' : 'idle'
}
