import { useCallback, useEffect, useState } from 'react'
import { Brain, Building2, Cpu, Crown, Pencil, Plug, Plus, RotateCcw, Route, Trash2, UsersRound, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n, type I18nKey } from '../../i18n'
import { cn } from '../../lib/utils'
import { Select } from '../../components/ui/select'
import { commandMessage, engineApi, onEngineEvent, type McpServer, type ModelSummary, type ProviderSummary } from '../../services/engine'
import ModelPicker from '../../components/composer/ModelPicker'
import EffortPicker from '../../components/composer/EffortPicker'
import type { ReasoningEffort } from '../../lib/reasoning'
import { useUIStore } from '../../stores/ui'
import { memoryApi } from '../../services/memory'
import type { MemoryRecord } from '../memory/types'
import { CatalogDialog } from '../connectors/CatalogDialog'
import { ConnectorLogo } from '../connectors/ConnectorLogo'
import { SignInDialog, useSignIn } from '../connectors/SignInDialog'
import AgentAvatar from './AgentAvatar'
import { BudgetFields, EditorSection } from './AgencyEditor'
import { useConnectorDirectory } from './useConnectorDirectory'
import type { AgencyAgent, AgencySettingsData, AgencyTeam, AgentBudget, AgentEffort, ErrandMode } from './types'

interface AgencySettingsProps {
  agents: AgencyAgent[]
  /** A2: vacío sin `agency_teams_v1`; entonces solo se ven los agentes. */
  teams?: AgencyTeam[]
  /** El agente con el que se abre (el del chat abierto, si hay uno). */
  initialAgentId?: string | null
  /** El equipo con el que se abre (el de la oficina o el puesto abierto). */
  initialTeamId?: string | null
  /** Con `agency_teams_v1`: equipos y lo de toda la Agency. */
  teamsEnabled?: boolean
  /** Con `agency_agent_memory_v1`: la memoria de cada agente y de cada equipo. */
  memoryEnabled?: boolean
}

type Scope = 'agent' | 'team' | 'agency'

const usdFormat = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const countFormat = new Intl.NumberFormat()

function numberOrUndefined(text: string): number | undefined {
  const value = Number(text.replace(',', '.'))
  return text.trim() !== '' && Number.isFinite(value) && value > 0 ? value : undefined
}

function budgetOf(usd: string, tokens: string): AgentBudget {
  return {
    ...(numberOrUndefined(usd) !== undefined ? { daily_usd: numberOrUndefined(usd) } : {}),
    ...(numberOrUndefined(tokens) !== undefined ? { daily_tokens: Math.round(numberOrUndefined(tokens)!) } : {}),
  }
}

/** Un recuerdo: se corrige en su sitio o se olvida. */
function MemoryRow({ record, onChanged }: { record: MemoryRecord; onChanged: () => void }) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(record.text)

  const save = async () => {
    try {
      await memoryApi.update(record.id, record.revision, { text: text.trim() })
      setEditing(false)
      onChanged()
    } catch (error) {
      toast.error(commandMessage(error))
    }
  }
  const forget = async () => {
    try {
      await memoryApi.forget(record.id, record.revision)
      onChanged()
    } catch (error) {
      toast.error(commandMessage(error))
    }
  }

  return (
    <li className="agency-memory-row" data-testid="agency-memory-row">
      <div className="agency-memory-row-head">
        <span className="agency-memory-topic">{record.topic}</span>
        {!editing && (
          <span className="agency-memory-actions">
            <button type="button" className="btn btn-quiet btn-icon btn-xs" onClick={() => setEditing(true)} aria-label={`${t('agency.settings.edit')} · ${record.topic}`} title={t('agency.settings.edit')}>
              <Pencil size={12} aria-hidden="true" />
            </button>
            <button type="button" className="btn btn-quiet btn-icon btn-xs agency-memory-forget" onClick={() => void forget()} aria-label={`${t('agency.settings.forget')} · ${record.topic}`} title={t('agency.settings.forget')}>
              <Trash2 size={12} aria-hidden="true" />
            </button>
          </span>
        )}
      </div>
      {editing ? (
        <div className="grid gap-2">
          <textarea className="field-input min-h-[64px] resize-y" value={text} maxLength={4096} onChange={(event) => setText(event.target.value)} aria-label={t('agency.settings.text')} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => { setEditing(false); setText(record.text) }}>{t('agency.settings.cancel')}</button>
            <button type="button" className="btn btn-primary btn-xs" disabled={!text.trim()} onClick={() => void save()}>{t('agency.settings.save')}</button>
          </div>
        </div>
      ) : (
        <p className="agency-memory-text">{record.text}</p>
      )}
    </li>
  )
}

