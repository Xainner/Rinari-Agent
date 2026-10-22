import { useEffect, useMemo, useRef, useState } from 'react'
import { ClipboardCheck, Hand, LayoutTemplate, MessageSquare, OctagonPause, SlidersHorizontal, UserPlus, UsersRound } from 'lucide-react'
import { useI18n } from '../../i18n'
import { engineApi } from '../../services/engine'
import { art } from '../rinari/art'
import AgentAvatar from './AgentAvatar'
import type { AgencyAgent, AgencyStatus, AgencyTeam, AgentSpend, Errand, OfficeMessage } from './types'
import { agencyStatusLine } from './AgencyCard'
import { postState, sessionState, teamState, type PostState } from './postState'

interface AgencyHomeProps {
  agents: AgencyAgent[]
  /** A2: vacío sin `agency_teams_v1`. */
  teams?: AgencyTeam[]
  status: AgencyStatus | null
  loaded: boolean
  onOpenAgent: (agent: AgencyAgent) => void
  onEditAgent: (agent: AgencyAgent) => void
  onNewAgent: () => void
  onOpenOffice?: (team: AgencyTeam) => void
  onOpenPost?: (team: AgencyTeam, agentId: string) => void
  onEditTeam?: (team: AgencyTeam) => void
  onNewTeam?: () => void
  /** «Usar una plantilla» (`agency_audit_v1`); sin él no se ofrece. */
  onUseTemplate?: () => void
}

/** El gasto de hoy tal como lo sabe el Engine: un coste desconocido se dice, no es cero. */
export function spendLine(spend: AgentSpend | undefined, t: ReturnType<typeof useI18n>['t'], locale: string): string | null {
  if (!spend) return null
  const count = new Intl.NumberFormat(locale)
  const usd = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
  const tokens = count.format(spend.tokens)
  if (spend.tokens > 0 && !spend.cost_known) return t('agency.home.spendUnknown', { tokens })
  if (spend.cost_usd !== null && spend.cost_usd > 0) return t('agency.home.spendCost', { tokens, cost: usd.format(spend.cost_usd) })
  return t('agency.home.spend', { tokens })
}

/** Lo que espera al dueño en un equipo: recados entregados por revisar y cadenas cortadas. */
interface TeamWaiting {
  team: AgencyTeam
  delivered: Errand[]
  /** Hay una cadena cortada después de lo último que escribió el dueño en esa oficina. */
  stopped: boolean
}

/**
 * Una cadena cortada sigue esperando hasta que el dueño vuelve a escribir en
 * esa oficina (con «Continuar» o a mano): el último aviso de corte es más
 * nuevo que su último mensaje.
 */
export function chainWaiting(messages: OfficeMessage[]): boolean {
  let lastOwner = -1
  let lastStop = -1
  messages.forEach((message, index) => {
    if (message.author_kind === 'owner' && !message.system) lastOwner = index
    if (message.notice?.kind === 'stopped') lastStop = index
  })
  return lastStop > lastOwner
}

/**
 * Los recados y oficinas de cada equipo, para «Te espera». Se vuelve a leer
 * cuando cambia el estado de la Agency (que se recarga con sus eventos).
 */
function useOwnerQueue(teams: AgencyTeam[], status: AgencyStatus | null): TeamWaiting[] {
  const [queue, setQueue] = useState<TeamWaiting[]>([])
  const seq = useRef(0)
  useEffect(() => {
    const mine = ++seq.current
    if (teams.length === 0) {
      setQueue([])
      return
    }
    void Promise.all(teams.map((team) => engineApi.agencyTeam(team.id)
      .then((result): TeamWaiting => ({
        team,
        delivered: result.errands.filter((errand) => errand.status === 'delivered'),
        stopped: chainWaiting(result.messages),
      }))
      .catch((): TeamWaiting => ({ team, delivered: [], stopped: false }))))
      .then((items) => { if (mine === seq.current) setQueue(items) })
  }, [teams, status])
  return queue
}

function StateChip({ state }: { state: PostState }) {
  const { t } = useI18n()
  if (state === 'idle') return null
  return (
    <span className="r-chip" data-tone={state === 'needs_you' ? 'warning' : 'accent'}>
      {t(state === 'needs_you' ? 'agency.agent.needsYou' : 'agency.agent.working')}
    </span>
  )
}

/**
 * El inicio de la Agency en la vista Normal: lo que te espera (recados por
 * revisar, cadenas cortadas, agentes que te necesitan), tus equipos y tus
 * agentes; o cómo empezar.
 */
