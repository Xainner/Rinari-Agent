import { useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle, ArrowDown, ArrowUp, ChevronDown, Clock, Crown, Eye, FolderGit2, FolderOpen, FolderPlus, Lightbulb, MoreHorizontal,
  Plug, Plus, RotateCcw, ScrollText, ShieldAlert, Trash2, UserCheck, UserPlus, Users, Workflow, Wrench, X,
} from 'lucide-react'
import { useI18n, type I18nKey } from '../../../i18n'
import { cn } from '../../../lib/utils'
import type { McpCatalogEntry, ModelSummary, ProviderSummary } from '../../../services/engine'
import { useUIStore } from '../../../stores/ui'
import ModelPicker from '../../../components/composer/ModelPicker'
import { Select } from '../../../components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu'
import { ConnectorLogo } from '../../connectors/ConnectorLogo'
import { SegChoice } from '../../connectors/SegChoice'
import { useFolderPicker } from '../../remote/useFolderPicker'
import AgentAvatar from '../AgentAvatar'
import { EditorSection } from '../AgencyEditor'
import type { ConnectorMark } from '../useConnectorDirectory'
import type { AgentPermissionProfile, FlowApproval, PlanAgent, PlanPending, PlanUse, TeamPlan } from '../types'
import RoutineWhen from './RoutineWhen'
import {
  addAgent, addRoutine, addStep, addUse, moveStep, pieceKey, removeAgent, removeRoutine, removeStep, removeUse, setFlow,
  updateAgent, updateRoutine, updateStep,
} from './planEdit'

const PROFILES: AgentPermissionProfile[] = ['read-only', 'workspace', 'full-access']
const APPROVALS: FlowApproval[] = ['auto', 'chief', 'owner']
const PROFILE_ICON = { 'read-only': Eye, workspace: FolderOpen, 'full-access': ShieldAlert } as const

export interface ReviewContext {
  marks: ConnectorMark[]
  catalog: McpCatalogEntry[]
  /** Estado de cada conector del dueño ahora (`agency.team.check`). */
  connectorStatus: Record<string, string>
  pending: PlanPending[]
  models: ModelSummary[]
  providers: ProviderSummary[]
}

/**
 * La propuesta, editable en su sitio: el equipo, sus agentes (con lo que usa
 * cada uno y si se reutiliza uno del dueño), su flujo, sus rutinas, sus
 * carpetas y su manual. Nada se crea aquí: eso es «Crear equipo».
 */
