import { CircleHelp, MessageSquare, Building2, OctagonX, Play, Plus, Settings2, UserPlus, UsersRound } from 'lucide-react'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'
import { SidebarFooter } from '../../components/app-shell/ApplicationMenu'
import agencyIcon from '../../assets/agency/agency-icon.webp'
import AgencyCard from './AgencyCard'
import type { AgencyAgent, AgencyStatus, AgencyTeam } from './types'

interface AgencySidebarProps {
  agents: AgencyAgent[]
  status: AgencyStatus | null
  /** El agente cuyo chat se ve, o null. */
  activeAgentId: string | null
  creating: boolean
  onOpenAgent: (agent: AgencyAgent) => void
  onNewAgent: () => void
  onTutorial: () => void
  onLeave: () => void
  /** Ajustes de la Agency (D-24). */
  onSettings?: () => void
  /** «Detener a todos» (sección 8); ausente sin `agency_stop_all_v1`. */
  onStopAll?: () => void
  /** Con la Agency detenida, «Reanudar» en su lugar (`agency_board_v2`). */
  halted?: boolean
  onResume?: () => void
  settingsOpen?: boolean
  /** A2: los equipos; sin `onNewTeam` (sin `agency_teams_v1`) se dice que llegan pronto. */
  teams?: AgencyTeam[]
  /** Lo que se ve de un equipo: su oficina o un puesto. */
  activeTeam?: { teamId: string; agentId: string | null } | null
  onOpenOffice?: (team: AgencyTeam) => void
  onOpenPost?: (team: AgencyTeam, agentId: string) => void
  onNewTeam?: () => void
}

/**
 * La barra lateral de la Agency (D-15): «Agentes» con todos (cada uno abre
 * su chat directo) y «Equipos» (A2), cada uno con su oficina y sus puestos. El selector Normal |
 * Agencia está desde el principio, con Agencia deshabilitada y «Pronto»
 * hasta que exista la oficina (D-21).
 */
