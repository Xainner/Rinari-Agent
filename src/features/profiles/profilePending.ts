import { useMemo } from 'react'
import { useSessionPendingStore, type SessionPending } from '../notifications/attentionIndicators'
import { useProfileStore } from './profileStore'

export interface ProfilePending {
  /** Conversaciones con algo pendiente en ese perfil. */
  count: number
  /** Alguna espera al dueño (aprobación o pregunta). */
  needsYou: boolean
}

/**
 * Pendientes por perfil (#34): turnos sin leer, aprobaciones, preguntas y
 * fallos de cada perfil. El activo ya lo muestran la barra lateral y la
 * campana; `others` es lo que no se ve desde aquí.
 */
export function profilePending(
  bySession: Record<string, SessionPending>,
  activeId: string | null,
): { byProfile: Record<string, ProfilePending>; others: ProfilePending } {
  const byProfile: Record<string, ProfilePending> = {}
  const others: ProfilePending = { count: 0, needsYou: false }
  for (const session of Object.values(bySession)) {
    if (!session.profileId) continue
    const entry = (byProfile[session.profileId] ??= { count: 0, needsYou: false })
    entry.count += 1
    entry.needsYou ||= session.needsYou
    if (activeId && session.profileId !== activeId) {
      others.count += 1
      others.needsYou ||= session.needsYou
    }
  }
  return { byProfile, others }
}

export function useProfilePending() {
  const bySession = useSessionPendingStore((state) => state.bySession)
  const activeId = useProfileStore((state) => state.activeId)
  return useMemo(() => profilePending(bySession, activeId), [bySession, activeId])
}
