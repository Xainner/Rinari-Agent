import { useEffect, useMemo, useState } from 'react'
import { Archive, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { Select } from '../../components/ui/select'
import { commandMessage, engineApi, type McpServer } from '../../services/engine'
import type { AgencyAgent, AgencyTeam, AgencyTeamInput } from './types'

/** Un equipo tiene hasta 8 agentes; para más, otro equipo (6.2). */
export const MAX_MEMBERS = 8

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
  const effectiveChief = chief && members.includes(chief) ? chief : members[0] ?? null

  const toggleMember = (agentId: string) =>
    setMembers((current) => {
      if (current.includes(agentId)) return current.filter((value) => value !== agentId)
      return current.length >= MAX_MEMBERS ? current : [...current, agentId]
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
    if (!team) return
    try {
      const result = await engineApi.agencyArchiveTeam(team.id)
      toast.success(t('agency.team.archived', { name: result.team.name }))
      onArchived?.(result.team)
    } catch (error) {
      toast.error(commandMessage(error))
    }
  }

  const duplicate = async () => {
    if (!team || !copyName?.trim()) return
    try {
      const result = await engineApi.agencyDuplicateTeam(team.id, copyName.trim())
      toast.success(t('agency.team.duplicated', { name: result.team.name }))
      setCopyName(null)
      onSaved(result.team, true)
    } catch (error) {
      toast.error(commandMessage(error))
    }
  }

  return (
    <div className="agency-form-page" data-testid="agency-team-form">
      <form
        className="agency-form"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <header className="grid gap-1">
          <h1 className="font-display text-[22px] font-semibold text-[var(--text)]">
            {editing ? t('agency.team.editTitle', { name: team!.name }) : t('agency.team.title')}
          </h1>
          <p className="field-hint">{t('agency.team.intro')}</p>
        </header>

        <label className="grid gap-1.5">
          <span className="field-label">{t('agency.team.name')}</span>
          <input
            className="field-input"
            value={name}
            maxLength={60}
            required
            autoFocus={!editing}
            placeholder={t('agency.team.namePlaceholder')}
            onChange={(event) => setName(event.target.value)}
            data-testid="agency-team-name"
          />
        </label>

        <label className="grid gap-1.5">
          <span className="field-label">{t('agency.team.purpose')}</span>
          <textarea
            className="field-input min-h-[80px] resize-y leading-relaxed"
            value={purpose}
            maxLength={2000}
            placeholder={t('agency.team.purposePlaceholder')}
            onChange={(event) => setPurpose(event.target.value)}
          />
        </label>

        <fieldset className="grid gap-1.5">
          <legend className="field-label mb-1.5">{t('agency.team.members', { n: members.length, max: MAX_MEMBERS })}</legend>
          {active.length === 0 ? (
            <span className="field-hint">{t('agency.team.noAgents')}</span>
          ) : (
            <div className="agency-connectors" data-testid="agency-team-members">
              {active.map((agent) => {
                const checked = members.includes(agent.id)
                return (
                  <label key={agent.id} className="agency-connector">
                    <input
                      type="checkbox"
                      className="r-checkbox"
                      checked={checked}
                      disabled={!checked && members.length >= MAX_MEMBERS}
                      onChange={() => toggleMember(agent.id)}
                    />
                    <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                  </label>
                )
              })}
            </div>
          )}
          <span className="field-hint">{t('agency.team.membersHint')}</span>
        </fieldset>

        <div className="grid max-w-sm gap-1.5">
          <span className="field-label">{t('agency.team.chief')}</span>
          <Select
            value={effectiveChief}
            label={t('agency.team.chief')}
            disabled={members.length === 0}
            options={members.map((id) => ({ value: id, label: agents.find((agent) => agent.id === id)?.name ?? id }))}
            onChange={setChief}
            testId="agency-team-chief"
          />
          <span className="field-hint">{t('agency.team.chiefHint')}</span>
        </div>

        <fieldset className="grid gap-1.5">
          <legend className="field-label mb-1.5">{t('agency.form.connectors')}</legend>
          {available.length === 0 ? (
            <span className="field-hint">{t('agency.form.noConnectors')}</span>
          ) : (
            <div className="agency-connectors">
              {available.map((server) => (
                <label key={server.name} className="agency-connector">
                  <input type="checkbox" className="r-checkbox" checked={connectors.includes(server.name)} onChange={() => toggleConnector(server.name)} />
                  <span className="truncate">{server.name}</span>
                </label>
              ))}
            </div>
          )}
          <span className="field-hint">{t('agency.team.connectorsHint')}</span>
        </fieldset>

        <fieldset className="grid gap-1.5">
          <legend className="field-label mb-1.5">{t('agency.team.budget')}</legend>
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
          <span className="field-hint">{t('agency.team.budgetHint')}</span>
        </fieldset>

        {editing && copyName !== null && (
          <div className="agency-draft" data-testid="agency-team-duplicate">
            <label className="grid min-w-0 flex-1 gap-1.5">
              <span className="field-label">{t('agency.team.copyName')}</span>
              <input className="field-input" value={copyName} maxLength={60} autoFocus onChange={(event) => setCopyName(event.target.value)} data-testid="agency-team-copy-name" />
            </label>
            <button type="button" className="btn btn-secondary btn-sm self-end" disabled={!copyName.trim()} onClick={() => void duplicate()} data-testid="agency-team-copy">
              {t('agency.team.copy')}
            </button>
            <p className="field-hint basis-full">{t('agency.team.copyHint')}</p>
          </div>
        )}

        <footer className="agency-form-actions">
          {editing && (
            <>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => void archive()}>
                <Archive size={13} aria-hidden="true" /> {t('agency.form.archive')}
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
        </footer>
      </form>
    </div>
  )
}
