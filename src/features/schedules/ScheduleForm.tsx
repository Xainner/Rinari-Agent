import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import { useI18n } from '../../i18n'
import { inputClass, labelClass } from '../../lib/ui'
import { commandMessage, engineApi, type ScheduleSpec, type ScheduledTaskInput } from '../../services/engine'
import { useEngineData } from '../engine/EngineContext'
import { SCHEDULES_CHANGED_EVENT, WEEKDAY_KEYS, defaultOnceAt, draftProblem, useScheduleForm } from './scheduleModel'

const SPEC_DEFAULTS: Record<ScheduleSpec['kind'], () => ScheduleSpec> = {
  once: () => ({ kind: 'once', at: defaultOnceAt() }),
  interval: () => ({ kind: 'interval', minutes: 60 }),
  daily: () => ({ kind: 'daily', time: '09:00' }),
  weekly: () => ({ kind: 'weekly', days: [0, 1, 2, 3, 4], time: '09:00' }),
}

/**
 * Crear o editar una tarea programada, o confirmar la que propuso Rinari.
 * Lo que se permite de antemano lo decide aquí el dueño: una propuesta
 * llega sin permisos.
 */
export default function ScheduleForm() {
  const { t } = useI18n()
  const open = useScheduleForm((state) => state.open)
  const close = useScheduleForm((state) => state.close)
  const data = useEngineData()
  const [draft, setDraft] = useState<ScheduledTaskInput | null>(null)
  const [grantInput, setGrantInput] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(open ? open.draft : null)
    setError('')
    setGrantInput('')
  }, [open])

  if (!open || !draft) return null
  const update = (patch: Partial<ScheduledTaskInput>) => setDraft((current) => (current ? { ...current, ...patch } : current))
  const spec = draft.schedule
  const setSpec = (next: ScheduleSpec) => update({ schedule: next })
  const grants = draft.grants ?? []

  const save = async () => {
    const problem = draftProblem(draft, t)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload: ScheduledTaskInput = { ...draft, name: draft.name.trim(), prompt: draft.prompt.trim() }
      if (open.taskId) await engineApi.scheduleUpdate(open.taskId, payload)
      else await engineApi.scheduleCreate(payload)
      toast.success(open.taskId ? t('schedules.saved') : t('schedules.created', { name: payload.name }))
      window.dispatchEvent(new Event(SCHEDULES_CHANGED_EVENT))
      close()
    } catch (err) {
      setError(commandMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const addGrant = () => {
    const capability = grantInput.trim()
    if (!capability || grants.some((grant) => grant.capability === capability && !grant.target)) return
    update({ grants: [...grants, { capability, target: null }] })
    setGrantInput('')
  }

  return (
    <Dialog open onOpenChange={(value) => { if (!value) close() }}>
      <DialogContent className="max-w-xl">
        <DialogTitle>{open.taskId ? t('schedules.form.editTitle') : open.proposed ? t('schedules.form.proposedTitle') : t('schedules.form.newTitle')}</DialogTitle>
        <DialogDescription>{open.proposed ? t('schedules.form.proposedHint') : t('schedules.form.hint')}</DialogDescription>
        <div className="mt-4 max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          <label className="block">
            <span className={labelClass}>{t('schedules.form.name')}</span>
            <input value={draft.name} maxLength={80} onChange={(event) => update({ name: event.target.value })} className={inputClass} />
          </label>

          <div role="radiogroup" aria-label={t('schedules.form.kind')} className="grid grid-cols-2 gap-2">
            {(['agent', 'reminder'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={draft.kind === kind}
                onClick={() => update({ kind })}
                className={`rounded-xl border px-3 py-2 text-left text-sm ${draft.kind === kind ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-muted)]'}`}
              >
                <span className="block font-medium">{t(kind === 'agent' ? 'schedules.kind.agent' : 'schedules.kind.reminder')}</span>
                <span className="block text-xs text-[var(--text-subtle)]">{t(kind === 'agent' ? 'schedules.kind.agentHint' : 'schedules.kind.reminderHint')}</span>
              </button>
            ))}
          </div>

          <label className="block">
            <span className={labelClass}>{t(draft.kind === 'reminder' ? 'schedules.form.reminderText' : 'schedules.form.prompt')}</span>
            <textarea value={draft.prompt} rows={4} maxLength={8000} onChange={(event) => update({ prompt: event.target.value })} className={inputClass} />
          </label>

          <fieldset className="space-y-2">
            <legend className={labelClass}>{t('schedules.form.when')}</legend>
            <select aria-label={t('schedules.form.when')} value={spec.kind} onChange={(event) => setSpec(SPEC_DEFAULTS[event.target.value as ScheduleSpec['kind']]())} className={inputClass}>
              <option value="once">{t('schedules.spec.once')}</option>
              <option value="daily">{t('schedules.spec.daily')}</option>
              <option value="weekly">{t('schedules.spec.weekly')}</option>
              <option value="interval">{t('schedules.spec.interval')}</option>
            </select>
            {spec.kind === 'once' && (
              <input type="datetime-local" aria-label={t('schedules.form.at')} value={spec.at} onChange={(event) => setSpec({ kind: 'once', at: event.target.value })} className={inputClass} />
            )}
            {spec.kind === 'interval' && (
              <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                {t('schedules.form.every')}
                <input type="number" min={5} step={5} value={spec.minutes} onChange={(event) => setSpec({ kind: 'interval', minutes: Number(event.target.value) })} className={`${inputClass} w-24`} />
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
                      onClick={() => setSpec({ ...spec, days: on ? spec.days.filter((item) => item !== day) : [...spec.days, day].sort() })}
                      className={`h-8 min-w-10 rounded-lg border px-2 text-xs ${on ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-muted)]'}`}
                    >
                      {t(key)}
                    </button>
                  )
                })}
              </div>
            )}
            {(spec.kind === 'daily' || spec.kind === 'weekly') && (
              <input type="time" aria-label={t('schedules.form.time')} value={spec.time} onChange={(event) => setSpec({ ...spec, time: event.target.value })} className={`${inputClass} w-32`} />
            )}
          </fieldset>

          {draft.kind === 'agent' && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block sm:col-span-3">
                  <span className={labelClass}>{t('schedules.form.project')}</span>
                  <select value={draft.project_id ?? ''} onChange={(event) => update({ project_id: event.target.value || null })} className={inputClass}>
                    <option value="">{t('schedules.form.noProject')}</option>
                    {data.projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className={labelClass}>{t('schedules.form.mode')}</span>
                  <select value={draft.mode ?? 'build'} onChange={(event) => update({ mode: event.target.value as ScheduledTaskInput['mode'] })} className={inputClass}>
                    <option value="plan">PLAN</option>
                    <option value="build">BUILD</option>
                    <option value="review">REVIEW</option>
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className={labelClass}>{t('schedules.form.model')}</span>
                  <select value={draft.model ?? ''} onChange={(event) => update({ model: event.target.value || null })} className={inputClass}>
                    <option value="">{t('schedules.form.defaultModel')}</option>
                    {data.models.filter((model) => model.saved !== false).map((model) => (
                      <option key={model.id} value={model.alias}>{model.alias}</option>
                    ))}
                  </select>
                </label>
              </div>

              <section className="space-y-2 rounded-xl border border-[var(--border)] p-3">
                <p className="text-sm font-medium text-[var(--text)]">{t('schedules.grants.title')}</p>
                <p className="text-xs text-[var(--text-subtle)]">{t('schedules.grants.hint')}</p>
                {grants.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {grants.map((grant) => (
                      <li key={`${grant.capability}:${grant.target ?? ''}`} className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-0.5 font-mono text-[11px] text-[var(--text-muted)]">
                        {grant.target ? `${grant.capability}: ${grant.target}` : grant.capability}
                        <button type="button" aria-label={t('schedules.grants.remove', { name: grant.capability })} onClick={() => update({ grants: grants.filter((item) => item !== grant) })} className="text-[var(--text-subtle)] hover:text-[var(--text)]">
                          <X size={11} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <input
                    value={grantInput}
                    aria-label={t('schedules.grants.add')}
                    placeholder="shell.exec"
                    onChange={(event) => setGrantInput(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addGrant() } }}
                    className={`${inputClass} font-mono`}
                  />
                  <button type="button" onClick={addGrant} className="rounded-lg border border-[var(--border)] px-3 text-xs text-[var(--text-muted)] hover:text-[var(--text)]">{t('schedules.grants.add')}</button>
                </div>
              </section>
            </>
          )}

          {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={close} className="rounded-lg px-3 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)]">{t('common.cancel')}</button>
          <button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {open.taskId ? t('schedules.form.save') : t('schedules.form.create')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
