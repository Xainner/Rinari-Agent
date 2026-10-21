import { useCallback, useEffect, useState } from 'react'
import { Plug, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n, type I18nKey } from '../../i18n'
import { cn } from '../../lib/utils'
import { Select } from '../../components/ui/select'
import { commandMessage, engineApi, onEngineEvent, type McpServer } from '../../services/engine'
import { memoryApi } from '../../services/memory'
import type { MemoryRecord } from '../memory/types'
import { CatalogDialog } from '../connectors/CatalogDialog'
import { SignInDialog, useSignIn } from '../connectors/SignInDialog'
import type { AgencyAgent, AgencySettingsData, AgencyTeam, AgentBudget, ErrandMode } from './types'

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
      <span className="agency-memory-topic">{record.topic}</span>
      {editing ? (
        <div className="grid gap-2">
          <textarea className="field-input min-h-[64px] resize-y" value={text} maxLength={4096} onChange={(event) => setText(event.target.value)} aria-label={t('agency.settings.text')} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => { setEditing(false); setText(record.text) }}>{t('agency.settings.cancel')}</button>
            <button type="button" className="btn btn-primary btn-xs" disabled={!text.trim()} onClick={() => void save()}>{t('agency.settings.save')}</button>
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-[var(--text)]">{record.text}</p>
      )}
      {!editing && (
        <div className="flex justify-end gap-1">
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setEditing(true)}>{t('agency.settings.edit')}</button>
          <button type="button" className="btn btn-quiet btn-xs" onClick={() => void forget()} aria-label={`${t('agency.settings.forget')} · ${record.topic}`}>
            <Trash2 size={12} aria-hidden="true" /> {t('agency.settings.forget')}
          </button>
        </div>
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
function MemoryAndAccounts({ owner }: { owner: Owner }) {
  const { t } = useI18n()
  const [records, setRecords] = useState<MemoryRecord[]>([])
  const [accounts, setAccounts] = useState<McpServer[]>([])
  const [topic, setTopic] = useState('')
  const [text, setText] = useState('')
  const [catalogOpen, setCatalogOpen] = useState(false)
  const openSignIn = useSignIn((state) => state.open)
  const tag = `${owner.kind}:${owner.id}`

  const reload = useCallback(async () => {
    try {
      const [memory, servers] = await Promise.all([
        owner.kind === 'agent' ? engineApi.agencyAgentMemory(owner.id) : engineApi.agencyTeamMemory(owner.id),
        engineApi.mcpList(),
      ])
      setRecords(memory.records)
      setAccounts(servers.servers.filter((server) => server.owner === tag))
    } catch (error) {
      toast.error(commandMessage(error))
    }
  }, [owner.kind, owner.id, tag])

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
      <section className="grid gap-3" aria-labelledby="agency-memory-title">
        <div>
          <h2 id="agency-memory-title" className="text-[15px] font-semibold text-[var(--text)]">{t('agency.settings.memory', { name: owner.name })}</h2>
          <p className="field-hint">{t(owner.kind === 'agent' ? 'agency.settings.memoryHint' : 'agency.settings.teamMemoryHint')}</p>
        </div>
        {records.length === 0 ? (
          <p className="field-hint">{t('agency.settings.memoryEmpty')}</p>
        ) : (
          <ul className="grid gap-2">
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
      </section>

      <section className="grid gap-3" aria-labelledby="agency-accounts-title">
        <div>
          <h2 id="agency-accounts-title" className="text-[15px] font-semibold text-[var(--text)]">{t('agency.settings.accounts', { name: owner.name })}</h2>
          <p className="field-hint">{t(owner.kind === 'agent' ? 'agency.settings.accountsHint' : 'agency.settings.teamAccountsHint')}</p>
        </div>
        {accounts.length === 0 ? (
          <p className="field-hint">{t('agency.settings.accountsEmpty')}</p>
        ) : (
          <ul className="agency-connectors">
            {accounts.map((server) => (
              <li key={server.name} className="agency-connector"><Plug size={13} aria-hidden="true" /><span className="truncate">{server.name}</span></li>
            ))}
          </ul>
        )}
        <div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCatalogOpen(true)} data-testid="agency-connect-account">
            <Plug size={13} aria-hidden="true" /> {t('agency.settings.connect')}
          </button>
        </div>
      </section>
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

/** El presupuesto del día de un equipo o de toda la Agency, y su jefe para un equipo. */
function BudgetEditor({ budget, onSave, testId }: { budget: AgentBudget; onSave: (budget: AgentBudget) => Promise<void>; testId: string }) {
  const { t } = useI18n()
  const [usd, setUsd] = useState(budget.daily_usd ? String(budget.daily_usd) : '')
  const [tokens, setTokens] = useState(budget.daily_tokens ? String(budget.daily_tokens) : '')
  const [saving, setSaving] = useState(false)
  return (
    <div className="grid gap-2" data-testid={testId}>
      <div className="agency-form-grid">
        <label className="grid gap-1">
          <span className="field-hint">{t('agency.form.budgetUsd')}</span>
          <input className="field-input" inputMode="decimal" value={usd} onChange={(event) => setUsd(event.target.value)} />
        </label>
        <label className="grid gap-1">
          <span className="field-hint">{t('agency.form.budgetTokens')}</span>
          <input className="field-input" inputMode="numeric" value={tokens} onChange={(event) => setTokens(event.target.value)} />
        </label>
      </div>
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

function TeamSettings({ team, agents }: { team: AgencyTeam; agents: AgencyAgent[] }) {
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
      <section className="grid gap-3" aria-labelledby="agency-team-budget-title">
        <div>
          <h2 id="agency-team-budget-title" className="text-[15px] font-semibold text-[var(--text)]">{t('agency.settings.teamBudget', { name: team.name })}</h2>
          <p className="field-hint">{t('agency.team.budgetHint')}</p>
        </div>
        <BudgetEditor key={team.id} budget={team.budget} onSave={(budget) => save({ budget })} testId="agency-team-budget" />
      </section>
      <section className="grid max-w-sm gap-1.5" aria-label={t('agency.team.chief')}>
        <span className="field-label">{t('agency.team.chief')}</span>
        <Select
          value={team.chief_agent_id}
          label={t('agency.team.chief')}
          disabled={team.members.length === 0}
          options={team.members.map((id) => ({ value: id, label: agents.find((agent) => agent.id === id)?.name ?? id }))}
          onChange={(chief) => void save({ chief_agent_id: chief })}
          testId="agency-settings-chief"
        />
        <span className="field-hint">{t('agency.team.chiefHint')}</span>
      </section>
      <MemoryAndAccounts key={team.id} owner={{ kind: 'team', id: team.id, name: team.name }} />
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

  if (!settings) return <p className="field-hint">{t('agency.settings.loading')}</p>
  const spend = settings.spend_today
  const spent = spend.tokens > 0 && !spend.cost_known
    ? t('agency.home.spendUnknown', { tokens: countFormat.format(spend.tokens) })
    : spend.cost_usd !== null && spend.cost_usd > 0
      ? t('agency.home.spendCost', { tokens: countFormat.format(spend.tokens), cost: usdFormat.format(spend.cost_usd) })
      : t('agency.home.spend', { tokens: countFormat.format(spend.tokens) })

  return (
    <>
      <section className="grid gap-3" aria-labelledby="agency-global-budget-title">
        <div>
          <h2 id="agency-global-budget-title" className="text-[15px] font-semibold text-[var(--text)]">{t('agency.settings.globalBudget')}</h2>
          <p className="field-hint">{t('agency.settings.globalBudgetHint')}</p>
          <p className="mt-1 font-mono text-[11.5px] text-[var(--text-subtle)]" data-testid="agency-global-spend">{spent}</p>
        </div>
        <BudgetEditor budget={settings.budget} onSave={(budget) => update({ budget })} testId="agency-global-budget" />
      </section>
      <fieldset className="grid gap-1.5">
        <legend className="field-label mb-1.5">{t('agency.settings.errandMode')}</legend>
        <div className="agency-choice" role="group" aria-label={t('agency.settings.errandMode')} data-testid="agency-errand-mode">
          {settings.errand_modes.map((mode) => {
            const available = settings.available_errand_modes.includes(mode)
            const active = settings.errand_mode === mode
            return (
              <button
                key={mode}
                type="button"
                className={cn('agency-choice-option', active && 'is-active')}
                aria-pressed={active}
                aria-disabled={!available || undefined}
                title={available ? undefined : t('agency.view.soon')}
                onClick={() => {
                  if (available && !active) void update({ errand_mode: mode })
                }}
                data-testid={`agency-errand-mode-${mode}`}
              >
                {t(`agency.settings.errandMode.${mode}` as I18nKey)}
                {!available && <span className="agency-soon ml-1.5">{t('agency.view.soon')}</span>}
              </button>
            )
          })}
        </div>
        <span className="field-hint">{t(`agency.settings.errandModeHint.${settings.errand_mode}` as I18nKey)}</span>
      </fieldset>
    </>
  )
}

/**
 * Ajustes de la Agency (D-24): por agente, su memoria y sus cuentas propias;
 * por equipo (A2), su memoria, sus cuentas, su presupuesto y su jefe; y lo de
 * toda la Agency: el presupuesto global y cómo corre un recado.
 */
export default function AgencySettings({ agents, teams = [], initialAgentId = null, initialTeamId = null, teamsEnabled = false }: AgencySettingsProps) {
  const { t } = useI18n()
  const [scope, setScope] = useState<Scope>(initialTeamId && teamsEnabled ? 'team' : 'agent')
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

  const scopes: Scope[] = teamsEnabled ? ['agent', 'team', 'agency'] : ['agent']

  return (
    <div className="agency-form-page" data-testid="agency-settings">
      <div className="agency-form">
        <header className="grid gap-1">
          <h1 className="font-display text-[22px] font-semibold text-[var(--text)]">{t('agency.settings.title')}</h1>
          <p className="field-hint">{t(teamsEnabled ? 'agency.settings.introTeams' : 'agency.settings.intro')}</p>
        </header>

        {scopes.length > 1 && (
          <div className="agency-choice" role="tablist" aria-label={t('agency.settings.title')}>
            {scopes.map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={scope === value}
                className={cn('agency-choice-option', scope === value && 'is-active')}
                onClick={() => setScope(value)}
                data-testid={`agency-settings-scope-${value}`}
              >
                {t(`agency.settings.scope.${value}` as I18nKey)}
              </button>
            ))}
          </div>
        )}

        {scope === 'agent' && (agents.length === 0 ? (
          <p className="field-hint">{t('agency.settings.noAgents')}</p>
        ) : (
          <>
            <div className="grid max-w-sm gap-1.5">
              <span className="field-label">{t('agency.settings.agent')}</span>
              <Select
                value={agentId}
                label={t('agency.settings.agent')}
                options={agents.map((item) => ({ value: item.id, label: item.name, detail: item.role || undefined }))}
                onChange={setAgentId}
                testId="agency-settings-agent"
              />
            </div>
            {agent && <MemoryAndAccounts key={agent.id} owner={{ kind: 'agent', id: agent.id, name: agent.name }} />}
          </>
        ))}

        {scope === 'team' && (teams.length === 0 ? (
          <p className="field-hint">{t('agency.settings.noTeams')}</p>
        ) : (
          <>
            <div className="grid max-w-sm gap-1.5">
              <span className="field-label">{t('agency.settings.team')}</span>
              <Select
                value={teamId}
                label={t('agency.settings.team')}
                options={teams.map((item) => ({ value: item.id, label: item.name, detail: item.purpose || undefined }))}
                onChange={setTeamId}
                testId="agency-settings-team"
              />
            </div>
            {team && <TeamSettings team={team} agents={agents} />}
          </>
        ))}

        {scope === 'agency' && <GlobalSettings />}
      </div>
      <SignInDialog />
    </div>
  )
}