/** De quién es lo que se ve: un agente (lo de su chat directo) o un equipo (lo de sus puestos). */
interface Owner {
  kind: 'agent' | 'team'
  id: string
  name: string
}

/**
 * La memoria propia y las cuentas propias de un agente o de un equipo (D-24,
 * C8). Las cuentas solo las ve y usa su dueño; se conectan desde el catálogo
 * de conectores, a su nombre.
 */
function MemoryAndAccounts({ owner, memoryEnabled = true }: { owner: Owner; memoryEnabled?: boolean }) {
  const { t } = useI18n()
  const [records, setRecords] = useState<MemoryRecord[]>([])
  const [accounts, setAccounts] = useState<McpServer[]>([])
  const [topic, setTopic] = useState('')
  const [text, setText] = useState('')
  const [catalogOpen, setCatalogOpen] = useState(false)
  const openSignIn = useSignIn((state) => state.open)
  const { byName } = useConnectorDirectory()
  const tag = `${owner.kind}:${owner.id}`

  const reload = useCallback(async () => {
    try {
      const [memory, servers] = await Promise.all([
        !memoryEnabled
          ? Promise.resolve({ records: [] as MemoryRecord[] })
          : owner.kind === 'agent' ? engineApi.agencyAgentMemory(owner.id) : engineApi.agencyTeamMemory(owner.id),
        engineApi.mcpList(),
      ])
      setRecords(memory.records)
      setAccounts(servers.servers.filter((server) => server.owner === tag))
    } catch (error) {
      toast.error(commandMessage(error))
    }
  }, [owner.kind, owner.id, tag, memoryEnabled])

  useEffect(() => {
    void reload()
    let stop: (() => void) | undefined
    let disposed = false
    void onEngineEvent((event) => {
      if (event.event === 'mcp.status.changed' || event.event.startsWith('memory.')) void reload()
    }).then((unlisten) => {
      if (disposed) unlisten()
      else stop = unlisten
    })
    return () => {
      disposed = true
      stop?.()
    }
  }, [reload])

  const remember = async () => {
    if (!topic.trim() || !text.trim()) return
    try {
      if (owner.kind === 'agent') await engineApi.agencyAgentRemember(owner.id, topic.trim(), text.trim())
      else await engineApi.agencyTeamRemember(owner.id, topic.trim(), text.trim())
      setTopic('')
      setText('')
      await reload()
    } catch (error) {
      toast.error(commandMessage(error))
    }
  }

  return (
    <>
      {!memoryEnabled ? (
        <div data-testid="agency-memory-soon">
          <EditorSection icon={Brain} title={t('agency.settings.memory', { name: owner.name })} hint={t('agency.settings.memorySoon')}>
            <span className="agency-soon self-start">{t('agency.view.soon')}</span>
          </EditorSection>
        </div>
      ) : (
        <EditorSection icon={Brain} title={t('agency.settings.memory', { name: owner.name })} hint={t(owner.kind === 'agent' ? 'agency.settings.memoryHint' : 'agency.settings.teamMemoryHint')}>
          {records.length === 0 ? (
            <p className="agency-settings-empty">{t('agency.settings.memoryEmpty')}</p>
          ) : (
            <ul className="agency-memory-list">
              {records.map((record) => <MemoryRow key={`${record.id}:${record.revision}`} record={record} onChanged={() => void reload()} />)}
            </ul>
          )}
          <div className="agency-memory-add">
            <input className="field-input" value={topic} maxLength={128} placeholder={t('agency.settings.topic')} aria-label={t('agency.settings.topic')} onChange={(event) => setTopic(event.target.value)} data-testid="agency-memory-topic" />
            <input className="field-input" value={text} maxLength={4096} placeholder={t('agency.settings.text')} aria-label={t('agency.settings.text')} onChange={(event) => setText(event.target.value)} data-testid="agency-memory-text" />
            <button type="button" className="btn btn-secondary btn-sm" disabled={!topic.trim() || !text.trim()} onClick={() => void remember()} data-testid="agency-memory-add">
              <Plus size={13} aria-hidden="true" /> {t('agency.settings.remember')}
            </button>
          </div>
        </EditorSection>
      )}

      <EditorSection icon={Plug} title={t('agency.settings.accounts', { name: owner.name })} hint={t(owner.kind === 'agent' ? 'agency.settings.accountsHint' : 'agency.settings.teamAccountsHint')}>
        {accounts.length === 0 ? (
          <p className="agency-settings-empty">{t('agency.settings.accountsEmpty')}</p>
        ) : (
          <ul className="agency-pick-grid">
            {accounts.map((server) => {
              const mark = byName.get(server.name)
              return (
                <li key={server.name} className="agency-pick is-static">
                  <ConnectorLogo name={mark?.label ?? server.name} logo={mark?.logo} tone={mark?.tone ?? 'remote'} size={26} />
                  <span className="min-w-0 flex-1 truncate">{mark?.label ?? server.name}</span>
                </li>
              )
            })}
          </ul>
        )}
        <div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCatalogOpen(true)} data-testid="agency-connect-account">
            <Plug size={13} aria-hidden="true" /> {t('agency.settings.connect')}
          </button>
        </div>
      </EditorSection>
      <CatalogDialog
        open={catalogOpen}
        owner={tag}
        onClose={() => setCatalogOpen(false)}
        onAdded={(server, next, label) => {
          setCatalogOpen(false)
          void reload()
          if (next === 'sign_in') openSignIn(server.name, label)
        }}
      />
    </>
  )
}

