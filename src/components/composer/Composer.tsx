import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import { ArrowUp, Brain, Check, Columns3, Eye, FileText, Image as ImageIcon, LoaderCircle, MessageSquareShare, Paperclip, RefreshCw, Search, Shield, Square, X } from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import { useI18n } from '../../i18n'
import { selectDraft, useComposerStore } from '../../stores/composer'
import { useUIStore } from '../../stores/ui'
import { engineApi, commandMessage, type ModelSummary, type ProviderSummary } from '../../services/engine'
import type { AttachmentRef } from '../../types'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { REASONING_LEVELS, supportsEffort, type ReasoningEffort } from '../../lib/reasoning'
import ModelPicker from './ModelPicker'
import { matchPaneTargets, paneMentionQuery, parsePaneMention, type PaneMentionTarget } from './paneMention'

export type ComposerPlacement = 'centered' | 'bottom'

const permissionColors = {
  'read-only': 'var(--text-muted)',
  workspace: 'var(--access-workspace)',
  'full-access': 'var(--access-full)',
} as const

interface ComposerProps {
  placement: ComposerPlacement
  onSend: (text: string, attachments?: AttachmentRef[]) => Promise<boolean>
  onPrepareAttachments?: (attachments: AttachmentRef[]) => Promise<AttachmentRef[]>
  onCancelAttachmentPreparation?: (attachments: AttachmentRef[]) => Promise<void>
  sessionId?: string
  /**
   * Clave del borrador. Por defecto `sessionId` o `'draft'` antes de que exista
   * sesión. Cada instancia lee y escribe únicamente esta clave.
   */
  draftKey?: string
  /**
   * Instancia de la vista Normal: mantiene sincronizado el espejo legacy del
   * store (`switchSession`) para los consumidores que aún lo usan. Los
   * Composers de un board pasan `false`.
   */
  primary?: boolean
  /**
   * Único destinatario de `rinari:focus-composer` y del autofocus al cambiar
   * de disposición. En un board solo el panel enfocado lo recibe.
   */
  acceptsGlobalFocus?: boolean
  isStreaming: boolean
  onStop: () => void
  models: ModelSummary[]
  /** Catálogo de proveedores para resolver el logo por alias/endpoint. */
  providers?: ProviderSummary[]
  activeAlias: string | null
  activeModel?: ModelSummary | null
  onUseModel: (model: ModelSummary) => void
  onDiscoverModels: () => void
  onOpenProviders: () => void
  sessionMode: string | null
  onModeChange: (mode: string) => void
  reasoningEffort: ReasoningEffort
  onReasoningChange: (effort: ReasoningEffort) => void
  permissionProfile: 'read-only' | 'workspace' | 'full-access'
  effectivePermissionProfile: 'read-only' | 'workspace' | 'full-access'
  permissionProfilesV2: boolean
  onPermissionChange: (profile: string) => void
  onSearchFiles: (query: string) => Promise<{ root: string; files: Array<{ path: string; relative_path: string; name: string }> }>
  /**
   * Paneles del board a los que se puede escribir con `@Panel mensaje`. Solo
   * en Boards; sin lista no hay autocompletado ni envío directo.
   */
  mentionTargets?: readonly PaneMentionTarget[]
  /** Envía `text` al panel `targetId` como tarea del usuario (reenvío manual). */
  onSendToTarget?: (targetId: string, text: string) => Promise<boolean>
}

const MODES = ['plan', 'build', 'review'] as const

/**
 * Composer: una sola unidad visual (textarea + toolbar con modelo).
 * El borrador vive en el store y sobrevive al cambio centered ↔ bottom.
 * Los adjuntos nativos y las referencias @ se conservan como rutas hasta que
 * el motor los valida para el turno.
 */
