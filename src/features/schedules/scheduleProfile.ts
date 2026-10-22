import { engineApi } from '../../services/engine'
import { lookupSession } from '../notifications/sessionDirectory'

/** Lo que identifica a una tarea programada en un aviso. */
export interface ScheduleOwnerHint {
  /** La conversación de la ejecución, si la hay. */
  sessionId?: string
  taskId?: string
  /** La tarea, si quien avisa ya la tiene (evita preguntarla). */
  task?: { agent_id?: string | null; project_id?: string | null } | null
}

/**
 * El perfil de Rinari al que pertenece una tarea programada o una de sus
 * ejecuciones, para que la campana sea por perfil: el de la conversación de
 * la ejecución, el del agente dueño de la regla o el de su proyecto. `null`
 * si no se puede saber (una tarea suelta, un Engine caído): entonces el aviso
 * se ve en todos, nunca se pierde.
 */
export async function scheduleProfileOf(hint: ScheduleOwnerHint): Promise<string | null> {
  if (hint.sessionId) {
    const entry = await lookupSession(hint.sessionId)
    if (entry?.exists && entry.profileId) return entry.profileId
  }
  let task = hint.task ?? null
  if (!task && hint.taskId) {
    task = await engineApi.scheduleGet(hint.taskId).then((result) => result.task).catch(() => null)
  }
  if (task?.agent_id) {
    const profile = await engineApi.agencyAgent(task.agent_id).then((result) => result.agent.rinari_profile_id).catch(() => null)
    if (profile) return profile
  }
  if (task?.project_id) {
    const projects = await engineApi.projectRecents(500).then((result) => result.projects).catch(() => [])
    const project = projects.find((item) => item.id === task?.project_id)
    if (project?.rinari_profile_id) return project.rinari_profile_id
  }
  return null
}
