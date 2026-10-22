import { CircleHelp, Copy, IdCard, LayoutTemplate, MessageSquare, Building2, MoreHorizontal, OctagonX, Pencil, Play, Plus, Settings, Settings2, UserPlus, UsersRound } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useUIStore } from '../../stores/ui'
import { dispatchAction } from '../../services/actions'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'
import { copyText } from '../../lib/clipboard'
import ApplicationMenu, { SidebarFooter } from '../../components/app-shell/ApplicationMenu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../components/ui/dropdown-menu'
import AgentAvatar from './AgentAvatar'
import AgencyCard from './AgencyCard'
import { postState, teamState, type PostState } from './postState'
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
  /** «Usar una plantilla» (`agency_audit_v1`): el «+» de Equipos ofrece las dos cosas. */
  onUseTemplate?: () => void
  /** La barra colapsada: un riel de iconos, como el de Rinari. */
  collapsed?: boolean
  /** Menú contextual: la ficha de un agente, los ajustes y la ficha de un equipo. */
  onAgentCard?: (agentId: string) => void
  onOpenSettings?: (agentId: string | null, teamId: string | null) => void
  onTeamCard?: (team: AgencyTeam) => void
  onEditTeam?: (team: AgencyTeam) => void
}

/** Una acción del menú de una fila. */
interface RowAction {
  key: string
  icon: ReactNode
  label: string
  onSelect: () => void
  disabled?: boolean
  separatorBefore?: boolean
}

/**
 * El menú de una fila de la Agency (clic derecho o «…»), como el de las
 * conversaciones de Rinari: con teclado se abre desde el botón «…».
 */
