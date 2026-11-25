import { useId } from 'react'
import { useI18n } from '../../../i18n'
import type { ScheduleSpec } from '../../../services/engine'
import { SegChoice } from '../../connectors/SegChoice'
import { WEEKDAY_KEYS } from '../../schedules/scheduleModel'

type Kind = 'daily' | 'weekly' | 'interval' | 'cron'

const DEFAULTS: Record<Kind, ScheduleSpec> = {
  daily: { kind: 'daily', time: '09:00' },
  weekly: { kind: 'weekly', days: [0, 1, 2, 3, 4], time: '09:00' },
  interval: { kind: 'interval', minutes: 60 },
  cron: { kind: 'cron', expr: '0 9 * * 1-5' },
}

function timeOf(spec: ScheduleSpec): string {
  return spec.kind === 'daily' || spec.kind === 'weekly' ? spec.time : '09:00'
}

/**
 * «Cuándo» de una rutina en la revisión de un equipo: el tipo en un
 * segmentado y sus campos al lado, en la hora local de este equipo. Las
 * rutinas de un equipo repiten; «una vez» no se ofrece aquí.
 */
export default function RoutineWhen({ spec, onChange, testId }: {
  spec: ScheduleSpec
  onChange: (next: ScheduleSpec) => void
  testId?: string
}) {
  const { t } = useI18n()
  const labelId = useId()
  const kind: Kind = spec.kind === 'once' ? 'daily' : spec.kind
  const hours = spec.kind === 'interval' && spec.seconds === undefined && spec.minutes % 60 === 0 && spec.minutes >= 60
  const amount = spec.kind === 'interval' ? (spec.seconds !== undefined ? Math.max(1, Math.round(spec.seconds / 60)) : hours ? spec.minutes / 60 : spec.minutes) : 1

  return (
    <div className="team-builder-when" data-testid={testId}>
      <span id={labelId} className="sr-only">{t('schedules.form.when')}</span>
      <SegChoice<Kind>
        small
        labelledBy={labelId}
        value={kind}
        options={(['daily', 'weekly', 'interval', 'cron'] as const).map((value) => ({ value, label: t(`agency.builder.when.${value}`) }))}
        onChange={(value) => onChange(value === 'daily' || value === 'weekly' ? { ...DEFAULTS[value], time: timeOf(spec) } as ScheduleSpec : DEFAULTS[value])}
      />
      <div className="team-builder-when-fields">
        {(spec.kind === 'daily' || spec.kind === 'weekly') && (
          <label className="team-builder-time">
            <span>{t('agency.builder.when.at')}</span>
            <input
              type="time"
              className="field-input"
              value={spec.time}
              aria-label={t('agency.builder.when.at')}
              onChange={(event) => onChange({ ...spec, time: event.target.value || spec.time })}
            />
          </label>
        )}
        {spec.kind === 'weekly' && (
          <div className="team-builder-days" role="group" aria-label={t('schedules.form.days')}>
            {WEEKDAY_KEYS.map((key, day) => {
              const on = spec.days.includes(day)
              return (
                <button
                  key={key}
                  type="button"
                  className="team-builder-day"
                  aria-pressed={on}
                  aria-label={t(key)}
                  title={t(key)}
                  onClick={() => {
                    const days = on ? spec.days.filter((item) => item !== day) : [...spec.days, day].sort()
                    if (days.length > 0) onChange({ ...spec, days })
                  }}
                >
                  {t(key).slice(0, 2)}
                </button>
              )
            })}
          </div>
        )}
        {spec.kind === 'interval' && (
          <div className="team-builder-every">
            <span>{t('schedules.form.every')}</span>
            <input
              type="number"
              min={1}
              step={1}
              className="field-input"
              value={amount}
              aria-label={t('schedules.form.every')}
              onChange={(event) => {
                const value = Math.max(1, Math.round(Number(event.target.value) || 1))
                onChange({ kind: 'interval', minutes: hours ? value * 60 : value })
              }}
            />
            <SegChoice<'minutes' | 'hours'>
              small
              label={t('schedules.form.unit')}
              value={hours ? 'hours' : 'minutes'}
              options={[
                { value: 'minutes', label: t('schedules.form.minutes') },
                { value: 'hours', label: t('agency.builder.when.hours') },
              ]}
              onChange={(unit) => onChange({ kind: 'interval', minutes: unit === 'hours' ? amount * 60 : amount })}
            />
          </div>
        )}
        {spec.kind === 'cron' && (
          <input
            className="field-input team-builder-cron"
            value={spec.expr}
            spellCheck={false}
            aria-label={t('schedules.spec.cron')}
            title={t('schedules.form.cronHint')}
            onChange={(event) => onChange({ kind: 'cron', expr: event.target.value })}
          />
        )}
      </div>
    </div>
  )
}
