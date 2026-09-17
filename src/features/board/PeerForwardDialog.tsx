import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { commandMessage, engineApi } from '../../services/engine'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import { PEER_MESSAGE_MAX_CHARS } from './peerLimits'

export interface PeerForwardTarget {
  sessionId: string
  label: string
}

export interface PeerForwardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Sesión del panel desde el que se reenvía (queda citada en el destino). */
  sourceSessionId: string
  /** Turno citado (última respuesta) si existe. */
  sourceTurnId: string | null
  /** Texto de la última respuesta del panel origen, para "Usar la última respuesta". */
  lastResponse: string | null
  targets: PeerForwardTarget[]
  onSent?: (target: PeerForwardTarget) => void
}

/**
 * Reenvío manual entre paneles: es el **usuario** quien manda, así que llega
 * al destino como tarea propia (`origin.kind = "user"`, con `quoted_source`),
 * sin consentimiento por destino ni techo de procedencia.
 */
export default function PeerForwardDialog({
  open,
  onOpenChange,
  sourceSessionId,
  sourceTurnId,
  lastResponse,
  targets,
  onSent,
}: PeerForwardDialogProps) {
  const { t } = useI18n()
  const [targetId, setTargetId] = useState<string>(targets[0]?.sessionId ?? '')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setText('')
    setBusy(false)
    setTargetId((current) => (targets.some((item) => item.sessionId === current) ? current : targets[0]?.sessionId ?? ''))
  }, [open, targets])

  const target = useMemo(() => targets.find((item) => item.sessionId === targetId) ?? null, [targets, targetId])
  const trimmed = text.trim()
  const canSend = Boolean(target) && trimmed.length > 0 && trimmed.length <= PEER_MESSAGE_MAX_CHARS && !busy

  async function send() {
    if (!target || !canSend) return
    setBusy(true)
    try {
      await engineApi.peerMessageForward({
        target_session_id: target.sessionId,
        message: trimmed,
        source_session_id: sourceSessionId,
        quoted_source: sourceTurnId ? { session_id: sourceSessionId, turn_id: sourceTurnId } : { session_id: sourceSessionId },
      })
      toast.success(t('board.peers.sent', { label: target.label }))
      onSent?.(target)
      onOpenChange(false)
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('board.peers.sendToTitle')}</DialogTitle>
          <DialogDescription>{t('board.peers.sendToHint')}</DialogDescription>
        </DialogHeader>
        {targets.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">{t('board.peers.noTargets')}</p>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              void send()
            }}
          >
            <label className="block space-y-1 text-xs text-[var(--text-muted)]">
              <span>{t('board.peers.target')}</span>
              <select
                value={targetId}
                aria-label={t('board.peers.target')}
                onChange={(event) => setTargetId(event.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
              >
                {targets.map((item) => (
                  <option key={item.sessionId} value={item.sessionId}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-xs text-[var(--text-muted)]">
              <span className="flex items-center justify-between">
                <span>{t('board.peers.message')}</span>
                <button
                  type="button"
                  disabled={!lastResponse}
                  title={lastResponse ? undefined : t('board.peers.noLastResponse')}
                  onClick={() => lastResponse && setText(lastResponse)}
                  className="text-[11px] text-[var(--accent-2)] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('board.peers.useLastResponse')}
                </button>
              </span>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={6}
                maxLength={PEER_MESSAGE_MAX_CHARS}
                aria-label={t('board.peers.message')}
                autoFocus
                className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)]"
              />
              <span className="block text-right font-mono text-[10px] text-[var(--text-subtle)]">{trimmed.length}/{PEER_MESSAGE_MAX_CHARS}</span>
            </label>
            <DialogFooter>
              <button
                type="button"
                disabled={busy}
                onClick={() => onOpenChange(false)}
                className="rounded-lg px-3 py-2 text-sm hover:bg-[var(--bg-hover)]"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={!canSend}
                className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                {t('board.peers.sendAction')}
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
