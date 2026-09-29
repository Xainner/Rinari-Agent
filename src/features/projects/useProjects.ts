import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  commandMessage,
  engineApi,
  type ProjectIntelligence,
  type ProjectStatus,
  type ProjectSummary,
} from '../../services/engine'
import { sortProjects } from './workspaceModel'
import { translate } from '../../i18n'
import { useUIStore } from '../../stores/ui'

/**
 * Projects: proyectos recientes del engine, apertura, estado Git vivo e
 * inteligencia. Identidad y metadata siempre engine-owned; aquí solo
 * cachés de lectura (status/intelligence por root) + mutación delegada.
 */
export function useProjects(options: { engineReady: boolean }) {
  const { engineReady } = options
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [archivedProjects, setArchivedProjects] = useState<ProjectSummary[]>([])
  const [projectsError, setProjectsError] = useState<string | null>(null)
  const [statusByRoot, setStatusByRoot] = useState<Record<string, ProjectStatus>>({})
  const [statusErrorByRoot, setStatusErrorByRoot] = useState<Record<string, string>>({})
  const [intelByRoot, setIntelByRoot] = useState<Record<string, ProjectIntelligence>>({})
  const statusInFlight = useRef(new Map<string, Promise<void>>())
  const statusLoadedAt = useRef(new Map<string, number>())

  const refreshProjects = useCallback(async (): Promise<void> => {
    try {
      const [recent, all] = await Promise.all([
        engineApi.projectRecents(),
        engineApi.projectList(true),
      ])
      const byRecent = new Map(recent.projects.map((project) => [project.id, project] as const))
      const active = sortProjects(all.projects
        .filter((project) => !project.archived)
        .map((project) => ({ ...project, ...byRecent.get(project.id) }))
      )
      setProjects(active)
      setArchivedProjects(all.projects.filter((project) => project.archived))
      setProjectsError(null)
    } catch (err) {
      setProjectsError(commandMessage(err))
      toast.error(commandMessage(err))
    }
  }, [])

  useEffect(() => {
    if (engineReady) void refreshProjects()
  }, [engineReady, refreshProjects])

  /** Registra (sin inicializar) y devuelve proyecto + sesión recomendada. */
  const openProject = useCallback(async (path: string) => {
    try {
      return await engineApi.projectOpen(path)
    } catch (err) {
      toast.error(commandMessage(err))
      return null
    }
  }, [])

  const updateProject = useCallback(async (
    projectId: string,
    changes: { name?: string; description?: string; pinned?: boolean; archived?: boolean },
  ): Promise<boolean> => {
    try {
      await engineApi.projectUpdate(projectId, changes)
      await refreshProjects()
      return true
    } catch (err) {
      toast.error(commandMessage(err))
      return false
    }
  }, [refreshProjects])

  const removeProject = useCallback(async (
    projectId: string,
    sessionPolicy: 'keep' | 'archive' | 'delete' = 'archive',
  ): Promise<boolean> => {
    try {
      await engineApi.projectRemove(projectId, sessionPolicy)
      await refreshProjects()
      return true
    } catch (err) {
      toast.error(commandMessage(err))
      return false
    }
  }, [refreshProjects])

  /** Borrado definitivo de un proyecto ya archivado (el Engine lo exige). */
  const deleteProject = useCallback(async (projectId: string): Promise<number | null> => {
    try {
      const result = await engineApi.projectDelete(projectId)
      await refreshProjects()
      return result.sessions_deleted
    } catch (err) {
      toast.error(commandMessage(err))
      return null
    }
  }, [refreshProjects])

  const loadStatus = useCallback((root: string, force = false): Promise<void> => {
    if (!root) return Promise.resolve()
    const pending = statusInFlight.current.get(root)
    if (pending) return pending
    const loadedAt = statusLoadedAt.current.get(root) ?? 0
    if (!force && Date.now() - loadedAt < 3_000) return Promise.resolve()

    const request = engineApi.projectStatus(root)
      .then((status) => {
        setStatusByRoot((prev) => ({ ...prev, [root]: status }))
        const engineError = status.status.error?.message ?? null
        setStatusErrorByRoot((prev) => {
          const next = { ...prev }
          if (engineError) next[root] = engineError
          else delete next[root]
          return next
        })
        statusLoadedAt.current.set(root, Date.now())
      })
      .catch((err) => {
        // Carpeta ausente, Git agotado o motor caído son estados distintos;
        // commandMessage conserva el código estructurado del puente.
        setStatusErrorByRoot((prev) => ({ ...prev, [root]: commandMessage(err) }))
      })
      .finally(() => {
        statusInFlight.current.delete(root)
      })
    statusInFlight.current.set(root, request)
    return request
  }, [])

  const loadIntelligence = useCallback(async (root: string): Promise<void> => {
    if (!root) return
    try {
      const intel = await engineApi.projectIntelligence(root)
      setIntelByRoot((prev) => ({ ...prev, [root]: intel }))
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }, [])

  const trustProject = useCallback(async (root: string): Promise<boolean> => {
    try {
      await engineApi.projectTrust(root)
      const intel = await engineApi.projectIntelligence(root)
      setIntelByRoot((prev) => ({ ...prev, [root]: intel }))
      toast.success(translate(useUIStore.getState().lang, 'project.trusted'))
      return true
    } catch (err) {
      toast.error(commandMessage(err))
      return false
    }
  }, [])

  return {
    projects,
    archivedProjects,
    projectsError,
    refreshProjects,
    openProject,
    updateProject,
    removeProject,
    deleteProject,
    statusByRoot,
    statusErrorByRoot,
    loadStatus,
    intelByRoot,
    loadIntelligence,
    trustProject,
  }
}

export type Projects = ReturnType<typeof useProjects>
