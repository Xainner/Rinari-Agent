import { Bell, BellOff, BellRing } from 'lucide-react'
import { useI18n } from '../../i18n'
import { Select } from '../../components/ui/select'
import type { ScheduleNotify } from '../../services/engine'

const ICONS = { all: Bell, problems: BellRing, none: BellOff } as const

/**
 * «Avisos» de una tarea programada o de una regla (`schedule_notify_v1`):
 * cada vuelta, solo si falla o te necesita, o nada que salte (sus vueltas
 * quedan en su historial).
 */
export default function NotifyField({ value, onChange }: { value: ScheduleNotify; onChange: (next: ScheduleNotify) => void }) {
  const { t } = useI18n()
  return (
    <div className="grid gap-1.5" data-testid="schedule-notify">
      <span className="field-label mt-0">{t('schedules.notify.label')}</span>
      <Select
        value={value}
        label={t('schedules.notify.label')}
        options={(['all', 'problems', 'none'] as const).map((option) => {
          const Icon = ICONS[option]
          return { value: option, label: t(`schedules.notify.${option}`), detail: t(`schedules.notify.${option}Hint`), icon: <Icon size={14} aria-hidden="true" /> }
        })}
        onChange={onChange}
        testId="schedule-notify-select"
      />
    </div>
  )
}

/** En una lista: una marca discreta cuando la tarea avisa menos que de cada vuelta. */
export function NotifyMark({ notify }: { notify: ScheduleNotify | undefined }) {
  const { t } = useI18n()
  if (!notify || notify === 'all') return null
  const Icon = ICONS[notify]
  const text = t(notify === 'none' ? 'schedules.notify.quiet' : 'schedules.notify.problemsShort')
  return (
    <span className="inline-flex shrink-0 items-center text-[var(--text-subtle)]" title={text} aria-label={text} data-testid="schedule-notify-mark">
      <Icon size={12} aria-hidden="true" />
    </span>
  )
}

/** Si una vuelta con este resultado debe saltar a la vista (toast, sistema o sonido). */
export function runNotifies(notify: ScheduleNotify | undefined, problem: boolean): boolean {
  if (notify === 'none') return false
  if (notify === 'problems') return problem
  return true
}
