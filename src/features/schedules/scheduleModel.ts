import { create } from 'zustand'
import type { I18nKey } from '../../i18n'
import type { ScheduleSpec, ScheduledCommand, ScheduledRunStatus, ScheduledTask, ScheduledTaskInput } from '../../services/engine'

type Translate = (key: I18nKey, vars?: Record<string, string | number>) => string

/** Días de la semana en el orden del Engine (0 = lunes). */
export const WEEKDAY_KEYS: readonly I18nKey[] = [
  'schedules.day.mon',
  'schedules.day.tue',
  'schedules.day.wed',
  'schedules.day.thu',
  'schedules.day.fri',
  'schedules.day.sat',
  'schedules.day.sun',
]

export const RUN_STATUS_KEYS: Record<ScheduledRunStatus, I18nKey> = {
  queued: 'schedules.status.queued',
  running: 'schedules.status.running',
  needs_you: 'schedules.status.needs_you',
  completed: 'schedules.status.completed',
  failed: 'schedules.status.failed',
  cancelled: 'schedules.status.cancelled',
  blocked: 'schedules.status.blocked',
  skipped: 'schedules.status.skipped',
}

/** Tono del estado: la verdad del resultado, sin maquillaje. */
export function runTone(status: ScheduledRunStatus): 'ok' | 'warn' | 'bad' | 'muted' | 'live' {
  if (status === 'completed') return 'ok'
  if (status === 'needs_you' || status === 'blocked') return 'warn'
  if (status === 'failed') return 'bad'
  if (status === 'running' || status === 'queued') return 'live'
  return 'muted'
}

export const SKIP_REASON_KEYS: Record<string, I18nKey> = {
  missed: 'schedules.reason.missed',
  previous_run_active: 'schedules.reason.previous_run_active',
  engine_restarted: 'schedules.reason.engine_restarted',
  conversation_deleted: 'schedules.reason.conversation_deleted',
  cancelled_by_owner: 'schedules.reason.cancelled_by_owner',
  task_deleted: 'schedules.reason.task_deleted',
}

/** Lo que el programador no puede sostener: revisa lo pendiente cada 5 s (Engine). */
export const MIN_INTERVAL_SECONDS = 5

/** Cada cuántos segundos corre un intervalo, lo dé en minutos o en segundos. */
export function intervalSeconds(spec: Extract<ScheduleSpec, { kind: 'interval' }>): number {
  return spec.seconds ?? spec.minutes * 60
}

export function describeSchedule(spec: ScheduleSpec, t: Translate, locale: string): string {
  switch (spec.kind) {
    case 'once': {
      const at = new Date(spec.at)
      const text = Number.isNaN(at.getTime())
        ? spec.at
        : at.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
      return t('schedules.describe.once', { at: text })
    }
    case 'interval': {
      const seconds = intervalSeconds(spec)
      if (seconds % 60 !== 0) return t('schedules.describe.everySeconds', { n: seconds })
      const minutes = seconds / 60
      return minutes % 60 === 0
        ? t('schedules.describe.everyHours', { n: minutes / 60 })
        : t('schedules.describe.everyMinutes', { n: minutes })
    }
    case 'daily':
      return t('schedules.describe.daily', { time: spec.time })
    case 'weekly': {
      const days = spec.days.length === 5 && [0, 1, 2, 3, 4].every((day) => spec.days.includes(day))
        ? t('schedules.describe.weekdays')
        : spec.days.map((day) => t(WEEKDAY_KEYS[day])).join(', ')
      return t('schedules.describe.weekly', { days, time: spec.time })
    }
    case 'cron':
      return t('schedules.describe.cron', { expr: spec.expr })
  }
}

/** Fecha y hora de un instante del Engine (segundos epoch). */
export function formatWhen(epoch: number | null | undefined, locale: string): string {
  if (!epoch) return '—'
  return new Date(epoch * 1000).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
}

