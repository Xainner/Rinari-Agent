import { useCallback, useEffect, useRef, useState } from 'react'
import { engineApi, onEngineEvent } from '../../services/engine'
import { isAgencySession, useAgencyStore } from '../../stores/agency'
import { useProfileStore } from '../profiles/profileStore'
import type { AgencyAgent, AgencyStatus, AgencyTeam } from './types'

/** Eventos de la Agency que cambian lo que dice: sus agentes, sus equipos y si está detenida. */
const AGENCY_EVENTS = new Set(['agency.agent.changed', 'agency.team.changed', 'agency.stopped', 'profile_bundle.activated'])
/** Eventos de una conversación: cuentan solo si es de la Agency (un chat directo o un puesto). */
const SESSION_EVENTS = new Set([
  'turn.started',
  'turn.completed',
  'turn.failed',
  'turn.cancelled',
  'turn.stopped',
  'approval.requested',
  'approval.resolved',
])
/** Una ráfaga de eventos es una sola recarga. */
const RELOAD_DEBOUNCE_MS = 250

export interface AgencyData {
  agents: AgencyAgent[]
  /** A2: vacío sin `agency_teams_v1`. */
  teams: AgencyTeam[]
  status: AgencyStatus | null
  loaded: boolean
  /** «Detener a todos» paró el tablero de este perfil, hasta reanudarlo (`agency_board_v2`). */
  halted: boolean
  reload: () => Promise<void>
}

/**
 * Los agentes del perfil activo y el estado de la tarjeta, al día con los
 * eventos del Engine. Sin la capacidad `agency_agents_v1` no pide nada: la
 * Agency no se ofrece si esta versión de Rinari no la tiene.
 */
export function useAgency(enabled: boolean, teamsEnabled = false, haltEnabled = false): AgencyData {
  const [agents, setAgents] = useState<AgencyAgent[]>([])
  const [teams, setTeams] = useState<AgencyTeam[]>([])
  const [status, setStatus] = useState<AgencyStatus | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [halted, setHalted] = useState(false)
  // Numbered: an older answer arriving late never overwrites a newer one that
  // was shown. If the newest fails, the last good one of the same profile stays.
  const seq = useRef(0)
  const applied = useRef(0)

  const reload = useCallback(async () => {
    if (!enabled) return
    const mine = ++seq.current
    const asked = useProfileStore.getState().activeId ?? 'default'
    try {
      const [list, current, teamList, settings] = await Promise.all([
        engineApi.agencyAgents(),
        engineApi.agencyStatus(),
        teamsEnabled ? engineApi.agencyTeams() : Promise.resolve({ teams: [] as AgencyTeam[] }),
        haltEnabled ? engineApi.agencySettings() : Promise.resolve(null),
      ])
      const profile = useProfileStore.getState().activeId ?? 'default'
      if (mine < applied.current || profile !== asked) return
      applied.current = mine
      setHalted(Boolean(settings?.stopped_profiles?.includes(profile)))
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
      if (mine === seq.current || mine === applied.current) setLoaded(true)
    }
  }, [enabled, teamsEnabled, haltEnabled])

  useEffect(() => {
    if (!enabled) return
    void reload()
    let stop: (() => void) | undefined
    let disposed = false
    let timer: number | undefined
    const later = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void reload(), RELOAD_DEBOUNCE_MS)
    }
    void onEngineEvent((event) => {
      if (AGENCY_EVENTS.has(event.event)) later()
      else if (SESSION_EVENTS.has(event.event)) {
        const sessionId = (event.payload as { session_id?: unknown } | undefined)?.session_id
        // Any turn of Rinari's own conversations is not the Agency's business.
        if (typeof sessionId === 'string' && isAgencySession(sessionId)) later()
      }
    }).then((unlisten) => {
      if (disposed) unlisten()
      else stop = unlisten
    })
    return () => {
      disposed = true
      window.clearTimeout(timer)
      stop?.()
    }
  }, [enabled, reload])

  return { agents, teams, status, loaded, halted, reload }
}
