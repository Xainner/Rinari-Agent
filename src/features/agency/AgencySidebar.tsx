import { CircleHelp, MessageSquare, Building2, UserPlus } from 'lucide-react'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'
import { SidebarFooter } from '../../components/app-shell/ApplicationMenu'
import agencyIcon from '../../assets/agency/agency-icon.webp'
import AgencyCard from './AgencyCard'
import type { AgencyAgent, AgencyStatus } from './types'

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
}

/**
 * La barra lateral de la Agency (D-15): «Agentes» con todos (cada uno abre
 * su chat directo) y «Equipos», que llegan en A2. El selector Normal |
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
}: AgencySidebarProps) {
  const { t } = useI18n()
  const working = new Set(status?.agent_ids.working ?? [])
  const waiting = new Set(status?.agent_ids.needs_you ?? [])

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

      <button type="button" className={cn('sidebar-new mt-3', creating && 'is-active')} onClick={onNewAgent} data-testid="agency-new-agent">
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

        <p className="sidebar-heading mb-1 mt-5 px-2">{t('agency.sidebar.teams')}</p>
        <p className="px-2 text-[12px] leading-relaxed text-[var(--text-subtle)]">{t('agency.sidebar.teamsSoon')}</p>
      </div>

      <button type="button" className="sidebar-link mb-2" onClick={onTutorial}>
        <CircleHelp size={15} aria-hidden="true" />
        <span className="truncate">{t('agency.sidebar.tutorial')}</span>
      </button>
      <AgencyCard mode="leave" status={status} onClick={onLeave} />
      <SidebarFooter />
    </div>
  )
}
