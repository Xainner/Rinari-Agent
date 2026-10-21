import { MessageSquare, SlidersHorizontal, UserPlus } from 'lucide-react'
import { useI18n } from '../../i18n'
import { art } from '../rinari/art'
import AgentAvatar from './AgentAvatar'
import type { AgencyAgent, AgencyStatus, AgentSpend } from './types'
import { agencyStatusLine } from './AgencyCard'

interface AgencyHomeProps {
  agents: AgencyAgent[]
  status: AgencyStatus | null
  loaded: boolean
  onOpenAgent: (agent: AgencyAgent) => void
  onEditAgent: (agent: AgencyAgent) => void
  onNewAgent: () => void
}

const usd = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const count = new Intl.NumberFormat()

/** El gasto de hoy tal como lo sabe el Engine: un coste desconocido se dice, no es cero. */
function spendLine(spend: AgentSpend | undefined, t: ReturnType<typeof useI18n>['t']): string | null {
  if (!spend) return null
  const tokens = count.format(spend.tokens)
  if (spend.tokens > 0 && !spend.cost_known) return t('agency.home.spendUnknown', { tokens })
  if (spend.cost_usd !== null && spend.cost_usd > 0) return t('agency.home.spendCost', { tokens, cost: usd.format(spend.cost_usd) })
  return t('agency.home.spend', { tokens })
}

/** El inicio de la Agency en la vista Normal: sus agentes, o cómo empezar. */
export default function AgencyHome({ agents, status, loaded, onOpenAgent, onEditAgent, onNewAgent }: AgencyHomeProps) {
  const { t } = useI18n()
  const working = new Set(status?.agent_ids.working ?? [])
  const waiting = new Set(status?.agent_ids.needs_you ?? [])

  if (loaded && agents.length === 0) {
    return (
      <div className="agency-empty" data-testid="agency-home-empty">
        <img src={art.chibi('wave')} alt="" className="agency-empty-art" draggable={false} />
        <h1 className="font-display text-[24px] font-semibold text-[var(--text)]">{t('agency.home.emptyTitle')}</h1>
        <p className="max-w-[440px] text-center text-[13.5px] leading-relaxed text-[var(--text-muted)]">{t('agency.home.emptyCopy')}</p>
        <button type="button" className="btn btn-primary" onClick={onNewAgent} data-testid="agency-home-create">
          <UserPlus size={15} aria-hidden="true" /> {t('agency.sidebar.newAgent')}
        </button>
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
      <ul className="agency-grid">
        {agents.map((agent) => {
          const state = waiting.has(agent.id)
            ? { tone: 'warning', text: t('agency.agent.needsYou') }
            : working.has(agent.id)
              ? { tone: 'accent', text: t('agency.agent.working') }
              : agent.spend_today?.over_budget
                ? { tone: 'danger', text: t('agency.agent.overBudget') }
                : null
          const spend = spendLine(agent.spend_today, t)
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
    </div>
  )
}
