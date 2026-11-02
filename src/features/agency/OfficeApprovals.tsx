import { ArrowUpRight, ShieldAlert } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useAgencyStore } from '../../stores/agency'
import { useOptionalEngineCommands, useOptionalEngineData } from '../engine/EngineContext'
import AgentAvatar from './AgentAvatar'
import type { AgencyAgent, AgencyTeam } from './types'

/**
 * What the team's posts wait for from the owner, in the office itself: who
 * asks, what for, and «Allow once» / «Deny» or «Open post». Before, the office
 * only showed a «!» on the sidebar while the chief kept posting «Waits for …».
 */
export function OfficeApprovals({ team, members }: { team: AgencyTeam; members: readonly AgencyAgent[] }) {
  const { t } = useI18n()
  const data = useOptionalEngineData()
  const commands = useOptionalEngineCommands()
  const postBySession = new Map(team.posts.map((post) => [post.session_id, post.agent_id]))
  const pending = (data?.approvals ?? []).filter((item) => item.session_id && postBySession.has(item.session_id) && item.status !== 'resolving')
  if (pending.length === 0 || !commands) return null
  return (
    <section className="agency-office-approvals" aria-label={t('agency.office.approvals')} data-testid="agency-office-approvals">
      {pending.map((approval) => {
        const agentId = postBySession.get(approval.session_id ?? '') ?? ''
        const agent = members.find((item) => item.id === agentId) ?? { id: agentId, name: t('agency.agent.gone') }
        const openPost = () => {
          useAgencyStore.getState().openPost(team.id, agentId)
          void commands.selectSession(approval.session_id ?? '')
        }
        return (
          <div key={approval.approval_id} className="agency-office-approval" data-testid="agency-office-approval">
            <AgentAvatar agent={agent} size={26} />
            <div className="min-w-0 flex-1">
              <p className="agency-office-approval-who"><ShieldAlert size={12} aria-hidden="true" /> {t('agency.office.needsYou', { name: agent.name })}</p>
              <p className="agency-office-approval-what" title={approval.description || approval.target || approval.capability}>
                {approval.description || approval.target || approval.capability}
              </p>
            </div>
            <div className="agency-office-approval-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void commands.resolveApproval(approval.approval_id, 'allow_once')}>{t('approval.choice.once')}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void commands.resolveApproval(approval.approval_id, 'deny')}>{t('approval.choice.deny')}</button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={openPost}>{t('agency.office.openPost')} <ArrowUpRight size={12} aria-hidden="true" /></button>
            </div>
          </div>
        )
      })}
    </section>
  )
}
