import { useAgencyStore } from '../../stores/agency'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { commandMessage, engineApi, onEngineEvent, type ScheduledRunStatus, type ScheduledTask, type ScheduledTaskInput } from '../../services/engine'
import { onNotificationActivated, sendSystemNotification } from '../../services/notifications'
import { requestSound } from '../../services/notificationSounds'
import { useNotificationCenter, type CenterNotification } from '../../stores/notificationCenter'
import { useUIStore } from '../../stores/ui'
import { RUN_STATUS_KEYS, SCHEDULES_CHANGED_EVENT, SKIP_REASON_KEYS, describeSchedule, formatWhen, useScheduleForm } from './scheduleModel'
import { scheduleProfileOf, type ScheduleOwnerHint } from './scheduleProfile'

/** El nombre de un agente para un aviso: el que la app ya sabe, o el que diga el Engine. */
async function agentName(agentId: string): Promise<string | null> {
  const known = useAgencyStore.getState().agentNames[agentId]
  if (known) return known
  return engineApi.agencyAgent(agentId).then((result) => result.agent.name || null).catch(() => null)
}

const windowAway = () => typeof document !== 'undefined' && (document.hidden || !document.hasFocus())

const TONE: Partial<Record<ScheduledRunStatus, CenterNotification['tone']>> = {
  completed: 'success',
  failed: 'error',
  blocked: 'warning',
  cancelled: 'info',
}

/**
 * Avisos de las tareas programadas, en toda la app, y cada uno también en
 * la campana (sección Tareas programadas):
 *
 * - una tarea que se pidió en un chat se crea al momento: «Ver» y
 *   «Deshacer»; la regla que crea un agente de la Agency (según su
 *   autonomía, sin capa de aprobación) dice quién la creó y «Ver» abre sus
 *   «Reglas». Un Engine anterior que solo la proponía deja la tarjeta para
 *   revisarla en el formulario;
 * - una ejecución que necesita al dueño avisa siempre, también por el sistema;
 * - un recordatorio es una notificación del sistema: es su razón de ser;
 * - el resultado de un turno programado avisa por el sistema si la ventana
 *   no está a la vista (la app puede estar en la bandeja).
 *
 * Pulsar una notificación del sistema abre la conversación de esa ejecución.
 * Cada entrada de la campana lleva el perfil de su tarea (el de su
 * conversación, su agente o su proyecto): la campana es por perfil.
 */
/** Rinari Agency: abrir el chat de un agente con su vista «Reglas» (lo escucha App). */
export const AGENCY_REVIEW_RULES_EVENT = 'rinari:agency-review-rules'

