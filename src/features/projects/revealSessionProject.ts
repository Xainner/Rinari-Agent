import { engineApi, type SessionSummary } from '../../services/engine'
import { useProjectExpansionStore } from '../../stores/projectExpansion'

/** Only confirmed membership may reveal a project; never use the previous selection. */
export async function revealSessionProject(session: SessionSummary): Promise<void> {
  if (session.kind !== 'PROJECT') return
  let projectId = session.project_id
  if (!projectId && session.project_root) {
    try {
      const { projects } = await engineApi.projectList()
      projectId = projects.find((project) => project.root === session.project_root
        || project.canonical_root === session.project_root)?.id ?? null
    } catch {
      // A catalog failure must not turn a successful creation into a failure.
      return
    }
  }
  if (projectId) useProjectExpansionStore.getState().reveal(projectId)
}
