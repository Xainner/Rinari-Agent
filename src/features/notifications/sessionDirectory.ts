import { engineApi, isCommandError, type SessionSummary } from '../../services/engine'

/**
 * Lo mínimo de una conversación para los avisos: si existe, a qué perfil
 * pertenece y cómo se llama. La lista de sesiones lo trae casi siempre; para
 * una que no está (más allá del tope de la lista, o borrada) se pregunta una
 * vez al Engine y se recuerda (#84, #34).
 */
export interface DirectoryEntry {
  exists: boolean
  archived: boolean
  profileId: string | null
  title: string | null
  projectRoot: string | null
}

const cache = new Map<string, DirectoryEntry>()
const inFlight = new Map<string, Promise<DirectoryEntry | null>>()

export function entryOf(row: SessionSummary): DirectoryEntry {
  return {
    exists: true,
    archived: row.state === 'archived',
    profileId: row.rinari_profile_id ?? null,
    title: row.title ?? null,
    projectRoot: row.project_root ?? null,
  }
}

/** `null` si no se pudo saber (Engine caído, error que no es «no existe»): no se borra nada. */
export function lookupSession(sessionId: string): Promise<DirectoryEntry | null> {
  const known = cache.get(sessionId)
  if (known) return Promise.resolve(known)
  const pending = inFlight.get(sessionId)
  if (pending) return pending
  const job = engineApi.sessionGet(sessionId)
    .then((result) => {
      const entry = entryOf(result.session)
      cache.set(sessionId, entry)
      return entry
    })
    .catch((error: unknown) => {
      if (isCommandError(error) && (error.code === 'NOT_FOUND' || error.code === 'SESSION_NOT_FOUND')) {
        const entry: DirectoryEntry = { exists: false, archived: false, profileId: null, title: null, projectRoot: null }
        cache.set(sessionId, entry)
        return entry
      }
      return null
    })
    .finally(() => inFlight.delete(sessionId))
  inFlight.set(sessionId, job)
  return job
}

/** Solo tests. */
export function resetSessionDirectoryForTests(): void {
  cache.clear()
  inFlight.clear()
}
