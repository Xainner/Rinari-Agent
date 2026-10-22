import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, History, MessageSquare, Pause, Pencil, Play, Plus, Trash2, Zap } from 'lucide-react'
import { NotifyMark } from '../schedules/NotifyField'
import { toast } from 'sonner'
import { useI18n, type I18nKey } from '../../i18n'
import { cn } from '../../lib/utils'
import { JobCancelledError, JobTimeoutError, runJob, useJobSignal } from './jobEvents'
import { commandMessage, engineApi, onEngineEvent, type ScheduledRun, type ScheduledTask, type ScheduledTaskInput, type ScheduledToolSpec } from '../../services/engine'
import { describeSchedule, formatWhen, SCHEDULES_CHANGED_EVENT } from '../schedules/scheduleModel'
import { useAgencyStore } from '../../stores/agency'
import { useOptionalEngineData } from '../engine/EngineContext'
import { useAgencyData } from './AgencyData'
import RuleForm from './RuleForm'

/**
 * Abrir la conversación de una ejecución de una regla, dentro de la Agency
 * (la escucha App): esas conversaciones no están en la lista de Rinari.
 */
export const AGENCY_OPEN_RUN_EVENT = 'rinari:agency-open-run'
export interface AgencyOpenRunDetail {
  agentId: string
  sessionId: string
}

const RUN_TONE: Partial<Record<ScheduledRun['status'], string>> = {
  completed: 'success',
  failed: 'danger',
  blocked: 'danger',
  needs_you: 'warning',
  running: 'accent',
  queued: 'accent',
}

interface RulesViewProps {
  /** El chat directo abierto; su agente sale del store de la Agency. */
  sessionId: string
}

/** Las partes de una regla, como en la sección 10.1 del plan: cuándo, qué, a dónde, límites. */
function RuleParts({ rule }: { rule: Pick<ScheduledTaskInput, 'schedule' | 'tool' | 'prompt' | 'watch' | 'deliver_to'> }) {
  const { t, lang } = useI18n()
  const { agents, teams } = useAgencyData()
  const target = rule.deliver_to ?? null
  // A name, never a raw id: an office or agent that is gone says so.
  const targetLabel = !target
    ? null
    : target.kind === 'office'
      ? t('agency.rules.deliverTo.office', { name: teams.find((team) => team.id === target.team_id)?.name ?? t('agency.rules.deliverTo.goneTeam') })
      : agents.find((agent) => agent.id === target.agent_id)?.name ?? t('agency.rules.deliverTo.goneAgent')
  const tool: ScheduledToolSpec | null | undefined = rule.tool
  const locale = lang === 'es' ? 'es' : 'en'
  return (
    <dl className="agency-rule-parts">
      <dt>{t('agency.rules.when')}</dt>
      <dd>
        {describeSchedule(rule.schedule, t, locale)}
        {rule.watch && <span className="text-[var(--text-muted)]">{t('agency.rules.watch', { path: rule.watch.path })}</span>}
      </dd>
      {tool ? (
        <>
          <dt>{t('agency.rules.what')}</dt>
          <dd>
            <code>{tool.server} · {tool.tool}</code>
            {Object.keys(tool.arguments ?? {}).length > 0 && (
              <code className="agency-rule-args">{JSON.stringify(tool.arguments)}</code>
            )}
          </dd>
          <dt>{t('agency.rules.where')}</dt>
          <dd>
            {tool.on_result === 'deliver' && tool.deliver
              ? <code>{tool.deliver.server} · {tool.deliver.tool}</code>
              : t(`agency.rules.onResult.${tool.on_result}` as I18nKey)}
          </dd>
          {tool.only_if_contains ? (
            <>
              <dt>{t('agency.rules.if')}</dt>
              <dd>{t('agency.rules.onlyIf', { text: tool.only_if_contains })}</dd>
            </>
          ) : null}
          {tool.max_per_day ? (
            <>
              <dt>{t('agency.rules.limits')}</dt>
              <dd>{t('agency.rules.perDay', { n: tool.max_per_day })}</dd>
            </>
          ) : null}
        </>
      ) : (
        <>
          <dt>{t('agency.rules.what')}</dt>
          <dd className="truncate">{rule.prompt}</dd>
        </>
      )}
      {targetLabel && (
        <>
          <dt>{t('agency.rules.deliverToShort')}</dt>
          <dd data-testid="agency-rule-deliver-target">{targetLabel}</dd>
        </>
      )}
    </dl>
  )
}