export default function AgencyHome({
  agents,
  teams = [],
  status,
  loaded,
  onOpenAgent,
  onEditAgent,
  onNewAgent,
  onOpenOffice,
  onOpenPost,
  onEditTeam,
  onNewTeam,
  onUseTemplate,
}: AgencyHomeProps) {
  const { t, lang } = useI18n()
  const locale = lang === 'es' ? 'es' : 'en'
  const working = new Set(status?.agent_ids.working ?? [])
  const waiting = new Set(status?.agent_ids.needs_you ?? [])
  const queue = useOwnerQueue(teams, status)
  const byId = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents])

  // What waits on the owner, newest kind first: someone asking, then work to review, then cut chains.
  const askingDirect = agents.filter((agent) => agent.session_id && sessionState(agent.session_id, status) === 'needs_you')
  const askingPosts = teams.flatMap((team) => team.posts
    .filter((post) => sessionState(post.session_id, status) === 'needs_you' && byId.has(post.agent_id))
    .map((post) => ({ team, agent: byId.get(post.agent_id) as AgencyAgent })))
  // Someone asking elsewhere (a rule's run, or an Engine without per-conversation
  // state): the agent-level state still says who, and its chat is the way in.
  const covered = new Set([...askingDirect.map((agent) => agent.id), ...askingPosts.map((item) => item.agent.id)])
  const askingAgents = agents.filter((agent) => waiting.has(agent.id) && !covered.has(agent.id))
  const chainsKnown = status?.waiting_for_owner ? status.waiting_for_owner.chains > 0 : true
  const reviewItems = queue.flatMap((item) => item.delivered.map((errand) => ({ team: item.team, errand })))
  const stoppedTeams = chainsKnown ? queue.filter((item) => item.stopped).map((item) => item.team) : []
  const waitingCount = askingDirect.length + askingPosts.length + askingAgents.length + reviewItems.length + stoppedTeams.length

  if (loaded && agents.length === 0) {
    return (
      <div className="agency-empty" data-testid="agency-home-empty">
        <img src={art.chibi('wave')} alt="" className="agency-empty-art" draggable={false} />
        <h1 className="font-display text-[24px] font-semibold text-[var(--text)]">{t('agency.home.emptyTitle')}</h1>
        <p className="max-w-[440px] text-center text-[13.5px] leading-relaxed text-[var(--text-muted)]">{t('agency.home.emptyCopy')}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className="btn btn-primary" onClick={onNewAgent} data-testid="agency-home-create">
            <UserPlus size={15} aria-hidden="true" /> {t('agency.sidebar.newAgent')}
          </button>
          {onUseTemplate && (
            <button type="button" className="btn btn-secondary" onClick={onUseTemplate} data-testid="agency-home-template">
              <LayoutTemplate size={15} aria-hidden="true" /> {t('agency.tutorial.template')}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="agency-home" data-testid="agency-home">
      <header className="agency-home-head">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[22px] font-semibold text-[var(--text)]">{t('agency.home.title')}</h1>
          {status && <p className="agency-home-status" data-attention={status.needs_you > 0 || undefined}>{agencyStatusLine(status, t)}</p>}
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onNewAgent}>
          <UserPlus size={13} aria-hidden="true" /> {t('agency.sidebar.newAgent')}
        </button>
      </header>

      {waitingCount > 0 && (
        <section className="agency-home-section" aria-labelledby="agency-home-waiting" data-testid="agency-home-waiting">
          <h2 id="agency-home-waiting" className="agency-home-heading">
            {t('agency.home.waiting')} <span className="agency-home-count">{waitingCount}</span>
          </h2>
          <ul className="agency-waiting-list">
            {askingDirect.map((agent) => (
              <li key={`direct:${agent.id}`}>
                <button type="button" className="agency-waiting-row" onClick={() => onOpenAgent(agent)} data-tone="warning">
                  <Hand size={14} aria-hidden="true" />
                  <AgentAvatar agent={agent} size={22} />
                  <span className="min-w-0 flex-1 truncate">{t('agency.home.waitingAsks', { name: agent.name })}</span>
                  <span className="agency-waiting-go">{t('agency.home.chat')}</span>
                </button>
              </li>
            ))}
            {askingAgents.map((agent) => (
              <li key={`agent:${agent.id}`}>
                <button type="button" className="agency-waiting-row" onClick={() => onOpenAgent(agent)} data-tone="warning">
                  <Hand size={14} aria-hidden="true" />
                  <AgentAvatar agent={agent} size={22} />
                  <span className="min-w-0 flex-1 truncate">{t('agency.home.waitingAsks', { name: agent.name })}</span>
                  <span className="agency-waiting-go">{t('agency.home.chat')}</span>
                </button>
              </li>
            ))}
            {askingPosts.map(({ team, agent }) => (
              <li key={`post:${team.id}:${agent.id}`}>
                <button type="button" className="agency-waiting-row" onClick={() => onOpenPost?.(team, agent.id)} data-tone="warning">
                  <Hand size={14} aria-hidden="true" />
                  <AgentAvatar agent={agent} size={22} />
                  <span className="min-w-0 flex-1 truncate">{t('agency.home.waitingAsksPost', { name: agent.name, team: team.name })}</span>
                  <span className="agency-waiting-go">{t('agency.sidebar.officeLabel')}</span>
                </button>
              </li>
            ))}
            {reviewItems.map(({ team, errand }) => (
              <li key={`errand:${errand.id}`}>
                <button type="button" className="agency-waiting-row" onClick={() => onOpenOffice?.(team)} data-testid="agency-waiting-errand">
                  <ClipboardCheck size={14} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{t('agency.home.waitingReview', { title: errand.title, team: team.name })}</span>
                  <span className="agency-waiting-go">{t('agency.home.review')}</span>
                </button>
              </li>
            ))}
            {stoppedTeams.map((team) => (
              <li key={`chain:${team.id}`}>
                <button type="button" className="agency-waiting-row" onClick={() => onOpenOffice?.(team)} data-testid="agency-waiting-chain">
                  <OctagonPause size={14} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{t('agency.home.waitingChain', { team: team.name })}</span>
                  <span className="agency-waiting-go">{t('agency.sidebar.officeLabel')}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(teams.length > 0 || onNewTeam) && (
        <section className="agency-home-section" aria-labelledby="agency-home-teams" data-testid="agency-home-teams">
          <div className="agency-home-section-head">
            <h2 id="agency-home-teams" className="agency-home-heading">{t('agency.sidebar.teams')}</h2>
            <span className="flex-1" />
            {onUseTemplate && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onUseTemplate} data-testid="agency-home-template">
                <LayoutTemplate size={13} aria-hidden="true" /> {t('agency.tutorial.template')}
              </button>
            )}
            {onNewTeam && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onNewTeam}>
                <UsersRound size={13} aria-hidden="true" /> {t('agency.sidebar.newTeam')}
              </button>
            )}
          </div>
          {teams.length === 0 ? (
            <p className="field-hint mt-0">{t('agency.home.noTeams')}</p>
          ) : (
            <ul className="agency-grid">
              {teams.map((team) => {
                const state = teamState(team, status)
                const members = team.members.map((id) => byId.get(id)).filter((agent): agent is AgencyAgent => Boolean(agent))
                return (
                  <li key={team.id} className="agency-tile" data-testid="agency-team-tile" data-state={state === 'needs_you' ? 'warning' : state === 'working' ? 'accent' : undefined}>
                    <div className="flex items-start gap-3">
                      <span className="agency-team-mark is-large" aria-hidden="true"><UsersRound size={18} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-[var(--text)]">{team.name}</p>
                        <p className="truncate text-[12.5px] text-[var(--text-muted)]">{team.purpose || t('agency.office.members', { n: members.length })}</p>
                      </div>
                      <StateChip state={state} />
                    </div>
                    {members.length > 0 && (
                      <ul className="agency-office-faces is-tile" aria-label={t('agency.office.members', { n: members.length })}>
                        {members.slice(0, 6).map((agent) => {
                          const memberState = postState(team, agent.id, status)
                          return (
                            <li key={agent.id} className="agency-office-face" data-state={memberState} title={agent.name} aria-label={agent.name}>
                              <AgentAvatar agent={agent} size={26} />
                              {memberState !== 'idle' && <span className="agency-face-dot" data-tone={memberState === 'needs_you' ? 'warning' : undefined} aria-hidden="true" />}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                    <div className="agency-tile-foot">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenOffice?.(team)} aria-label={t('agency.sidebar.office', { name: team.name })}>
                        <MessageSquare size={13} aria-hidden="true" /> {t('agency.sidebar.officeLabel')}
                      </button>
                      {onEditTeam && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEditTeam(team)}>
                          <SlidersHorizontal size={13} aria-hidden="true" /> {t('agency.home.card')}
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      <section className="agency-home-section" aria-labelledby="agency-home-agents">
        {(teams.length > 0 || onNewTeam || waitingCount > 0) && (
          <h2 id="agency-home-agents" className="agency-home-heading">{t('agency.sidebar.agents')}</h2>
        )}
        <ul className="agency-grid">
          {agents.map((agent) => {
            const state = waiting.has(agent.id)
              ? { tone: 'warning', text: t('agency.agent.needsYou') }
              : working.has(agent.id)
                ? { tone: 'accent', text: t('agency.agent.working') }
                : agent.spend_today?.over_budget
                  ? { tone: 'danger', text: t('agency.agent.overBudget') }
                  : null
            const spend = spendLine(agent.spend_today, t, locale)
            return (
              <li key={agent.id} className="agency-tile" data-testid="agency-tile" data-state={state?.tone}>
                <div className="flex items-start gap-3">
                  <AgentAvatar agent={agent} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-[var(--text)]">{agent.name}</p>
                    {agent.role && <p className="truncate text-[12.5px] text-[var(--text-muted)]">{agent.role}</p>}
                  </div>
                  {state && <span className="r-chip" data-tone={state.tone}>{state.text}</span>}
                </div>
                <div className="agency-tile-foot">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenAgent(agent)} aria-label={t('agency.home.open', { name: agent.name })}>
                    <MessageSquare size={13} aria-hidden="true" /> {t('agency.home.chat')}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEditAgent(agent)}>
                    <SlidersHorizontal size={13} aria-hidden="true" /> {t('agency.home.card')}
                  </button>
                  {spend && <span className="agency-tile-spend">{spend}</span>}
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
