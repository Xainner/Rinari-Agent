import type { ProjectSummary, SessionSummary } from '../../services/engine'

/**
 * Modelo puro para el sidebar: agrupa sesiones bajo su proyecto por
 * `project_id` (identidad, nunca path matcheado a mano salvo fallback a
 * `project_root` para sesiones que lo traen sin id). Sin React: testeable.
 */
export interface ProjectSection {
  project: ProjectSummary
  sessions: SessionSummary[]
}

export interface PinnedEntry {
  session: SessionSummary
  /** Proyecto de la conversación, para mostrar su nombre; null si es suelta. */
  project: ProjectSummary | null
}

export interface WorkspaceModel {
  /** Conversaciones fijadas, la más reciente primero. No se repiten abajo. */
  pinned: PinnedEntry[]
  /** Una sección por proyecto reciente (aunque no tenga sesiones). */
  sections: ProjectSection[]
  /** CHATs + sesiones sin proyecto resoluble. */
  chats: SessionSummary[]
}

/** Fijadas visibles antes de «Ver más». */
export const PINNED_VISIBLE_LIMIT = 8

/** Nombre de display: última parte de la ruta. Solo presentación. */
export function projectDisplayName(root: string): string {
  const base = root.split(/[/\\]/).filter(Boolean).pop()
  return base && base.length > 0 ? base : root
}

export function buildWorkspaceModel(
  sessions: SessionSummary[],
  projects: ProjectSummary[],
  query = '',
): WorkspaceModel {
  const byId = new Map(projects.map((p) => [p.id, p] as const))
  const byRoot = new Map(projects.map((p) => [p.root, p] as const))
  const buckets = new Map<string, SessionSummary[]>()
  const chats: SessionSummary[] = []
  const pinned: PinnedEntry[] = []

  for (const session of sessions) {
    let projectId: string | null = null
    if (session.project_id && byId.has(session.project_id)) {
      projectId = session.project_id
    } else if (session.project_root && byRoot.has(session.project_root)) {
      projectId = byRoot.get(session.project_root)!.id
    }
    if (session.pinned_at) {
      // Sale de su proyecto o de los chats: una fijada se ve una sola vez.
      pinned.push({ session, project: projectId ? byId.get(projectId)! : null })
    } else if (session.kind === 'PROJECT' && projectId) {
      const bucket = buckets.get(projectId) ?? []
      bucket.push(session)
      buckets.set(projectId, bucket)
    } else {
      chats.push(session)
    }
  }

  pinned.sort((left, right) => (right.session.pinned_at ?? '').localeCompare(left.session.pinned_at ?? ''))
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const sections = projects.map((project) => ({
      project,
      sessions: buckets.get(project.id) ?? [],
    }))
  if (!normalizedQuery) return { pinned, sections, chats }
  const includes = (value: string | null | undefined) =>
    value?.toLocaleLowerCase().includes(normalizedQuery) ?? false
  return {
    pinned: pinned.filter((entry) => includes(entry.session.title) || includes(entry.project?.name)),
    sections: sections
      .map((section) => {
        const projectMatches = includes(section.project.name)
          || includes(section.project.description)
          || includes(section.project.root)
        const matchingSessions = section.sessions.filter((session) => includes(session.title))
        return projectMatches ? section : { ...section, sessions: matchingSessions }
      })
      .filter((section) =>
        includes(section.project.name)
        || includes(section.project.description)
        || includes(section.project.root)
        || section.sessions.length > 0,
      ),
    chats: chats.filter((session) => includes(session.title)),
  }
}

export function sortProjects(projects: ProjectSummary[]): ProjectSummary[] {
  return [...projects].sort((left, right) =>
    Number(Boolean(right.pinned)) - Number(Boolean(left.pinned))
    || (right.last_opened_at ?? '').localeCompare(left.last_opened_at ?? ''),
  )
}

/** Calendar boundaries use local time, including daylight-saving changes. */
export function groupRecentChats(sessions: SessionSummary[], now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime()
  const week = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime()
  const groups: { key: 'today' | 'yesterday' | 'week' | 'older'; sessions: SessionSummary[] }[] = [
    { key: 'today', sessions: [] }, { key: 'yesterday', sessions: [] }, { key: 'week', sessions: [] }, { key: 'older', sessions: [] },
  ]
  const date = (session: SessionSummary) => Date.parse(session.last_active_at || session.updated_at) || 0
  for (const session of [...sessions].sort((a, b) => date(b) - date(a))) {
    const time = date(session)
    groups[time >= today ? 0 : time >= yesterday ? 1 : time >= week ? 2 : 3].sessions.push(session)
  }
  return groups.filter(group => group.sessions.length > 0)
}
