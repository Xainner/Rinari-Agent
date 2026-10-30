import { useEffect, useMemo, useState } from 'react'
import { Archive, Copy, Crown, Plug, Target, UsersRound, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'
import { commandMessage, engineApi, type McpServer } from '../../services/engine'
import AgentAvatar from './AgentAvatar'
import { BudgetFields, ConnectorTiles, EditorHero, EditorPage, EditorSection } from './AgencyEditor'
import { useConnectorDirectory } from './useConnectorDirectory'
import { useConfirm } from '../../components/ui/useConfirm'
import type { AgencyAgent, AgencyTeam, AgencyTeamInput } from './types'

/** Un equipo tiene hasta 8 agentes; para más, otro equipo (6.2). */

interface TeamFormProps {
  agents: AgencyAgent[]
  /** Sin equipo: «Nuevo equipo». Con equipo: su ficha. */
  team?: AgencyTeam | null
  onSaved: (team: AgencyTeam, created: boolean) => void
  onCancel: () => void
  onArchived?: (team: AgencyTeam) => void
}

function numberOrUndefined(text: string): number | undefined {
  const value = Number(text.replace(',', '.'))
  return text.trim() !== '' && Number.isFinite(value) && value > 0 ? value : undefined
}

/**
 * La ficha de un equipo (A2): nombre, para qué es, sus agentes (hasta 8), el
 * jefe, los conectores que ven sus puestos y su presupuesto del día. La valida
 * el Engine. Los miembros de un equipo que ya existe entran y salen uno a uno
 * (`agency.team.join` / `leave`): al salir, sus recados abiertos van al jefe.
 */
export default function TeamForm({ agents, team, onSaved, onCancel, onArchived }: TeamFormProps) {
  const { t } = useI18n()
  const { ask: confirm, dialog: confirmDialog } = useConfirm()
  const editing = Boolean(team)
  const [name, setName] = useState(team?.name ?? '')
  const [purpose, setPurpose] = useState(team?.purpose ?? '')
  const [members, setMembers] = useState<string[]>(team?.members ?? [])
  const [chief, setChief] = useState<string | null>(team?.chief_agent_id ?? null)
  const [connectors, setConnectors] = useState<string[]>(team?.connectors ?? [])
  const [usd, setUsd] = useState(team?.budget.daily_usd ? String(team.budget.daily_usd) : '')
  const [tokens, setTokens] = useState(team?.budget.daily_tokens ? String(team.budget.daily_tokens) : '')
  const [servers, setServers] = useState<McpServer[]>([])
  const [saving, setSaving] = useState(false)
  const [copyName, setCopyName] = useState<string | null>(null)

  useEffect(() => {
    engineApi.mcpList().then((result) => setServers(result.servers)).catch(() => {})
  }, [])

  // Los conectores de todos (globales, sin dueño) y las cuentas de este equipo.
  const available = useMemo(() => {
    const own = team ? `team:${team.id}` : null
    return servers.filter((server) => {
      const owner = server.owner ?? null
      return (server.scope ?? 'global') === 'global' && (owner === null || owner === own)
    })
  }, [servers, team])

  const active = agents.filter((agent) => agent.archived_at === null)
  const { marks } = useConnectorDirectory()
  const availableMarks = useMemo(() => {
    const names = new Set(available.map((server) => server.name))
    return marks.filter((mark) => names.has(mark.name))
  }, [marks, available])
  const effectiveChief = chief && members.includes(chief) ? chief : members[0] ?? null

  const toggleMember = (agentId: string) =>
    setMembers((current) => {
      if (current.includes(agentId)) return current.filter((value) => value !== agentId)
      return [...current, agentId]
    })
  const toggleConnector = (serverName: string) =>
    setConnectors((current) => (current.includes(serverName) ? current.filter((value) => value !== serverName) : [...current, serverName]))

  const budget = () => ({
    ...(numberOrUndefined(usd) !== undefined ? { daily_usd: numberOrUndefined(usd) } : {}),
    ...(numberOrUndefined(tokens) !== undefined ? { daily_tokens: Math.round(numberOrUndefined(tokens)!) } : {}),
  })

  const submit = async () => {
    setSaving(true)
    try {
      if (!team) {
        const input: AgencyTeamInput = {
          name: name.trim(),
          purpose: purpose.trim(),
          members,
          chief_agent_id: effectiveChief,
          connectors,
          budget: budget(),
        }
        const result = await engineApi.agencyCreateTeam(input)
        toast.success(t('agency.team.created', { name: result.team.name }))
        onSaved(result.team, true)
        return
      }
      // Primero quién entra (el jefe nuevo puede ser uno de ellos), después la ficha, al final quién sale.
      for (const agentId of members.filter((id) => !team.members.includes(id))) await engineApi.agencyJoinTeam(team.id, agentId)
      const result = await engineApi.agencyUpdateTeam(team.id, {
        name: name.trim(),
        purpose: purpose.trim(),
        chief_agent_id: effectiveChief,
        connectors,
        budget: budget(),
      })
      let saved = result.team
      for (const agentId of team.members.filter((id) => !members.includes(id))) saved = (await engineApi.agencyLeaveTeam(team.id, agentId)).team
      onSaved(saved, false)
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const archive = async () => {
    if (!team || saving) return
    const ok = await confirm({
      title: t('agency.team.archiveTitle', { name: team.name }),
      body: t('agency.team.archiveBody'),
      confirmLabel: t('agency.team.archive'),
      cancelLabel: t('agency.form.cancel'),
    })
    if (!ok) return
    try {
      const result = await engineApi.agencyArchiveTeam(team.id)
      toast.success(t('agency.team.archived', { name: result.team.name }))
      onArchived?.(result.team)
    } catch (error) {
      toast.error(commandMessage(error))
    }
  }

  const duplicate = async () => {
    // A double click duplicated the team (and its agents) twice.
    if (!team || !copyName?.trim() || saving) return
    setSaving(true)
    try {
      const result = await engineApi.agencyDuplicateTeam(team.id, copyName.trim())
      toast.success(t('agency.team.duplicated', { name: result.team.name }))
      setCopyName(null)
      onSaved(result.team, true)
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const chosen = members.map((id) => agents.find((agent) => agent.id === id)).filter((agent): agent is AgencyAgent => Boolean(agent))

  return (
    <EditorPage
      testId="agency-team-form"
      onSubmit={() => void submit()}
      footer={(
        <>
          {editing && (
            <>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => void archive()}>
                <Archive size={13} aria-hidden="true" /> {t('agency.team.archive')}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCopyName(copyName === null ? t('agency.team.copyDefault', { name: team!.name }) : null)} data-testid="agency-team-duplicate-open">
                <Copy size={13} aria-hidden="true" /> {t('agency.team.duplicate')}
              </button>
            </>
          )}
          <span className="flex-1" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>{t('agency.form.cancel')}</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !name.trim()} data-testid="agency-team-submit">
            {editing ? t('agency.form.save') : t('agency.team.create')}
          </button>
        </>
      )}
    >
      <EditorHero
        media={chosen.length > 0 ? (
          <div className="agency-team-faces" aria-hidden="true">
            {chosen.slice(0, 4).map((agent) => <AgentAvatar key={agent.id} agent={agent} size={40} />)}
          </div>
        ) : (
          <span className="agency-team-emblem" aria-hidden="true"><UsersRound size={30} /></span>
        )}
        kicker={editing ? t('agency.team.editKicker') : t('agency.team.title')}
      >
        <input
          className="agency-title-input"
          value={name}
          maxLength={60}
          required
          autoFocus={!editing}
          aria-label={t('agency.team.name')}
          placeholder={t('agency.team.namePlaceholder')}
          onChange={(event) => setName(event.target.value)}
          data-testid="agency-team-name"
        />
        <p className="agency-editor-sub">{t('agency.team.intro')}</p>
      </EditorHero>

      {editing && copyName !== null && (
        <div className="agency-draft-card" data-testid="agency-team-duplicate">
          <span className="agency-draft-spark" aria-hidden="true"><Copy size={16} /></span>
          <div className="min-w-0 flex-1">
            <p className="agency-draft-title">{t('agency.team.copyName')}</p>
            <div className="agency-draft-row">
              <input className="field-input" value={copyName} maxLength={60} autoFocus aria-label={t('agency.team.copyName')} onChange={(event) => setCopyName(event.target.value)} data-testid="agency-team-copy-name" />
              <button type="button" className="btn btn-secondary btn-sm" disabled={!copyName.trim() || saving} onClick={() => void duplicate()} data-testid="agency-team-copy">
                {t('agency.team.copy')}
              </button>
            </div>
            <p className="field-hint">{t('agency.team.copyHint')}</p>
          </div>
        </div>
      )}

      <EditorSection icon={Target} title={t('agency.team.purpose')} hint={t('agency.team.purposeHint')}>
        <textarea
          className="field-input agency-instructions is-short"
          value={purpose}
          maxLength={2000}
          aria-label={t('agency.team.purpose')}
          placeholder={t('agency.team.purposePlaceholder')}
          onChange={(event) => setPurpose(event.target.value)}
        />
      </EditorSection>

      <EditorSection icon={UsersRound} title={t('agency.team.members', { n: members.length })} hint={t('agency.team.membersCardHint')}>
        {active.length === 0 ? (
          <p className="field-hint mt-0">{t('agency.team.noAgents')}</p>
        ) : (
          <div className="agency-pick-grid is-agents" data-testid="agency-team-members">
            {active.map((agent) => {
              const checked = members.includes(agent.id)
              const isChief = checked && effectiveChief === agent.id
              return (
                <div key={agent.id} className={cn('agency-pick is-agent', isChief && 'is-chief')} data-checked={checked || undefined}>
                  <label className="agency-pick-main">
                    <input
                      type="checkbox"
                      className="r-checkbox"
                      checked={checked}
                      onChange={() => toggleMember(agent.id)}
                    />
                    <AgentAvatar agent={agent} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-[var(--text)]">{agent.name}</span>
                      {agent.role && <span className="block truncate text-[11.5px] text-[var(--text-subtle)]">{agent.role}</span>}
                    </span>
                  </label>
                  {checked && (
                    <button
                      type="button"
                      className="agency-chief-toggle"
                      aria-pressed={isChief}
                      aria-label={isChief ? t('agency.team.isChief', { name: agent.name }) : t('agency.team.makeChief', { name: agent.name })}
                      title={isChief ? t('agency.team.chief') : t('agency.team.makeChiefShort')}
                      onClick={() => setChief(agent.id)}
                      data-testid="agency-team-chief"
                    >
                      <Crown size={13} aria-hidden="true" />
                      {isChief && <span>{t('agency.team.chiefShort')}</span>}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <p className="field-hint mt-0">{t('agency.team.chiefHint')}</p>
      </EditorSection>

      <EditorSection icon={Plug} title={t('agency.form.connectors')} hint={t('agency.team.connectorsHint')}>
        <ConnectorTiles marks={availableMarks} selected={connectors} onToggle={toggleConnector} empty={t('agency.form.noConnectors')} />
      </EditorSection>

      <EditorSection icon={Wallet} title={t('agency.team.budget')} hint={t('agency.team.budgetHint')}>
        <BudgetFields usd={usd} tokens={tokens} onUsd={setUsd} onTokens={setTokens} />
      </EditorSection>
      {confirmDialog}
    </EditorPage>
  )
}