function RowMenu({ open, onOpenChange, label, actions }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  actions: RowAction[]
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="agency-row-more" aria-label={label} title={label} onClick={(event) => event.stopPropagation()} data-testid="agency-row-menu">
          <MoreHorizontal size={14} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-max max-w-[calc(100vw-16px)]">
        {actions.map((action) => (
          <span key={action.key} className="contents">
            {action.separatorBefore && <DropdownMenuSeparator />}
            <DropdownMenuItem disabled={action.disabled} onSelect={action.onSelect} data-testid={`agency-menu-${action.key}`}>
              {action.icon} {action.label}
            </DropdownMenuItem>
          </span>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** El punto de estado de una fila: trabajando (cian) o te necesita (ámbar), con su nombre para el lector. */
function StateMark({ state, label }: { state: PostState; label: string }) {
  if (state === 'idle') return null
  return state === 'needs_you'
    ? <span className="r-chip agency-row-trail" data-tone="warning" role="img" aria-label={label} title={label}>!</span>
    : <span className="agency-working-dot agency-row-trail" role="img" aria-label={label} title={label} />
}

/** Un botón del riel: solo su icono, con su nombre como etiqueta y tooltip. */
function RailButton({ label, onClick, active = false, tone, testId, children }: {
  label: string
  onClick: () => void
  active?: boolean
  tone?: 'danger' | 'warning'
  testId?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-current={active ? 'page' : undefined}
      className={cn('agency-rail-button', active && 'is-active')}
      data-tone={tone}
      data-testid={testId}
    >
      {children}
    </button>
  )
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
  collapsed = false,
  onAgentCard,
  onOpenSettings,
  onTeamCard,
  onEditTeam,
  onUseTemplate,
}: AgencySidebarProps) {
  const { t } = useI18n()
  const working = new Set(status?.agent_ids.working ?? [])
  const waiting = new Set(status?.agent_ids.needs_you ?? [])
  const nameOf = new Map(agents.map((agent) => [agent.id, agent.name]))
  const byId = new Map(agents.map((agent) => [agent.id, agent]))
  // Which row's menu is open: `agent:<id>`, `post:<team>:<agent>` or `office:<team>`.
  const [menu, setMenu] = useState<string | null>(null)
  const stateText = (state: PostState) => (state === 'needs_you' ? t('agency.agent.needsYou') : state === 'working' ? t('agency.agent.working') : '')
  const copySession = (sessionId: string | null | undefined) => {
    if (!sessionId) return
    void copyText(sessionId).then((ok) => toast[ok ? 'success' : 'error'](t(ok ? 'sidebar.sessionIdCopied' : 'sidebar.sessionIdCopyFailed')))
  }
  const agentActions = (agentId: string, sessionId: string | null | undefined): RowAction[] => [
    ...(onAgentCard ? [{ key: 'card', icon: <IdCard size={13} />, label: t('agency.menu.card'), onSelect: () => onAgentCard(agentId) }] : []),
    ...(onOpenSettings ? [{ key: 'settings', icon: <Settings2 size={13} />, label: t('agency.menu.settings'), onSelect: () => onOpenSettings(agentId, null) }] : []),
    { key: 'copy', icon: <Copy size={13} />, label: t('sidebar.copySessionId'), onSelect: () => copySession(sessionId), disabled: !sessionId, separatorBefore: true },
  ]
  const officeActions = (team: AgencyTeam): RowAction[] => [
    ...(onTeamCard ? [{ key: 'card', icon: <IdCard size={13} />, label: t('agency.menu.teamCard'), onSelect: () => onTeamCard(team) }] : []),
    ...(onEditTeam ? [{ key: 'edit', icon: <Pencil size={13} />, label: t('agency.team.card.edit'), onSelect: () => onEditTeam(team) }] : []),
    ...(onOpenSettings ? [{ key: 'settings', icon: <Settings2 size={13} />, label: t('agency.menu.settings'), onSelect: () => onOpenSettings(null, team.id) }] : []),
  ]
  // En el cajón móvil la barra va siempre expandida, como la de Rinari.
  const mobileOpen = useUIStore((state) => state.sidebarOpen)

  if (collapsed && !mobileOpen) {
    return (
      <div className="agency-rail" data-testid="agency-sidebar" data-rail="true">
        <RailButton label={t('agency.sidebar.newAgent')} onClick={onNewAgent} active={creating} testId="agency-new-agent">
          <UserPlus size={17} aria-hidden="true" />
        </RailButton>
        <div className="agency-rail-list" aria-label={t('agency.sidebar.agents')}>
          {agents.map((agent) => {
            const state = waiting.has(agent.id) ? t('agency.agent.needsYou') : working.has(agent.id) ? t('agency.agent.working') : ''
            return (
              <button
                key={agent.id}
                type="button"
                className={cn('agency-rail-avatar', agent.id === activeAgentId && 'is-active')}
                onClick={() => onOpenAgent(agent)}
                aria-current={agent.id === activeAgentId ? 'page' : undefined}
                aria-label={state ? `${agent.name} · ${state}` : agent.name}
                title={state ? `${agent.name} · ${state}` : agent.name}
                data-testid="agency-agent-row"
              >
                <AgentAvatar agent={agent} size={30} />
                {waiting.has(agent.id) ? <span className="agency-rail-dot" data-tone="warning" aria-hidden="true" /> : working.has(agent.id) ? <span className="agency-rail-dot" aria-hidden="true" /> : null}
              </button>
            )
          })}
          {teams.length > 0 && <span className="agency-rail-sep" aria-hidden="true" />}
          {teams.map((team) => {
            const active = activeTeam?.teamId === team.id
            const state = teamState(team, status)
            const office = t('agency.sidebar.office', { name: team.name })
            return (
              <RailButton key={team.id} label={state === 'idle' ? office : `${office} · ${stateText(state)}`} onClick={() => onOpenOffice?.(team)} active={active} testId="agency-team-office">
                <span className="agency-team-mark" aria-hidden="true"><UsersRound size={14} /></span>
                {state !== 'idle' && <span className="agency-rail-dot" data-tone={state === 'needs_you' ? 'warning' : undefined} aria-hidden="true" />}
              </RailButton>
            )
          })}
          {onNewTeam && (
            <RailButton label={t('agency.sidebar.newTeam')} onClick={onNewTeam} testId="agency-new-team">
              <Plus size={16} aria-hidden="true" />
            </RailButton>
          )}
        </div>
        {halted && onResume ? (
          <RailButton label={`${t('agency.sidebar.resume')} · ${t('agency.sidebar.stopped')}`} onClick={onResume} tone="warning" testId="agency-resume">
            <Play size={17} aria-hidden="true" />
          </RailButton>
        ) : onStopAll && agents.length > 0 && (
          <RailButton label={t('agency.sidebar.stopAll')} onClick={onStopAll} tone="danger" testId="agency-stop-all">
            <OctagonX size={17} aria-hidden="true" />
          </RailButton>
        )}
        {onSettings && (
          <RailButton label={t('agency.sidebar.settings')} onClick={onSettings} active={settingsOpen} testId="agency-settings-link">
            <Settings2 size={17} aria-hidden="true" />
          </RailButton>
        )}
        <RailButton label={t('agency.sidebar.tutorial')} onClick={onTutorial}>
          <CircleHelp size={17} aria-hidden="true" />
        </RailButton>
        <AgencyCard mode="leave" status={status} onClick={onLeave} compact />
        <RailButton label={t('app.settings')} onClick={() => dispatchAction('settings')}>
          <Settings size={17} aria-hidden="true" />
        </RailButton>
        <ApplicationMenu collapsed />
      </div>
    )
  }

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
              const key = `agent:${agent.id}`
              return (
                <li key={agent.id} className="agency-row-item" onContextMenu={(event) => { event.preventDefault(); setMenu(key) }}>
                  <button
                    type="button"
                    className={cn('agency-agent-row', agent.id === activeAgentId && 'is-active')}
                    onClick={() => onOpenAgent(agent)}
                    aria-current={agent.id === activeAgentId ? 'page' : undefined}
                    aria-label={state ? `${agent.name} · ${state}` : agent.name}
                    data-testid="agency-agent-row"
                  >
                    <AgentAvatar agent={agent} size={26} />
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate">{agent.name}</span>
                      {agent.role && <span className="block truncate text-[11px] text-[var(--text-subtle)]">{agent.role}</span>}
                    </span>
                    {waiting.has(agent.id) ? (
                      <span className="r-chip agency-row-trail" data-tone="warning" aria-hidden="true">!</span>
                    ) : working.has(agent.id) ? (
                      <span className="agency-working-dot agency-row-trail" aria-hidden="true" />
                    ) : null}
                  </button>
                  <RowMenu open={menu === key} onOpenChange={(open) => setMenu(open ? key : null)} label={t('agency.menu.label', { name: agent.name })} actions={agentActions(agent.id, agent.session_id)} />
                </li>
              )
            })}
          </ul>
        )}

        <div className="mb-1 mt-5 flex items-center justify-between gap-2 px-2">
          <p className="sidebar-heading">{t('agency.sidebar.teams')}</p>
          {onNewTeam && onUseTemplate ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="icon-btn agency-new-team" aria-label={t('agency.sidebar.newTeam')} title={t('agency.sidebar.newTeam')} data-testid="agency-new-team">
                  <Plus size={14} aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-max">
                <DropdownMenuItem onSelect={onNewTeam} data-testid="agency-new-team-blank"><UsersRound size={13} /> {t('agency.sidebar.newTeamBlank')}</DropdownMenuItem>
                <DropdownMenuItem onSelect={onUseTemplate} data-testid="agency-new-team-template"><LayoutTemplate size={13} /> {t('agency.tutorial.template')}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : onNewTeam && (
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
              const officeKey = `office:${team.id}`
              return (
                <li key={team.id} data-testid="agency-team">
                  <div className="agency-row-item" onContextMenu={(event) => { if (event.defaultPrevented) return; event.preventDefault(); setMenu(officeKey) }}>
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
                  <RowMenu open={menu === officeKey} onOpenChange={(open) => setMenu(open ? officeKey : null)} label={t('agency.menu.label', { name: team.name })} actions={officeActions(team)} />
                  </div>
                  {team.posts.length > 0 && (
                    <ul className="agency-posts" aria-label={t('agency.sidebar.posts', { name: team.name })}>
                      {team.posts.map((post) => {
                        const active = activeTeam?.teamId === team.id && activeTeam.agentId === post.agent_id
                        // A name, never a raw id: an agent that is gone says so.
                        const name = nameOf.get(post.agent_id) ?? t('agency.agent.gone')
                        const state = postState(team, post.agent_id, status)
                        const label = t('agency.sidebar.post', { name, team: team.name })
                        const key = `post:${team.id}:${post.agent_id}`
                        return (
                          <li key={post.agent_id} className="agency-row-item" onContextMenu={(event) => { event.preventDefault(); setMenu(key) }}>
                            <button
                              type="button"
                              className={cn('agency-post-row', active && 'is-active')}
                              onClick={() => onOpenPost?.(team, post.agent_id)}
                              aria-current={active ? 'page' : undefined}
                              aria-label={state === 'idle' ? label : `${label} · ${stateText(state)}`}
                              data-testid="agency-post-row"
                              data-state={state}
                            >
                              <AgentAvatar agent={byId.get(post.agent_id) ?? { id: post.agent_id, name }} size={20} />
                              <span className="min-w-0 flex-1 truncate text-left">{name}</span>
                              {team.chief_agent_id === post.agent_id && <span className="agency-chief agency-row-trail" title={t('agency.team.chief')}>{t('agency.team.chiefShort')}</span>}
                              <StateMark state={state} label={stateText(state)} />
                            </button>
                            {byId.has(post.agent_id) && (
                              <RowMenu open={menu === key} onOpenChange={(open) => setMenu(open ? key : null)} label={t('agency.menu.label', { name })} actions={agentActions(post.agent_id, post.session_id)} />
                            )}
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
