import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, BookOpen, Pencil, Play, Plus, Repeat, Square, Trash2, Workflow, X } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n, type I18nKey } from '../../i18n'
import { Select } from '../../components/ui/select'
import { commandMessage, engineApi, onEngineEvent, type ScheduleSpec } from '../../services/engine'
import ScheduleSpecField from '../schedules/ScheduleSpecField'
import { describeSchedule, formatWhen, runTone, RUN_STATUS_KEYS, specProblem } from '../schedules/scheduleModel'
import AgentAvatar from './AgentAvatar'
import { useAgencyData } from './AgencyData'
import { useTeamEvents } from './Board'
import type { AgencyAgent, AgencyFlow, FlowApproval, FlowInput, FlowRun, TeamOverview, TeamRoutine } from './types'

const MAX_MANUAL = 20000
const MAX_TEXT = 8000
const RELOAD_DEBOUNCE_MS = 250
const APPROVALS: FlowApproval[] = ['auto', 'chief', 'owner']
const APPROVAL_KEYS: Record<FlowApproval, I18nKey> = {
  auto: 'agency.flow.approval.auto',
  chief: 'agency.flow.approval.chief',
  owner: 'agency.flow.approval.owner',
}
const RUN_TONES: Record<FlowRun['status'], string | undefined> = { running: 'accent', done: 'success', cancelled: undefined }
const RUN_KEYS: Record<FlowRun['status'], I18nKey> = {
  running: 'agency.flow.run.running',
  done: 'agency.flow.run.done',
  cancelled: 'agency.flow.run.cancelled',
}

/**
 * El equipo en una llamada (`agency.team.overview`), al día con los eventos de
 * su oficina, de su pizarra y de las reglas (una rutina que corre o termina).
 */
export function useTeamOverview(teamId: string | null) {
  const [overview, setOverview] = useState<TeamOverview | null>(null)
  const seq = useRef(0)
  const reload = useCallback(async () => {
    if (!teamId) return
    const mine = ++seq.current
    try {
      const next = await engineApi.agencyTeamOverview(teamId)
      if (mine === seq.current) setOverview(next)
    } catch {
      // Un equipo que se acaba de borrar: el panel se cierra con él.
    }
  }, [teamId])
  useTeamEvents(teamId, reload)
  useEffect(() => {
    if (!teamId) return
    let stop: (() => void) | undefined
    let disposed = false
    let timer: number | undefined
    void onEngineEvent((event) => {
      if (!event.event.startsWith('schedule.')) return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void reload(), RELOAD_DEBOUNCE_MS)
    }).then((unlisten) => {
      if (disposed) unlisten()
      else stop = unlisten
    })
    return () => {
      disposed = true
      window.clearTimeout(timer)
      stop?.()
    }
  }, [reload, teamId])
  return { overview, reload }
}

function useMembers(overview: TeamOverview | null): AgencyAgent[] {
  const { agents } = useAgencyData()
  if (!overview) return []
  return overview.team.members
    .map((id) => agents.find((agent) => agent.id === id))
    .filter((agent): agent is AgencyAgent => Boolean(agent))
}

