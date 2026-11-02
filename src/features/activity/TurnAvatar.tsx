import { RinariAvatar, type RinariState } from '../rinari/RinariAvatar'
import AgentAvatar from '../agency/AgentAvatar'
import { useAgencyData } from '../agency/AgencyData'
import { useAgencyStore } from '../../stores/agency'

/**
 * Who works the turn: an Agency agent's own face in its chat or post, Rinari
 * everywhere else.
 */
export function TurnAvatar({ sessionId, state, size }: { sessionId: string; state: RinariState; size: number }) {
  const agentId = useAgencyStore((store) => store.agentSessions[sessionId] ?? store.postSessions[sessionId]?.agentId ?? null)
  const { agents } = useAgencyData()
  const agent = agentId ? agents.find((item) => item.id === agentId) ?? null : null
  if (agent) return <AgentAvatar agent={agent} size={size} />
  return <RinariAvatar state={state} size={size} />
}