/** El presupuesto del día de un equipo o de toda la Agency. */
function BudgetEditor({ budget, onSave, testId }: { budget: AgentBudget; onSave: (budget: AgentBudget) => Promise<void>; testId: string }) {
  const { t } = useI18n()
  const [usd, setUsd] = useState(budget.daily_usd ? String(budget.daily_usd) : '')
  const [tokens, setTokens] = useState(budget.daily_tokens ? String(budget.daily_tokens) : '')
  const [saving, setSaving] = useState(false)
  return (
    <div className="grid gap-3" data-testid={testId}>
      <BudgetFields usd={usd} tokens={tokens} onUsd={setUsd} onTokens={setTokens} />
      <div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={saving}
          onClick={() => {
            setSaving(true)
            void onSave(budgetOf(usd, tokens)).finally(() => setSaving(false))
          }}
        >
          {t('agency.settings.saveBudget')}
        </button>
      </div>
    </div>
  )
}

/** El modelo y el esfuerzo del agente, como en su ficha: se guardan al elegir. */
function AgentModelSettings({ agent }: { agent: AgencyAgent }) {
  const { t } = useI18n()
  const [models, setModels] = useState<ModelSummary[]>([])
  const [providers, setProviders] = useState<ProviderSummary[]>([])
  const [activeAlias, setActiveAlias] = useState<string | null>(null)
  const [model, setModel] = useState<string | null>(agent.model ?? null)
  // «Predeterminado» del selector (`off`) es el esfuerzo del modelo: null en el Engine.
  const [effort, setEffort] = useState<ReasoningEffort>(agent.reasoning_effort ?? 'off')

  useEffect(() => {
    engineApi.modelList().then((result) => setModels(result.models.filter((item) => item.saved !== false))).catch(() => {})
    engineApi.providerList().then((result) => { setProviders(result.providers); setActiveAlias(result.active_alias) }).catch(() => {})
  }, [])

  const save = async (patch: { model?: string | null; reasoning_effort?: AgentEffort | null }) => {
    try {
      await engineApi.agencyUpdateAgent(agent.id, patch)
      toast.success(t('agency.settings.saved'))
      return true
    } catch (error) {
      toast.error(commandMessage(error))
      return false
    }
  }
  const chooseModel = (next: string | null) => {
    const previous = model
    setModel(next)
    void save({ model: next }).then((ok) => { if (!ok) setModel(previous) })
  }
  const chooseEffort = (next: ReasoningEffort) => {
    const previous = effort
    setEffort(next)
    void save({ reasoning_effort: next === 'off' ? null : next as AgentEffort }).then((ok) => { if (!ok) setEffort(previous) })
  }

  const chosen = model ? models.find((item) => item.id === model) ?? null : null
  // El esfuerzo se ofrece según el modelo: el elegido, o con «El de siempre» el que usa Rinari ahora.
  const effortModel = chosen ?? models.find((item) => item.alias === activeAlias) ?? null
  return (
    <EditorSection icon={Cpu} title={t('agency.form.model')} hint={t('agency.form.modelHint')} testId="agency-settings-model">
      <div className="agency-model-row">
        <div className="agency-model-field">
          <ModelPicker
            models={models}
            providers={providers}
            activeAlias={chosen?.alias ?? null}
            activeModel={chosen}
            missingLabel={model === null ? t('agency.form.modelDefault') : t('agency.form.modelMissing')}
            onUseModel={(item) => chooseModel(item.id)}
            onDiscoverModels={() => {}}
            onOpenProviders={() => useUIStore.getState().goSettings('providers')}
          />
        </div>
        <div className="agency-effort" data-testid="agency-settings-effort">
          <EffortPicker value={effort} capabilities={effortModel?.capabilities} onChange={chooseEffort} />
        </div>
        {model !== null && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => chooseModel(null)}>
            <RotateCcw size={13} aria-hidden="true" /> {t('agency.form.modelUseDefault')}
          </button>
        )}
      </div>
    </EditorSection>
  )
}

