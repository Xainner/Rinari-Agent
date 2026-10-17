import { useState } from 'react'
import { GitBranchPlus } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { desktopApi, type QuestionRequest } from '../../services/desktop'
import { commandMessage } from '../../services/engine'

export interface SessionOffer {
  title: string
  prompt: string
  reason?: string
  context?: 'brief' | 'fork'
  isolation?: 'auto' | 'worktree' | 'same'
  done_when?: string
}

/** The offer an Engine question carries, when it is one (plan-sesiones-hijas 5.1). */
export function offerOf(request: QuestionRequest): SessionOffer | null {
  const offer = (request as QuestionRequest & { offer?: unknown }).offer
  if (!offer || typeof offer !== 'object') return null
  const value = offer as Partial<SessionOffer>
  return typeof value.title === 'string' && typeof value.prompt === 'string' ? (value as SessionOffer) : null
}

/**
 * «¿Nueva sesión o aquí?»: Rinari thinks a task the owner asked for would go
 * better in its own conversation and waits for the answer. Nothing opens
 * unless the owner chooses «Nueva sesión».
 */
export function OfferCard({ request, offer, onResolved }: { request: QuestionRequest; offer: SessionOffer; onResolved: () => void }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const answer = async (choice: 'new_session' | 'here') => {
    setBusy(true)
    try {
      await desktopApi.answer(request, { offer: choice }, false)
      onResolved()
    } catch (error) {
      setBusy(false)
      toast.error(commandMessage(error))
    }
  }
  return (
    <section className="question-card offer-card mb-3 p-4 text-sm" data-testid="offer-card" aria-label={t('children.offer.region')}>
      <p className="offer-card-kicker"><GitBranchPlus size={13} aria-hidden="true" /> {t('children.offer.question')}</p>
      <h3 className="offer-card-title">{offer.title}</h3>
      {offer.reason && <p className="offer-card-reason">{offer.reason}</p>}
      <p className={`offer-card-prompt${expanded ? ' is-expanded' : ''}`}>{offer.prompt}</p>
      {offer.prompt.length > 160 && (
        <button type="button" className="offer-card-more" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
          {expanded ? t('followups.less') : t('followups.readAll')}
        </button>
      )}
      <p className="offer-card-meta">
        {t(offer.context === 'fork' ? 'children.context.fork' : 'children.context.brief')}
        {' · '}
        {t(offer.isolation === 'same' ? 'children.isolation.same' : offer.isolation === 'worktree' ? 'children.isolation.worktree' : 'children.isolation.auto')}
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" disabled={busy} className="btn btn-ghost btn-sm" onClick={() => void answer('here')}>{t('children.offer.here')}</button>
        <button type="button" disabled={busy} className="btn btn-primary btn-sm" onClick={() => void answer('new_session')}>{t('children.offer.new')}</button>
      </div>
    </section>
  )
}