/** Un ensayo lee como mucho una herramienta: si en un minuto no responde, se dice. */
const REHEARSAL_TIMEOUT_MS = 60_000

interface Rehearsal {
  outcome: 'nothing_new' | 'condition_not_met' | 'would_run' | 'blocked' | 'not_rehearsable' | 'failed'
  reason?: string
  result?: string
  delivery?: { server: string; tool: string; arguments: Record<string, unknown> }
}

/**
 * Las últimas ejecuciones de una regla (10.1.5): cuándo, cómo terminó y, si
 * tuvo conversación, el enlace para abrirla (no está en la lista de Rinari).
 */
function RuleRuns({ rule, agentId }: { rule: ScheduledTask; agentId: string }) {
  const { t, lang } = useI18n()
  const locale = lang === 'es' ? 'es' : 'en'
  const [runs, setRuns] = useState<ScheduledRun[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    try {
      const result = await engineApi.scheduleRuns(rule.id, 10)
      setRuns(result.runs)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [rule.id])

  useEffect(() => {
    void load()
    let stop: (() => void) | undefined
    let disposed = false
    void onEngineEvent((event) => {
      const taskId = (event.payload as { task_id?: unknown } | undefined)?.task_id
      if (event.event.startsWith('schedule.run.') && taskId === rule.id) void load()
    }).then((unlisten) => {
      if (disposed) unlisten()
      else stop = unlisten
    })
    return () => {
      disposed = true
      stop?.()
    }
  }, [load, rule.id])

  if (failed && runs === null) {
    return (
      <p className="field-hint" role="alert">
        {t('agency.rules.runsFailed')}{' '}
        <button type="button" className="btn btn-quiet btn-xs" onClick={() => void load()}>{t('agency.rules.retry')}</button>
      </p>
    )
  }
  if (runs === null) return <p className="field-hint" aria-busy="true">{t('agency.settings.loading')}</p>
  if (runs.length === 0) return <p className="field-hint">{t('agency.rules.noRuns')}</p>
  return (
    <ol className="agency-rule-runs" data-testid="agency-rule-runs">
      {runs.map((run) => (
        <li key={run.id} className="agency-rule-run">
          <span className="r-chip" data-tone={RUN_TONE[run.status]}>{t(`schedules.status.${run.status}` as I18nKey)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] text-[var(--text)]">
              {formatWhen(run.started_at ?? run.scheduled_for, locale)}
              {run.trigger === 'manual' ? ` · ${t('agency.rules.runManual')}` : ''}
            </span>
            {(run.reason || run.summary) && <span className="block truncate text-[11.5px] text-[var(--text-subtle)]">{run.reason || run.summary}</span>}
          </span>
          {run.session_id && (
            <button
              type="button"
              className="btn btn-quiet btn-xs"
              onClick={() => window.dispatchEvent(new CustomEvent<AgencyOpenRunDetail>(AGENCY_OPEN_RUN_EVENT, { detail: { agentId, sessionId: run.session_id as string } }))}
              aria-label={t('agency.rules.openRunLabel', { when: formatWhen(run.started_at ?? run.scheduled_for, locale) })}
              data-testid="agency-rule-run-open"
            >
              <MessageSquare size={12} aria-hidden="true" /> {t('agency.rules.openRun')}
            </button>
          )}
        </li>
      ))}
    </ol>
  )
}

/** «Probar»: lo que la regla haría ahora, sin enviar nada (Agency 10.1.3). */
function RehearseButton({ proposal }: { proposal: ScheduledTaskInput }) {
  const { t } = useI18n()
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Rehearsal | null>(null)
  const jobSignal = useJobSignal()

  // Suscrito antes de pedirlo: «no se puede ensayar» llega casi enseguida.
  const start = async () => {
    if (running) return
    setResult(null)
    setRunning(true)
    try {
      setResult(await runJob(
        () => engineApi.scheduleRehearse(proposal),
        (event) => (event.event === 'schedule.rehearsed' ? (event.payload as unknown as Rehearsal) : null),
        REHEARSAL_TIMEOUT_MS,
        jobSignal(),
      ))
    } catch (error) {
      if (error instanceof JobCancelledError) return // the card closed meanwhile
      toast.error(error instanceof JobTimeoutError ? t('agency.jobTimeout') : commandMessage(error))
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" disabled={running} onClick={() => void start()} data-testid="agency-rule-rehearse">
        {running ? t('agency.rules.rehearsing') : t('agency.rules.rehearse')}
      </button>
      {result && (
        <div className="agency-rehearsal" role="status" data-testid="agency-rule-rehearsal" data-outcome={result.outcome}>
          <p className="font-semibold">{t(`agency.rules.rehearsal.${result.outcome}` as I18nKey)}</p>
          {result.reason && <p className="field-hint">{result.reason}</p>}
          {result.delivery && (
            <code className="agency-rule-args">{result.delivery.server} · {result.delivery.tool} {JSON.stringify(result.delivery.arguments)}</code>
          )}
          {!result.delivery && result.result ? <code className="agency-rule-args">{result.result}</code> : null}
        </div>
      )}
    </>
  )
}

/** Lo que «Probar» manda al Engine de una regla ya guardada: la regla, sin su id ni su estado. */
function ruleInput(rule: ScheduledTask): ScheduledTaskInput {
  return {
    name: rule.name,
    kind: rule.kind,
    schedule: rule.schedule,
    prompt: rule.prompt,
    tool: rule.tool ?? null,
    watch: rule.watch ?? null,
    agent_id: rule.agent_id ?? null,
    notify: rule.notify ?? 'all',
  }
}

/**
 * La vista «Reglas» del panel lateral (D-18): las reglas permanentes del
 * agente cuyo chat está abierto y sus últimas ejecuciones. Las crea el
 * agente (según su autonomía) o el dueño con «Nueva regla», y van por
 * permisos: no hay una capa de aprobación. Cada una se edita, se prueba, se
 * pausa, se ejecuta ahora o se borra, y muestra su historial.
 */
export default function RulesView({ sessionId }: RulesViewProps) {
  const { t, lang } = useI18n()
  const agentId = useAgencyStore((state) => state.agentSessions[sessionId] ?? null)
  const locale = lang === 'es' ? 'es' : 'en'
  // null: cerrado; 'new': «Nueva regla»; una regla: editarla.
  const [form, setForm] = useState<ScheduledTask | 'new' | null>(null)
  const [history, setHistory] = useState<Record<string, boolean>>({})
  const [rules, setRules] = useState<ScheduledTask[]>([])
  const [loaded, setLoaded] = useState(false)
  const capabilities = useOptionalEngineData()?.status?.capabilities
  const canRehearse = capabilities?.agency_rule_rehearsal_v1 === true
  const deliverEnabled = capabilities?.agency_audit_v1 === true

  const reload = useCallback(async () => {
    if (!agentId) return
    try {
      const result = await engineApi.scheduleList()
      setRules(result.tasks.filter((task) => task.agent_id === agentId))
    } catch {
      // El Engine puede estar reiniciando: se conserva lo último.
    } finally {
      setLoaded(true)
    }
  }, [agentId])

  useEffect(() => {
    void reload()
    let stop: (() => void) | undefined
    let disposed = false
    void onEngineEvent((event) => {
      if (event.event.startsWith('schedule.')) void reload()
    }).then((unlisten) => {
      if (disposed) unlisten()
      else stop = unlisten
    })
    return () => {
      disposed = true
      stop?.()
    }
  }, [reload])

  // One action at a time: a double click ran or deleted twice.
  const busyRef = useRef(false)
  const [busy, setBusy] = useState(false)
  const act = async (work: () => Promise<unknown>) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await work()
      window.dispatchEvent(new Event(SCHEDULES_CHANGED_EVENT))
      await reload()
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  if (!agentId) return null
  return (
    <div className="agency-rules" data-testid="agency-rules">
      <div className="flex items-center gap-2">
        <p className="field-hint mt-0 flex-1">{t('agency.rules.lead')}</p>
        <button type="button" className="btn btn-secondary btn-sm" data-testid="agency-rule-new" onClick={() => setForm('new')}>
          <Plus size={13} aria-hidden="true" /> {t('agency.rules.new')}
        </button>
      </div>
      <RuleForm
        agentId={agentId}
        open={form !== null}
        rule={form === 'new' ? null : form}
        deliverEnabled={deliverEnabled}
        onClose={() => setForm(null)}
        onSaved={(task, created) => {
          toast.success(t(created ? 'agency.rules.created' : 'agency.rules.saved', { name: task.name }))
          window.dispatchEvent(new Event(SCHEDULES_CHANGED_EVENT))
          void reload()
        }}
      />

      {loaded && rules.length === 0 && (
        <p className="dock-empty-line">{t('agency.rules.empty')}</p>
      )}

      {rules.map((rule) => {
        const open = history[rule.id] === true
        return (
          <article key={rule.id} className="agency-rule" data-testid="agency-rule" data-enabled={rule.enabled || undefined}>
            <header className="agency-rule-head">
              <Zap size={14} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate font-semibold">{rule.name}</span>
              <NotifyMark notify={rule.notify} />
              <span className="r-chip" data-tone={rule.enabled ? 'success' : undefined}>
                {rule.enabled ? t('agency.rules.active') : t('agency.rules.paused')}
              </span>
            </header>
            <RuleParts rule={rule} />
            {rule.last_run && (
              <p className="field-hint">
                {t('agency.rules.lastRun', {
                  status: t(`schedules.status.${rule.last_run.status}` as I18nKey),
                  when: formatWhen(rule.last_run.started_at, locale),
                })}
                {rule.last_run.reason ? ` · ${rule.last_run.reason}` : ''}
              </p>
            )}
            <footer className="agency-rule-actions">
              <button type="button" className="btn btn-quiet btn-xs" disabled={busy} onClick={() => void act(() => engineApi.scheduleDelete(rule.id))} aria-label={`${t('agency.rules.delete')} · ${rule.name}`} title={t('agency.rules.delete')}>
                <Trash2 size={13} aria-hidden="true" />
              </button>
              <button type="button" className="btn btn-quiet btn-xs" onClick={() => setForm(rule)} aria-label={`${t('agency.rules.edit')} · ${rule.name}`} title={t('agency.rules.edit')} data-testid="agency-rule-edit">
                <Pencil size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={cn('btn btn-quiet btn-xs agency-rule-history-toggle', open && 'is-open')}
                aria-expanded={open}
                onClick={() => setHistory((current) => ({ ...current, [rule.id]: !open }))}
                data-testid="agency-rule-history"
              >
                <History size={13} aria-hidden="true" /> {t('agency.rules.history')}
                <ChevronDown size={12} aria-hidden="true" className="agency-rule-chevron" />
              </button>
              <span className="flex-1" />
              {canRehearse && rule.kind === 'tool' && <RehearseButton proposal={ruleInput(rule)} />}
              <button type="button" className="btn btn-ghost btn-xs" disabled={busy} onClick={() => void act(() => engineApi.scheduleUpdate(rule.id, { enabled: !rule.enabled }))}>
                {rule.enabled ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
                {rule.enabled ? t('agency.rules.pause') : t('agency.rules.resume')}
              </button>
              <button type="button" className="btn btn-secondary btn-xs" disabled={busy} onClick={() => void act(() => engineApi.scheduleRunNow(rule.id))}>
                {t('agency.rules.runNow')}
              </button>
            </footer>
            {open && <RuleRuns rule={rule} agentId={agentId} />}
          </article>
        )
      })}
    </div>
  )
}