function TeamSettings({ team, agents, memoryEnabled }: { team: AgencyTeam; agents: AgencyAgent[]; memoryEnabled: boolean }) {
  const { t } = useI18n()
  const save = async (patch: { budget?: AgentBudget; chief_agent_id?: string }) => {
    try {
      await engineApi.agencyUpdateTeam(team.id, patch)
      toast.success(t('agency.settings.saved'))
    } catch (error) {
      toast.error(commandMessage(error))
    }
  }
  return (
    <>
      <EditorSection icon={Crown} title={t('agency.team.chief')} hint={t('agency.team.chiefHint')}>
        <div className="max-w-sm">
          <Select
            value={team.chief_agent_id}
            label={t('agency.team.chief')}
            disabled={team.members.length === 0}
            options={team.members.map((id) => {
              const agent = agents.find((item) => item.id === id)
              return { value: id, label: agent?.name ?? id, detail: agent?.role || undefined, icon: <AgentAvatar agent={agent ?? { id, name: id }} size={18} /> }
            })}
            onChange={(chief) => void save({ chief_agent_id: chief })}
            testId="agency-settings-chief"
          />
        </div>
      </EditorSection>
      <EditorSection icon={Wallet} title={t('agency.settings.teamBudget', { name: team.name })} hint={t('agency.team.budgetHint')}>
        <BudgetEditor key={team.id} budget={team.budget} onSave={(budget) => save({ budget })} testId="agency-team-budget" />
      </EditorSection>
      <MemoryAndAccounts key={team.id} owner={{ kind: 'team', id: team.id, name: team.name }} memoryEnabled={memoryEnabled} />
    </>
  )
}

