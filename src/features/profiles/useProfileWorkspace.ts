import { useEffect, useRef } from 'react'
import { inProfile, useProfileStore } from './profileStore'

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

  useEffect(() => {
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

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
    openDraft()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, activeRecord?.id, activeRecord?.rinari_profile_id])
}