export default function ScheduleNotifier({ onOpenSession }: { onOpenSession: (sessionId: string) => void }) {
  const { t, lang } = useI18n()
  const goSchedules = useUIStore((state) => state.goSchedules)
  const openProposal = useScheduleForm((state) => state.openProposal)
  // Solo las sesiones que avisó este componente: las notificaciones de
  // Boards conservan su comportamiento.
  const notified = useRef(new Set<string>())
  const latest = useRef({ t, lang, goSchedules, openProposal, onOpenSession })
  latest.current = { t, lang, goSchedules, openProposal, onOpenSession }

  useEffect(() => {
    let disposed = false
    const stops: Array<() => void> = []
    const keep = (stop: () => void) => (disposed ? stop() : stops.push(stop))
    // The profile of each entry is looked up (it may ask the Engine): in
    // order, so «needs you» → «completed» of the same run never swaps.
    let lane: Promise<void> = Promise.resolve()
    const record = (hint: ScheduleOwnerHint, item: Omit<CenterNotification, 'id' | 'at' | 'read' | 'module'> & { id?: string; module?: CenterNotification['module'] }) => {
      lane = lane
        .then(() => scheduleProfileOf(hint))
        .catch(() => null)
        .then((profileId) => useNotificationCenter.getState().push({ module: 'schedules', ...item, profileId }))
    }

    const notify = (title: string, body: string, sessionId?: string) => {
      if (sessionId) notified.current.add(sessionId)
      void sendSystemNotification({ title, body, target: sessionId ? { sessionId } : undefined })
    }

    void onEngineEvent((event) => {
      const { t: tr, lang: language, goSchedules: go, openProposal: propose, onOpenSession: open } = latest.current
      const locale = language === 'es' ? 'es' : 'en'
      const payload = event.payload
      const name = String(payload.name ?? '')
      const sessionId = typeof payload.session_id === 'string' && payload.session_id ? payload.session_id : undefined
      const openAction = sessionId ? { label: tr('schedules.openSession'), onClick: () => open(sessionId) } : undefined
      const runTarget = sessionId ? { kind: 'session' as const, sessionId } : { kind: 'schedules' as const }
      const runHint: ScheduleOwnerHint = { sessionId, taskId: typeof payload.task_id === 'string' ? payload.task_id : undefined }

      if (event.event === 'schedule.proposed' && payload.proposal) {
        const proposal = payload.proposal as ScheduledTaskInput
        const task = payload.created && payload.task ? (payload.task as ScheduledTask) : null
        const undo = (created: ScheduledTask) => {
          void engineApi.scheduleDelete(created.id)
            .then(() => {
              window.dispatchEvent(new Event(SCHEDULES_CHANGED_EVENT))
              useNotificationCenter.getState().dismiss(`created:${created.id}`)
              toast(tr('schedules.undone', { name: created.name }))
            })
            .catch((err) => toast.error(commandMessage(err)))
        }
        if (task?.agent_id) {
          // Rinari Agency: the agent created it as its autonomy allows (no
          // approval layer). Said once, with who did it, «Deshacer» and «Ver».
          const agentId = task.agent_id
          const when = `${describeSchedule(task.schedule, tr, locale)} · ${tr('schedules.next', { when: formatWhen(task.next_run_at, locale) })}`
          const view = () => window.dispatchEvent(new CustomEvent(AGENCY_REVIEW_RULES_EVENT, { detail: { agentId } }))
          void agentName(agentId).then((agent) => {
            const title = agent
              ? tr('agency.rules.createdToast', { agent, name: task.name })
              : tr('agency.rules.createdToastAnon', { name: task.name })
            toast.success(title, {
              description: when,
              duration: 15_000,
              action: { label: tr('schedules.undo'), onClick: () => undo(task) },
              cancel: { label: tr('schedules.view'), onClick: view },
            })
            record({ task }, { id: `created:${task.id}`, module: 'agency', title, body: when, tone: 'success', target: { kind: 'agency-rules', agentId } })
          })
          window.dispatchEvent(new Event(SCHEDULES_CHANGED_EVENT))
          return
        }
        // An Engine before 34fb9b6 only proposed an agent's rule: there is no
        // card for it any more, the agent creates its rules itself.
        if (proposal.agent_id) return
        if (task) {
          const when = `${describeSchedule(task.schedule, tr, locale)} · ${tr('schedules.next', { when: formatWhen(task.next_run_at, locale) })}`
          toast.success(tr('schedules.createdToast', { name: task.name }), {
            description: when,
            duration: 12_000,
            action: { label: tr('schedules.undo'), onClick: () => undo(task) },
            cancel: { label: tr('schedules.view'), onClick: go },
          })
          record({ task, sessionId }, { id: `created:${task.id}`, title: tr('schedules.createdToast', { name: task.name }), body: when, tone: 'success', target: { kind: 'schedules' } })
          window.dispatchEvent(new Event(SCHEDULES_CHANGED_EVENT))
          return
        }
        toast(tr('schedules.proposedToast', { name: proposal.name }), {
          description: tr('schedules.proposedHint'),
          duration: 20_000,
          action: { label: tr('schedules.review'), onClick: () => { go(); propose(proposal) } },
        })
        record({ sessionId, task: proposal }, { title: tr('schedules.proposedToast', { name: proposal.name }), body: tr('schedules.proposedHint'), tone: 'info', target: { kind: 'schedules' } })
        return
      }
      if (event.event === 'schedule.run.needs_you') {
        const wanted = String(payload.reason ?? payload.capability ?? '')
        toast.warning(tr('schedules.needsYouToast', { name }), { description: wanted, duration: 30_000, action: openAction })
        requestSound('attention')
        notify(tr('schedules.needsYouToast', { name }), wanted, sessionId)
        record(runHint, { id: `run:${payload.run_id}`, title: tr('schedules.needsYouToast', { name }), body: wanted, tone: 'warning', target: runTarget })
        return
      }
      if (event.event !== 'schedule.run.completed') return
      // Un comando que salió bien y solo avisa si falla: queda en el historial (#50).
      if (payload.quiet === true) return
      const status = String(payload.status ?? '') as ScheduledRunStatus
      if (status === 'skipped') return
      if (payload.kind === 'reminder') {
        const text = String(payload.summary ?? '')
        toast(tr('schedules.reminderToast', { name }), { description: text, duration: 30_000 })
        // Recordar es su razón de ser: suena aunque la app esté a la vista.
        requestSound('reminder')
        notify(name, text)
        record(runHint, { id: `run:${payload.run_id}`, title: tr('schedules.reminderToast', { name }), body: text, tone: 'info', target: { kind: 'schedules' } })
        return
      }
      const reason = typeof payload.reason === 'string' ? payload.reason : ''
      const detail = reason ? (SKIP_REASON_KEYS[reason] ? tr(SKIP_REASON_KEYS[reason]) : reason) : String(payload.summary ?? '')
      const title = tr('schedules.runFinished', { name, status: RUN_STATUS_KEYS[status] ? tr(RUN_STATUS_KEYS[status]) : status })
      if (status === 'completed') toast.success(title, { description: detail, action: openAction })
      else toast.error(title, { description: detail, action: openAction })
      if (windowAway()) notify(title, detail, sessionId)
      // Mismo id que su «te necesita»: el aviso se actualiza, no se duplica.
      record(runHint, { id: `run:${payload.run_id}`, title, body: detail, tone: TONE[status] ?? 'info', target: runTarget })
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
