import { useMemo } from 'react'
import { useSessionPendingStore, useSessionWorkingStore, type SessionPending } from '../notifications/attentionIndicators'
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

/** Conversaciones con un turno en marcha en cada perfil, incluido el activo. */
export function profileWorking(bySession: Record<string, string | null>): Record<string, number> {
  const byProfile: Record<string, number> = {}
  for (const profileId of Object.values(bySession)) if (profileId) byProfile[profileId] = (byProfile[profileId] ?? 0) + 1
  return byProfile
}

export function useProfileWorking(): Record<string, number> {
  const bySession = useSessionWorkingStore((state) => state.bySession)
  return useMemo(() => profileWorking(bySession), [bySession])
}