export default function Composer({
  placement,
  onSend,
  onPrepareAttachments,
  onCancelAttachmentPreparation,
  sessionId,
  draftKey: explicitDraftKey,
  primary = true,
  acceptsGlobalFocus = true,
  isStreaming,
  onStop,
  models,
  providers,
  activeAlias,
  activeModel,
  onUseModel,
  onDiscoverModels,
  onOpenProviders,
  sessionMode,
  onModeChange,
  reasoningEffort,
  onReasoningChange,
  permissionProfile,
  effectivePermissionProfile,
  permissionProfilesV2,
  onPermissionChange,
  onSearchFiles,
  mentionTargets,
  onSendToTarget,
}: ComposerProps) {
  const { t } = useI18n()
  const draftKey = explicitDraftKey ?? (sessionId || 'draft')
  const draft = useComposerStore(selectDraft(draftKey))
  const text = draft.text
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const preparationGenerationRef = useRef(new Map<string, number>())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [attachmentOpen, setAttachmentOpen] = useState(false)
  const [permissionOpen, setPermissionOpen] = useState(false)
  const [reasoningOpen, setReasoningOpen] = useState(false)
  const [previewAttachment, setPreviewAttachment] = useState<AttachmentRef | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | undefined>()
  const [previewText, setPreviewText] = useState<string | undefined>()
  const [previewLoading, setPreviewLoading] = useState(false)
  const [attachmentNotice, setAttachmentNotice] = useState<string | undefined>()
  const reasoningCapabilities = activeModel?.capabilities ?? models.find(model => model.alias === activeAlias)?.capabilities
  useEffect(() => {
    if (!supportsEffort(reasoningCapabilities, reasoningEffort)) onReasoningChange('off')
  }, [reasoningCapabilities, reasoningEffort, onReasoningChange])
  const attachments = draft.attachments
  const addAttachmentFor = useComposerStore((s) => s.addAttachmentFor)
  const updateAttachmentFor = useComposerStore((s) => s.updateAttachmentFor)
  const removeAttachmentFor = useComposerStore((s) => s.removeAttachmentFor)
  const setTextFor = useComposerStore((s) => s.setTextFor)
  const updateAttachmentById = useComposerStore((s) => s.updateAttachmentById)
  const replaceAttachmentById = useComposerStore((s) => s.replaceAttachmentById)
  const removeAttachmentsById = useComposerStore((s) => s.removeAttachmentsById)
  const restoreSubmission = useComposerStore((s) => s.restoreSubmission)
  const switchDraftSession = useComposerStore((s) => s.switchSession)
  const setText = (value: string) => setTextFor(draftKey, value)
  const [fileMatches, setFileMatches] = useState<Array<{ path: string; relative_path: string; name: string }>>([])
  const mention = text.match(/(?:^|\s)@([^\s]*)$/)?.[1] ?? null
  // Mensaje directo a otro panel: `@Panel texto` al inicio del mensaje.
  const paneTargets = mentionTargets ?? []
  const paneQuery = paneTargets.length > 0 ? paneMentionQuery(text) : null
  const paneMatches = paneQuery !== null ? matchPaneTargets(paneQuery, paneTargets) : []
  const paneMention = onSendToTarget && paneTargets.length > 0 ? parsePaneMention(text, paneTargets) : null
  const [paneHighlight, setPaneHighlight] = useState(0)
  useEffect(() => {
    setPaneHighlight(0)
  }, [paneQuery])
  const [visionRoute, setVisionRoute] = useState<{ key: string; available: boolean; reason: string; destination: string }>()
  const [visionRevision, setVisionRevision] = useState(0)
  useEffect(() => { const refresh = () => setVisionRevision(n => n + 1); window.addEventListener('rinari-vision-changed', refresh); return () => window.removeEventListener('rinari-vision-changed', refresh) }, [])
  const imageAttachments = attachments.filter((file) => file.kind === 'image' || file.mime_type?.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name))
  const visualAttachments = attachments.filter((file) =>
    (file.images?.length ?? 0) > 0
    || (file.kind === 'pdf' && (file.visualPages?.length ?? 0) > 0)
    || (imageAttachments.includes(file) && file.ocr !== true),
  )
  const visionModelId = activeModel?.id ?? models.find(model => model.alias === activeAlias)?.id
  const visionRouteKey = `${sessionId || 'draft'}:${visionModelId || activeAlias}`
  const visionUnavailable = visualAttachments.length > 0 && visionRoute?.key === visionRouteKey && !visionRoute.available

  useEffect(() => {
    let cancelled = false
    if (sessionId || visionModelId) void engineApi.sessionImageSupport(sessionId ?? null, visionModelId).then(support => {
      if (!cancelled && support.model_id === visionModelId) setVisionRoute({ key: visionRouteKey, available: support.available, reason: support.reason, destination: `${support.destination_provider} / ${support.destination_model ?? support.destination_model_id}` })
    }).catch(error => { if (!cancelled) setVisionRoute({ key: visionRouteKey, available: false, reason: commandMessage(error), destination: '' }) })
    return () => { cancelled = true }
  }, [sessionId, activeAlias, attachments.length, visionRouteKey, visionModelId, visionRevision])

  useEffect(() => {
    // Only the Normal instance moves the legacy mirror; a board pane must not
    // redirect wrappers that other components still call without a key.
    if (primary) switchDraftSession(draftKey)
  }, [draftKey, primary, switchDraftSession])

  useEffect(() => {
    if (mention === null) {
      setFileMatches([])
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      void onSearchFiles(mention).then((result) => {
        if (!cancelled) setFileMatches(result.files.slice(0, 12))
      }).catch(() => {
        if (!cancelled) setFileMatches([])
      })
    }, 120)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [mention, onSearchFiles])

  useEffect(() => {
    if (!acceptsGlobalFocus) return
    function focus(event: Event) {
      // A typed request names its session; a legacy event without detail
      // goes to whichever instance currently accepts global focus.
      const wanted = (event as CustomEvent<{ sessionId?: string } | undefined>).detail?.sessionId
      if (wanted && sessionId && wanted !== sessionId) return
      textareaRef.current?.focus()
    }
    window.addEventListener('rinari:focus-composer', focus)
    return () => window.removeEventListener('rinari:focus-composer', focus)
  }, [acceptsGlobalFocus, sessionId])

  useEffect(() => {
    if (acceptsGlobalFocus) textareaRef.current?.focus()
  }, [placement, acceptsGlobalFocus])

  function autosize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`
  }

  async function handleSend() {
    // Capture identity and content before any await: focus or view changes
    // during the request must not redirect the outcome to another draft.
    const submissionSessionKey = draftKey
    const store = useComposerStore.getState()
    const current = store.getDraft(submissionSessionKey)
    const content = current.text
    const outgoing = current.attachments
    const attachmentIds = outgoing.map((item) => item.id)
    if (isStreaming || isSubmitting || visionUnavailable || outgoing.some((item) => item.status === 'preparing' || item.status === 'error') || (!content.trim() && outgoing.length === 0)) return
    const direct = onSendToTarget && paneTargets.length > 0 ? parsePaneMention(content, paneTargets) : null
    if (direct && onSendToTarget) {
      // Mensaje directo a otro panel: solo texto; los adjuntos se quedan en el borrador.
      if (!direct.message) return
      setTextFor(submissionSessionKey, '')
      autosize()
      textareaRef.current?.focus()
      setIsSubmitting(true)
      try {
        const ok = await onSendToTarget(direct.target.id, direct.message)
        if (!ok) {
          setTextFor(submissionSessionKey, content)
          requestAnimationFrame(autosize)
        }
      } catch {
        setTextFor(submissionSessionKey, content)
        requestAnimationFrame(autosize)
      } finally {
        setIsSubmitting(false)
      }
      return
    }
    store.clearFor(submissionSessionKey)
    autosize()
    textareaRef.current?.focus()
    setIsSubmitting(true)
    try {
      const ok = await onSend(content.trim() || 'Revisa los archivos adjuntos.', outgoing)
      if (ok) removeAttachmentsById(attachmentIds)
      if (!ok) {
        restoreSubmission(submissionSessionKey, attachmentIds, content)
        requestAnimationFrame(autosize)
      }
    } catch {
      restoreSubmission(submissionSessionKey, attachmentIds, content)
      requestAnimationFrame(autosize)
    } finally {
      setIsSubmitting(false)
    }
  }

  const canSend = paneMention ? paneMention.message.length > 0 : (!!text.trim() || attachments.length > 0)

  async function prepareOne(item: AttachmentRef) {
    if (!onPrepareAttachments) return
    const generation = (preparationGenerationRef.current.get(item.id) ?? 0) + 1
    preparationGenerationRef.current.set(item.id, generation)
    const pending = { ...item, status: 'preparing' as const, error: undefined }
    updateAttachmentById(item.id, pending)
    try {
      const prepared = await onPrepareAttachments([pending])
      if (preparationGenerationRef.current.get(item.id) !== generation) return
      replaceAttachmentById(item.id, prepared)
    } catch (error) {
      if (preparationGenerationRef.current.get(item.id) !== generation) return
      updateAttachmentById(item.id, { status: 'error', error: error instanceof Error ? error.message : 'No se pudo preparar el adjunto' })
    }
  }

  function addAttachment(item: AttachmentRef) {
    if (attachments.length >= 8 && !attachments.some((current) => current.path === item.path && current.name === item.name)) {
      setAttachmentNotice('Puedes adjuntar hasta ocho archivos por envío.')
      return
    }
    setAttachmentNotice(undefined)
    const pending = onPrepareAttachments
      ? { ...item, status: 'preparing' as const, error: undefined }
      : item
    addAttachmentFor(draftKey, pending)
    if (onPrepareAttachments) void prepareOne(pending)
  }

  function useOcrForImages() {
    for (const file of imageAttachments) {
      if (!file.ocr) void prepareOne({ ...file, ocr: true })
    }
  }

  async function cancelAttachment(file: AttachmentRef) {
    // Invalidate local ownership before awaiting the engine so a completion
    // racing with cancellation cannot put the attachment back.
    preparationGenerationRef.current.set(file.id, (preparationGenerationRef.current.get(file.id) ?? 0) + 1)
    removeAttachmentsById([file.id])
    await onCancelAttachmentPreparation?.([file])
  }

  async function openAttachmentPreview(file: AttachmentRef) {
    setPreviewAttachment(file)
    setPreviewUrl(file.previewUrl)
    setPreviewText(undefined)
    if (file.previewUrl || !(file.derivedUri || file.uri)) return
    setPreviewLoading(true)
    try {
      const result = await engineApi.attachmentPreview(file.derivedUri || file.uri || '', 512 * 1024)
      if (typeof result.base64 === 'string' && typeof result.mime_type === 'string') {
        setPreviewUrl(`data:${result.mime_type};base64,${result.base64}`)
      } else if (typeof result.data_url === 'string') {
        setPreviewUrl(result.data_url)
      } else if (typeof result.text === 'string') {
        setPreviewText(result.text)
      }
    } catch {
      setPreviewText('No se pudo abrir la vista previa de este adjunto.')
    } finally {
      setPreviewLoading(false)
    }
  }

  function addBrowserFile(file: File) {
    if (file.size > 25 * 1024 * 1024) {
      setAttachmentNotice(`${file.name} supera el límite de 25 MiB por documento.`)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      addAttachment({
        id: `att_${Date.now().toString(36)}_${file.name}`,
        path: file.name,
        name: file.name,
        mime_type: file.type || undefined,
        size: file.size,
        source: 'native',
        kind: file.type.startsWith('image/') ? 'image' : undefined,
        data_url: reader.result,
        previewUrl: file.type.startsWith('image/') ? reader.result : undefined,
        status: 'ready',
      })
    }
    reader.readAsDataURL(file)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    for (const file of Array.from(event.dataTransfer.files)) addBrowserFile(file)
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    for (const file of Array.from(event.clipboardData.files)) addBrowserFile(file)
  }

  async function chooseFiles() {
    const selected = await open({ multiple: true, directory: false, title: 'Adjuntar archivos' })
    const paths = typeof selected === 'string' ? [selected] : selected ?? []
    for (const path of paths) {
      addAttachment({
        id: `att_${Date.now().toString(36)}_${path}`,
        path,
        name: path.split(/[/\\]/).pop() ?? path,
        source: 'native',
        kind: /\.(png|jpe?g|webp)$/i.test(path) ? 'image' : undefined,
        status: 'ready',
      })
    }
  }

  function beginWorkspaceAttachment() {
    setAttachmentOpen(false)
    const next = text.match(/(?:^|\s)@[^\s]*$/) ? text : `${text}${text && !text.endsWith(' ') ? ' ' : ''}@`
    setText(next)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      autosize()
    })
  }

  function choosePaneTarget(target: PaneMentionTarget) {
    setText(`@${target.label} `)
    setFileMatches([])
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      autosize()
    })
  }

  function chooseWorkspaceFile(file: { path: string; relative_path: string; name: string }) {
    addAttachment({ id: `att_${Date.now().toString(36)}_${file.path}`, path: file.path, name: file.relative_path, source: 'workspace', kind: /\.(png|jpe?g|webp)$/i.test(file.path) ? 'image' : undefined, status: 'ready' })
    setText(text.replace(/(?:^|\s)@[^\s]*$/, (match) => `${match.startsWith(' ') ? ' ' : ''}@${file.relative_path} `))
    setFileMatches([])
    requestAnimationFrame(autosize)
  }

  return (
    <div className="composer-root relative">
      <div onDrop={handleDrop} onDragOver={(event) => event.preventDefault()} className="composer-surface rounded-[22px] border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.24)] transition-colors focus-within:border-[var(--accent-2)]/50">
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5 px-1">
            {attachments.map((file) => (
              <span key={`${file.path}:${file.name}`} className="inline-flex max-w-[320px] items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-1 text-[11px] text-[var(--text-muted)]">
                <button type="button" onClick={() => void openAttachmentPreview(file)} className="inline-flex min-w-0 items-center gap-1.5 rounded px-0.5 text-left hover:text-[var(--text)]" title="Abrir vista previa">
                  {file.previewUrl ? <img src={file.previewUrl} alt="" className="size-7 rounded object-cover" /> : file.kind === 'image' ? <ImageIcon size={12} className="shrink-0" /> : <FileText size={12} className="shrink-0" />}
                  <span className="truncate">{file.name}</span>
                </button>
                {file.ocr && <span className="rounded bg-[var(--accent-2)]/10 px-1 text-[10px] text-[var(--accent-2)]">OCR</span>}
                {file.warning && <span title={file.warning} className="text-amber-300">⚠</span>}
                {file.kind === 'pdf' && <details className="relative"><summary className="cursor-pointer rounded px-1 text-[10px] text-[var(--text-subtle)] hover:text-[var(--text)]">PDF</summary><div className="absolute top-full right-0 z-40 mt-1 w-56 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 shadow-xl"><label className="block text-[10px] text-[var(--text-subtle)]">Páginas (ej. 1-3,5)<input disabled={file.status === 'preparing'} defaultValue={file.pageRange ?? ''} onChange={(event) => updateAttachmentFor(draftKey, file.id, { pageRange: event.target.value || undefined })} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-subtle)] px-1.5 py-1 font-mono text-[11px] text-[var(--text)] outline-none disabled:opacity-50" /></label><label className="mt-2 block text-[10px] text-[var(--text-subtle)]">Páginas visuales<input disabled={file.status === 'preparing'} defaultValue={file.visualPages?.join(',') ?? ''} onChange={(event) => updateAttachmentFor(draftKey, file.id, { visualPages: event.target.value.split(',').map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0) })} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-subtle)] px-1.5 py-1 font-mono text-[11px] text-[var(--text)] outline-none disabled:opacity-50" /></label><button type="button" disabled={file.status === 'preparing'} onClick={() => void prepareOne(useComposerStore.getState().getDraft(draftKey).attachments.find((candidate) => candidate.id === file.id) ?? file)} className="mt-2 rounded border border-[var(--border)] px-2 py-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-50">Repreparar PDF</button></div></details>}
                {file.status === 'preparing' && <><LoaderCircle size={12} className="animate-spin text-[var(--accent-2)]" /><button type="button" aria-label={`Cancelar preparación de ${file.name}`} onClick={() => void cancelAttachment(file)} className="cursor-pointer rounded p-0.5 hover:bg-[var(--bg-hover)]"><Square size={10} /></button></>}
                {file.status === 'error' && <><span title={file.error} className="text-red-400">{file.error || 'Error'}</span><button type="button" aria-label={`Reintentar ${file.name}`} onClick={() => void prepareOne(file)} className="cursor-pointer rounded p-0.5 hover:bg-[var(--bg-hover)]"><RefreshCw size={11} /></button></>}
                <button type="button" aria-label={`Quitar ${file.name}`} onClick={() => removeAttachmentFor(draftKey, file.id)} className="cursor-pointer rounded p-0.5 hover:bg-[var(--bg-hover)]"><X size={11} /></button>
              </span>
            ))}
          </div>
        )}
        {attachmentNotice && <div className="mb-2 rounded-lg border border-red-400/30 bg-red-400/5 px-2.5 py-2 text-[11px] text-red-300">{attachmentNotice}</div>}
        {visionUnavailable && <div role="alert" className="mb-2 rounded-lg border border-amber-400/30 p-2 text-xs">{visionRoute?.reason}</div>}
        {visualAttachments.length > 0 && visionRoute?.key === visionRouteKey && visionRoute.available && <p className="mb-2 text-[11px] text-[var(--text-subtle)]">Visión: {visionRoute.destination}</p>}
        {imageAttachments.some(file => !file.ocr) && <button type="button" onClick={useOcrForImages} className="mb-2 text-[11px] text-[var(--text-muted)]">Usar OCR para estas imágenes</button>}
        {paneMention && (
          <div className="mb-2 flex items-center gap-2 text-[11px] text-[var(--accent-2)]" data-testid="pane-mention-chip">
            <MessageSquareShare size={12} aria-hidden="true" />
            <span>{t('composer.paneMention.direct', { label: paneMention.target.label })}</span>
            <span className="text-[var(--text-subtle)]">· {paneMention.message ? t('composer.paneMention.hint') : t('composer.paneMention.empty')}</span>
          </div>
        )}
        {(paneMatches.length > 0 || fileMatches.length > 0) && (
          <div className="absolute right-2 bottom-full left-2 z-30 mb-2 max-h-64 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1.5 shadow-xl">
            {paneMatches.length > 0 && (
              <div role="listbox" aria-label={t('composer.paneMention.heading')} data-testid="pane-mention-list">
                <p className="px-2.5 pt-1 pb-0.5 text-[10px] font-semibold tracking-wider text-[var(--text-subtle)] uppercase">{t('composer.paneMention.heading')}</p>
                {paneMatches.map((target, index) => (
                  <button
                    key={target.id}
                    type="button"
                    role="option"
                    aria-selected={index === paneHighlight}
                    onMouseEnter={() => setPaneHighlight(index)}
                    onClick={() => choosePaneTarget(target)}
                    className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${index === paneHighlight ? 'bg-[var(--bg-hover)] text-[var(--text)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]'}`}
                  >
                    <Columns3 size={13} /><span className="truncate">{target.label}</span>
                  </button>
                ))}
              </div>
            )}
            {fileMatches.map((file) => (
              <button key={file.path} type="button" onClick={() => chooseWorkspaceFile(file)} className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)]">
                <FileText size={13} /><span className="truncate">{file.relative_path}</span>
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={text}
          rows={placement === 'centered' ? 2 : 1}
          aria-label={t('composer.message')}
          placeholder={isStreaming ? t('composer.placeholderStreaming') : t('composer.placeholder')}
          onChange={(e) => {
            setText(e.target.value)
            autosize()
          }}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (paneMatches.length > 0 && !e.nativeEvent.isComposing) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setPaneHighlight((index) => (index + 1) % paneMatches.length); return }
              if (e.key === 'ArrowUp') { e.preventDefault(); setPaneHighlight((index) => (index - 1 + paneMatches.length) % paneMatches.length); return }
              if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); choosePaneTarget(paneMatches[paneHighlight] ?? paneMatches[0]); return }
              if (e.key === 'Escape') { e.preventDefault(); setText(text.replace(/^@/, '')); return }
            }
            const sendWithEnter = useUIStore.getState().enterToSend
            const mod = e.ctrlKey || e.metaKey
            if (
              e.key === 'Enter' &&
              !e.nativeEvent.isComposing &&
              (sendWithEnter ? !e.shiftKey : mod)
            ) {
              e.preventDefault()
              void handleSend()
            }
          }}
          className="composer-textarea block max-h-[240px] min-h-13 w-full resize-none border-0 bg-transparent text-[15px] leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)] focus:outline-none focus-visible:outline-none"
        />
        <div className="composer-toolbar">
          <div className="composer-tools">
          <Popover open={attachmentOpen} onOpenChange={setAttachmentOpen}>
            <PopoverTrigger asChild>
              <button type="button" disabled={isStreaming} aria-label="Adjuntar archivos" title="Añadir al mensaje" className="flex size-8 cursor-pointer items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)] disabled:opacity-40">
                <Paperclip size={15} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-60 p-1.5">
              <p className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold tracking-wider text-[var(--text-subtle)] uppercase">Añadir al mensaje</p>
              <button type="button" onClick={() => { setAttachmentOpen(false); void chooseFiles() }} className="flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]">
                <FileText size={15} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
                <span><span className="block text-[13px] text-[var(--text)]">Adjuntar desde el equipo</span><span className="block text-[11px] text-[var(--text-subtle)]">Imagen, documento o archivo local</span></span>
              </button>
              <button type="button" onClick={beginWorkspaceAttachment} className="flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]">
                <Search size={15} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
                <span><span className="block text-[13px] text-[var(--text)]">Buscar en el proyecto</span><span className="block text-[11px] text-[var(--text-subtle)]">Encuentra un archivo del workspace</span></span>
              </button>
            </PopoverContent>
          </Popover>
          <Popover open={permissionOpen} onOpenChange={setPermissionOpen}>
            <PopoverTrigger asChild>
              <button type="button" disabled={isStreaming} title="Permisos de este chat" style={{ color: permissionColors[sessionMode === 'plan' || sessionMode === 'review' ? permissionProfile : effectivePermissionProfile] }} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-current/25 bg-[var(--bg-subtle)] p-2 text-xs transition-colors hover:border-current disabled:opacity-40">
                <Shield size={13} />
                <span className="sr-only">{sessionMode === 'plan' || sessionMode === 'review' ? (permissionProfile === 'full-access' ? 'Lectura · Acceso completo' : permissionProfile === 'workspace' ? 'Lectura · Workspace' : 'Solo lectura') : effectivePermissionProfile === 'read-only' ? 'Solo lectura' : effectivePermissionProfile === 'full-access' ? 'Acceso completo' : 'Workspace'}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-1.5">
              {sessionMode !== 'build' && <p className="px-2.5 py-2 text-[11px] text-[var(--text-subtle)]">PLAN y REVIEW no modifican archivos ni ejecutan comandos. Estos permisos definen qué carpetas pueden leer.</p>}
              {([
                ['read-only', 'Solo lectura', 'No inicia shell ni procesos y no modifica archivos.'],
                ['workspace', 'Workspace', 'Trabaja dentro del proyecto; pide permiso ante una mutación externa detectable.'],
                ['full-access', 'Acceso completo', 'Permite mutaciones locales externas. Credenciales, trabajo previo y Git remoto siguen protegidos.'],
              ] as const).map(([value, label, description]) => (
                <button key={value} type="button" disabled={isStreaming || (value === 'full-access' && !permissionProfilesV2)} title={value === 'full-access' && !permissionProfilesV2 ? 'Actualiza Rinari Engine para usar acceso completo con garantías v2.' : undefined} onClick={() => { setPermissionOpen(false); onPermissionChange(value) }} className="flex w-full cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-default disabled:opacity-40">
                  <span className="min-w-0 flex-1"><span className="block text-[13px]" style={{ color: permissionColors[value] }}>{label}</span><span className="block text-[11px] text-[var(--text-subtle)]">{sessionMode === 'plan' || sessionMode === 'review' ? (value === 'full-access' ? 'Lee carpetas externas sin pedir permiso. Las credenciales siguen protegidas.' : value === 'workspace' ? 'Lee el proyecto y pide permiso para leer carpetas externas.' : 'Lee únicamente la carpeta de esta sesión.') : description}</span></span>
                  {permissionProfile === value && <Check size={14} className="mt-0.5" style={{ color: permissionColors[value] }} />}
                </button>
              ))}
            </PopoverContent>
          </Popover>
          </div>
          <div
            role="group"
            aria-label={t('mode.change')}
            className="composer-modes inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] p-0.5"
          >
            {MODES.map((mode) => {
              const current = (sessionMode ?? 'build').toLowerCase()
              const selected = current === mode
              return (
                <button
                  key={mode}
                  type="button"
                  disabled={sessionMode === null || isStreaming}
                  onClick={() => onModeChange(mode)}
                  aria-pressed={selected}
                  title={t(`mode.${mode}` as 'mode.plan')}
                  className={`rounded-full px-2.5 py-1 font-mono text-[10px] tracking-wide transition-all disabled:opacity-40 ${
                    selected
                      ? 'bg-[var(--accent)] font-bold text-white'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {t(`mode.${mode}` as 'mode.plan')}
                </button>
              )
            })}
          </div>
          <div className="composer-model-controls">
          <ModelPicker
            models={models}
            providers={providers}
            activeAlias={activeAlias}
            activeModel={activeModel}
            onUseModel={onUseModel}
            onDiscoverModels={onDiscoverModels}
            onOpenProviders={onOpenProviders}
            disabled={isStreaming}
          />
          <Popover open={reasoningOpen} onOpenChange={setReasoningOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={isStreaming}
                title={t('composer.thinkingMenu')}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--text)] disabled:opacity-40"
              >
                <Brain size={13} aria-hidden="true" />
                <span>{t(`thinking.${reasoningEffort}` as 'thinking.high')}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="max-h-[min(70vh,32rem)] w-72 overflow-y-auto p-1.5"
            >
              <p className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold tracking-wider text-[var(--text-subtle)] uppercase">
                {t('composer.thinkingMenu')}
              </p>
              {REASONING_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  disabled={!supportsEffort(activeModel?.capabilities ?? models.find(model => model.alias === activeAlias)?.capabilities, level)}
                  onClick={() => { setReasoningOpen(false); onReasoningChange(level) }}
                  className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-[var(--text)]">
                      {t(`thinking.${level}` as 'thinking.high')}
                    </span>
                    <span className="block text-[11px] leading-snug text-[var(--text-subtle)]">
                      {t(`thinking.desc${level === 'off' ? 'Off' : level[0].toUpperCase() + level.slice(1)}` as 'thinking.descHigh')}
                    </span>
                  </span>
                  {reasoningEffort === level && (
                    <Check size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--accent-2)]" />
                  )}
                </button>
              ))}
              <p className="px-2.5 py-2 text-[11px] text-[var(--text-subtle)]">{t('thinking.compatibility')}</p>
            </PopoverContent>
          </Popover>

          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              aria-label={t('composer.stop')}
              title={t('composer.stop')}
              className="flex size-9 items-center justify-center rounded-full bg-[var(--text)] text-[var(--bg-app)] transition-transform hover:scale-105 active:scale-95"
            >
              <Square size={14} aria-hidden="true" fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!canSend || isSubmitting || visionUnavailable || attachments.some((item) => item.status === 'preparing' || item.status === 'error')}
              aria-label={t('composer.send')}
              title={t('composer.send')}
              className="flex size-9 items-center justify-center rounded-full bg-[var(--accent)] text-white transition-all hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:hover:brightness-100"
            >
              <ArrowUp size={17} aria-hidden="true" />
            </button>
          )}
          </div>
        </div>
      </div>
      <p className="mt-1.5 px-1 text-center text-[11px] text-[var(--text-subtle)]">
        {t('composer.hint')}
      </p>
      {previewAttachment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={`Vista previa de ${previewAttachment.name}`} onClick={() => setPreviewAttachment(null)}>
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
              <Eye size={15} className="text-[var(--accent-2)]" />
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--text)]">{previewAttachment.name}</span>
              <button type="button" aria-label="Cerrar vista previa" onClick={() => setPreviewAttachment(null)} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><X size={15} /></button>
            </div>
            <div className="min-h-32 overflow-auto p-4">
              {previewLoading && <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--text-muted)]"><LoaderCircle size={16} className="animate-spin" /> Preparando vista previa…</div>}
              {!previewLoading && previewUrl && previewAttachment.kind === 'image' && <img src={previewUrl} alt={previewAttachment.name} className="mx-auto max-h-[65vh] max-w-full rounded-lg object-contain" />}
              {!previewLoading && previewText !== undefined && <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[var(--text-muted)]">{previewText}</pre>}
              {!previewLoading && !previewUrl && previewText === undefined && <p className="py-10 text-center text-sm text-[var(--text-muted)]">No hay vista previa disponible.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
