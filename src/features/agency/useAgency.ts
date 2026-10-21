import { useCallback, useEffect, useState } from 'react'
import { engineApi, onEngineEvent } from '../../services/engine'
import { useAgencyStore } from '../../stores/agency'
import type { AgencyAgent, AgencyStatus, AgencyTeam } from './types'

/** Eventos que cambian lo que dice la Agency: sus agentes, sus turnos y lo que esperan. */
const REFRESH_EVENTS = new Set([
  'agency.agent.changed',
  'agency.team.changed',
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
  /** A2: vacío sin `agency_teams_v1`. */
  teams: AgencyTeam[]
  status: AgencyStatus | null
  loaded: boolean
  reload: () => Promise<void>
}

/**
 * Los agentes del perfil activo y el estado de la tarjeta, al día con los
 * eventos del Engine. Sin la capacidad `agency_agents_v1` no pide nada: la
 * Agency no se ofrece si esta versión de Rinari no la tiene.
 */
export function useAgency(enabled: boolean, teamsEnabled = false): AgencyData {
  const [agents, setAgents] = useState<AgencyAgent[]>([])
  const [teams, setTeams] = useState<AgencyTeam[]>([])
  const [status, setStatus] = useState<AgencyStatus | null>(null)
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    if (!enabled) return
    try {
      const [list, current, teamList] = await Promise.all([
        engineApi.agencyAgents(),
        engineApi.agencyStatus(),
        teamsEnabled ? engineApi.agencyTeams() : Promise.resolve({ teams: [] as AgencyTeam[] }),
      ])
      setAgents(list.agents)
      setStatus(current)
      setTeams(teamList.teams)
      useAgencyStore.getState().setAgentSessions(list.agents)
      useAgencyStore.getState().setPostSessions(teamList.teams)
      const names = new Map(list.agents.map((agent) => [agent.id, agent.name]))
      useAgencyStore.getState().setSessionLabels(Object.fromEntries([
        ...list.agents.filter((agent) => agent.session_id).map((agent) => [agent.session_id as string, agent.name]),
        ...teamList.teams.flatMap((team) => team.posts.map((post) => [post.session_id, `${names.get(post.agent_id) ?? post.agent_id} · ${team.name}`])),
      ]))
    } catch {
      // El Engine puede estar reiniciando: se conserva lo último que se supo.
    } finally {
      setLoaded(true)
    }
  }, [enabled, teamsEnabled])

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

  return { agents, teams, status, loaded, reload }
}
