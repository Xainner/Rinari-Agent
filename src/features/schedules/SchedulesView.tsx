import { Bell, Bot, CalendarClock, ExternalLink, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog'
import { Switch } from '../../components/ui/switch'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'
import { commandMessage, engineApi, onEngineEvent, type ScheduledRun, type ScheduledTask } from '../../services/engine'
import { useEngineData } from '../engine/EngineContext'
import {
  RUN_STATUS_KEYS,
  SCHEDULES_CHANGED_EVENT,
  SKIP_REASON_KEYS,
  describeSchedule,
  formatWhen,
  runTone,
  useScheduleForm,
} from './scheduleModel'

const TONE_CLASS: Record<ReturnType<typeof runTone>, string> = {
  ok: 'border-emerald-500/40 text-emerald-400',
  warn: 'border-amber-500/40 text-amber-400',
  bad: 'border-[var(--danger)]/50 text-[var(--danger)]',
  live: 'border-[var(--accent)]/50 text-[var(--accent)]',
  muted: 'border-[var(--border)] text-[var(--text-subtle)]',
}

function StatusBadge({ run }: { run: ScheduledRun }) {
  const { t } = useI18n()
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium', TONE_CLASS[runTone(run.status)])}>
      {t(RUN_STATUS_KEYS[run.status])}
    </span>
  )
}

/**
 * Tareas programadas: la lista, la ficha de la elegida y su historial. Las
 * corre el Engine mientras Rinari está abierta o en la bandeja; aquí solo se
 * crean, se revisan y se prueban.
 */