/** Lo de toda la Agency: el presupuesto global y cómo corre un recado (D-28). */
function GlobalSettings() {
  const { t } = useI18n()
  const [settings, setSettings] = useState<AgencySettingsData | null>(null)

  useEffect(() => {
    engineApi.agencySettings().then(setSettings).catch((error) => toast.error(commandMessage(error)))
  }, [])

  const update = async (patch: { budget?: AgentBudget; errand_mode?: ErrandMode }) => {
    try {
      setSettings(await engineApi.agencySetSettings(patch))
      toast.success(t('agency.settings.saved'))
    } catch (error) {
      toast.error(commandMessage(error))
    }
  }

  if (!settings) return <p className="agency-settings-empty">{t('agency.settings.loading')}</p>
  const spend = settings.spend_today
  const spent = spend.tokens > 0 && !spend.cost_known
    ? t('agency.home.spendUnknown', { tokens: countFormat.format(spend.tokens) })
    : spend.cost_usd !== null && spend.cost_usd > 0
      ? t('agency.home.spendCost', { tokens: countFormat.format(spend.tokens), cost: usdFormat.format(spend.cost_usd) })
      : t('agency.home.spend', { tokens: countFormat.format(spend.tokens) })

  return (
    <>
      <EditorSection icon={Wallet} title={t('agency.settings.globalBudget')} hint={t('agency.settings.globalBudgetHint')}>
        <p className="agency-spend-line" data-testid="agency-global-spend">{spent}</p>
        <BudgetEditor budget={settings.budget} onSave={(budget) => update({ budget })} testId="agency-global-budget" />
      </EditorSection>
      <EditorSection icon={Route} title={t('agency.settings.errandMode')}>
        <div className="agency-option-cards" role="group" aria-label={t('agency.settings.errandMode')} data-testid="agency-errand-mode">
          {settings.errand_modes.map((mode) => {
            const available = settings.available_errand_modes.includes(mode)
            const active = settings.errand_mode === mode
            return (
              <button
                key={mode}
                type="button"
                className="agency-option-card"
                aria-pressed={active}
                aria-checked={active}
                aria-disabled={!available || undefined}
                title={available ? undefined : t('agency.view.soon')}
                onClick={() => {
                  if (available && !active) void update({ errand_mode: mode })
                }}
                data-testid={`agency-errand-mode-${mode}`}
              >
                <span className="agency-option-icon"><Route size={16} aria-hidden="true" /></span>
                <span className="agency-option-title">
                  {t(`agency.settings.errandMode.${mode}` as I18nKey)}
                  {!available && <span className="agency-soon ml-1.5">{t('agency.view.soon')}</span>}
                </span>
                <span className="agency-option-hint">{t(`agency.settings.errandModeHint.${mode}` as I18nKey)}</span>
              </button>
            )
          })}
        </div>
      </EditorSection>
    </>
  )
}

/**
 * Ajustes de la Agency (D-24), como los ajustes de Rinari: a la izquierda
 * cada agente, cada equipo y lo de toda la Agency; a la derecha lo suyo en
 * tarjetas. Por agente, su memoria y sus cuentas propias; por equipo (A2),
 * su jefe, su presupuesto, su memoria y sus cuentas; y de toda la Agency, el
 * presupuesto global y cómo corre un recado.
 */
