import type { PlanAgent, PlanRoutine, PlanStep, PlanUse, TeamPlan } from '../types'

/**
 * Ediciones de una propuesta de equipo que el dueño hace en la revisión. Son
 * puras: devuelven otra propuesta. Lo que depende de un agente (el jefe, los
 * pasos del flujo, las rutinas) sigue al agente cuando se quita.
 */

export function pieceKey(use: PlanUse): string {
  switch (use.kind) {
    case 'connector': return `connector:${use.name}`
    case 'catalog': return `catalog:${use.id}`
    case 'tools': return `tools:${use.group}`
    case 'missing': return `missing:${use.need}`
  }
}

export function freshKey(plan: TeamPlan): string {
  const taken = new Set(plan.agents.map((agent) => agent.key))
  let n = plan.agents.length + 1
  while (taken.has(`agent-${n}`)) n += 1
  return `agent-${n}`
}

export function updateAgent(plan: TeamPlan, key: string, patch: Partial<PlanAgent>): TeamPlan {
  return { ...plan, agents: plan.agents.map((agent) => (agent.key === key ? { ...agent, ...patch } : agent)) }
}

export function addAgent(plan: TeamPlan, name: string): TeamPlan {
  const agent: PlanAgent = {
    key: freshKey(plan),
    name,
    role: '',
    instructions: '',
    permission_profile: 'workspace',
    uses: [],
  }
  return { ...plan, agents: [...plan.agents, agent] }
}

/** Quita un agente: deja de ser jefe, sale de los pasos (un paso sin nadie se va) y sus rutinas se van. */
export function removeAgent(plan: TeamPlan, key: string): TeamPlan {
  const agents = plan.agents.filter((agent) => agent.key !== key)
  if (agents.length === 0) return plan
  const steps = (plan.flow?.steps ?? [])
    .map((step) => ({ ...step, agents: step.agents.filter((value) => value !== key) }))
    .filter((step) => step.agents.length > 0)
  const flow = plan.flow && steps.length > 0 ? { ...plan.flow, steps } : null
  const routines = plan.routines.filter((routine) => (routine.starts_flow ? flow !== null : routine.agent !== key))
  const chief = plan.team.chief === key ? agents[0].key : plan.team.chief
  return { ...plan, agents, flow, routines, team: { ...plan.team, chief } }
}

export function removeUse(plan: TeamPlan, key: string, use: PlanUse): TeamPlan {
  const agent = plan.agents.find((item) => item.key === key)
  if (!agent) return plan
  return updateAgent(plan, key, { uses: agent.uses.filter((item) => pieceKey(item) !== pieceKey(use)) })
}

export function addUse(plan: TeamPlan, key: string, use: PlanUse): TeamPlan {
  const agent = plan.agents.find((item) => item.key === key)
  if (!agent || agent.uses.some((item) => pieceKey(item) === pieceKey(use))) return plan
  return updateAgent(plan, key, { uses: [...agent.uses, use] })
}

// -- el flujo --------------------------------------------------------------------------

export function setFlow(plan: TeamPlan, flow: TeamPlan['flow']): TeamPlan {
  // Sin flujo, una rutina que lo arrancaba ya no tiene qué arrancar.
  const routines = flow ? plan.routines : plan.routines.filter((routine) => !routine.starts_flow)
  return { ...plan, flow, routines }
}

export function updateStep(plan: TeamPlan, index: number, patch: Partial<PlanStep>): TeamPlan {
  if (!plan.flow) return plan
  return { ...plan, flow: { ...plan.flow, steps: plan.flow.steps.map((step, at) => (at === index ? { ...step, ...patch } : step)) } }
}

export function addStep(plan: TeamPlan, step: PlanStep): TeamPlan {
  const flow = plan.flow ?? { name: plan.team.name, description: '', steps: [] }
  return { ...plan, flow: { ...flow, steps: [...flow.steps, step] } }
}

export function removeStep(plan: TeamPlan, index: number): TeamPlan {
  if (!plan.flow) return plan
  const steps = plan.flow.steps.filter((_, at) => at !== index)
  return setFlow(plan, steps.length > 0 ? { ...plan.flow, steps } : null)
}

export function moveStep(plan: TeamPlan, index: number, by: -1 | 1): TeamPlan {
  if (!plan.flow) return plan
  const target = index + by
  if (target < 0 || target >= plan.flow.steps.length) return plan
  const steps = [...plan.flow.steps]
  ;[steps[index], steps[target]] = [steps[target], steps[index]]
  return { ...plan, flow: { ...plan.flow, steps } }
}

// -- las rutinas -----------------------------------------------------------------------

export function updateRoutine(plan: TeamPlan, index: number, patch: Partial<PlanRoutine>): TeamPlan {
  return { ...plan, routines: plan.routines.map((routine, at) => (at === index ? { ...routine, ...patch } : routine)) }
}

export function addRoutine(plan: TeamPlan, name: string): TeamPlan {
  const routine: PlanRoutine = plan.flow
    ? { name, schedule: { kind: 'daily', time: '09:00' }, starts_flow: true, input: '', agent: null, prompt: '' }
    : { name, schedule: { kind: 'daily', time: '09:00' }, starts_flow: false, input: '', agent: plan.team.chief, prompt: '' }
  return { ...plan, routines: [...plan.routines, routine] }
}

export function removeRoutine(plan: TeamPlan, index: number): TeamPlan {
  return { ...plan, routines: plan.routines.filter((_, at) => at !== index) }
}

// -- lo que falta para crearlo ---------------------------------------------------------

/** Agentes sugeridos («podrías reutilizar a…») sin respuesta del dueño: hasta elegir, no se crea. */
export function undecided(plan: TeamPlan): PlanAgent[] {
  return plan.agents.filter((agent) => Boolean(agent.reuse_agent_id) && (agent.reuse === null || agent.reuse === undefined))
}

/** Qué impide crear el equipo ahora, en claves de i18n con sus datos. */
export function blockers(plan: TeamPlan): Array<{ key: 'name' | 'agentName' | 'reuse' | 'routine' | 'step'; name?: string }> {
  const out: Array<{ key: 'name' | 'agentName' | 'reuse' | 'routine' | 'step'; name?: string }> = []
  if (!plan.team.name.trim()) out.push({ key: 'name' })
  for (const agent of plan.agents) {
    if (!agent.name.trim()) out.push({ key: 'agentName' })
  }
  for (const agent of undecided(plan)) out.push({ key: 'reuse', name: agent.reuse_name ?? agent.name })
  for (const routine of plan.routines) {
    if (!routine.name.trim() || (!routine.starts_flow && (!routine.agent || !routine.prompt.trim()))) {
      out.push({ key: 'routine', name: routine.name })
    }
  }
  for (const step of plan.flow?.steps ?? []) {
    if (step.agents.length === 0) out.push({ key: 'step', name: step.name })
  }
  return out
}
