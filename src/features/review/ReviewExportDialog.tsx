import { useEffect, useState } from 'react'
import { LoaderCircle, MessageSquareText, PackageOpen, ScrollText, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { create } from 'zustand'
import { useI18n } from '../../i18n'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import { Switch } from '../../components/ui/switch'
import { platform } from '../../platform'
import { commandMessage } from '../../services/engine'
import { version as APP_VERSION } from '../../../package.json'

interface ReviewExportState {
  target: { sessionId: string } | null
  open: (sessionId: string) => void
  close: () => void
}

/** «Exportar para revisión» (#79): la conversación entera, desde la barra lateral o Avanzado. */
export const useReviewExport = create<ReviewExportState>((set) => ({
  target: null,
  open: (sessionId) => set({ target: { sessionId } }),
  close: () => set({ target: null }),
}))

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
        include_messages: messages,
      })
      const env = JSON.parse(files['entorno.json'] ?? '{}') as { first_event_at?: string | null; last_event_at?: string | null }
      // La versión de la app (la Nightly exacta): sin ella, un paquete de otra
      // máquina no decía qué arreglos tenía (SOIN, 23-oct).
      const withApp = { ...files, 'entorno.json': JSON.stringify({ app_version: APP_VERSION, ...env }) }
      const result = await platform().diagnostics.exportReview({
        files: withApp,
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
            <DialogDescription className="review-export-scope">
              {t('review.whole')}
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