/** El manual del equipo: su procedimiento, que cada puesto lee en cada turno. */
function ManualSection({ overview, onSaved }: { overview: TeamOverview; onSaved: () => void }) {
  const { t } = useI18n()
  const saved = overview.team.manual ?? ''
  const [text, setText] = useState(saved)
  const [saving, setSaving] = useState(false)
  const dirty = text !== saved
  // Lo que llega del Engine (el jefe o la ficha lo cambiaron) sin pisar lo que el dueño escribe.
  const previous = useRef(saved)
  useEffect(() => {
    setText((current) => (current === previous.current ? saved : current))
    previous.current = saved
  }, [saved])
  const save = async () => {
    setSaving(true)
    try {
      await engineApi.agencyUpdateTeam(overview.team.id, { manual: text.trim() })
      toast.success(t('agency.work.manual.saved'))
      onSaved()
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setSaving(false)
    }
  }
  return (
    <section className="office-panel-section" data-testid="agency-work-manual">
      <h3>{t('agency.work.manual')}</h3>
      <p className="field-hint mt-0 mb-2">{t('agency.work.manual.hint')}</p>
      <textarea
        className="field-input min-h-[140px] resize-y leading-relaxed"
        value={text}
        maxLength={MAX_MANUAL}
        placeholder={t('agency.work.manual.placeholder')}
        onChange={(event) => setText(event.target.value)}
        aria-label={t('agency.work.manual')}
        data-testid="agency-work-manual-text"
      />
      {dirty && (
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setText(saved)}>{t('agency.settings.cancel')}</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => void save()} data-testid="agency-work-manual-save">
            {t('agency.work.manual.save')}
          </button>
        </div>
      )}
    </section>
  )
}

interface RoutineDraft { agentId: string; name: string; schedule: ScheduleSpec; prompt: string }