export default function AgencySettings({ agents, teams = [], initialAgentId = null, initialTeamId = null, teamsEnabled = false, memoryEnabled = true }: AgencySettingsProps) {
  const { t } = useI18n()
  const [scope, setScope] = useState<Scope>(initialTeamId && teamsEnabled ? 'team' : agents.length > 0 || !teamsEnabled ? 'agent' : 'agency')
  const [agentId, setAgentId] = useState<string | null>(initialAgentId ?? agents[0]?.id ?? null)
  const [teamId, setTeamId] = useState<string | null>(initialTeamId ?? teams[0]?.id ?? null)
  const agent = agents.find((item) => item.id === agentId) ?? null
  const team = teams.find((item) => item.id === teamId) ?? null

  useEffect(() => {
    if (!agentId && agents[0]) setAgentId(agents[0].id)
  }, [agentId, agents])
  useEffect(() => {
    if (!teamId && teams[0]) setTeamId(teams[0].id)
  }, [teamId, teams])

  const members = (item: AgencyTeam) => item.members.map((id) => agents.find((candidate) => candidate.id === id)).filter((candidate): candidate is AgencyAgent => Boolean(candidate))

  return (
    <div className="agency-settings-page" data-testid="agency-settings">
      <div className="agency-settings-layout">
        <nav className="agency-settings-nav" aria-label={t('agency.settings.title')}>
          <h1 className="agency-settings-title">{t('agency.settings.title')}</h1>
          <p className="agency-settings-nav-head">{t('agency.sidebar.agents')}</p>
          {agents.length === 0 ? (
            <p className="agency-settings-nav-empty">{t('agency.sidebar.noAgents')}</p>
          ) : agents.map((item) => {
            const current = scope === 'agent' && agentId === item.id
            return (
              <button key={item.id} type="button" className={cn('agency-settings-nav-row', current && 'is-active')} aria-current={current ? 'page' : undefined} onClick={() => { setScope('agent'); setAgentId(item.id) }} data-testid="agency-settings-agent-row">
                <AgentAvatar agent={item} size={24} />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
              </button>
            )
          })}
          {teamsEnabled && (
            <>
              <p className="agency-settings-nav-head">{t('agency.sidebar.teams')}</p>
              {teams.length === 0 ? (
                <p className="agency-settings-nav-empty">{t('agency.sidebar.noTeams')}</p>
              ) : teams.map((item) => {
                const current = scope === 'team' && teamId === item.id
                return (
                  <button key={item.id} type="button" className={cn('agency-settings-nav-row', current && 'is-active')} aria-current={current ? 'page' : undefined} onClick={() => { setScope('team'); setTeamId(item.id) }} data-testid="agency-settings-team-row">
                    <span className="agency-team-mark" aria-hidden="true"><UsersRound size={13} /></span>
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  </button>
                )
              })}
              <span className="agency-settings-nav-sep" aria-hidden="true" />
              <button type="button" className={cn('agency-settings-nav-row', scope === 'agency' && 'is-active')} aria-current={scope === 'agency' ? 'page' : undefined} onClick={() => setScope('agency')} data-testid="agency-settings-scope-agency">
                <span className="agency-team-mark" aria-hidden="true"><Building2 size={13} /></span>
                <span className="min-w-0 flex-1 truncate">{t('agency.settings.scope.agency')}</span>
              </button>
            </>
          )}
        </nav>

        <div className="agency-settings-main">
          {scope === 'agent' && (agent ? (
            <>
              <header className="agency-settings-head">
                <AgentAvatar agent={agent} size={48} />
                <div className="min-w-0">
                  <h2 className="truncate font-display text-[20px] font-bold text-[var(--text)]">{agent.name}</h2>
                  <p className="truncate text-[13px] text-[var(--text-muted)]">{agent.role || t('agency.settings.agentIntro')}</p>
                </div>
              </header>
              {/* Hermanas de la memoria: cada una con su clave, o React deja copias al cambiar de agente. */}
              <AgentModelSettings key={`model:${agent.id}`} agent={agent} />
              <MemoryAndAccounts key={agent.id} owner={{ kind: 'agent', id: agent.id, name: agent.name }} memoryEnabled={memoryEnabled} />
            </>
          ) : (
            <p className="agency-settings-empty">{t('agency.settings.noAgents')}</p>
          ))}

          {scope === 'team' && (team ? (
            <>
              <header className="agency-settings-head">
                <div className="agency-team-faces" aria-hidden="true">
                  {members(team).slice(0, 4).map((item) => <AgentAvatar key={item.id} agent={item} size={40} />)}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate font-display text-[20px] font-bold text-[var(--text)]">{team.name}</h2>
                  <p className="truncate text-[13px] text-[var(--text-muted)]">{team.purpose || t('agency.office.members', { n: team.members.length })}</p>
                </div>
              </header>
              <TeamSettings team={team} agents={agents} memoryEnabled={memoryEnabled} />
            </>
          ) : (
            <p className="agency-settings-empty">{t('agency.settings.noTeams')}</p>
          ))}

          {scope === 'agency' && (
            <>
              <header className="agency-settings-head">
                <span className="agency-team-emblem is-small" aria-hidden="true"><Building2 size={22} /></span>
                <div className="min-w-0">
                  <h2 className="font-display text-[20px] font-bold text-[var(--text)]">{t('agency.settings.scope.agency')}</h2>
                  <p className="text-[13px] text-[var(--text-muted)]">{t(teamsEnabled ? 'agency.settings.introTeams' : 'agency.settings.intro')}</p>
                </div>
              </header>
              <GlobalSettings />
            </>
          )}
        </div>
      </div>
      <SignInDialog />
    </div>
  )
}
