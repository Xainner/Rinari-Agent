import { engineApi, type AgentView, type ModelRoles, type ModelSummary, type ProviderSummary } from '../../services/engine'

/**
 * Lo que deja de funcionar si se desactiva un proveedor (plan 0.4.0 #97):
 * el proveedor activo, el modelo de respaldo y el auxiliar (#80) y los
 * agentes con un modelo suyo. Las conversaciones conservan su modelo y lo
 * dicen al enviar; no cuentan aquí.
 */
export interface ProviderDependencies {
  active: boolean
  fallback: boolean
  auxiliary: boolean
  agents: string[]
}

export function dependenciesOf(
  provider: ProviderSummary,
  models: ModelSummary[],
  roles: ModelRoles | null,
  agents: AgentView[],
): ProviderDependencies {
  const own = models.filter((model) => model.provider_id === provider.id)
  const refs = new Set(own.flatMap((model) => [model.id, model.alias]))
  return {
    active: provider.active,
    fallback: Boolean(roles?.fallback && refs.has(roles.fallback)),
    auxiliary: Boolean(roles?.auxiliary && refs.has(roles.auxiliary)),
    agents: agents
      .filter((agent) => agent.assignment.model && refs.has(agent.assignment.model))
      .map((agent) => agent.name),
  }
}

export function hasDependencies(deps: ProviderDependencies): boolean {
  return deps.active || deps.fallback || deps.auxiliary || deps.agents.length > 0
}

/** Pasa al reemplazo todo lo que usaba el proveedor y luego lo desactiva. */
export async function disableWithReplacement(
  provider: ProviderSummary,
  deps: ProviderDependencies,
  replacement: ModelSummary | null,
): Promise<void> {
  if (replacement) {
    if (deps.active) await engineApi.modelUse(replacement.id)
    if (deps.fallback || deps.auxiliary) {
      await engineApi.setModelRoles({
        ...(deps.fallback ? { fallback: replacement.id } : {}),
        ...(deps.auxiliary ? { auxiliary: replacement.id } : {}),
      })
    }
    for (const agent of deps.agents) await engineApi.agentConfigSet({ agent, model: replacement.id })
  } else {
    // Sin reemplazo: el respaldo y el auxiliar quedan sin modelo, no apuntando a uno apagado.
    if (deps.fallback || deps.auxiliary) {
      await engineApi.setModelRoles({
        ...(deps.fallback ? { fallback: null } : {}),
        ...(deps.auxiliary ? { auxiliary: null } : {}),
      })
    }
  }
  await engineApi.providerUpdate(provider.alias, { enabled: false })
}
