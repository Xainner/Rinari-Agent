import { seqOfMessage, useReviewExport } from '../features/review/ReviewExportDialog'
import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, Check, Copy, FileText, Film, Flag, Hammer, Music, PencilLine, Image as ImageIcon, LoaderCircle, MessageSquareShare, CalendarClock, Play, Sparkles, SquareSlash, GitBranchPlus, ClipboardList, ChevronRight, PackageOpen } from 'lucide-react'
import type { ChatMessage } from '../types'
import { useI18n } from '../i18n'
import type { I18nKey } from '../i18n/es'
import { usePeerNavigation } from '../features/board/PeerNavigationContext'
import { copyText } from '../lib/clipboard'
import { engineApi } from '../services/engine'
import { AttachmentPreview } from './AttachmentPreview'
import { AttachmentPlayer, isPlayableAttachment } from './AttachmentMedia'
import { useFileWorkspace } from '../features/files/FileWorkspace'
import { ReadingBadges, RecognizedPreview, coverageDetail } from './AttachmentReading'
import Markdown from './Markdown'
import ImageViewer, { useImageViewer } from './image-viewer/ImageViewer'
import { attachmentViewerImages, isImageAttachment } from './image-viewer/attachmentImages'
import { RinariAvatar } from '../features/rinari/RinariAvatar'
import { useOptionalEngineCommands, useOptionalEngineData } from '../features/engine/EngineContext'
import { TurnSessionContext } from '../features/activity/turnSession'
import { commandMessage } from '../services/engine'
import { toast } from 'sonner'
import { useChildrenStore } from '../features/children/childrenStore'

/** An audio or a video the owner sent (#57): a chip that opens its player in the bubble. */
function PlayableAttachment({ attachment }: { attachment: NonNullable<ChatMessage['attachments']>[number] }) {
  const { t } = useI18n()
  const sessionId = useFileWorkspace()?.sessionId
  const [open, setOpen] = useState(false)
  if (open && sessionId) return <div className="w-full min-w-[16rem]"><AttachmentPlayer sessionId={sessionId} attachment={attachment} onClose={() => setOpen(false)} /></div>
  const label = t('attach.play', { name: attachment.name })
  return (
    <button type="button" disabled={!sessionId || !attachment.uri} onClick={() => setOpen(true)} className="attach-chip-play is-history" aria-label={label} title={label}>
      <span className="attach-chip-play-icon" aria-hidden="true"><Play size={10} /></span>
      {attachment.kind === 'audio' ? <Music size={13} aria-hidden="true" /> : <Film size={13} aria-hidden="true" />}
      <span className="truncate">{attachment.name}</span>
    </button>
  )
}

/** Los adjuntos del mensaje: las imágenes se recorren juntas en el visor grande (#77). */
function MessageAttachments({ attachments }: { attachments: NonNullable<ChatMessage['attachments']> }) {
  const files = useFileWorkspace()
  const viewer = useImageViewer()
  const images = useMemo(() => attachmentViewerImages(attachments, files), [attachments, files])
  return <>
    {attachments.map((attachment) => isPlayableAttachment(attachment)
      ? <PlayableAttachment key={attachment.id} attachment={attachment} />
      : <PreviewAttachment key={attachment.id} attachment={attachment} onView={isImageAttachment(attachment) ? (from) => viewer.show(images, Math.max(0, images.findIndex((image) => image.key === attachment.id)), from) : undefined} />)}
    <ImageViewer {...viewer.props} />
  </>
}

