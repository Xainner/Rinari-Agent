import { create } from 'zustand'
import type { I18nKey } from '../../i18n'
import type { ScheduleSpec, ScheduledRunStatus, ScheduledTask, ScheduledTaskInput } from '../../services/engine'

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
  if (status === 'running') return 'live'
  return 'muted'
}

export const SKIP_REASON_KEYS: Record<string, I18nKey> = {
  missed: 'schedules.reason.missed',
  previous_run_active: 'schedules.reason.previous_run_active',
  engine_restarted: 'schedules.reason.engine_restarted',
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
    case 'interval':
      return spec.minutes % 60 === 0
        ? t('schedules.describe.everyHours', { n: spec.minutes / 60 })
        : t('schedules.describe.everyMinutes', { n: spec.minutes })
    case 'daily':
      return t('schedules.describe.daily', { time: spec.time })
    case 'weekly': {
      const days = spec.days.length === 5 && [0, 1, 2, 3, 4].every((day) => spec.days.includes(day))
        ? t('schedules.describe.weekdays')
        : spec.days.map((day) => t(WEEKDAY_KEYS[day])).join(', ')
      return t('schedules.describe.weekly', { days, time: spec.time })
    }
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
    model: task.model,
    skills: task.skills,
    grants: task.grants,
  }
}

/**
 * Validación local antes de enviar: la que evita un viaje obvio. La que
 * manda es la del Engine, y su mensaje se muestra tal cual.
 */
export function draftProblem(draft: ScheduledTaskInput, t: Translate): string | null {
  if (!draft.name.trim()) return t('schedules.form.needName')
  if (!draft.prompt.trim()) return t(draft.kind === 'reminder' ? 'schedules.form.needReminder' : 'schedules.form.needPrompt')
  const spec = draft.schedule
  if (spec.kind === 'weekly' && spec.days.length === 0) return t('schedules.form.needDays')
  if (spec.kind === 'interval' && (!Number.isInteger(spec.minutes) || spec.minutes < 5)) return t('schedules.form.minInterval')
  if (spec.kind === 'once' && !spec.at) return t('schedules.form.needAt')
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
