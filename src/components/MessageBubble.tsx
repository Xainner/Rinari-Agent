import { useEffect, useState } from 'react'
import { ArrowUpRight, Brain, Check, Copy, Eye, FileText, Image as ImageIcon, LoaderCircle, MessageSquareShare, X } from 'lucide-react'
import type { ChatMessage } from '../types'
import { useI18n } from '../i18n'
import { usePeerNavigation } from '../features/board/PeerNavigationContext'
import { copyText } from '../lib/clipboard'
import { engineApi } from '../services/engine'
import { useBlockingOverlay } from '../stores/overlay'
import Markdown from './Markdown'

function HistoricalAttachment({ attachment }: { attachment: NonNullable<ChatMessage['attachments']>[number] }) {
  const [previewUrl, setPreviewUrl] = useState(attachment.previewUrl)
  const [previewText, setPreviewText] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (previewUrl || attachment.kind !== 'image' || !attachment.uri) return
    let cancelled = false
    setLoading(true)
    void engineApi.attachmentPreview(attachment.uri, 512 * 1024).then((result) => {
      if (cancelled) return
      if (typeof result.data_url === 'string') setPreviewUrl(result.data_url)
      else if (typeof result.base64 === 'string' && typeof result.mime_type === 'string') setPreviewUrl(`data:${result.mime_type};base64,${result.base64}`)
    }).catch(() => undefined).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [attachment.kind, attachment.uri, previewUrl])

  // El visor cubre la ventana: mientras está abierto se retiran las vistas
  // nativas, que si no quedarían por encima de él (§8.3).
  useBlockingOverlay(open)

  async function showPreview() {
    setOpen(true)
    if (previewUrl || previewText !== undefined || !attachment.uri) return
    setLoading(true)
    try {
      const result = await engineApi.attachmentPreview(attachment.derivedUri || attachment.uri, 512 * 1024)
      if (typeof result.text === 'string') setPreviewText(result.text)
      if (typeof result.data_url === 'string') setPreviewUrl(result.data_url)
      else if (typeof result.base64 === 'string' && typeof result.mime_type === 'string') setPreviewUrl(`data:${result.mime_type};base64,${result.base64}`)
    } catch {
      setPreviewText('No se pudo abrir la vista previa de este adjunto.')
    } finally {
      setLoading(false)
    }
  }

  return <>
    <button type="button" onClick={() => void showPreview()} className="inline-flex max-w-56 items-center gap-1.5 rounded-lg border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]" title="Abrir vista previa">
      {previewUrl ? <img src={previewUrl} alt={attachment.name} className="size-8 rounded object-cover" /> : attachment.kind === 'image' ? <ImageIcon size={13} /> : <FileText size={13} />}
      <span className="truncate">{attachment.name}</span>
      {loading && <LoaderCircle size={11} className="animate-spin" />}
    </button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={`Vista previa de ${attachment.name}`} onClick={() => setOpen(false)}>
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3"><Eye size={15} className="text-[var(--accent-2)]" /><span className="min-w-0 flex-1 truncate text-sm text-[var(--text)]">{attachment.name}</span><button type="button" aria-label="Cerrar vista previa" onClick={() => setOpen(false)} className="rounded-lg p-1.5 hover:bg-[var(--bg-hover)]"><X size={15} /></button></div>
        <div className="min-h-32 overflow-auto p-4">{loading && <div className="flex justify-center py-8"><LoaderCircle size={16} className="animate-spin" /></div>}{!loading && previewUrl && <img src={previewUrl} alt={attachment.name} className="mx-auto max-h-[65vh] max-w-full rounded-lg object-contain" />}{!loading && previewText !== undefined && <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[var(--text-muted)]">{previewText}</pre>}{!loading && !previewUrl && previewText === undefined && <p className="py-8 text-center text-sm text-[var(--text-muted)]">No hay vista previa disponible.</p>}</div>
      </div>
    </div>}
  </>
}

/**
 * Burbuja de mensaje: usuario alineado a la derecha, Rinari con Markdown.
 * Edición/regeneración/export llegan con historial de sesión (Fase 4).
 */
