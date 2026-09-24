import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { onEngineEvent, type ScheduledTaskInput } from '../../services/engine'
import { onNotificationActivated, sendSystemNotification } from '../../services/notifications'
import { useUIStore } from '../../stores/ui'
import { RUN_STATUS_KEYS, SKIP_REASON_KEYS, useScheduleForm } from './scheduleModel'
import type { ScheduledRunStatus } from '../../services/engine'

const windowAway = () => typeof document !== 'undefined' && (document.hidden || !document.hasFocus())

/**
 * Avisos de las tareas programadas, en toda la app:
 *
 * - una propuesta de Rinari (`schedule.proposed`) abre la tarjeta «Revisar»;
 * - una ejecución que necesita al dueño avisa siempre, también por el sistema;
 * - un recordatorio es una notificación del sistema: es su razón de ser;
 * - el resultado de un turno programado avisa por el sistema si la ventana
 *   no está a la vista (la app puede estar en la bandeja).
 *
 * Pulsar una notificación abre la conversación de esa ejecución.
 */
export default function ScheduleNotifier({ onOpenSession }: { onOpenSession: (sessionId: string) => void }) {
  const { t } = useI18n()
  const goSchedules = useUIStore((state) => state.goSchedules)
  const openProposal = useScheduleForm((state) => state.openProposal)
  // Solo las sesiones que avisó este componente: las notificaciones de
  // Boards conservan su comportamiento.
  const notified = useRef(new Set<string>())
  const latest = useRef({ t, goSchedules, openProposal, onOpenSession })
  latest.current = { t, goSchedules, openProposal, onOpenSession }

  useEffect(() => {
    let disposed = false
    const stops: Array<() => void> = []
    const keep = (stop: () => void) => (disposed ? stop() : stops.push(stop))

    const notify = (title: string, body: string, sessionId?: string) => {
      if (sessionId) notified.current.add(sessionId)
      void sendSystemNotification({ title, body, target: sessionId ? { sessionId } : undefined })
    }

    void onEngineEvent((event) => {
      const { t: tr, goSchedules: go, openProposal: propose, onOpenSession: open } = latest.current
      const payload = event.payload
      const name = String(payload.name ?? '')
      const sessionId = typeof payload.session_id === 'string' && payload.session_id ? payload.session_id : undefined
      const openAction = sessionId ? { label: tr('schedules.openSession'), onClick: () => open(sessionId) } : undefined

      if (event.event === 'schedule.proposed' && payload.proposal) {
        const proposal = payload.proposal as ScheduledTaskInput
        toast(tr('schedules.proposedToast', { name: proposal.name }), {
          description: tr('schedules.proposedHint'),
          duration: 20_000,
          action: { label: tr('schedules.review'), onClick: () => { go(); propose(proposal) } },
        })
        return
      }
      if (event.event === 'schedule.run.needs_you') {
        const wanted = String(payload.reason ?? payload.capability ?? '')
        toast.warning(tr('schedules.needsYouToast', { name }), { description: wanted, duration: 30_000, action: openAction })
        notify(tr('schedules.needsYouToast', { name }), wanted, sessionId)
        return
      }
      if (event.event !== 'schedule.run.completed') return
      const status = String(payload.status ?? '') as ScheduledRunStatus
      if (status === 'skipped') return
      if (payload.kind === 'reminder') {
        const text = String(payload.summary ?? '')
        toast(tr('schedules.reminderToast', { name }), { description: text, duration: 30_000 })
        notify(name, text)
        return
      }
      const reason = typeof payload.reason === 'string' ? payload.reason : ''
      const detail = reason ? (SKIP_REASON_KEYS[reason] ? tr(SKIP_REASON_KEYS[reason]) : reason) : String(payload.summary ?? '')
      const title = tr('schedules.runFinished', { name, status: RUN_STATUS_KEYS[status] ? tr(RUN_STATUS_KEYS[status]) : status })
      if (status === 'completed') toast.success(title, { description: detail, action: openAction })
      else toast.error(title, { description: detail, action: openAction })
      if (windowAway()) notify(title, detail, sessionId)
    }).then(keep)

    void onNotificationActivated((target) => {
      if (target.sessionId && notified.current.has(target.sessionId)) latest.current.onOpenSession(target.sessionId)
    })
      .then(keep)
      .catch(() => undefined)

    return () => {
      disposed = true
      for (const stop of stops.splice(0)) stop()
    }
  }, [])

  return null
}
