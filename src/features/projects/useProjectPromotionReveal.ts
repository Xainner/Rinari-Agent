import { useEffect, useRef } from 'react'
import type { SessionSummary } from '../../services/engine'
import { revealSessionProject } from './revealSessionProject'

/** Observe confirmed CHAT → PROJECT transitions, never initial catalog hydration. */
export function useProjectPromotionReveal(
  sessions: Record<string, SessionSummary>,
  engineGeneration: number,
  refreshProjects: () => Promise<void>,
) {
  const previous = useRef({ generation: engineGeneration, sessions })
  useEffect(() => {
    const before = previous.current
    previous.current = { generation: engineGeneration, sessions }
    if (before.generation !== engineGeneration) return
    const promoted = Object.values(sessions).filter((session) =>
      before.sessions[session.id]?.kind === 'CHAT' && session.kind === 'PROJECT',
    )
    if (!promoted.length) return
    void refreshProjects()
    for (const session of promoted) void revealSessionProject(session)
  }, [sessions, engineGeneration, refreshProjects])
}