export default function MessageBubble({ message }: { message: ChatMessage }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!message.pending) return
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [message.pending])

  if (message.role === 'user' && message.origin?.kind === 'peer') {
    return <PeerBubble message={message} />
  }

  if (message.role === 'user') {
    const quoted = message.origin?.kind === 'user' ? message.origin.quoted_source : null
    const quotedSession = quoted && typeof quoted.session_id === 'string' ? quoted.session_id : null
    return (
      <div className="flex flex-col items-end gap-1">
        {quotedSession && <ForwardedBadge sessionId={quotedSession} />}
        <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[var(--accent)]/15 px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-[var(--text)]">
          {message.attachments && message.attachments.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">
            {message.attachments.map((attachment) => <HistoricalAttachment key={attachment.id} attachment={attachment} />)}
          </div>}
          {message.content}
        </div>
        </div>
      </div>
    )
  }

  if (message.pending) {
    return (
      <div role="status" aria-live="polite" className="flex min-h-10 items-start gap-2 text-sm text-[var(--text-muted)]">
        <Brain size={16} aria-hidden="true" className="mt-0.5 animate-pulse text-[var(--accent-2)]" />
        <div className="flex flex-col">
          <span className="flex items-center gap-2">
            <span>{t('reasoning.thinking')}</span>
            <span className="flex items-center gap-1" aria-hidden="true">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="size-1 animate-bounce rounded-full bg-[var(--accent-2)]"
                  style={{ animationDelay: `${dot * 140}ms` }}
                />
              ))}
            </span>
          </span>
          <span className="mt-0.5 text-[10px] leading-none tabular-nums text-[var(--text-subtle)]">
            {t('reasoning.time', { s: elapsed })}
          </span>
        </div>
      </div>
    )
  }

  async function copy() {
    if (await copyText(message.content)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    }
  }

  return (
    <div className="group relative">
      <Markdown>{message.content || '…'}</Markdown>
      <button
        type="button"
        onClick={copy}
        aria-label={t('bubble.copy')}
        title={t('bubble.copy')}
        className="mt-1 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-[var(--text-subtle)] opacity-0 transition-all group-hover:opacity-100 hover:bg-[var(--bg-hover)] hover:text-[var(--text)] focus-visible:opacity-100"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? t('markdown.copied') : t('bubble.copy')}
      </button>
    </div>
  )
}

/**
 * Mensaje recibido del agente de otro panel. Va a la izquierda, con marco
 * propio y atribución: el usuario debe distinguirlo de su propio prompt. Es
 * dato no confiable para el modelo; el runtime del Engine ya lo limita.
 */
function PeerBubble({ message }: { message: ChatMessage }) {
  const { t } = useI18n()
  const navigation = usePeerNavigation()
  const origin = message.origin!
  const sourceId = origin.source_session_id ?? null
  const label = (sourceId && navigation?.labelFor(sourceId)) || origin.source_label || sourceId || t('board.peers.unknown')
  const canNavigate = Boolean(sourceId && navigation?.labelFor(sourceId))
  return (
    <div className="flex justify-start" data-testid="peer-bubble">
      <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-[var(--accent-2)]/40 bg-[var(--accent-2)]/10 px-4 py-2.5 text-[15px] leading-relaxed text-[var(--text)]">
        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--accent-2)]">
          <MessageSquareShare size={13} aria-hidden="true" />
          <span className="truncate">{t('board.peers.incoming', { label })}</span>
          {typeof origin.hop === 'number' && origin.hop > 1 && (
            <span className="rounded-full bg-[var(--accent-2)]/15 px-1.5 py-0.5 font-mono text-[10px] normal-case" title={t('board.peers.hopHint')}>
              {t('board.peers.hop', { n: origin.hop })}
            </span>
          )}
          {canNavigate && sourceId && (
            <button
              type="button"
              onClick={() => navigation?.focusSession(sourceId)}
              className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 normal-case text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
            >
              {t('board.peers.goToPane')} <ArrowUpRight size={11} aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="whitespace-pre-wrap">{message.content}</div>
        <p className="mt-1.5 text-[10px] text-[var(--text-subtle)]">{t('board.peers.untrusted')}</p>
      </div>
    </div>
  )
}

/** El usuario reenvió a mano un texto de otro panel: se marca la cita, sin techo. */
function ForwardedBadge({ sessionId }: { sessionId: string }) {
  const { t } = useI18n()
  const navigation = usePeerNavigation()
  const label = navigation?.labelFor(sessionId) ?? sessionId
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-[var(--text-subtle)]">
      <MessageSquareShare size={11} aria-hidden="true" />
      {t('board.peers.forwardedFrom', { label })}
    </span>
  )
}