export default function PlanReview({ plan, onChange, context }: {
  plan: TeamPlan
  onChange: (next: TeamPlan) => void
  context: ReviewContext
}) {
  const { t } = useI18n()
  const agentName = (key: string | null) => plan.agents.find((agent) => agent.key === key)?.name || t('agency.builder.agentUnnamed')

  return (
    <>
      <EditorSection icon={Users} title={t('agency.builder.agents')} hint={t('agency.builder.agentsHint')} testId="team-builder-agents">
        <div className="team-builder-agents">
          {plan.agents.map((agent) => (
            <AgentCard
              key={agent.key}
              agent={agent}
              chief={plan.team.chief === agent.key}
              only={plan.agents.length === 1}
              context={context}
              onChange={(patch) => onChange(updateAgent(plan, agent.key, patch))}
              onChief={() => onChange({ ...plan, team: { ...plan.team, chief: agent.key } })}
              onRemove={() => onChange(removeAgent(plan, agent.key))}
              onRemoveUse={(use) => onChange(removeUse(plan, agent.key, use))}
              onAddUse={(use) => onChange(addUse(plan, agent.key, use))}
            />
          ))}
        </div>
        <div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange(addAgent(plan, ''))} data-testid="team-builder-add-agent">
            <UserPlus size={13} aria-hidden="true" /> {t('agency.builder.addAgent')}
          </button>
        </div>
      </EditorSection>

      <EditorSection icon={Workflow} title={t('agency.builder.flow')} hint={t('agency.builder.flowHint')} testId="team-builder-flow">
        {plan.flow ? (
          <>
            <div className="team-builder-flow-head">
              <input
                className="field-input"
                value={plan.flow.name}
                maxLength={80}
                aria-label={t('agency.builder.flowName')}
                placeholder={t('agency.builder.flowName')}
                onChange={(event) => onChange(setFlow(plan, { ...plan.flow!, name: event.target.value }))}
              />
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => onChange(setFlow(plan, null))}>
                <Trash2 size={13} aria-hidden="true" /> {t('agency.builder.flowRemove')}
              </button>
            </div>
            <ol className="team-builder-steps">
              {plan.flow.steps.map((step, index) => (
                <li key={index} className="team-builder-step" data-testid="team-builder-step">
                  <span className="team-builder-step-num" aria-hidden="true">{index + 1}</span>
                  <div className="team-builder-step-card">
                    <div className="team-builder-step-top">
                      <input
                        className="team-builder-step-name"
                        value={step.name}
                        maxLength={80}
                        aria-label={t('agency.builder.stepName', { n: index + 1 })}
                        placeholder={t('agency.builder.stepName', { n: index + 1 })}
                        onChange={(event) => onChange(updateStep(plan, index, { name: event.target.value }))}
                      />
                      <div className="team-builder-icon-row">
                        <button type="button" className="btn btn-quiet btn-icon btn-xs" disabled={index === 0} aria-label={t('agency.builder.stepUp')} title={t('agency.builder.stepUp')} onClick={() => onChange(moveStep(plan, index, -1))}>
                          <ArrowUp size={13} aria-hidden="true" />
                        </button>
                        <button type="button" className="btn btn-quiet btn-icon btn-xs" disabled={index === plan.flow!.steps.length - 1} aria-label={t('agency.builder.stepDown')} title={t('agency.builder.stepDown')} onClick={() => onChange(moveStep(plan, index, 1))}>
                          <ArrowDown size={13} aria-hidden="true" />
                        </button>
                        <button type="button" className="btn btn-quiet btn-icon btn-xs" aria-label={t('agency.builder.stepRemove')} title={t('agency.builder.stepRemove')} onClick={() => onChange(removeStep(plan, index))}>
                          <X size={13} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <div className="team-builder-who" role="group" aria-label={t('agency.builder.stepWho')}>
                      {plan.agents.map((agent) => {
                        const on = step.agents.includes(agent.key)
                        return (
                          <button
                            key={agent.key}
                            type="button"
                            className="team-builder-who-chip"
                            aria-pressed={on}
                            onClick={() => onChange(updateStep(plan, index, {
                              agents: on ? step.agents.filter((key) => key !== agent.key) : [...step.agents, agent.key],
                            }))}
                          >
                            <AgentAvatar agent={{ id: agent.reuse ? agent.reuse_agent_id ?? agent.key : agent.key, name: agent.name }} size={18} />
                            <span className="truncate">{agent.name || t('agency.builder.agentUnnamed')}</span>
                          </button>
                        )
                      })}
                    </div>
                    {step.agents.length === 0 && <p className="team-builder-warn"><AlertTriangle size={12} aria-hidden="true" /> {t('agency.builder.stepNobody')}</p>}
                    <textarea
                      className="field-input agency-instructions is-short"
                      value={step.instructions}
                      maxLength={8000}
                      aria-label={t('agency.builder.stepInstructions')}
                      placeholder={t('agency.builder.stepInstructions')}
                      onChange={(event) => onChange(updateStep(plan, index, { instructions: event.target.value }))}
                    />
                    <div className="team-builder-step-foot">
                      <span className="team-builder-mini-label">{t('agency.builder.approval')}</span>
                      <Select<FlowApproval>
                        compact
                        value={step.approval}
                        label={t('agency.builder.approval')}
                        options={APPROVALS.map((value) => ({ value, label: t(`agency.builder.approval.${value}` as I18nKey) }))}
                        onChange={(value) => onChange(updateStep(plan, index, { approval: value }))}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onChange(addStep(plan, { name: '', agents: [plan.team.chief], instructions: '', approval: 'auto' }))}
                data-testid="team-builder-add-step"
              >
                <Plus size={13} aria-hidden="true" /> {t('agency.builder.addStep')}
              </button>
            </div>
          </>
        ) : (
          <div className="team-builder-empty">
            <p>{t('agency.builder.noFlow', { chief: agentName(plan.team.chief) })}</p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onChange(addStep(plan, { name: '', agents: [plan.team.chief], instructions: '', approval: 'auto' }))}
            >
              <Plus size={13} aria-hidden="true" /> {t('agency.builder.addFlow')}
            </button>
          </div>
        )}
      </EditorSection>

      <EditorSection icon={Clock} title={t('agency.builder.routines')} hint={t('agency.builder.routinesHint')} testId="team-builder-routines">
        {plan.routines.length === 0 && <p className="field-hint mt-0">{t('agency.builder.noRoutines')}</p>}
        {plan.routines.map((routine, index) => (
          <div key={index} className="team-builder-routine" data-testid="team-builder-routine">
            <div className="team-builder-step-top">
              <input
                className="team-builder-step-name"
                value={routine.name}
                maxLength={80}
                aria-label={t('agency.builder.routineName')}
                placeholder={t('agency.builder.routineName')}
                onChange={(event) => onChange(updateRoutine(plan, index, { name: event.target.value }))}
              />
              <button type="button" className="btn btn-quiet btn-icon btn-xs" aria-label={t('agency.builder.routineRemove')} title={t('agency.builder.routineRemove')} onClick={() => onChange(removeRoutine(plan, index))}>
                <X size={13} aria-hidden="true" />
              </button>
            </div>
            <RoutineWhen spec={routine.schedule} onChange={(schedule) => onChange(updateRoutine(plan, index, { schedule }))} />
            {plan.flow && (
              <SegChoice<'flow' | 'agent'>
                small
                label={t('agency.builder.routineWhat')}
                value={routine.starts_flow ? 'flow' : 'agent'}
                options={[
                  { value: 'flow', label: t('agency.builder.routineFlow') },
                  { value: 'agent', label: t('agency.builder.routineAgent') },
                ]}
                onChange={(value) => onChange(updateRoutine(plan, index, value === 'flow'
                  ? { starts_flow: true, agent: null }
                  : { starts_flow: false, agent: routine.agent ?? plan.team.chief }))}
              />
            )}
            {routine.starts_flow ? (
              <textarea
                className="field-input agency-instructions is-short"
                value={routine.input}
                maxLength={8000}
                aria-label={t('agency.builder.routineInput')}
                placeholder={t('agency.builder.routineInput')}
                onChange={(event) => onChange(updateRoutine(plan, index, { input: event.target.value }))}
              />
            ) : (
              <>
                <div className="team-builder-step-foot">
                  <span className="team-builder-mini-label">{t('agency.builder.routineWho')}</span>
                  <Select<string>
                    compact
                    value={routine.agent}
                    label={t('agency.builder.routineWho')}
                    placeholder={t('agency.builder.routineWho')}
                    options={plan.agents.map((agent) => ({
                      value: agent.key,
                      label: agent.name || t('agency.builder.agentUnnamed'),
                      icon: <AgentAvatar agent={{ id: agent.reuse ? agent.reuse_agent_id ?? agent.key : agent.key, name: agent.name }} size={16} />,
                    }))}
                    onChange={(value) => onChange(updateRoutine(plan, index, { agent: value }))}
                  />
                </div>
                <textarea
                  className="field-input agency-instructions is-short"
                  value={routine.prompt}
                  maxLength={8000}
                  aria-label={t('agency.builder.routinePrompt')}
                  placeholder={t('agency.builder.routinePrompt')}
                  onChange={(event) => onChange(updateRoutine(plan, index, { prompt: event.target.value }))}
                />
              </>
            )}
          </div>
        ))}
        <div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange(addRoutine(plan, ''))} data-testid="team-builder-add-routine">
            <Plus size={13} aria-hidden="true" /> {t('agency.builder.addRoutine')}
          </button>
        </div>
      </EditorSection>

      <Folders plan={plan} onChange={onChange} />

      <EditorSection icon={ScrollText} title={t('agency.builder.manual')} hint={t('agency.builder.manualHint')}>
        <textarea
          className="field-input agency-instructions"
          value={plan.team.manual}
          maxLength={20000}
          aria-label={t('agency.builder.manual')}
          placeholder={t('agency.builder.manualPlaceholder')}
          onChange={(event) => onChange({ ...plan, team: { ...plan.team, manual: event.target.value } })}
        />
        {plan.assumptions.length > 0 && (
          <div className="team-builder-assumptions" data-testid="team-builder-assumptions">
            <p className="team-builder-mini-label"><Lightbulb size={12} aria-hidden="true" /> {t('agency.builder.assumptions')}</p>
            <ul>
              {plan.assumptions.map((item, index) => (
                <li key={`${index}:${item}`}>
                  <span className="min-w-0 flex-1">{item}</span>
                  <button
                    type="button"
                    className="btn btn-quiet btn-icon btn-xs"
                    aria-label={t('agency.builder.assumptionRemove')}
                    title={t('agency.builder.assumptionRemove')}
                    onClick={() => onChange({ ...plan, assumptions: plan.assumptions.filter((_, at) => at !== index) })}
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </EditorSection>
    </>
  )
}

function AgentCard({ agent, chief, only, context, onChange, onChief, onRemove, onRemoveUse, onAddUse }: {
  agent: PlanAgent
  chief: boolean
  only: boolean
  context: ReviewContext
  onChange: (patch: Partial<PlanAgent>) => void
  onChief: () => void
  onRemove: () => void
  onRemoveUse: (use: PlanUse) => void
  onAddUse: (use: PlanUse) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const reused = Boolean(agent.reuse_agent_id) && agent.reuse === true
  const deciding = Boolean(agent.reuse_agent_id) && (agent.reuse === null || agent.reuse === undefined)
  const avatar = { id: reused ? agent.reuse_agent_id! : agent.key, name: agent.name }
  const chosenModel = agent.model ? context.models.find((item) => item.id === agent.model) ?? null : null
  const free = context.marks.filter((mark) => !agent.uses.some((use) => use.kind === 'connector' && use.name === mark.name))

  return (
    <article className={cn('team-builder-agent', chief && 'is-chief', deciding && 'is-deciding')} data-testid="team-builder-agent" data-key={agent.key}>
      <header className="team-builder-agent-head">
        <AgentAvatar agent={avatar} size={40} />
        <div className="min-w-0 flex-1">
          <input
            className="team-builder-agent-name"
            value={agent.name}
            maxLength={60}
            disabled={reused}
            aria-label={t('agency.form.name')}
            placeholder={t('agency.builder.agentNamePlaceholder')}
            onChange={(event) => onChange({ name: event.target.value })}
          />
          <input
            className="team-builder-agent-role"
            value={agent.role}
            maxLength={120}
            disabled={reused}
            aria-label={t('agency.form.role')}
            placeholder={t('agency.form.rolePlaceholder')}
            onChange={(event) => onChange({ role: event.target.value })}
          />
        </div>
        <button
          type="button"
          className="agency-chief-toggle"
          aria-pressed={chief}
          onClick={onChief}
          title={chief ? t('agency.builder.chiefIs') : t('agency.builder.chiefMake')}
          data-testid="team-builder-chief"
        >
          <Crown size={12} aria-hidden="true" /> {chief ? t('agency.builder.chief') : t('agency.builder.chiefMakeShort')}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="btn btn-quiet btn-icon btn-xs" aria-label={t('agency.builder.agentMenu', { name: agent.name })}>
              <MoreHorizontal size={14} aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={only} onSelect={onRemove}>
              <Trash2 size={13} aria-hidden="true" /> {t('agency.builder.agentRemove')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {agent.reuse_agent_id && (
        <div className={cn('team-builder-reuse', deciding && 'is-open')} data-testid="team-builder-reuse">
          <UserCheck size={14} aria-hidden="true" />
          <p className="min-w-0">
            {agent.reuse_named
              ? t('agency.builder.reuseNamed', { name: agent.reuse_name ?? '' })
              : t('agency.builder.reuseSuggested', { name: agent.reuse_name ?? '' })}
          </p>
          <SegChoice<'reuse' | 'new'>
            small
            label={t('agency.builder.reuseChoice')}
            value={agent.reuse === true ? 'reuse' : agent.reuse === false ? 'new' : null}
            options={[
              { value: 'reuse', label: t('agency.builder.reuseYes', { name: agent.reuse_name ?? '' }) },
              { value: 'new', label: t('agency.builder.reuseNo') },
            ]}
            onChange={(value) => onChange(value === 'reuse'
              ? { reuse: true, name: agent.reuse_name ?? agent.name }
              : { reuse: false })}
          />
        </div>
      )}
      {reused && <p className="field-hint mt-0">{t('agency.builder.reuseKeeps')}</p>}

      <div className="team-builder-uses" aria-label={t('agency.builder.uses')}>
        {agent.uses.map((use) => <UseChip key={pieceKey(use)} use={use} context={context} onRemove={() => onRemoveUse(use)} />)}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="team-builder-use-add" aria-label={t('agency.builder.useAdd')} title={t('agency.builder.useAdd')}>
              <Plus size={12} aria-hidden="true" /> {agent.uses.length === 0 ? t('agency.builder.useAdd') : null}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="team-builder-use-menu">
            <DropdownMenuLabel>{t('agency.builder.useYours')}</DropdownMenuLabel>
            {free.length === 0 && <DropdownMenuItem disabled>{t('agency.builder.useNone')}</DropdownMenuItem>}
            {free.map((mark) => (
              <DropdownMenuItem key={mark.name} onSelect={() => onAddUse({ kind: 'connector', name: mark.name })}>
                <ConnectorLogo name={mark.label} logo={mark.logo} tone={mark.tone} size={18} /> {mark.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => useUIStore.getState().goSettings('mcp')}>
              <Plug size={13} aria-hidden="true" /> {t('agency.builder.useConnectMore')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <button type="button" className="team-builder-more" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <ChevronDown size={13} aria-hidden="true" className={cn('transition-transform', open && 'rotate-180')} />
        {t('agency.builder.agentDetails')}
        <span className="team-builder-more-hint">{t(`agency.form.autonomy.${agent.permission_profile}` as I18nKey)}</span>
      </button>
      {open && (
        <div className="team-builder-agent-details">
          <textarea
            className="field-input agency-instructions"
            value={agent.instructions}
            maxLength={8000}
            disabled={reused}
            aria-label={t('agency.form.instructions')}
            placeholder={t('agency.form.instructionsPlaceholder')}
            onChange={(event) => onChange({ instructions: event.target.value })}
          />
          {!reused && (
            <div className="team-builder-detail-row">
              <span className="team-builder-mini-label">{t('agency.form.autonomy')}</span>
              <Select<AgentPermissionProfile>
                compact
                value={agent.permission_profile}
                label={t('agency.form.autonomy')}
                options={PROFILES.map((value) => {
                  const ProfileIcon = PROFILE_ICON[value]
                  return {
                    value,
                    label: t(`agency.form.autonomy.${value}` as I18nKey),
                    detail: t(`agency.form.autonomyHint.${value}` as I18nKey),
                    icon: <ProfileIcon size={14} aria-hidden="true" />,
                  }
                })}
                onChange={(value) => onChange({ permission_profile: value })}
              />
            </div>
          )}
          {!reused && (
            <div className="team-builder-detail-row">
              <span className="team-builder-mini-label">{t('agency.form.model')}</span>
              <div className="agency-model-field team-builder-model">
                <ModelPicker
                  models={context.models}
                  providers={context.providers}
                  activeAlias={chosenModel?.alias ?? null}
                  activeModel={chosenModel}
                  missingLabel={t('agency.form.modelDefault')}
                  onUseModel={(item) => onChange({ model: item.id })}
                  onDiscoverModels={() => {}}
                  onOpenProviders={() => useUIStore.getState().goSettings('providers')}
                />
              </div>
              {agent.model && (
                <button type="button" className="btn btn-quiet btn-xs" onClick={() => onChange({ model: null })}>
                  <RotateCcw size={12} aria-hidden="true" /> {t('agency.form.modelUseDefault')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  )
}

function UseChip({ use, context, onRemove }: { use: PlanUse; context: ReviewContext; onRemove: () => void }) {
  const { t } = useI18n()
  let body: ReactNode
  let tone: 'success' | 'warning' | undefined
  let title: string
  if (use.kind === 'connector') {
    const mark = context.marks.find((item) => item.name === use.name)
    const status = context.connectorStatus[use.name]
    tone = status === 'connected' ? 'success' : undefined
    title = status === 'connected' ? t('agency.builder.useConnected') : t('agency.builder.useYoursIdle')
    body = <><ConnectorLogo name={mark?.label ?? use.name} logo={mark?.logo} tone={mark?.tone ?? 'remote'} size={16} /> {mark?.label ?? use.name}</>
  } else if (use.kind === 'catalog') {
    const entry = context.catalog.find((item) => item.id === use.id)
    tone = 'warning'
    title = t('agency.builder.useToConnect')
    body = <><ConnectorLogo name={entry?.name ?? use.name} logo={entry?.logo} tone={entry?.category ?? 'remote'} size={16} /> {entry?.name ?? use.name}<span className="team-builder-use-note">{t('agency.builder.useToConnectShort')}</span></>
  } else if (use.kind === 'tools') {
    title = t('agency.builder.useTools')
    body = <><Wrench size={12} aria-hidden="true" /> {use.group}</>
  } else {
    tone = 'warning'
    title = t('agency.builder.useMissing')
    body = <><AlertTriangle size={12} aria-hidden="true" /> {use.need}</>
  }
  return (
    <span className="r-chip team-builder-use" data-tone={tone} data-kind={use.kind} title={title}>
      {body}
      <button type="button" className="team-builder-use-x" aria-label={t('agency.builder.useRemove')} onClick={onRemove}>
        <X size={11} aria-hidden="true" />
      </button>
    </span>
  )
}

function Folders({ plan, onChange }: { plan: TeamPlan; onChange: (next: TeamPlan) => void }) {
  const { t } = useI18n()
  const { pickFolders, dialog } = useFolderPicker()
  const project = plan.team.project_folder
  const work = plan.team.work_folders
  const setTeam = (patch: Partial<TeamPlan['team']>) => onChange({ ...plan, team: { ...plan.team, ...patch } })
  const pick = async (): Promise<string | null> => (await pickFolders())?.[0] ?? null
  const none = useMemo(() => !project && work.length === 0, [project, work])

  return (
    <EditorSection icon={FolderOpen} title={t('agency.builder.folders')} hint={t('agency.builder.foldersHint')} testId="team-builder-folders">
      <div className="team-builder-folder">
        <span className="team-builder-folder-icon"><FolderGit2 size={15} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="team-builder-folder-title">{t('agency.builder.projectFolder')}</p>
          {project ? <p className="team-builder-path" title={project}>{project}</p> : <p className="field-hint mt-0">{t('agency.builder.projectFolderNone')}</p>}
        </div>
        <button type="button" className="btn btn-secondary btn-xs" onClick={() => void pick().then((path) => { if (path) setTeam({ project_folder: path, work_folders: work.filter((item) => item !== path) }) })}>
          {project ? t('agency.builder.change') : t('agency.builder.choose')}
        </button>
        {project && (
          <button type="button" className="btn btn-quiet btn-icon btn-xs" aria-label={t('agency.builder.folderRemove')} title={t('agency.builder.folderRemove')} onClick={() => setTeam({ project_folder: null })}>
            <X size={13} aria-hidden="true" />
          </button>
        )}
      </div>
      {work.map((path) => (
        <div key={path} className="team-builder-folder">
          <span className="team-builder-folder-icon"><FolderOpen size={15} aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <p className="team-builder-folder-title">{t('agency.builder.workFolder')}</p>
            <p className="team-builder-path" title={path}>{path}</p>
          </div>
          <button type="button" className="btn btn-quiet btn-icon btn-xs" aria-label={t('agency.builder.folderRemove')} title={t('agency.builder.folderRemove')} onClick={() => setTeam({ work_folders: work.filter((item) => item !== path) })}>
            <X size={13} aria-hidden="true" />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void pick().then((path) => { if (path && path !== project && !work.includes(path)) setTeam({ work_folders: [...work, path] }) })}
          data-testid="team-builder-add-folder"
        >
          <FolderPlus size={13} aria-hidden="true" /> {t('agency.builder.addWorkFolder')}
        </button>
      </div>
      <p className="field-hint mt-0">{none ? t('agency.builder.foldersNone') : t('agency.builder.foldersTrust')}</p>
      {dialog}
    </EditorSection>
  )
}
