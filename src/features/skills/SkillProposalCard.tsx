import { useState } from 'react'
import { LoaderCircle, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { commandMessage, engineApi } from '../../services/engine'
import { useUIStore } from '../../stores/ui'
import { SKILLS_CHANGED_EVENT } from '../../components/composer/useSlashCommands'
import type { SkillTimelineItem } from '../activity/types'

type Status = SkillTimelineItem['status']

/**
 * Una skill en el chat, fuera de la actividad plegada: la propuesta que
 * espera al dueño (nueva, mejora, fusión o parecida a otra) o la que ya se
 * guardó porque el dueño la pidió (/learn, /lesson), con «Deshacer».
 *
 * El Engine decide el estado; la tarjeta solo refleja lo que respondió y la
 * resolución que llega después (`skill.proposal.resolved`).
 */
export function SkillProposalCard({ item }: { item: SkillTimelineItem }) {
  const { t } = useI18n()
  const goSettings = useUIStore((s) => s.goSettings)
  const openSkill = useUIStore((s) => s.openSkill)
  const [local, setLocal] = useState<{ status: Status; turnedOff?: string[]; turnedOn?: string[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const status = local?.status ?? item.status
  const turnedOff = local?.turnedOff ?? item.turnedOff ?? []
  const turnedOn = local?.turnedOn ?? item.turnedOn ?? []
  const merge = item.replaces.length > 0

  async function act(action: 'approve' | 'reject' | 'undo') {
    setBusy(true)
    try {
      if (action === 'approve') {
        const result = await engineApi.skillPendingApprove(item.name)
        setLocal({ status: 'approved', turnedOff: result.turned_off ?? [] })
      } else if (action === 'reject') {
        await engineApi.skillPendingReject(item.name)
        setLocal({ status: 'rejected' })
      } else {
        const result = await engineApi.skillRevert(item.name)
        setLocal({ status: 'undone', turnedOn: result.turned_on ?? [] })
      }
      window.dispatchEvent(new Event(SKILLS_CHANGED_EVENT))
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setBusy(false)
    }
  }

  // Lo que ya se guardó sin esperar (el dueño lo pidió) no se presenta como propuesta.
  const saved = item.status === 'active'
  const versions = { from: item.previousVersion ?? '—', to: item.version ?? '—' }
  const title = merge
    ? t('skills.card.merge', { name: item.name, names: item.replaces.join(', ') })
    : item.update
      ? t(saved ? 'skills.card.updated' : 'skills.card.update', { name: item.name, ...versions })
      : t(saved ? 'skills.card.savedNew' : 'skills.card.new', { name: item.name })
  const outcome =
    status === 'approved'
      ? turnedOff.length
        ? t('skills.card.approvedMerge', { names: turnedOff.join(', ') })
        : t('skills.card.approved')
      : status === 'rejected'
        ? t('skills.card.rejected')
        : status === 'undone'
          ? turnedOn.length
            ? t('skills.card.undoneMerge', { names: turnedOn.join(', ') })
            : t('skills.card.undone')
          : status === 'active'
            ? t('skills.card.saved')
            : null
  const button =
    'rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-semibold hover:bg-[var(--bg-hover)] disabled:opacity-50'

  return (
    <section
      data-testid="skill-proposal"
      data-status={status}
      aria-label={title}
      className="mt-3 space-y-2 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-sm"
    >
      <div className="flex items-start gap-2">
        <Sparkles size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--accent)]" />
        <div className="min-w-0 space-y-1">
          <p className="font-semibold text-[var(--text)] [overflow-wrap:anywhere]">{title}</p>
          {item.description && <p className="text-xs text-[var(--text-muted)]">{item.description}</p>}
        </div>
      </div>
      {item.similarTo.length > 0 && (
        <ul className="space-y-1 text-xs text-[var(--text-muted)]">
          {item.similarTo.map((similar) => (
            <li key={similar.name} data-testid="skill-similar">
              {t('skills.card.similar', { name: similar.name })}
              {similar.reason && <> — {t('skills.card.reason', { reason: similar.reason })}</>}
            </li>
          ))}
        </ul>
      )}
      {item.review === 'danger' && status === 'pending' && (
        <p className="text-xs text-[var(--danger)]">{t('skills.card.danger')}</p>
      )}
      {outcome && (
        <p role="status" className="text-xs text-[var(--text-muted)]">
          {outcome}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {busy && <LoaderCircle size={13} aria-hidden="true" className="motion-safe:animate-spin" />}
        {status === 'pending' && (
          <>
            <button type="button" disabled={busy} className={`${button} bg-[var(--accent)] text-white`} onClick={() => void act('approve')}>
              {t('skills.pendingApprove')}
            </button>
            <button type="button" disabled={busy} className={button} onClick={() => void act('reject')}>
              {t('skills.pendingReject')}
            </button>
            <button type="button" className={button} onClick={() => goSettings('skills')}>
              {t('skills.card.review')}
            </button>
          </>
        )}
        {(status === 'active' || status === 'approved') && (
          <>
            <button type="button" disabled={busy} className={button} onClick={() => void act('undo')}>
              {t('skills.learned.undo')}
            </button>
            <button type="button" className={button} onClick={() => openSkill(item.name)}>
              {t('skills.learned.view')}
            </button>
          </>
        )}
      </div>
    </section>
  )
}
