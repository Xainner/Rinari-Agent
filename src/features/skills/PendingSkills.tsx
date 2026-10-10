import { useState } from 'react'
import { toast } from 'sonner'
import { commandMessage, engineApi, type SkillProposal } from '../../services/engine'
import { useI18n } from '../../i18n'
import ReviewFindings from './ReviewFindings'
import SkillChanges from './SkillChanges'

const buttonClass =
  'rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40'

/**
 * Lo que espera la aprobación del dueño: una skill nueva que Rinari propuso por
 * su cuenta, un cambio a una skill instalada o creada por el dueño, o contenido
 * que la revisión marcó como peligroso. Una actualización muestra qué cambia.
 * Las mejoras de skills aprendidas no pasan por aquí: se aplican y se avisan.
 */
export default function PendingSkills({ proposals, onChanged }: { proposals: SkillProposal[]; onChanged: () => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function decide(proposal: SkillProposal, approve: boolean) {
    setBusy(proposal.name)
    try {
      if (approve) await engineApi.skillPendingApprove(proposal.name)
      else await engineApi.skillPendingReject(proposal.name)
      toast.success(t(approve ? 'skills.pendingApproved' : 'skills.pendingRejected', { name: proposal.name }))
      onChanged()
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setBusy(null)
    }
  }

  if (proposals.length === 0) return null
  return (
    <section aria-label={t('skills.pendingTitle')} className="space-y-2 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
      <h3 className="text-sm font-semibold text-[var(--text)]">{t('skills.pendingTitle')} · {proposals.length}</h3>
      <p className="text-xs text-[var(--text-subtle)]">{t('skills.pendingDesc')}</p>
      <ul className="space-y-3">
        {proposals.map((proposal) => (
          <li key={proposal.name} className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-[var(--text)]">{proposal.name}</span>
              <span className="rounded-md border border-[var(--border)] px-1.5 text-[10px] text-[var(--text-subtle)]">
                {t(proposal.update ? 'skills.pendingUpdate' : 'skills.pendingNew')}
              </span>
              {proposal.version && <span className="text-[10px] text-[var(--text-subtle)]">v{proposal.version}</span>}
              <span className="ml-auto flex gap-1.5">
                <button type="button" onClick={() => setOpen(open === proposal.name ? null : proposal.name)} className={buttonClass}>
                  {t(open === proposal.name ? 'skills.pendingHide' : 'skills.pendingShow')}
                </button>
                <button type="button" disabled={busy !== null} onClick={() => void decide(proposal, false)} className={`${buttonClass} text-[var(--danger)]`}>
                  {t('skills.pendingReject')}
                </button>
                <button type="button" disabled={busy !== null} onClick={() => void decide(proposal, true)} className="btn btn-primary btn-sm">
                  {t('skills.pendingApprove')}
                </button>
              </span>
            </div>
            <p className="text-xs text-[var(--text-subtle)]">{proposal.description}</p>
            {(proposal.replaces?.length ?? 0) > 0 && (
              <p className="text-xs text-[var(--text-muted)]">{t('skills.card.replaces', { names: proposal.replaces!.join(', ') })}</p>
            )}
            {proposal.similar_to?.map((similar) => (
              <p key={similar.name} className="text-xs text-[var(--text-muted)]">
                {t('skills.card.similar', { name: similar.name })}
                {similar.reason && <> — {t('skills.card.reason', { reason: similar.reason })}</>}
              </p>
            ))}
            <ReviewFindings review={proposal.review} compact />
            {open === proposal.name && (
              proposal.current_skill_md !== null
                ? <SkillChanges before={proposal.current_skill_md} after={proposal.skill_md} />
                : (
                  <figure>
                    <figcaption className="mb-1 text-[10px] font-semibold tracking-wider text-[var(--text-subtle)] uppercase">{t('skills.pendingProposed')}</figcaption>
                    <pre className="max-h-72 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-2 font-mono text-[11px] whitespace-pre-wrap text-[var(--text-muted)]">{proposal.skill_md}</pre>
                  </figure>
                )
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