function RoutineForm({ members, draft, onClose, onSaved, teamId }: {
  members: AgencyAgent[]
  draft: RoutineDraft
  onClose: () => void
  onSaved: () => void
  teamId: string
}) {
  const { t } = useI18n()
  const [value, setValue] = useState(draft)
  const [saving, setSaving] = useState(false)
  const problem = !value.agentId
    ? t('agency.work.routine.needAgent')
    : !value.name.trim()
      ? t('schedules.form.needName')
      : !value.prompt.trim()
        ? t('schedules.form.needPrompt')
        : specProblem(value.schedule, t)
  const save = async () => {
    if (problem || saving) return
    setSaving(true)
    try {
      await engineApi.agencyCreateRoutine(teamId, value.agentId, value.name.trim(), value.schedule, value.prompt.trim())
      onSaved()
      onClose()
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="agency-work-form" data-testid="agency-routine-form">
      <div className="grid gap-1.5">
        <span className="field-label mt-0">{t('agency.work.routine.agent')}</span>
        <Select
          value={value.agentId || null}
          label={t('agency.work.routine.agent')}
          placeholder={t('agency.work.routine.pickAgent')}
          options={members.map((agent) => ({ value: agent.id, label: agent.name, detail: agent.role || undefined, icon: <AgentAvatar agent={agent} size={18} /> }))}
          onChange={(agentId) => setValue({ ...value, agentId })}
          testId="agency-routine-agent"
        />
      </div>
      <label className="grid gap-1.5">
        <span className="field-label mt-0">{t('agency.work.routine.name')}</span>
        <input className="field-input" value={value.name} maxLength={80} onChange={(event) => setValue({ ...value, name: event.target.value })} data-testid="agency-routine-name" />
        <span className="field-hint">{t('agency.work.routine.nameHint')}</span>
      </label>
      <ScheduleSpecField spec={value.schedule} onChange={(schedule) => setValue({ ...value, schedule })} />
      <label className="grid gap-1.5">
        <span className="field-label mt-0">{t('agency.work.routine.prompt')}</span>
        <textarea className="field-input min-h-[84px] resize-y leading-relaxed" value={value.prompt} maxLength={MAX_TEXT} onChange={(event) => setValue({ ...value, prompt: event.target.value })} data-testid="agency-routine-prompt" />
      </label>
      {problem && <p className="field-hint mt-0">{problem}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>{t('agency.settings.cancel')}</button>
        <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(problem) || saving} onClick={() => void save()} data-testid="agency-routine-save">
          {t('agency.work.routine.save')}
        </button>
      </div>
    </div>
  )
}

/** Las rutinas: lo que cada agente hace solo cada tanto, en su puesto. */
function RoutinesSection({ overview, members, onSaved }: { overview: TeamOverview; members: AgencyAgent[]; onSaved: () => void }) {
  const { t, lang } = useI18n()
  const locale = lang === 'es' ? 'es' : 'en'
  const [draft, setDraft] = useState<RoutineDraft | null>(null)
  const byId = new Map(members.map((agent) => [agent.id, agent]))
  return (
    <section className="office-panel-section" data-testid="agency-work-routines">
      <div className="agency-work-head">
        <h3>{t('agency.work.routines', { n: overview.routines.length })}</h3>
        {!draft && (
          <button
            type="button"
            className="btn btn-quiet btn-xs"
            // The chief, while it is in the team (one that left would only fail on save).
            onClick={() => setDraft({ agentId: (byId.has(overview.team.chief_agent_id ?? '') ? overview.team.chief_agent_id : members[0]?.id) ?? '', name: '', schedule: { kind: 'interval', minutes: 60 }, prompt: '' })}
            data-testid="agency-routine-new"
          >
            <Plus size={12} aria-hidden="true" /> {t('agency.work.routine.new')}
          </button>
        )}
      </div>
      {draft && <RoutineForm members={members} draft={draft} teamId={overview.team.id} onClose={() => setDraft(null)} onSaved={onSaved} />}
      {overview.routines.length === 0 && !draft ? (
        <p className="field-hint mt-0">{t('agency.work.routines.empty')}</p>
      ) : (
        <ul className="agency-work-list">
          {overview.routines.map((routine: TeamRoutine) => {
            const agent = routine.agent_id ? byId.get(routine.agent_id) ?? null : null
            return (
              <li key={routine.id} className="agency-work-item" data-testid="agency-routine">
                <div className="agency-work-item-head">
                  {agent ? <AgentAvatar agent={agent} size={20} /> : <Repeat size={14} aria-hidden="true" />}
                  <span className="min-w-0 flex-1 truncate font-medium text-[var(--text)]">{routine.name}</span>
                  {!routine.enabled && <span className="r-chip">{t('agency.work.routine.paused')}</span>}
                  {routine.last && <span className="r-chip" data-tone={toneOf(runTone(routine.last.status))}>{t(RUN_STATUS_KEYS[routine.last.status])}</span>}
                  <button
                    type="button"
                    className="btn btn-quiet btn-icon btn-xs"
                    aria-label={t('agency.work.routine.edit')}
                    title={t('agency.work.routine.edit')}
                    onClick={() => setDraft({ agentId: routine.agent_id ?? '', name: routine.name, schedule: routine.schedule, prompt: routine.prompt })}
                  >
                    <Pencil size={12} aria-hidden="true" />
                  </button>
                </div>
                <p className="agency-work-item-line">
                  {[agent?.name ?? routine.agent, describeSchedule(routine.schedule, t, locale)].filter(Boolean).join(' · ')}
                </p>
                {routine.enabled && routine.next_run_at && (
                  <p className="agency-work-item-line">{t('agency.work.routine.next', { when: formatWhen(routine.next_run_at, locale) })}</p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function toneOf(tone: ReturnType<typeof runTone>): string | undefined {
  if (tone === 'ok') return 'success'
  if (tone === 'warn') return 'warning'
  if (tone === 'bad') return 'danger'
  if (tone === 'live') return 'accent'
  return undefined
}

function emptyStep(): FlowInput['steps'][number] {
  return { name: '', agents: [], instructions: '', approval: 'chief' }
}

/** Crear o editar un flujo: sus pasos en orden, quién hace cada uno y quién lo aprueba. */
function FlowEditor({ teamId, members, flow, onClose, onSaved }: {
  teamId: string
  members: AgencyAgent[]
  flow: AgencyFlow | null
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useI18n()
  const [name, setName] = useState(flow?.name ?? '')
  const [description, setDescription] = useState(flow?.description ?? '')
  const [steps, setSteps] = useState<FlowInput['steps']>(
    flow ? flow.steps.map(({ name: stepName, agents, instructions, approval }) => ({ name: stepName, agents, instructions, approval })) : [emptyStep()],
  )
  const [saving, setSaving] = useState(false)
  const problem = !name.trim()
    ? t('agency.flow.needName')
    : steps.some((step) => !step.name.trim())
      ? t('agency.flow.needStepName')
      : steps.some((step) => step.agents.length === 0)
        ? t('agency.flow.needStepAgents')
        : null
  const setStep = (index: number, patch: Partial<FlowInput['steps'][number]>) =>
    setSteps((current) => current.map((step, at) => (at === index ? { ...step, ...patch } : step)))
  const move = (index: number, by: number) =>
    setSteps((current) => {
      const next = [...current]
      const [step] = next.splice(index, 1)
      next.splice(index + by, 0, step)
      return next
    })
  const save = async () => {
    if (problem || saving) return
    setSaving(true)
    try {
      await engineApi.agencySaveFlow(teamId, {
        ...(flow ? { id: flow.id } : {}),
        name: name.trim(),
        description: description.trim(),
        steps: steps.map((step) => ({ ...step, name: step.name.trim(), instructions: step.instructions.trim() })),
      })
      onSaved()
      onClose()
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="agency-work-form" data-testid="agency-flow-editor">
      <label className="grid gap-1.5">
        <span className="field-label mt-0">{t('agency.flow.name')}</span>
        <input className="field-input" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} data-testid="agency-flow-name" />
      </label>
      <label className="grid gap-1.5">
        <span className="field-label mt-0">{t('agency.flow.description')}</span>
        <textarea className="field-input min-h-[56px] resize-y leading-relaxed" value={description} maxLength={MAX_TEXT} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <ol className="agency-flow-steps">
        {steps.map((step, index) => (
          <li key={index} className="agency-flow-step" data-testid="agency-flow-step">
            <div className="agency-work-item-head">
              <span className="agency-flow-step-n">{index + 1}</span>
              <input
                className="field-input min-w-0 flex-1"
                value={step.name}
                maxLength={80}
                placeholder={t('agency.flow.stepName')}
                aria-label={t('agency.flow.stepName')}
                onChange={(event) => setStep(index, { name: event.target.value })}
                data-testid="agency-flow-step-name"
              />
              <button type="button" className="btn btn-quiet btn-icon btn-xs" disabled={index === 0} aria-label={t('agency.flow.up')} title={t('agency.flow.up')} onClick={() => move(index, -1)}><ArrowUp size={12} aria-hidden="true" /></button>
              <button type="button" className="btn btn-quiet btn-icon btn-xs" disabled={index === steps.length - 1} aria-label={t('agency.flow.down')} title={t('agency.flow.down')} onClick={() => move(index, 1)}><ArrowDown size={12} aria-hidden="true" /></button>
              <button type="button" className="btn btn-quiet btn-icon btn-xs" disabled={steps.length === 1} aria-label={t('agency.flow.removeStep')} title={t('agency.flow.removeStep')} onClick={() => setSteps((current) => current.filter((_, at) => at !== index))}><X size={12} aria-hidden="true" /></button>
            </div>
            <div className="agency-flow-agents" role="group" aria-label={t('agency.flow.who')}>
              {members.map((agent) => (
                <label key={agent.id} className="agency-flow-agent">
                  <input
                    type="checkbox"
                    className="r-checkbox"
                    checked={step.agents.includes(agent.id)}
                    onChange={(event) => setStep(index, { agents: event.target.checked ? [...step.agents, agent.id] : step.agents.filter((id) => id !== agent.id) })}
                    data-testid="agency-flow-step-agent"
                  />
                  <AgentAvatar agent={agent} size={16} />
                  <span className="truncate">{agent.name}</span>
                </label>
              ))}
            </div>
            <textarea
              className="field-input min-h-[56px] resize-y leading-relaxed"
              value={step.instructions}
              maxLength={MAX_TEXT}
              placeholder={t('agency.flow.instructions')}
              aria-label={t('agency.flow.instructions')}
              onChange={(event) => setStep(index, { instructions: event.target.value })}
            />
            <div className="grid gap-1.5">
              <span className="field-label mt-0">{t('agency.flow.approval')}</span>
              <Select
                value={step.approval}
                label={t('agency.flow.approval')}
                options={APPROVALS.map((approval) => ({ value: approval, label: t(APPROVAL_KEYS[approval]) }))}
                onChange={(approval) => setStep(index, { approval })}
              />
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn-secondary btn-sm justify-self-start" onClick={() => setSteps((current) => [...current, emptyStep()])} data-testid="agency-flow-add-step">
        <Plus size={12} aria-hidden="true" /> {t('agency.flow.addStep')}
      </button>
      {problem && <p className="field-hint mt-0">{problem}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>{t('agency.settings.cancel')}</button>
        <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(problem) || saving} onClick={() => void save()} data-testid="agency-flow-save">
          {t('agency.flow.save')}
        </button>
      </div>
    </div>
  )
}

function FlowCard({ flow, teamId, onChanged, onEdit }: { flow: AgencyFlow; teamId: string; onChanged: () => void; onEdit: () => void }) {
  const { t } = useI18n()
  const [input, setInput] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const start = async () => {
    setBusy(true)
    try {
      await engineApi.agencyStartFlow(teamId, flow.id, (input ?? '').trim())
      toast.success(t('agency.flow.started', { name: flow.name }))
      setInput(null)
      onChanged()
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    try {
      await engineApi.agencyDeleteFlow(flow.id)
      onChanged()
    } catch (error) {
      toast.error(commandMessage(error))
    }
  }
  return (
    <li className="agency-work-item" data-testid="agency-flow">
      <div className="agency-work-item-head">
        <Workflow size={14} aria-hidden="true" className="text-[var(--accent-2)]" />
        <span className="min-w-0 flex-1 truncate font-medium text-[var(--text)]">{flow.name}</span>
        <button type="button" className="btn btn-quiet btn-icon btn-xs" aria-label={t('agency.flow.edit')} title={t('agency.flow.edit')} onClick={onEdit}><Pencil size={12} aria-hidden="true" /></button>
        {confirmDelete ? (
          // Un segundo clic, sobre un botón que dice lo que hace; al salir de él, se olvida.
          <button type="button" className="btn btn-danger btn-xs" autoFocus onClick={() => void remove()} onBlur={() => setConfirmDelete(false)} data-testid="agency-flow-delete-confirm">
            {t('agency.flow.deleteConfirm')}
          </button>
        ) : (
          <button type="button" className="btn btn-quiet btn-icon btn-xs" aria-label={t('agency.flow.delete')} title={t('agency.flow.delete')} onClick={() => setConfirmDelete(true)} data-testid="agency-flow-delete">
            <Trash2 size={12} aria-hidden="true" />
          </button>
        )}
      </div>
      {flow.description && <p className="agency-work-item-line">{flow.description}</p>}
      <ol className="agency-flow-summary">
        {flow.steps.map((step, index) => (
          <li key={index}>
            <span className="text-[var(--text)]">{step.name}</span>
            {' · '}
            {(step.agent_names ?? step.agents).join(', ')}
            {' · '}
            <span className="text-[var(--text-subtle)]">{t(APPROVAL_KEYS[step.approval])}</span>
          </li>
        ))}
      </ol>
      {input === null ? (
        <button type="button" className="btn btn-secondary btn-sm justify-self-start" onClick={() => setInput('')} data-testid="agency-flow-run">
          <Play size={12} aria-hidden="true" /> {t('agency.flow.run')}
        </button>
      ) : (
        <div className="grid gap-2">
          <textarea
            className="field-input min-h-[56px] resize-y leading-relaxed"
            value={input}
            maxLength={MAX_TEXT}
            autoFocus
            placeholder={t('agency.flow.inputPlaceholder')}
            aria-label={t('agency.flow.input')}
            onChange={(event) => setInput(event.target.value)}
            data-testid="agency-flow-input"
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setInput(null)}>{t('agency.settings.cancel')}</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void start()} data-testid="agency-flow-start">
              <Play size={12} aria-hidden="true" /> {t('agency.flow.start')}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

/** Los flujos y sus corridas: pasos que se pasan el trabajo en orden. */
function FlowsSection({ overview, members, onChanged }: { overview: TeamOverview; members: AgencyAgent[]; onChanged: () => void }) {
  const { t, lang } = useI18n()
  const locale = lang === 'es' ? 'es' : 'en'
  const [editing, setEditing] = useState<AgencyFlow | 'new' | null>(null)
  const cancel = async (run: FlowRun) => {
    try {
      await engineApi.agencyCancelFlowRun(run.id)
      onChanged()
    } catch (error) {
      toast.error(commandMessage(error))
    }
  }
  return (
    <>
      <section className="office-panel-section" data-testid="agency-work-flows">
        <div className="agency-work-head">
          <h3>{t('agency.work.flows', { n: overview.flows.length })}</h3>
          {!editing && (
            <button type="button" className="btn btn-quiet btn-xs" onClick={() => setEditing('new')} data-testid="agency-flow-new">
              <Plus size={12} aria-hidden="true" /> {t('agency.flow.new')}
            </button>
          )}
        </div>
        {editing && (
          <FlowEditor
            key={editing === 'new' ? 'new' : editing.id}
            teamId={overview.team.id}
            members={members}
            flow={editing === 'new' ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={onChanged}
          />
        )}
        {overview.flows.length === 0 && !editing ? (
          <p className="field-hint mt-0">{t('agency.work.flows.empty')}</p>
        ) : (
          <ul className="agency-work-list">
            {overview.flows.map((flow) => (
              <FlowCard key={flow.id} flow={flow} teamId={overview.team.id} onChanged={onChanged} onEdit={() => setEditing(flow)} />
            ))}
          </ul>
        )}
      </section>
      {overview.runs.length > 0 && (
        <section className="office-panel-section" data-testid="agency-work-runs">
          <h3>{t('agency.work.runs')}</h3>
          <ul className="agency-work-list">
            {overview.runs.map((run) => (
              <li key={run.id} className="agency-work-item" data-testid="agency-flow-run-item">
                <div className="agency-work-item-head">
                  <span className="min-w-0 flex-1 truncate text-[var(--text)]">{run.flow ?? t('agency.flow.gone')}</span>
                  <span className="r-chip" data-tone={RUN_TONES[run.status]}>{t(RUN_KEYS[run.status])}</span>
                  {run.status === 'running' && (
                    <button type="button" className="btn btn-quiet btn-icon btn-xs" aria-label={t('agency.flow.cancel')} title={t('agency.flow.cancel')} onClick={() => void cancel(run)} data-testid="agency-flow-cancel">
                      <Square size={11} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <p className="agency-work-item-line">
                  {run.status === 'running' && run.step_name
                    ? t('agency.flow.run.at', { n: run.step + 1, total: run.steps, step: run.step_name })
                    : formatWhen(run.finished_at ?? run.created_at, locale)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

/**
 * «Trabajo» en el panel lateral de la oficina (replanteo, fases 2 a 4): el
 * manual del equipo, sus rutinas, sus flujos y las corridas de esos flujos.
 */
export function TeamWorkPanel({ teamId }: { teamId: string }) {
  const { t } = useI18n()
  const { overview, reload } = useTeamOverview(teamId)
  const members = useMembers(overview)
  if (!overview) return null
  return (
    <div className="office-panel" data-testid="agency-team-work">
      <div className="office-panel-body">
        <p className="office-panel-lead"><BookOpen size={14} aria-hidden="true" />{t('agency.work.lead')}</p>
        <ManualSection overview={overview} onSaved={() => void reload()} />
        <RoutinesSection overview={overview} members={members} onSaved={() => void reload()} />
        <FlowsSection overview={overview} members={members} onChanged={() => void reload()} />
      </div>
    </div>
  )
}
