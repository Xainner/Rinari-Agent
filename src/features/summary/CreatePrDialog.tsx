import { GitPullRequestCreate } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { commandMessage, engineApi, onEngineEvent } from '../../services/engine'
import { platform } from '../../platform'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog'

/**
 * «Crear PR» (plan 0.4.0 #82): publicar algo siempre se confirma. La tarjeta
 * pide título, rama base y descripción; gh trabaja en segundo plano y el
 * resultado llega como `repo.pr.created` o `repo.pr.failed`. Nunca hace push.
 */
export default function CreatePrDialog({ open, onClose, sessionId, branch, defaultTitle, defaultBase }: {
  open: boolean
  onClose: () => void
  sessionId: string
  branch: string
  defaultTitle: string
  defaultBase: string
}) {
  const { t } = useI18n()
  const [sending, setSending] = useState(false)
  const job = useRef<string | null>(null)

  // El resultado llega por evento, aunque el diálogo ya se haya cerrado.
  useEffect(() => {
    let stop: (() => void) | undefined
    let alive = true
    void onEngineEvent((event) => {
      if (event.payload?.session_id !== sessionId || !job.current || event.payload?.job_id !== job.current) return
      if (event.event === 'repo.pr.created') {
        job.current = null
        const url = typeof event.payload.url === 'string' ? event.payload.url : ''
        toast.success(t('summary.pr.created', { n: String(event.payload.number ?? '') }), url ? { action: { label: t('summary.pr.open'), onClick: () => void platform().opener.openUrl(url) } } : undefined)
      } else if (event.event === 'repo.pr.failed') {
        job.current = null
        toast.error(t('summary.pr.failed', { reason: String(event.payload.error?.message ?? '') }))
      }
    }).then((unsubscribe) => { if (alive) stop = unsubscribe; else unsubscribe() })
    return () => { alive = false; stop?.() }
  }, [sessionId, t])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const title = String(form.get('title') ?? '').trim()
    const base = String(form.get('base') ?? '').trim()
    if (!title || !base) return
    setSending(true)
    try {
      const result = await engineApi.repoPrCreate(sessionId, { title, base, body: String(form.get('body') ?? '') })
      job.current = result.job_id
      toast(t('summary.pr.creating'))
      onClose()
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-lg" data-testid="create-pr-dialog">
        <DialogHeader>
          <DialogTitle>{t('summary.pr.title')}</DialogTitle>
          <DialogDescription>{t('summary.pr.desc', { branch })}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="create-pr-form">
          <label className="field-label" htmlFor="pr-title">{t('summary.pr.fieldTitle')}</label>
          <input id="pr-title" name="title" className="field-input" defaultValue={defaultTitle} required autoFocus />
          <label className="field-label" htmlFor="pr-base">{t('summary.pr.fieldBase')}</label>
          <input id="pr-base" name="base" className="field-input font-mono" defaultValue={defaultBase} required spellCheck={false} />
          <label className="field-label" htmlFor="pr-body">{t('summary.pr.fieldBody')}</label>
          <textarea id="pr-body" name="body" className="field-input create-pr-body" rows={5} />
          <div className="create-pr-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>{t('common.cancel')}</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={sending}>
              <GitPullRequestCreate size={13} aria-hidden="true" /> {t('summary.pr.confirm')}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
