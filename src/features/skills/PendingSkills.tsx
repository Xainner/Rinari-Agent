import { useState } from 'react'
import { toast } from 'sonner'
import { commandMessage, engineApi, type SkillProposal } from '../../services/engine'
import { useI18n } from '../../i18n'
import ReviewFindings from './ReviewFindings'

const buttonClass =
  'rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40'

/**
 * Skills que Rinari propuso por su cuenta: nada entra al catálogo hasta que el
 * dueño la aprueba. En una actualización se ve la versión actual al lado.
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
                <button type="button" disabled={busy !== null} onClick={() => void decide(proposal, false)} className={`${buttonClass} text-red-400`}>
                  {t('skills.pendingReject')}
                </button>
                <button type="button" disabled={busy !== null} onClick={() => void decide(proposal, true)} className="rounded-lg bg-[var(--accent)] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40">
                  {t('skills.pendingApprove')}
                </button>
              </span>
            </div>
            <p className="text-xs text-[var(--text-subtle)]">{proposal.description}</p>
            <ReviewFindings review={proposal.review} compact />
            {open === proposal.name && (
              <div className={proposal.current_skill_md ? 'grid gap-2 md:grid-cols-2' : ''}>
                {proposal.current_skill_md && (
                  <figure>
                    <figcaption className="mb-1 text-[10px] font-semibold tracking-wider text-[var(--text-subtle)] uppercase">{t('skills.pendingCurrent')}</figcaption>
                    <pre className="max-h-72 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-2 font-mono text-[11px] whitespace-pre-wrap text-[var(--text-muted)]">{proposal.current_skill_md}</pre>
                  </figure>
                )}
                <figure>
                  <figcaption className="mb-1 text-[10px] font-semibold tracking-wider text-[var(--text-subtle)] uppercase">{t('skills.pendingProposed')}</figcaption>
                  <pre className="max-h-72 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-2 font-mono text-[11px] whitespace-pre-wrap text-[var(--text-muted)]">{proposal.skill_md}</pre>
                </figure>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
