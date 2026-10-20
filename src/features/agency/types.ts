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