function PreviewAttachment({ attachment, onView }: { attachment: NonNullable<ChatMessage['attachments']>[number]; onView?: (from: HTMLElement) => void }) {
  const { t } = useI18n()
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

  // Una imagen leída con OCR deja ver el original y el texto reconocido.
  const recognized = Boolean(attachment.ocr && attachment.kind === 'image' && attachment.derivedUri)

  async function showPreview() {
    setOpen(true)
    if (recognized || previewUrl || previewText !== undefined || !attachment.uri) return
    setLoading(true)
    try {
      const result = await engineApi.attachmentPreview(attachment.derivedUri || attachment.uri, 512 * 1024)
      if (typeof result.text === 'string') setPreviewText(result.text)
      if (typeof result.data_url === 'string') setPreviewUrl(result.data_url)
      else if (typeof result.base64 === 'string' && typeof result.mime_type === 'string') setPreviewUrl(`data:${result.mime_type};base64,${result.base64}`)
    } catch {
      setPreviewText(t('attach.previewFailed'))
    } finally {
      setLoading(false)
    }
  }

  return <>
    <button type="button" onClick={(event) => (onView ? onView(event.currentTarget) : void showPreview())} className="inline-flex max-w-56 items-center gap-1.5 rounded-lg border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]" title={t('attach.openPreview')}>
      {previewUrl ? <img src={previewUrl} alt={attachment.name} className="size-8 rounded object-cover" /> : attachment.kind === 'image' ? <ImageIcon size={13} /> : <FileText size={13} />}
      <span className="truncate">{attachment.name}</span>
      <ReadingBadges attachment={attachment} />
      {loading && <LoaderCircle size={11} className="animate-spin" />}
    </button>
    <AttachmentPreview name={attachment.name} open={open} onOpenChange={setOpen}>
      {attachment.coverage && <p className="mb-3 text-xs text-[var(--text-muted)]">{t('attach.coverage.pages', { read: attachment.coverage.prepared_pages, total: attachment.coverage.total_pages })} · {coverageDetail(attachment.coverage, t)}</p>}
      {recognized ? <RecognizedPreview attachment={attachment} previewUrl={previewUrl} /> : <>
      {loading && <div className="flex justify-center py-8"><LoaderCircle size={16} className="animate-spin" /></div>}
      {!loading && previewUrl && <img src={previewUrl} alt={attachment.name} className="mx-auto max-h-[65vh] max-w-full rounded-lg object-contain" />}
      {!loading && previewText !== undefined && <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[var(--text-muted)]">{previewText}</pre>}
      {!loading && !previewUrl && previewText === undefined && <p className="py-8 text-center text-sm text-[var(--text-muted)]">{t('attach.previewUnavailable')}</p>}
      </>}
    </AttachmentPreview>
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

  // Implementar o ajustar un plan tampoco es algo que el dueño escribió (#55).
  if (message.role === 'user' && (message.origin?.source === 'plan_implement' || message.origin?.source === 'plan_adjust')) {
    return <PlanSeparator kind={message.origin.source === 'plan_adjust' ? 'adjust' : 'implement'} title={message.origin.plan_title ?? null} comment={message.origin.comment ?? null} />
  }

  // A child session's brief, from the conversation that opened it (plan-sesiones-hijas 5.5).
  if (message.role === 'user' && (message.origin?.source === 'child_brief' || message.origin?.source === 'parent_message')) {
    return <BriefBubble message={message} />
  }
  // The mother's report turn: which children reported back.
  if (message.role === 'user' && message.origin?.source === 'child_report') {
    const origin = message.origin as { children?: unknown; reports?: unknown }
    return <ChildReportSeparator names={message.content} childIds={origin.children} reports={origin.reports} />
  }

  // A turn the goal started is not something the owner wrote: a separator.
  if (message.role === 'user' && message.origin?.source === 'goal') {
    return <GoalSeparator iteration={message.origin.iteration ?? null} />
  }

  if (message.role === 'user') {
    // Solo el mensaje recién enviado entra con la transición de envío; el
    // historial (scroll, recarga) aparece en su sitio.
    const fresh = typeof message.createdAt === 'number' && Date.now() - message.createdAt < 1500
    const quoted = message.origin?.kind === 'user' ? message.origin.quoted_source : null
    const command = message.origin?.kind === 'user' && typeof message.origin.command === 'string' ? message.origin.command : null
    const text = command ? withoutCommand(message.content, command) : message.content
    const quotedSession = quoted && typeof quoted.session_id === 'string' ? quoted.session_id : null
    return (
      <div data-testid="user-message-row" className="group/user flex w-full min-w-0 flex-col items-end gap-1">
        {quotedSession && <ForwardedBadge sessionId={quotedSession} />}
        {message.origin?.kind === 'schedule' && <ScheduledBadge />}
        <div className="flex w-full min-w-0 items-center justify-end gap-2">
        <ChildFromMessage text={text} />
        <ExportFromMessage messageId={message.id} turnId={message.turnId} />
        <div data-testid="user-message-bubble" className={`user-bubble w-fit min-w-0 max-w-[85%] px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] text-[var(--text)]${fresh ? ' is-fresh' : ''}`}>
          {message.attachments && message.attachments.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">
            <MessageAttachments attachments={message.attachments} />
          </div>}
          {command && <><CommandChip name={command} kind={message.origin?.command_kind ?? 'command'} />{text && <br />}</>}
          {text}
        </div>
        </div>
      </div>
    )
  }

  if (message.pending) {
    return (
      <div role="status" aria-live="polite" className="rinari-working min-h-10">
        <RinariAvatar state="thinking" size={38} />
        <div className="flex flex-col">
          <span className="activity-text-shimmer">{t('reasoning.thinking')}</span>
          <span className="mt-1 text-[10.5px] leading-none tabular-nums text-[var(--text-subtle)]">
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
    <div className="flex w-full min-w-0 justify-start" data-testid="peer-bubble">
      <div className="w-fit min-w-0 max-w-[85%] [overflow-wrap:anywhere] rounded-2xl rounded-bl-md border border-[var(--accent-2)]/40 bg-[var(--accent-2)]/10 px-4 py-2.5 text-[15px] leading-relaxed text-[var(--text)]">
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
/** El prompt lo envió una tarea programada, no el usuario en ese momento. */
/**
 * El comando o la skill con que empezó el mensaje, como etiqueta en vez del
 * «/nombre» crudo. El texto que escribiste después queda debajo.
 */
function CommandChip({ name, kind }: { name: string; kind: string }) {
  const { t } = useI18n()
  const skill = kind === 'skill'
  const Icon = skill ? Sparkles : SquareSlash
  return (
    <span
      data-testid="command-chip"
      title={t(skill ? 'message.skillUsed' : 'message.commandUsed', { name })}
      className="mb-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--accent)]/35 bg-[var(--accent)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--accent-2)]"
    >
      <Icon size={12} aria-hidden="true" className="shrink-0" />
      <span className="truncate">{name}</span>
      <span className="sr-only">{t(skill ? 'message.skillUsed' : 'message.commandUsed', { name })}</span>
    </span>
  )
}

/** Quita el «/nombre» del principio: la etiqueta ya lo dice. */
export function withoutCommand(content: string, name: string): string {
  const prefix = `/${name}`
  if (!content.startsWith(prefix)) return content
  const rest = content.slice(prefix.length)
  return rest === '' || /^\s/.test(rest) ? rest.trimStart() : content
}

function ScheduledBadge() {
  const { t } = useI18n()
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-[var(--text-subtle)]">
      <CalendarClock size={11} aria-hidden="true" />
      {t('schedules.fromTask')}
    </span>
  )
}

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

function PlanSeparator({ kind, title, comment }: { kind: 'implement' | 'adjust'; title: string | null; comment: string | null }) {
  const { t } = useI18n()
  const text = kind === 'adjust'
    ? (comment ? t('plan.separator.adjust', { comment }) : t('plan.separator.adjustPlain'))
    : (title ? t('plan.separator.implement', { title }) : t('plan.separator.implementPlain'))
  return (
    <div data-testid="plan-separator" data-kind={kind} className="goal-separator plan-separator" role="separator">
      <span title={text}>{kind === 'adjust' ? <PencilLine size={11} aria-hidden="true" /> : <Hammer size={11} aria-hidden="true" />}<span className="plan-separator-text">{text}</span></span>
    </div>
  )
}

/** «Hacer en sesión hija»: the owner's message, as the task of a child (plan-sesiones-hijas 5.4). */
/** «Exportar desde aquí» (#79): el paquete de revisión desde este mensaje. */
function ExportFromMessage({ messageId, turnId }: { messageId: string; turnId?: string }) {
  const { t } = useI18n()
  const sessionId = useContext(TurnSessionContext)
  const seq = seqOfMessage(messageId)
  // Un mensaje del turno en curso aún no tiene número: su turno marca el inicio.
  if (!sessionId || (seq === undefined && !turnId)) return null
  return (
    <button type="button" data-testid="export-from-message" className="child-from-message is-icon" title={t('review.fromHereHint')}
      aria-label={t('review.fromHereShort')} onClick={() => useReviewExport.getState().open(sessionId, seq, turnId)}>
      <PackageOpen size={12} aria-hidden="true" />
    </button>
  )
}

function ChildFromMessage({ text }: { text: string }) {
  const { t } = useI18n()
  const sessionId = useContext(TurnSessionContext)
  const [busy, setBusy] = useState(false)
  if (!sessionId || text.trim().length < 10) return null
  const open = async () => {
    setBusy(true)
    try {
      const opened = await engineApi.sessionChildStart(sessionId, text.trim())
      toast(t('children.opened', { title: opened.title }))
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <button type="button" data-testid="child-from-message" disabled={busy} onClick={() => void open()} title={t('children.fromMessageHint')}
      className="child-from-message">
      {busy ? <LoaderCircle size={12} className="motion-safe:animate-spin" aria-hidden="true" /> : <GitBranchPlus size={12} aria-hidden="true" />} {t('children.fromMessage')}
    </button>
  )
}

function useSessionTitle(sessionId: string | null): string | null {
  const data = useOptionalEngineData()
  return sessionId ? data?.sessionsById[sessionId]?.title ?? null : null
}

/** What the mother sent the child (its brief or a later message), folded like Claude Code's «Mensaje recibido de …». */
function BriefBubble({ message }: { message: ChatMessage }) {
  const motherId = (message.origin as { parent_session_id?: string } | undefined)?.parent_session_id ?? null
  const brief = message.origin?.source === 'child_brief'
  return (
    <div data-testid={brief ? 'child-brief' : 'mother-message'} className="child-report-lines">
      <ReceivedLine label={brief ? 'children.briefFrom' : 'children.messageFrom'} sessionId={motherId} fallback="children.fromMotherPlain" text={message.content} />
    </div>
  )
}

/**
 * The children that reported back, one quiet line each, like Claude Code's
 * «Mensaje recibido de …»: the title opens the child, the chevron unfolds
 * what it said.
 */
export function ChildReportSeparator({ names, childIds, reports }: { names: string; childIds: unknown; reports?: unknown }) {
  const { t } = useI18n()
  const ids = Array.isArray(childIds) ? childIds.filter((id): id is string => typeof id === 'string') : []
  if (ids.length === 0) {
    return (
      <div data-testid="child-report-separator" className="goal-separator" role="separator">
        <span><ClipboardList size={11} aria-hidden="true" />{t('children.reportSeparator', { names })}</span>
      </div>
    )
  }
  return (
    <div data-testid="child-report-separator" className="child-report-lines">
      {ids.map((id) => <ChildReportLine key={id} childId={id} said={reportOf(reports, id)} />)}
    </div>
  )
}

/** Lo que dijo esa hija en ese informe (#100); los viejos no lo guardan. */
function reportOf(reports: unknown, id: string): string | undefined {
  if (!reports || typeof reports !== 'object') return undefined
  const text = (reports as Record<string, unknown>)[id]
  return typeof text === 'string' && text ? text : undefined
}

function ChildReportLine({ childId, said }: { childId: string; said?: string }) {
  const child = useChildrenStore((state) => {
    for (const list of Object.values(state.byParent)) {
      const found = list.find((item) => item.child_session_id === childId)
      if (found) return found
    }
    return undefined
  })
  return <ReceivedLine label="children.reportFrom" sessionId={childId} fallbackTitle={child?.title} fallback="children.untitled" text={said ?? (child?.report?.text || child?.report?.summary || '')} />
}

/** «<label> <session> ›»: the title opens that conversation, the chevron unfolds the text. */
function ReceivedLine({ label, sessionId, fallbackTitle, fallback, text }: { label: I18nKey; sessionId: string | null; fallbackTitle?: string; fallback: I18nKey; text: string }) {
  const { t } = useI18n()
  const commands = useOptionalEngineCommands()
  const title = useSessionTitle(sessionId) || fallbackTitle || t(fallback)
  const [open, setOpen] = useState(false)
  // El texto se despliega y se repliega con movimiento: al plegar sigue un
  // instante montado mientras se cierra.
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(closeTimer.current), [])
  const toggle = () => {
    window.clearTimeout(closeTimer.current)
    if (!open) {
      setClosing(false)
      setOpen(true)
      return
    }
    setOpen(false)
    setClosing(true)
    closeTimer.current = window.setTimeout(() => setClosing(false), 180)
  }
  return (
    <div className="child-report-line" data-open={open || undefined}>
      <p className="child-report-head">
        <span>{t(label)}</span>
        {sessionId
          ? <button type="button" className="child-report-title" onClick={() => void commands?.selectSession(sessionId)}>{title}</button>
          : <span className="child-report-title">{title}</span>}
        {text && (
          <button type="button" className="child-report-toggle" aria-expanded={open} aria-label={t(open ? 'children.reportHide' : 'children.reportShow')} title={t(open ? 'children.reportHide' : 'children.reportShow')} onClick={toggle}>
            <ChevronRight size={13} aria-hidden="true" />
          </button>
        )}
      </p>
      {(open || closing) && text && (
        <div className="child-report-fold" data-closing={closing || undefined} aria-hidden={closing || undefined}>
          <div><div className="child-report-body"><Markdown>{text}</Markdown></div></div>
        </div>
      )}
    </div>
  )
}

function GoalSeparator({ iteration }: { iteration: number | null }) {
  const { t } = useI18n()
  return (
    <div data-testid="goal-separator" className="goal-separator" role="separator">
      <span><Flag size={11} aria-hidden="true" />{iteration === 1 ? t('goal.separatorStart') : iteration ? t('goal.separator', { n: iteration }) : t('goal.separatorPlain')}</span>
    </div>
  )
}
