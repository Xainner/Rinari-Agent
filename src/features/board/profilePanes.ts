import { useMemo } from 'react'
import { useBoardStore, type BoardPane } from '../../stores/board'
import { useProfileStore, inProfile } from '../profiles/profileStore'
import { useOptionalEngineData } from '../engine/EngineContext'

type ProfileData = {
  sessionsById: Record<string, { rinari_profile_id?: string | null } | undefined>
  projects: ReadonlyArray<{ id: string; rinari_profile_id?: string | null }>
}

/**
 * Whether a pane belongs to the active profile: its conversation's profile, or
 * for a draft its project's. A pane whose conversation is not loaded yet, or a
 * general draft, stays visible so nothing vanishes by mistake.
 */
export function paneInProfile(pane: BoardPane, data: ProfileData | null, activeId: string | null): boolean {
  if (!activeId || !data) return true
  if (pane.sessionId) {
    const session = data.sessionsById[pane.sessionId]
    return session ? inProfile(session, activeId) : true
  }
  const projectId = pane.draft?.projectId
  const project = projectId ? data.projects.find((item) => item.id === projectId) : undefined
  return project ? inProfile(project, activeId) : true
}

/** The board's panes as the active profile sees them: one board per profile. */
export function useProfilePanes(): BoardPane[] {
  const panes = useBoardStore((state) => state.panes)
  const activeId = useProfileStore((state) => state.activeId)
  const data = useOptionalEngineData()
  const sessionsById = data?.sessionsById
  const projects = data?.projects
  return useMemo(
    () => (sessionsById && projects ? panes.filter((pane) => paneInProfile(pane, { sessionsById, projects }, activeId)) : panes),
    [panes, sessionsById, projects, activeId],
  )
}
