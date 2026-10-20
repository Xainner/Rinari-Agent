import { useCallback, useEffect, useState } from 'react'
import { engineApi, onEngineEvent } from '../../services/engine'
import { useAgencyStore } from '../../stores/agency'
import type { AgencyAgent, AgencyStatus } from './types'

/** Eventos que cambian lo que dice la Agency: sus agentes, sus turnos y lo que esperan. */
const REFRESH_EVENTS = new Set([
  'agency.agent.changed',
  'turn.started',
  'turn.completed',
  'turn.failed',
  'turn.cancelled',
  'turn.stopped',
  'approval.requested',
  'approval.resolved',
  'profile_bundle.activated',
])

export interface AgencyData {
  agents: AgencyAgent[]
  status: AgencyStatus | null
  loaded: boolean
  reload: () => Promise<void>
}

/**
 * Los agentes del perfil activo y el estado de la tarjeta, al día con los
 * eventos del Engine. Sin la capacidad `agency_agents_v1` no pide nada: la
 * Agency no se ofrece si esta versión de Rinari no la tiene.
 */
export function useAgency(enabled: boolean): AgencyData {
  const [agents, setAgents] = useState<AgencyAgent[]>([])
  const [status, setStatus] = useState<AgencyStatus | null>(null)
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    if (!enabled) return
    try {
      const [list, current] = await Promise.all([engineApi.agencyAgents(), engineApi.agencyStatus()])
      setAgents(list.agents)
      setStatus(current)
      useAgencyStore.getState().setAgentSessions(list.agents)
    } catch {
      // El Engine puede estar reiniciando: se conserva lo último que se supo.
    } finally {
      setLoaded(true)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    void reload()
    let stop: (() => void) | undefined
    let disposed = false
    void onEngineEvent((event) => {
      if (REFRESH_EVENTS.has(event.event)) void reload()
    }).then((unlisten) => {
      if (disposed) unlisten()
      else stop = unlisten
    })
    return () => {
      disposed = true
      stop?.()
    }
  }, [enabled, reload])

  return { agents, status, loaded, reload }
}