export default function SchedulesView({ onOpenSession }: { onOpenSession: (sessionId: string) => void }) {
  const { t, lang } = useI18n()
  const locale = lang === 'es' ? 'es' : 'en'
  const data = useEngineData()
  const openNew = useScheduleForm((state) => state.openNew)
  const openEdit = useScheduleForm((state) => state.openEdit)
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [runs, setRuns] = useState<ScheduledRun[]>([])
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState<ScheduledTask | null>(null)
  const selected = tasks.find((task) => task.id === selectedId) ?? tasks[0] ?? null

  const reload = useCallback(async () => {
    try {
      const result = await engineApi.scheduleList()
      setTasks(result.tasks)
      setError('')
    } catch (err) {
      setError(commandMessage(err))
    } finally {
      setLoaded(true)
    }
  }, [])

  const loadRuns = useCallback(async (taskId: string) => {
    try {
      setRuns((await engineApi.scheduleGet(taskId)).runs)
    } catch {
      setRuns([])
    }
  }, [])

  useEffect(() => {
    void reload()
    const refresh = () => void reload()
    window.addEventListener(SCHEDULES_CHANGED_EVENT, refresh)
    let stop: (() => void) | undefined
    let disposed = false
    void onEngineEvent((event) => {
      if (event.event.startsWith('schedule.') && event.event !== 'schedule.proposed') refresh()
    }).then((unlisten) => {
      if (disposed) unlisten()
      else stop = unlisten
    })
    return () => {
      disposed = true
      stop?.()
      window.removeEventListener(SCHEDULES_CHANGED_EVENT, refresh)
    }
  }, [reload])

  const selectedKey = selected ? `${selected.id}:${selected.last_run?.id ?? ''}:${selected.last_run?.status ?? ''}` : ''
  useEffect(() => {
    if (selected) void loadRuns(selected.id)
    else setRuns([])
    // La clave cambia con la última ejecución: el historial se refresca solo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, loadRuns])

  const act = async (work: () => Promise<unknown>, done?: string) => {
    setBusy(true)
    try {
      await work()
      if (done) toast.success(done)
      await reload()
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const projectName = (id: string | null) => (id ? data.projects.find((project) => project.id === id)?.name ?? id : null)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden" data-testid="schedules-view">
      <header className="flex shrink-0 items-start gap-4 border-b border-[var(--border)] px-6 py-5">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-bold text-[var(--text)]">{t('schedules.title')}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{t('schedules.subtitle')}</p>
        </div>
        <button type="button" onClick={openNew} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white">
          <Plus size={15} aria-hidden="true" />
          {t('schedules.new')}
        </button>
      </header>

      {error && <p role="alert" className="px-6 pt-4 text-sm text-[var(--danger)]">{error}</p>}

      {loaded && tasks.length === 0 && !error ? (
        <div className="grid flex-1 place-items-center p-8 text-center">
          <div className="max-w-sm space-y-3">
            <CalendarClock size={28} className="mx-auto text-[var(--text-subtle)]" aria-hidden="true" />
            <p className="text-sm text-[var(--text-muted)]">{t('schedules.empty')}</p>
            <button type="button" onClick={openNew} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)] hover:bg-[var(--bg-hover)]">{t('schedules.new')}</button>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(260px,360px)_1fr]">
          <ul className="min-h-0 overflow-y-auto border-r border-[var(--border)] p-3" aria-label={t('schedules.title')}>
            {tasks.map((task) => (
              <li key={task.id}>
                <div
                  className={cn(
                    'flex items-start gap-3 rounded-xl px-3 py-2.5',
                    task.id === selected?.id ? 'bg-[var(--bg-active)]' : 'hover:bg-[var(--bg-hover)]',
                  )}
                >
                  <button type="button" onClick={() => setSelectedId(task.id)} className="min-w-0 flex-1 text-left">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--text)]">
                      {task.kind === 'reminder' ? <Bell size={13} aria-hidden="true" /> : <Bot size={13} aria-hidden="true" />}
                      <span className="truncate">{task.name}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-[var(--text-subtle)]">{describeSchedule(task.schedule, t, locale)}</span>
                    <span className="mt-1 flex items-center gap-2 text-[11px] text-[var(--text-subtle)]">
                      {task.enabled && task.next_run_at ? t('schedules.next', { when: formatWhen(task.next_run_at, locale) }) : t('schedules.paused')}
                      {task.last_run && <StatusBadge run={task.last_run} />}
                    </span>
                  </button>
                  <Switch
                    checked={task.enabled}
                    disabled={busy}
                    aria-label={t('schedules.enabled', { name: task.name })}
                    onCheckedChange={(enabled) => void act(() => engineApi.scheduleUpdate(task.id, { enabled }))}
                  />
                </div>
              </li>
            ))}
          </ul>

          {selected && (
            <section className="min-h-0 overflow-y-auto p-6" aria-label={selected.name}>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-[var(--text)]">{selected.name}</h2>
                <button type="button" disabled={busy} onClick={() => void act(() => engineApi.scheduleRunNow(selected.id), t('schedules.started'))} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)] hover:bg-[var(--bg-hover)] disabled:opacity-50">
                  <Play size={14} aria-hidden="true" /> {t('schedules.runNow')}
                </button>
                <button type="button" onClick={() => openEdit(selected)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)] hover:bg-[var(--bg-hover)]">
                  <Pencil size={14} aria-hidden="true" /> {t('schedules.edit')}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={t('schedules.delete', { name: selected.name })}
                  title={t('schedules.delete', { name: selected.name })}
                  onClick={() => setDeleting(selected)}
                  className="rounded-lg border border-[var(--border)] p-2 text-[var(--text-muted)] hover:text-[var(--danger)] disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-[var(--text-subtle)]">{t('schedules.form.when')}</dt>
                <dd className="text-[var(--text)]">{describeSchedule(selected.schedule, t, locale)}</dd>
                <dt className="text-[var(--text-subtle)]">{t('schedules.nextLabel')}</dt>
                <dd className="text-[var(--text)]">{selected.enabled ? formatWhen(selected.next_run_at, locale) : t('schedules.paused')}</dd>
                <dt className="text-[var(--text-subtle)]">{t('schedules.form.kind')}</dt>
                <dd className="text-[var(--text)]">{t(selected.kind === 'agent' ? 'schedules.kind.agent' : 'schedules.kind.reminder')}</dd>
                {selected.kind === 'agent' && (
                  <>
                    <dt className="text-[var(--text-subtle)]">{t('schedules.form.project')}</dt>
                    <dd className="text-[var(--text)]">{projectName(selected.project_id) ?? t('schedules.form.noProject')}</dd>
                    <dt className="text-[var(--text-subtle)]">{t('schedules.form.mode')}</dt>
                    <dd className="text-[var(--text)]">{selected.mode.toUpperCase()}{selected.model ? ` · ${selected.model}` : ''}</dd>
                    <dt className="text-[var(--text-subtle)]">{t('schedules.grants.title')}</dt>
                    <dd className="font-mono text-xs text-[var(--text-muted)]">
                      {selected.grants.length ? selected.grants.map((grant) => (grant.target ? `${grant.capability}: ${grant.target}` : grant.capability)).join(' · ') : t('schedules.grants.none')}
                    </dd>
                  </>
                )}
              </dl>
              <p className="mt-4 whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-sm text-[var(--text)]">{selected.prompt}</p>

              <h3 className="mt-6 text-sm font-semibold text-[var(--text)]">{t('schedules.history')}</h3>
              {runs.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--text-subtle)]">{t('schedules.noRuns')}</p>
              ) : (
                <ul className="mt-2 divide-y divide-[var(--border)]">
                  {runs.map((run) => (
                    <li key={run.id} className="flex items-start gap-3 py-2.5 text-sm">
                      <span className="w-40 shrink-0 text-xs text-[var(--text-subtle)]">
                        {formatWhen(run.started_at ?? run.scheduled_for, locale)}
                        {run.trigger === 'manual' && <span className="block">{t('schedules.manual')}</span>}
                      </span>
                      <StatusBadge run={run} />
                      <span className="min-w-0 flex-1 text-[var(--text-muted)]">
                        <span className="line-clamp-2">
                          {run.reason ? (SKIP_REASON_KEYS[run.reason] ? t(SKIP_REASON_KEYS[run.reason]) : run.reason) : run.summary ?? ''}
                        </span>
                      </span>
                      {run.session_id && (
                        <button type="button" onClick={() => onOpenSession(run.session_id as string)} className="inline-flex shrink-0 items-center gap-1 text-xs text-[var(--accent)] hover:underline">
                          {t('schedules.openSession')} <ExternalLink size={11} aria-hidden="true" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('schedules.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('schedules.deleteConfirm', { name: deleting?.name ?? '' })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = deleting
                setDeleting(null)
                if (target) void act(() => engineApi.scheduleDelete(target.id), t('schedules.deleted'))
              }}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {t('schedules.deleteAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
