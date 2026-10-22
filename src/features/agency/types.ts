/**
 * Rinari Agency (A1): lo que el Engine devuelve de un agente
 * (`agency_agents_v1`). El Engine es el dueño de cada campo; la app lo
 * presenta y nunca lo inventa (un coste desconocido es `null`, no cero).
 */

import type { PresentedFile } from '../activity/types'
import type { ScheduleSpec, ScheduledRunStatus } from '../../services/engine'

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
  /** Esfuerzo de razonamiento de sus vueltas (chat, puestos, reglas, hijos); null: el del modelo. */
  reasoning_effort?: AgentEffort | null
  /** El avatar que eligió el dueño (un id de `AGENT_AVATARS`); null: uno fijo por su id. */
  icon?: string | null
  /**
   * D-34: un Soul guardado que usa como personalidad; null: solo sus
   * instrucciones (nunca la personalidad de Rinari). `agency_audit_v1`.
   */
  soul_id?: string | null
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
  reasoning_effort?: AgentEffort | null
  icon?: string | null
  soul_id?: string | null
}

/** Los esfuerzos que guarda el Engine para un agente (los de una vuelta). */
export type AgentEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra'

/** Lo que dice la tarjeta «Rinari Agency». */
export interface AgencyStatus {
  agents: number
  working: number
  needs_you: number
  agent_ids: { working: string[]; needs_you: string[] }
  /**
   * `agency_audit_v1`: las conversaciones que trabajan o esperan (chats
   * directos y puestos), si la Agency está detenida y lo que espera al dueño.
   */
  session_ids?: { working: string[]; needs_you: string[] }
  stopped?: boolean
  waiting_for_owner?: { errands: number; chains: number }
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
  /** El dueño detuvo este equipo solo («Detener equipo»); lo dice `agency.team.list`. */
  stopped?: boolean
  /** Cómo trabaja el equipo, escrito por el dueño: cada puesto lo lee (`agency_team_work_v1`). */
  manual?: string
}

export interface AgencyTeamInput {
  name: string
  purpose?: string
  chief_agent_id?: string | null
  connectors?: string[]
  budget?: AgentBudget
  /** Solo al crear; después se entra y se sale con join y leave. */
  members?: string[]
  manual?: string
}

export interface OfficeMessage {
  id: string
  team_id: string
  /** system: lo publica el Engine (un flujo que avanza o termina), nunca el dueño. */
  author_kind: 'owner' | 'agent' | 'system'
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
  /** Una cadena cortada (`agency_audit_v1`): por qué, y cuál, para «Continuar». */
  | { kind: 'stopped'; reason: string; detail?: string; chain_id: string }
  /** Lo que un puesto mostró con `file.present`, abierto por su URI (nunca una ruta). */
  | { kind: 'files'; items: PresentedFile[] }
  /** Un flujo del equipo: empezó, pasa a un paso o terminó (con lo que entregó cada paso). */
  | { kind: 'flow'; state: 'started' | 'step' | 'done'; flow: string; step?: string; run_id: string }

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

/** `agency.templates.list` (`agency_audit_v1`): un equipo listo para empezar. */
export interface AgencyTemplateSummary {
  id: string
  name: string
  purpose: string
  agents: { name: string; role: string }[]
}

/** Una conversación de un agente según `agency.agent.get`: su chat, un puesto o una ejecución de una regla. */
export interface AgencyAgentSession {
  id: string
  title?: string | null
  kind?: 'direct' | 'post' | 'rule_run'
  team_id?: string | null
  task_id?: string | null
  updated_at?: number | string | null
}

// -- Cómo trabaja un equipo solo (replanteo 22-oct, fases 2 a 4; `agency_team_work_v1`) --

/** Una rutina: una regla de un agente que corre en su puesto de este equipo. */
export interface TeamRoutine {
  id: string
  name: string
  agent_id: string | null
  agent: string | null
  schedule: ScheduleSpec
  prompt: string
  enabled: boolean
  paused_by: string | null
  next_run_at: number | null
  last: { status: ScheduledRunStatus; finished_at: number | null; summary: string; session_id: string | null } | null
}

/** Quién acepta lo que entrega un paso antes de que empiece el siguiente. */
export type FlowApproval = 'auto' | 'chief' | 'owner'

export interface FlowStep {
  name: string
  agents: string[]
  /** Los nombres de `agents`, en el mismo orden (los da el Engine). */
  agent_names?: string[]
  instructions: string
  approval: FlowApproval
}

export interface AgencyFlow {
  id: string
  team_id: string
  name: string
  description: string
  steps: FlowStep[]
  created_at: number
  updated_at: number
}

export interface FlowInput {
  id?: string
  name: string
  description?: string
  steps: Array<Pick<FlowStep, 'name' | 'agents' | 'instructions' | 'approval'>>
}

export interface FlowRun {
  id: string
  flow_id: string
  team_id: string
  status: 'running' | 'done' | 'cancelled'
  step: number
  input: string
  outputs: Array<{ step: number; agent_id: string | null; errand_id: string; summary: string }>
  started_by: string | null
  created_at: number
  updated_at: number
  finished_at: number | null
  /** Nombre del flujo, cuántos pasos tiene y el paso en el que va. */
  flow: string | null
  steps: number
  step_name: string | null
}

export interface TeamOverview {
  team: AgencyTeam & { stopped: boolean }
  routines: TeamRoutine[]
  flows: AgencyFlow[]
  runs: FlowRun[]
  /** Recados de la pizarra por estado. */
  errands: Partial<Record<ErrandStatus, number>>
  activity: Array<{ id: string; at: number; kind: string; line: string; errand_id: string | null }>
  spend: {
    today: AgentSpend
    week: AgentSpend
    agents: Array<{ agent_id: string; name: string; today: AgentSpend; week: AgentSpend }>
  }
}
