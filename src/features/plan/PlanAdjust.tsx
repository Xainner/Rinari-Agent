import { PencilLine, Send } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { commandMessage, engineApi } from '../../services/engine'

/**
 * «Ajustar» un plan con una respuesta ahí mismo (plan 0.4.0 #55): el campo se
 * abre en la tarjeta (o arriba de la vista «Plan»); al enviarlo arranca un
 * turno PLAN que revisa **ese** plan con el comentario, sin una burbuja suelta
 * del usuario, y su resultado es la versión siguiente del mismo plan.
 */
export default function PlanAdjust({ sessionId, planTurnId, disabled = false }: { sessionId: string; planTurnId: string; disabled?: boolean }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const comment = String(new FormData(event.currentTarget).get('comment') ?? '').trim()
    if (!comment) return
    setSending(true)
    try {
      await engineApi.startPlanTurn(sessionId, { kind: 'user', source: 'plan_adjust', plan_turn_id: planTurnId, comment })
      setOpen(false)
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setSending(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} aria-expanded={false} onClick={() => setOpen(true)}>
        <PencilLine size={13} aria-hidden="true" /> {t('plan.adjust')}
      </button>
    )
  }
  return (
    <form className="plan-adjust" onSubmit={(event) => void submit(event)} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false) } }}>
      <input
        name="comment"
        className="field-input"
        aria-label={t('plan.adjustLabel')}
        placeholder={t('plan.adjustPlaceholder')}
        autoFocus
        disabled={sending}
      />
      <button type="submit" className="btn btn-primary btn-sm" disabled={sending}>
        <Send size={12} aria-hidden="true" /> {t('plan.adjustSend')}
      </button>
    </form>
  )
}
