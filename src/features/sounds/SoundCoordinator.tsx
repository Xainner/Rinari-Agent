import { useEffect, useRef } from 'react'
import { useRuntimeStore } from '../engine/EngineContext'
import { getWindowAttention, useWindowAttention } from '../../hooks/useWindowAttention'
import { requestSound } from '../../services/notificationSounds'
import { useBoardStore } from '../../stores/board'
import { useSoundPrefs } from '../../stores/soundPrefs'
import { useUIStore } from '../../stores/ui'
import type { TimelineStatus, TurnTimeline } from '../activity/types'

const ACTIVE: ReadonlySet<TimelineStatus> = new Set(['running', 'approval', 'cancelling'])

/**
 * ¿Está el usuario mirando esa conversación? Ventana atendida y la sesión a
 * la vista: la activa de Normal, o un panel expandido de Boards.
 */
export function sessionAttended(sessionId: string, activeSession: string): boolean {
  if (!getWindowAttention().attended) return false
  const view = useUIStore.getState().view
  if (view === 'chat') return activeSession === sessionId
  if (view === 'board') {
    const pane = useBoardStore.getState().panes.find((item) => item.sessionId === sessionId)
    return Boolean(pane && !pane.collapsed)
  }
  return false
}

/**
 * Tonos de los sucesos de turno, en Normal y en Boards a la vez (una sesión
 * en ambas vistas suena una sola vez): terminado, fallido, y aprobaciones o
 * preguntas nuevas. Solo transiciones observadas en vivo: abrir el historial,
 * restaurar un snapshot o volver a montar la vista no hacen sonar nada. Lo
 * que ocurre en la conversación que estás mirando no suena (salvo que lo
 * pidas en Ajustes).
 */
export default function SoundCoordinator({ activeSession }: { activeSession: string }) {
  const store = useRuntimeStore()
  // Mantiene viva la escucha de foco y visibilidad que lee `sessionAttended`.
  useWindowAttention()
  // La sesión activa cambia sin rehacer la suscripción.
  const activeRef = useRef(activeSession)
  activeRef.current = activeSession

  useEffect(() => {
    const seen = new Map<string, TurnTimeline>()
    /** Turnos observados en curso: solo ellos pueden sonar al cambiar. */
    const live = new Set<string>()
    const asked = new Set<string>()
    const approvals = new Set<string>()
    const quiet = (sessionId: string) => !useSoundPrefs.getState().whileAttended && sessionAttended(sessionId, activeRef.current)

    const scan = (initial: boolean) => {
      const state = store.getState()
      for (const timeline of Object.values(state.timelines)) {
        const previous = seen.get(timeline.turnId)
        if (previous === timeline) continue
        seen.set(timeline.turnId, timeline)
        const wasLive = live.has(timeline.turnId)
        if (ACTIVE.has(timeline.status)) {
          live.add(timeline.turnId)
        } else if (wasLive) {
          live.delete(timeline.turnId)
          if (!quiet(timeline.sessionId)) {
            if (timeline.status === 'completed') requestSound('success')
            else if (timeline.status === 'failed' || timeline.status === 'stopped') requestSound('error')
            // `cancelled` lo pidió el usuario: silencio.
          }
        }
        for (const item of timeline.items) {
          if (item.type !== 'question' || item.request.status !== 'pending') continue
          const id = item.request.request_id
          if (asked.has(id)) continue
          asked.add(id)
          if (wasLive && !quiet(timeline.sessionId)) requestSound('attention')
        }
      }
      for (const approval of state.approvals) {
        if (approvals.has(approval.approval_id)) continue
        approvals.add(approval.approval_id)
        const fresh = !initial && (!approval.turn_id || live.has(approval.turn_id))
        if (fresh && approval.session_id && !quiet(approval.session_id)) requestSound('attention')
      }
    }

    scan(true)
    return store.subscribe(() => scan(false))
  }, [store])

  return null
}