/** Valor por defecto de un `<input type="datetime-local">`: dentro de una hora, en punto. */
export function defaultOnceAt(now = new Date()): string {
  const next = new Date(now.getTime() + 60 * 60 * 1000)
  next.setMinutes(0, 0, 0)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(next.getHours())}:00`
}

export function emptyDraft(): ScheduledTaskInput {
  return {
    name: '',
    kind: 'agent',
    schedule: { kind: 'daily', time: '09:00' },
    prompt: '',
    project_id: null,
    mode: 'build',
    permission_profile: null,
    model: null,
    skills: [],
    grants: [],
  }
}

export function draftFromTask(task: ScheduledTask): ScheduledTaskInput {
  return {
    name: task.name,
    kind: task.kind,
    schedule: task.schedule,
    prompt: task.prompt,
    project_id: task.project_id,
    mode: task.mode,
    permission_profile: task.permission_profile ?? null,
    model: task.model,
    skills: task.skills,
    grants: task.grants,
    ...(task.command ? { command: task.command } : {}),
    ...(task.target === 'this_conversation' && task.session_id ? { target: task.target, session_id: task.session_id } : {}),
  }
}

/**
 * El nombre de la tarea de un mensaje o una entrada de la cola que corre en
 * su conversación («Repetir aquí», `schedule_target_v1`). Los tipos generados
 * del protocolo aún no traen `task_name`: se lee sin suponerlo.
 */
export function scheduleTaskName(origin: { kind: string } | null | undefined): string | null {
  const name = (origin as { task_name?: unknown } | null | undefined)?.task_name
  return typeof name === 'string' && name.trim() ? name : null
}

/** Una ejecución de tarea que corre en la conversación donde se pidió. */
export function runsInItsConversation(origin: { kind: string } | null | undefined): boolean {
  return origin?.kind === 'schedule' && (origin as { target?: unknown }).target === 'this_conversation'
}

/** La tarea corre en la conversación donde se pidió («Repetir aquí»). */
export function runsHere(draft: Pick<ScheduledTaskInput, 'target' | 'session_id'>): boolean {
  return draft.target === 'this_conversation' && Boolean(draft.session_id)
}

/** Una tarea «Comando» nueva: avisa solo si falla (#50). */
export function emptyCommand(): ScheduledCommand {
  return { command: '', shell: 'default', cwd: null, timeout_s: 600, on_result: 'notify_failure' }
}

/**
 * Validación local antes de enviar: la que evita un viaje obvio. La que
 * manda es la del Engine, y su mensaje se muestra tal cual.
 */
export function draftProblem(draft: ScheduledTaskInput, t: Translate): string | null {
  if (!draft.name.trim()) return t('schedules.form.needName')
  if (draft.kind === 'command') {
    if (!draft.command?.command.trim()) return t('schedules.form.needCommand')
    if (draft.command.on_result === 'agent' && !draft.prompt.trim()) return t('schedules.form.needPrompt')
  } else if (!draft.prompt.trim()) return t(draft.kind === 'reminder' ? 'schedules.form.needReminder' : 'schedules.form.needPrompt')
  return specProblem(draft.schedule, t)
}

/** Lo que le falta a un horario (también el de una regla de la Agency). */
export function specProblem(spec: ScheduleSpec, t: Translate): string | null {
  if (spec.kind === 'weekly' && spec.days.length === 0) return t('schedules.form.needDays')
  if (spec.kind === 'interval') {
    const seconds = intervalSeconds(spec)
    if (!Number.isInteger(seconds) || seconds < MIN_INTERVAL_SECONDS) return t('schedules.form.minInterval')
  }
  if (spec.kind === 'once' && !spec.at) return t('schedules.form.needAt')
  if (spec.kind === 'cron' && spec.expr.trim().split(/\s+/).length !== 5) return t('schedules.form.needCron')
  return null
}

/**
 * El formulario abierto: nueva tarea, edición o una propuesta de Rinari.
 * Lo abre la página o la tarjeta de propuesta del chat; vive fuera de la
 * página para que una propuesta pueda llegar estando en otra vista.
 */
interface ScheduleFormState {
  open: { draft: ScheduledTaskInput; taskId: string | null; proposed: boolean } | null
  openNew: () => void
  openEdit: (task: ScheduledTask) => void
  openProposal: (draft: ScheduledTaskInput) => void
  close: () => void
}

export const useScheduleForm = create<ScheduleFormState>((set) => ({
  open: null,
  openNew: () => set({ open: { draft: emptyDraft(), taskId: null, proposed: false } }),
  openEdit: (task) => set({ open: { draft: draftFromTask(task), taskId: task.id, proposed: false } }),
  openProposal: (draft) => set({ open: { draft: { ...emptyDraft(), ...draft, grants: [] }, taskId: null, proposed: true } }),
  close: () => set({ open: null }),
}))

/** Aviso a la página de que la lista cambió (evento `schedule.*`). */
export const SCHEDULES_CHANGED_EVENT = 'rinari:schedules-changed'
