import { useI18n } from '../../i18n'
import { inputClass, labelClass } from '../../lib/ui'
import type { ScheduleSpec } from '../../services/engine'
import { WEEKDAY_KEYS, defaultOnceAt } from './scheduleModel'

const SPEC_DEFAULTS: Record<ScheduleSpec['kind'], () => ScheduleSpec> = {
  once: () => ({ kind: 'once', at: defaultOnceAt() }),
  interval: () => ({ kind: 'interval', minutes: 60 }),
  daily: () => ({ kind: 'daily', time: '09:00' }),
  weekly: () => ({ kind: 'weekly', days: [0, 1, 2, 3, 4], time: '09:00' }),
  cron: () => ({ kind: 'cron', expr: '0 9 * * 1-5' }),
}

/**
 * «Cuándo» de una tarea programada o de una regla de la Agency: el tipo de
 * horario y sus campos, en la hora local de este equipo.
 */
export default function ScheduleSpecField({ spec, onChange }: { spec: ScheduleSpec; onChange: (next: ScheduleSpec) => void }) {
  const { t } = useI18n()
  return (
    <fieldset className="space-y-2">
      <legend className={labelClass}>{t('schedules.form.when')}</legend>
      <select aria-label={t('schedules.form.when')} value={spec.kind} onChange={(event) => onChange(SPEC_DEFAULTS[event.target.value as ScheduleSpec['kind']]())} className={inputClass}>
        <option value="once">{t('schedules.spec.once')}</option>
        <option value="daily">{t('schedules.spec.daily')}</option>
        <option value="weekly">{t('schedules.spec.weekly')}</option>
        <option value="interval">{t('schedules.spec.interval')}</option>
        <option value="cron">{t('schedules.spec.cron')}</option>
      </select>
      {spec.kind === 'cron' && (
        <label className="block">
          <input aria-label={t('schedules.spec.cron')} value={spec.expr} spellCheck={false} onChange={(event) => onChange({ kind: 'cron', expr: event.target.value })} className={`${inputClass} font-mono`} />
          <span className="mt-1 block text-xs text-[var(--text-subtle)]">{t('schedules.form.cronHint')}</span>
        </label>
      )}
      {spec.kind === 'once' && (
        <input type="datetime-local" aria-label={t('schedules.form.at')} value={spec.at} onChange={(event) => onChange({ kind: 'once', at: event.target.value })} className={inputClass} />
      )}
      {spec.kind === 'interval' && (
        <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          {t('schedules.form.every')}
          <input type="number" min={5} step={5} value={spec.minutes} onChange={(event) => onChange({ kind: 'interval', minutes: Number(event.target.value) })} className={`${inputClass} w-24`} />
          {t('schedules.form.minutes')}
        </label>
      )}
      {spec.kind === 'weekly' && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('schedules.form.days')}>
          {WEEKDAY_KEYS.map((key, day) => {
            const on = spec.days.includes(day)
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...spec, days: on ? spec.days.filter((item) => item !== day) : [...spec.days, day].sort() })}
                className={`h-8 min-w-10 rounded-lg border px-2 text-xs ${on ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-muted)]'}`}
              >
                {t(key)}
              </button>
            )
          })}
        </div>
      )}
      {(spec.kind === 'daily' || spec.kind === 'weekly') && (
        <input type="time" aria-label={t('schedules.form.time')} value={spec.time} onChange={(event) => onChange({ ...spec, time: event.target.value })} className={`${inputClass} w-32`} />
      )}
    </fieldset>
  )
}