export default function AgencySidebar({
  agents,
  status,
  activeAgentId,
  creating,
  onOpenAgent,
  onNewAgent,
  onTutorial,
  onLeave,
  onSettings,
  onStopAll,
  halted = false,
  onResume,
  settingsOpen = false,
  teams = [],
  activeTeam = null,
  onOpenOffice,
  onOpenPost,
  onNewTeam,
}: AgencySidebarProps) {
  const { t } = useI18n()
  const working = new Set(status?.agent_ids.working ?? [])
  const waiting = new Set(status?.agent_ids.needs_you ?? [])
  const nameOf = new Map(agents.map((agent) => [agent.id, agent.name]))

  return (
    <div className="flex h-full min-h-0 flex-col px-3 pt-3" data-testid="agency-sidebar">
      <div role="group" aria-label={t('agency.name')} className="agency-view-switch">
        <button type="button" className="agency-view-option is-active" aria-pressed="true">
          <MessageSquare size={13} aria-hidden="true" /> {t('agency.view.normal')}
        </button>
        <button
          type="button"
          className="agency-view-option"
          aria-disabled="true"
          aria-pressed="false"
          title={t('agency.view.officeSoon')}
          aria-label={`${t('agency.view.office')} · ${t('agency.view.soon')}`}
          data-testid="agency-office-soon"
          onClick={(event) => event.preventDefault()}
        >
          <Building2 size={13} aria-hidden="true" /> {t('agency.view.office')}
          <span className="agency-soon" aria-hidden="true">{t('agency.view.soon')}</span>
        </button>
      </div>

      <button type="button" className={cn('sidebar-new agency-new-agent mt-3', creating && 'is-active')} onClick={onNewAgent} data-testid="agency-new-agent">
        <UserPlus size={15} aria-hidden="true" />
        <span className="truncate">{t('agency.sidebar.newAgent')}</span>
      </button>

      <div className="sidebar-scroll mt-4 min-h-0 flex-1 overflow-y-auto">
        <p className="sidebar-heading mb-1 px-2">{t('agency.sidebar.agents')}</p>
        {agents.length === 0 ? (
          <p className="px-2 py-1 text-[12px] text-[var(--text-subtle)]">{t('agency.sidebar.noAgents')}</p>
        ) : (
          <ul className="grid gap-0.5" aria-label={t('agency.sidebar.agents')}>
            {agents.map((agent) => {
              const state = waiting.has(agent.id)
                ? t('agency.agent.needsYou')
                : working.has(agent.id)
                  ? t('agency.agent.working')
                  : agent.spend_today?.over_budget
                    ? t('agency.agent.overBudget')
                    : ''
              return (
                <li key={agent.id}>
                  <button
                    type="button"
                    className={cn('agency-agent-row', agent.id === activeAgentId && 'is-active')}
                    onClick={() => onOpenAgent(agent)}
                    aria-current={agent.id === activeAgentId ? 'page' : undefined}
                    aria-label={state ? `${agent.name} · ${state}` : agent.name}
                    data-testid="agency-agent-row"
                  >
                    <img src={agencyIcon} alt="" className="agency-agent-avatar" draggable={false} />
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate">{agent.name}</span>
                      {agent.role && <span className="block truncate text-[11px] text-[var(--text-subtle)]">{agent.role}</span>}
                    </span>
                    {waiting.has(agent.id) ? (
                      <span className="r-chip" data-tone="warning" aria-hidden="true">!</span>
                    ) : working.has(agent.id) ? (
                      <span className="agency-working-dot" aria-hidden="true" />
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="mb-1 mt-5 flex items-center justify-between gap-2 px-2">
          <p className="sidebar-heading">{t('agency.sidebar.teams')}</p>
          {onNewTeam && (
            <button type="button" className="icon-btn agency-new-team" onClick={onNewTeam} aria-label={t('agency.sidebar.newTeam')} title={t('agency.sidebar.newTeam')} data-testid="agency-new-team">
              <Plus size={14} aria-hidden="true" />
            </button>
          )}
        </div>
        {!onNewTeam ? (
          <p className="px-2 text-[12px] leading-relaxed text-[var(--text-subtle)]">{t('agency.sidebar.teamsSoon')}</p>
        ) : teams.length === 0 ? (
          <p className="px-2 py-1 text-[12px] text-[var(--text-subtle)]">{t('agency.sidebar.noTeams')}</p>
        ) : (
          <ul className="grid gap-2" aria-label={t('agency.sidebar.teams')}>
            {teams.map((team) => {
              const officeActive = activeTeam?.teamId === team.id && activeTeam.agentId === null
              return (
                <li key={team.id} data-testid="agency-team">
                  <button
                    type="button"
                    className={cn('agency-agent-row', officeActive && 'is-active')}
                    onClick={() => onOpenOffice?.(team)}
                    aria-current={officeActive ? 'page' : undefined}
                    aria-label={t('agency.sidebar.office', { name: team.name })}
                    data-testid="agency-team-office"
                  >
                    <span className="agency-team-mark" aria-hidden="true"><UsersRound size={14} /></span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate">{team.name}</span>
                      <span className="block truncate text-[11px] text-[var(--text-subtle)]">{t('agency.sidebar.officeLabel')}</span>
                    </span>
                  </button>
                  {team.posts.length > 0 && (
                    <ul className="agency-posts" aria-label={t('agency.sidebar.posts', { name: team.name })}>
                      {team.posts.map((post) => {
                        const active = activeTeam?.teamId === team.id && activeTeam.agentId === post.agent_id
                        const name = nameOf.get(post.agent_id) ?? post.agent_id
                        return (
                          <li key={post.agent_id}>
                            <button
                              type="button"
                              className={cn('agency-post-row', active && 'is-active')}
                              onClick={() => onOpenPost?.(team, post.agent_id)}
                              aria-current={active ? 'page' : undefined}
                              aria-label={t('agency.sidebar.post', { name, team: team.name })}
                              data-testid="agency-post-row"
                            >
                              <img src={agencyIcon} alt="" className="agency-post-avatar" draggable={false} />
                              <span className="min-w-0 flex-1 truncate text-left">{name}</span>
                              {team.chief_agent_id === post.agent_id && <span className="agency-chief" title={t('agency.team.chief')}>{t('agency.team.chiefShort')}</span>}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {halted && onResume ? (
        <button type="button" className="sidebar-link agency-resume" onClick={onResume} data-testid="agency-resume">
          <Play size={15} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-left">{t('agency.sidebar.resume')}</span>
          <span className="r-chip" data-tone="warning">{t('agency.sidebar.stopped')}</span>
        </button>
      ) : onStopAll && (agents.length > 0) && (
        <button type="button" className="sidebar-link agency-stop-all" onClick={onStopAll} data-testid="agency-stop-all">
          <OctagonX size={15} aria-hidden="true" />
          <span className="truncate">{t('agency.sidebar.stopAll')}</span>
        </button>
      )}
      {onSettings && (
        <button type="button" className={cn('sidebar-link', settingsOpen && 'is-active')} onClick={onSettings} aria-current={settingsOpen ? 'page' : undefined} data-testid="agency-settings-link">
          <Settings2 size={15} aria-hidden="true" />
          <span className="truncate">{t('agency.sidebar.settings')}</span>
        </button>
      )}
      <button type="button" className="sidebar-link mb-2" onClick={onTutorial}>
        <CircleHelp size={15} aria-hidden="true" />
        <span className="truncate">{t('agency.sidebar.tutorial')}</span>
      </button>
      <AgencyCard mode="leave" status={status} onClick={onLeave} />
      <SidebarFooter />
    </div>
  )
}
