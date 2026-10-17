import { useEffect, useRef } from 'react'
import { inProfile, useProfileStore } from './profileStore'

/**
 * Un cambio de perfil para abrir una conversación concreta (un aviso de otro
 * perfil, #34): esa conversación llega enseguida, así que no se abre un
 * borrador nuevo por el camino.
 */
let arriving = false

/** Cambia al perfil de la conversación si hace falta; resuelve cuando ya está activo. */
export async function switchToProfileOf(profileId: string | null | undefined): Promise<void> {
  const store = useProfileStore.getState()
  const target = profileId || 'default'
  if (!store.activeId || store.activeId === target) return
  arriving = true
  try {
    await store.activate(target)
  } catch (error) {
    arriving = false
    throw error
  }
}

interface Options {
  ready: boolean
  /** The open conversation, if any. */
  activeRecord: { id: string; rinari_profile_id?: string | null } | null
  refreshSessions: () => Promise<unknown> | void
  refreshProjects: () => Promise<unknown> | void
  /** Opens a new conversation draft in the active profile. */
  openDraft: () => void
}

/**
 * Keeps the desktop in step with the active Rinari profile:
 * - loads it once the Engine is ready and again when the window regains
 *   focus (the CLI may have switched it);
 * - refetches the lists when what a profile holds changes (a switch, a move);
 * - when the open conversation is not part of the active profile (a switch,
 *   or it was moved away), starts a new conversation in this profile instead
 *   of leaving work from elsewhere on screen.
 */
export function useProfileWorkspace({ ready, activeRecord, refreshSessions, refreshProjects, openDraft }: Options): void {
  const load = useProfileStore((state) => state.load)
  const activeId = useProfileStore((state) => state.activeId)
  const revision = useProfileStore((state) => state.revision)

  useEffect(() => {
    if (ready) void load()
  }, [ready, load])

  // Al volver a la ventana se relee (la CLI pudo cambiar de perfil), pero
  // nunca antes de que el motor esté listo: era un ENGINE_DOWN por arranque (#91).
  useEffect(() => {
    if (!ready) return
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load, ready])

  const firstRevision = useRef(true)
  useEffect(() => {
    if (firstRevision.current) {
      firstRevision.current = false
      return
    }
    void refreshSessions()
    void refreshProjects()
    // Only the revision: the refresh callbacks may change identity per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision])

  const leftFor = useRef<string | null>(null)
  useEffect(() => {
    if (!activeId || !activeRecord) return
    if (inProfile(activeRecord, activeId)) {
      leftFor.current = null
      return
    }
    const key = `${activeRecord.id}:${activeId}`
    if (leftFor.current === key) return
    leftFor.current = key
    if (arriving) {
      arriving = false
      return
    }
    openDraft()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, activeRecord?.id, activeRecord?.rinari_profile_id])
}
