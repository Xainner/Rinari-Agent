/**
 * Rinari Agency (A1): lo que el Engine devuelve de un agente
 * (`agency_agents_v1`). El Engine es el dueño de cada campo; la app lo
 * presenta y nunca lo inventa (un coste desconocido es `null`, no cero).
 */

export type AgentPermissionProfile = 'read-only' | 'workspace' | 'full-access'

export interface AgentBudget {
  daily_usd?: number
  daily_tokens?: number
}

export interface AgentSpend {
  tokens: number
  /** `null` cuando un modelo que usó no tiene precio conocido. */
  cost_usd: number | null
  cost_known: boolean
  calls: number
  budget: AgentBudget
  over_budget: boolean
}

export interface AgencyAgent {
  id: string
  rinari_profile_id: string
  name: string
  role: string
  instructions: string
  model: string | null
  permission_profile: AgentPermissionProfile
  connectors: string[]
  budget: AgentBudget
  ask_new_destinations: boolean | null
  /** Su chat directo: una conversación CHAT marcada con su id. */
  session_id: string | null
  created_at: number
  updated_at: number
  archived_at: number | null
  spend_today?: AgentSpend
}

/** Lo que el dueño escribe en la ficha (crear o cambiar). */
export interface AgencyAgentInput {
  name: string
  role?: string
  instructions?: string
  model?: string | null
  permission_profile?: AgentPermissionProfile
  connectors?: string[]
  budget?: AgentBudget
  ask_new_destinations?: boolean | null
}

/** Lo que dice la tarjeta «Rinari Agency». */
export interface AgencyStatus {
  agents: number
  working: number
  needs_you: number
  agent_ids: { working: string[]; needs_you: string[] }
}

/**
 * Rinari Agency A2 (`agency_teams_v1`): equipos, sus puestos, la oficina y la
 * pizarra. Un puesto es la conversación de un agente en un equipo.
 */
export interface TeamPost {
  team_id: string
  agent_id: string
  session_id: string
  created_at: number
}

export interface AgencyTeam {
  id: string
  rinari_profile_id: string
  name: string
  purpose: string
  chief_agent_id: string | null
  connectors: string[]
  budget: AgentBudget
  members: string[]
  posts: TeamPost[]
  created_at: number
  updated_at: number
  archived_at: number | null
}

export interface AgencyTeamInput {
  name: string
  purpose?: string
  chief_agent_id?: string | null
  connectors?: string[]
  budget?: AgentBudget
  /** Solo al crear; después se entra y se sale con join y leave. */
  members?: string[]
}

export interface OfficeMessage {
  id: string
  team_id: string
  author_kind: 'owner' | 'agent'
  agent_id: string | null
  text: string
  mentions: string[]
  errand_id: string | null
  chain_id: string
  hop: number
  created_at: number
  /** Un aviso del Engine (un recado dejado, una espera): la app lo pone en palabras. */
  system?: boolean
  notice?: OfficeNotice | null
  /** Viene de una vuelta que leyó algo de fuera de la máquina. */
  external?: boolean
}

/** Qué dice un aviso de la oficina, como datos (el Engine no escribe frases). */
export type OfficeNotice =
  | { kind: 'errand'; title: string }
  | { kind: 'wait'; for: string }
  | { kind: 'delivered'; title: string; to?: string }

/** blocked: no pudo empezar o falló; espera a que el dueño lo reintente. */
export type ErrandStatus = 'pending' | 'in_progress' | 'delivered' | 'reviewed' | 'returned' | 'blocked' | 'cancelled'

export interface Errand {
  id: string
  team_id: string
  from_team_id: string | null
  from_agent_id: string | null
  to_agent_id: string | null
  title: string
  body: string
  done_when: string[]
  status: ErrandStatus
  result: { summary?: string } | null
  return_reason: string | null
  chain_id: string
  hop: number
  session_id: string | null
  created_at: number
  updated_at: number
  started_at: number | null
  delivered_at: number | null
  /** Veces que se entregó y que se devolvió (a la cuarta devolución, se traba). */
  deliveries?: number
  returns?: number
}

export interface ErrandInput {
  title: string
  body?: string
  done_when?: string[]
  to_agent_id?: string | null
}

/** Cómo corre un recado: un turno del puesto (Vía 1) o subagentes (Vía 2, D-28, todavía no). */
export type ErrandMode = 'turn' | 'subagents'

export interface AgencySettingsData {
  /** Perfiles con la Agency detenida («Detener a todos») hasta reanudarla. */
  stopped_profiles?: string[]
  budget: AgentBudget
  errand_mode: ErrandMode
  errand_modes: ErrandMode[]
  available_errand_modes: ErrandMode[]
  spend_today: AgentSpend
}

export interface TeamTemplate {
  name: string
  purpose: string
  connectors: string[]
  budget: AgentBudget
  agents: Partial<AgencyAgentInput>[]
  chief_index: number | null
}
