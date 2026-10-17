import { useEffect, useState } from 'react'
import { LoaderCircle, MessageSquareText, PackageOpen, ScrollText, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { create } from 'zustand'
import { useI18n } from '../../i18n'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import { Switch } from '../../components/ui/switch'
import { platform } from '../../platform'
import { commandMessage } from '../../services/engine'

interface ReviewExportState {
  target: { sessionId: string; fromSeq?: number } | null
  open: (sessionId: string, fromSeq?: number) => void
  close: () => void
}

/** «Exportar para revisión» (#79): desde la barra lateral o desde un mensaje. */
export const useReviewExport = create<ReviewExportState>((set) => ({
  target: null,
  open: (sessionId, fromSeq) => set({ target: { sessionId, fromSeq } }),
  close: () => set({ target: null }),
}))

/** El seq de un mensaje del historial (`h12`), si lo tiene. */
export function seqOfMessage(id: string): number | undefined {
  const match = /^h(\d+)$/.exec(id)
  return match ? Number(match[1]) : undefined
}

/**
 * El paquete para revisar una conversación: el Engine prepara su parte sin
 * secretos y el host añade los registros de esas horas y lo guarda (.zip).
 * El texto de los mensajes va por defecto, con el aviso (decisión del dueño).
 */
export default function ReviewExportDialog() {
  const { t } = useI18n()
  const target = useReviewExport((state) => state.target)
  const close = useReviewExport((state) => state.close)
  const [messages, setMessages] = useState(true)
  const [logs, setLogs] = useState(true)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (target) { setMessages(true); setLogs(true) } }, [target])

  const run = async () => {
    if (!target) return
    setBusy(true)
    try {
      const { files } = await platform().command<{ files: Record<string, string> }>('session_review_export', {
        session_id: target.sessionId,
        from_seq: target.fromSeq ?? null,
        include_messages: messages,
      })
      const env = JSON.parse(files['entorno.json'] ?? '{}') as { first_event_at?: string | null; last_event_at?: string | null }
      const result = await platform().diagnostics.exportReview({
        files,
        from: env.first_event_at ?? null,
        to: env.last_event_at ?? null,
        includeLogs: logs,
        suggestedName: `rinari-revision-${target.sessionId}.zip`,
      })
      if (result.saved) {
        toast.success(t('review.saved'))
        close()
      }
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={(next) => { if (!next) close() }}>
      <DialogContent className="review-export max-w-md" data-testid="review-export">
        <div className="review-export-head">
          <span className="review-export-icon" aria-hidden="true"><PackageOpen size={18} /></span>
          <div className="min-w-0">
            <DialogTitle>{t('review.title')}</DialogTitle>
            <DialogDescription className="review-export-scope" data-from={target?.fromSeq !== undefined || undefined}>
              {target?.fromSeq !== undefined ? t('review.fromHere', { n: target.fromSeq }) : t('review.whole')}
            </DialogDescription>
          </div>
        </div>
        <div className="review-export-options">
          <div className="review-export-option" data-on={messages || undefined}>
            <MessageSquareText size={15} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="adv-row-title">{t('review.messages')}</p>
              <p className="adv-row-hint">{messages ? t('review.messagesOn') : t('review.messagesOff')}</p>
            </div>
            <Switch checked={messages} onCheckedChange={setMessages} aria-label={t('review.messages')} />
          </div>
          <div className="review-export-option" data-on={logs || undefined}>
            <ScrollText size={15} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="adv-row-title">{t('review.logs')}</p>
              <p className="adv-row-hint">{t('review.logsHint')}</p>
            </div>
            <Switch checked={logs} onCheckedChange={setLogs} aria-label={t('review.logs')} />
          </div>
        </div>
        <p className="review-export-secrets"><ShieldCheck size={14} aria-hidden="true" /><span>{t('review.secrets')}</span></p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={close}>{t('common.cancel')}</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void run()} data-testid="review-export-save">
            {busy && <LoaderCircle size={13} className="motion-safe:animate-spin" aria-hidden="true" />} {t('review.save')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
