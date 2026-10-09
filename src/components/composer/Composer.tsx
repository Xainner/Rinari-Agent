import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent } from 'react'
import DictationButton from '../../features/dictation/DictationButton'
import { useDictationPrefs } from '../../features/dictation/dictationPrefs'
import { useReducedMotion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { ArrowUp, Check, Columns3, FileText, Image as ImageIcon, LoaderCircle, MessageSquareShare, Plus, RefreshCw, Search, Shield, Square, X } from 'lucide-react'
import { platform } from '../../platform'
import { useI18n } from '../../i18n'
import { AttachmentPreview } from '../AttachmentPreview'
import { cn } from '../../lib/utils'
import { ReadingBadges, RecognizedPreview, coverageDetail } from '../AttachmentReading'

type ImageReadMode = 'image' | 'text' | 'both'
import { selectDraft, useComposerStore } from '../../stores/composer'
import { useUIStore } from '../../stores/ui'
import { engineApi, commandMessage, type ModelRefreshResult, type ModelSummary, type ProviderSummary } from '../../services/engine'
import type { AttachmentRef } from '../../types'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { supportsEffort, type ReasoningEffort } from '../../lib/reasoning'
import ModelPicker from './ModelPicker'
import EffortPicker from './EffortPicker'
import ContextRing from '../../features/context/ContextRing'
import { useComposerHeight } from './useComposerHeight'
import { useChatFileReceiver } from './ChatFileDropZone'
import { FOCUS_COMPOSER_EVENT } from './focusComposer'
import { matchPaneTargets, paneMentionQuery, parsePaneMention, type PaneMentionTarget } from './paneMention'
import { matchSlashCommands, parseSlashCommand, planSlash, runsOnPick, slashQuery, type SlashPlan } from './slashCommands'
import { useSlashCommands } from './useSlashCommands'
import type { SlashCommand } from '../../services/engine'
import type { SendOptions } from '../../features/engine/useEngineSession'
import type { I18nKey } from '../../i18n'

export type ComposerPlacement = 'centered' | 'bottom'

const permissionColors = {
  'read-only': 'var(--text-muted)',
  workspace: 'var(--access-workspace)',
  'full-access': 'var(--access-full)',
} as const

interface ComposerProps {
  placement: ComposerPlacement
  onSend: (text: string, attachments?: AttachmentRef[], options?: SendOptions) => Promise<boolean>
  /**
   * Comandos `/` de interfaz (nueva, compactar, cambios…). `/help` y
   * `/model` los resuelve el compositor; sin este manejador el resto no se ofrece.
   */
  onUiCommand?: (name: string, text: string) => boolean | Promise<boolean>
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
  /**
   * Mientras Rinari trabaja, Enter le da el mensaje en el turno en curso (lo
   * lee al terminar el paso actual). Sin esta prop el compositor espera.
   */
  onSteer?: (text: string) => Promise<boolean>
  /** Tab mientras trabaja: el mensaje espera a que termine el turno. */
  onQueue?: (text: string) => Promise<boolean>
  models: ModelSummary[]
  /** Catálogo de proveedores para resolver el logo por alias/endpoint. */
  providers?: ProviderSummary[]
  activeAlias: string | null
  activeModel?: ModelSummary | null
  onUseModel: (model: ModelSummary) => void
  onDiscoverModels: () => void
  onRefreshModels?: () => Promise<ModelRefreshResult>
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

/** Comandos `/` de interfaz que resuelve el propio compositor. */
const LOCAL_SLASH = new Set(['help', 'model'])

/** Descripción localizada de los comandos integrados; el resto usa la del Engine. */
const SLASH_DESCRIPTION_KEYS: Record<string, I18nKey> = {
  help: 'slash.help',
  new: 'slash.new',
  plan: 'slash.plan',
  build: 'slash.build',
  review: 'slash.review',
  test: 'slash.test',
  skill: 'slash.skill',
  learn: 'slash.learn',
  skills: 'slash.skills',
  compact: 'slash.compact',
  context: 'slash.context',
  model: 'slash.model',
  diff: 'slash.diff',
  tasks: 'slash.tasks',
  fork: 'slash.fork',
  rename: 'slash.rename',
}

/**
 * Composer: una sola unidad visual (textarea + toolbar con modelo).
 * El borrador vive en el store y sobrevive al cambio centered ↔ bottom.
 * Los adjuntos nativos y las referencias @ se conservan como rutas hasta que
 * el motor los valida para el turno.
 */
export default function Composer({
  placement,
  onSend,
  onUiCommand,
  onPrepareAttachments,
  onCancelAttachmentPreparation,
  sessionId,
  draftKey: explicitDraftKey,
  primary = true,
  acceptsGlobalFocus = true,
  isStreaming,
  onStop,
  onSteer,
  onQueue,
  models,
  providers,
  activeAlias,
  activeModel,
  onUseModel,
  onDiscoverModels,
  onRefreshModels,
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
  const appReduceMotion = useUIStore((s) => s.reduceMotion)
  const systemReducedMotion = useReducedMotion()
  // Indicador deslizante del modo: una sola pieza a nivel del grupo,
  // posicionada con medidas reales (sin layoutId). La medición absorbe
  // el padding del grupo porque los botones cuelgan de él.
  const reducePillMotion = appReduceMotion || Boolean(systemReducedMotion)
  const pillDuration = reducePillMotion ? 0 : 0.22
  // A legacy mode ("ask", from terminal sessions) runs as BUILD in the Engine;
  // showing no mode selected made it look broken.
  const rawMode = (sessionMode ?? 'build').toLowerCase()
  const currentMode = (MODES as readonly string[]).includes(rawMode) ? rawMode : 'build'
  // Modo pedido con clic en este grupo: solo ese cambio viaja. Un cambio
  // que llega solo (conversación nueva que corrige plan anterior a build,
  // sincronización del engine) se coloca sin animar: es el viaje fantasma.
  // Guardar el pedido en ref (no estado) evita un render extra que
  // cortaría la animación en pleno vuelo.
  const userModeRef = useRef<string | null>(null)
  const pillArmed = userModeRef.current === currentMode && pillDuration !== 0
  const modesGroupRef = useRef<HTMLDivElement>(null)
  const modeButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const pillRef = useRef<HTMLSpanElement>(null)
  // Colocación imperativa en layout effect, sin pasar por estado: la
  // escritura llega en el mismo commit y el navegador transiciona desde
  // lo ya pintado. Con estado React, la medición se aplicaría antes del
  // primer pintado del cambio y el viaje nunca se vería. Al montar, la
  // primera escritura ocurre antes del primer pintado: la pill aparece
  // ya colocada, sin viaje fantasma (conversación nueva).
  const placePill = useCallback(() => {
    const pill = pillRef.current
    const button = modeButtonRefs.current.get(currentMode)
    if (!pill || !button) return
    pill.style.width = button.offsetWidth + 'px'
    pill.style.transform = 'translateX(' + button.offsetLeft + 'px)'
  }, [currentMode])
  // Recolocar tras cada render (cambio de modo o de idioma) y ante
  // cambios de tamaño (zoom, carga de fuentes, contenedor).
  useLayoutEffect(() => {
    placePill()
  })
  useEffect(() => {
    const group = modesGroupRef.current
    if (!group || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => placePill())
    observer.observe(group)
    return () => observer.disconnect()
  }, [placePill])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // The latest send, for dictation's optional «send when done» (it runs after an await).
  const handleSendRef = useRef<() => Promise<void>>(async () => {})
  const preparationGenerationRef = useRef(new Map<string, number>())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [attachmentOpen, setAttachmentOpen] = useState(false)
  const [permissionOpen, setPermissionOpen] = useState(false)
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
  // Comandos `/`: el catálogo llega del Engine al escribir la primera barra.
  const [engineCommands, loadCommands] = useSlashCommands(sessionId)
  const wantsCommands = text.startsWith('/')
  useEffect(() => {
    if (wantsCommands) loadCommands()
  }, [wantsCommands, loadCommands])
  const slashCommands = engineCommands.filter((command) => command.kind !== 'ui' || LOCAL_SLASH.has(command.name) || Boolean(onUiCommand))
  const slashQ = slashQuery(text)
  const slashMatches = slashQ !== null ? matchSlashCommands(slashQ, slashCommands) : []
  const [slashHighlight, setSlashHighlight] = useState(0)
  // Las sugerencias (/, @) se abren encima del compositor, fuera de su caja.
  // Su contenedor hace scroll cuando el compositor crece, y eso las
  // recortaba: van en un portal, ancladas a la caja medida del compositor.
  const rootRef = useRef<HTMLDivElement>(null)
  const [menuBox, setMenuBox] = useState<{ left: number; width: number; bottom: number } | null>(null)
  useEffect(() => {
    setSlashHighlight(0)
  }, [slashQ])
  const menuOpen = slashMatches.length > 0 || paneMatches.length > 0 || fileMatches.length > 0
  const menuRef = useRef<HTMLDivElement>(null)
  // Con las flechas, la opción elegida no se salía de la lista visible.
  useEffect(() => {
    const selected = menuRef.current?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')
    selected?.scrollIntoView?.({ block: 'nearest' })
  }, [slashHighlight, menuBox])
  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuBox(null)
      return
    }
    const measure = () => {
      const rect = rootRef.current?.getBoundingClientRect()
      if (!rect) return
      setMenuBox({ left: rect.left + 8, width: Math.max(0, rect.width - 16), bottom: window.innerHeight - rect.top + 8 })
    }
    measure()
    window.addEventListener('resize', measure)
    // Captura: el scroll del contenedor del compositor también mueve la caja.
    window.addEventListener('scroll', measure, true)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (rootRef.current) observer?.observe(rootRef.current)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      observer?.disconnect()
    }
  }, [menuOpen])
  const [modelSignal, setModelSignal] = useState(0)
  // «Cambiar modelo» desde un error del turno abre el selector de esta sesión.
  const pickerRequest = useUIStore((s) => s.modelPickerRequest)
  useEffect(() => {
    if (pickerRequest && sessionId && pickerRequest.sessionId === sessionId) setModelSignal((value) => value + 1)
  }, [pickerRequest, sessionId])
  const [visionRoute, setVisionRoute] = useState<{ key: string; available: boolean; reason: string; destination: string }>()
  const [visionRevision, setVisionRevision] = useState(0)
  useEffect(() => { const refresh = () => setVisionRevision(n => n + 1); window.addEventListener('rinari-vision-changed', refresh); return () => window.removeEventListener('rinari-vision-changed', refresh) }, [])
  const imageAttachments = attachments.filter((file) => file.kind === 'image' || file.mime_type?.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name))
  const visualAttachments = attachments.filter((file) =>
    (file.images?.length ?? 0) > 0
    || (file.kind === 'pdf' && (file.visualPages?.length ?? 0) > 0)
    || (imageAttachments.includes(file) && (file.ocr !== true || file.keepImage === true)),
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
    function focus(event: Event) {
      // A typed request names its session and reaches that instance even when
      // it is not the one accepting global focus (e.g. the pane header menu
      // focusing its own composer). A legacy event without detail goes to
      // whichever instance currently accepts global focus.
      const wanted = (event as CustomEvent<{ sessionId?: string } | undefined>).detail?.sessionId
      if (wanted) {
        if (!sessionId || wanted !== sessionId) return
      } else if (!acceptsGlobalFocus) {
        return
      }
      textareaRef.current?.focus()
    }
    window.addEventListener(FOCUS_COMPOSER_EVENT, focus)
    return () => window.removeEventListener(FOCUS_COMPOSER_EVENT, focus)
  }, [acceptsGlobalFocus, sessionId])

  useEffect(() => {
    if (acceptsGlobalFocus) textareaRef.current?.focus()
  }, [placement, acceptsGlobalFocus])

  const { armSendReset, cancelSendReset } = useComposerHeight(textareaRef, text, draftKey, placement, reducePillMotion)

  const canSteer = isStreaming && Boolean(onSteer)

  /** Mensaje durante el turno: ahora (guiar) o al terminar (cola). Solo texto. */
  async function handleSteer(later: boolean) {
    const submissionSessionKey = draftKey
    const content = useComposerStore.getState().getDraft(submissionSessionKey).text
    const deliver = later ? onQueue : onSteer
    if (!deliver || !content.trim() || isSubmitting) return
    armSendReset()
    setTextFor(submissionSessionKey, '')
    textareaRef.current?.focus()
    setIsSubmitting(true)
    try {
      if (!(await deliver(content.trim()))) {
        setTextFor(submissionSessionKey, content)
        cancelSendReset()
      }
    } catch {
      setTextFor(submissionSessionKey, content)
      cancelSendReset()
    } finally {
      setIsSubmitting(false)
    }
  }

  /**
   * What was dictated goes where the cursor is, with a space on each side
   * when it touches other words. It is never sent unless the owner turned
   * on «send when done» in Settings › Dictation.
   */
  function insertDictation(spoken: string) {
    const box = textareaRef.current
    const current = useComposerStore.getState().getDraft(draftKey).text
    const start = box && document.activeElement === box ? box.selectionStart : current.length
    const end = box && document.activeElement === box ? box.selectionEnd : current.length
    const before = current.slice(0, start)
    const after = current.slice(end)
    const lead = before && !/\s$/.test(before) ? ' ' : ''
    const trail = after && !/^\s/.test(after) ? ' ' : ''
    setTextFor(draftKey, before + lead + spoken + trail + after)
    const caret = (before + lead + spoken).length
    requestAnimationFrame(() => {
      box?.focus()
      box?.setSelectionRange(caret, caret)
    })
    if (useDictationPrefs.getState().sendOnFinish) void handleSendRef.current()
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
      armSendReset()
      setTextFor(submissionSessionKey, '')
      textareaRef.current?.focus()
      setIsSubmitting(true)
      try {
        const ok = await onSendToTarget(direct.target.id, direct.message)
        if (!ok) {
          setTextFor(submissionSessionKey, content)
          cancelSendReset()
        }
      } catch {
        setTextFor(submissionSessionKey, content)
        cancelSendReset()
      } finally {
        setIsSubmitting(false)
      }
      return
    }
    // `/comando`: la interfaz lo resuelve aquí o viaja con el turno para que el
    // Engine lo expanda. Un texto que empieza por `/` sin ser comando (una
    // ruta) se envía tal cual.
    const slash = content.startsWith('/') ? parseSlashCommand(content, slashCommands) : null
    const plan = slash ? planSlash(slash.command, slash.text) : null
    if (plan && plan.kind !== 'send') {
      setTextFor(submissionSessionKey, '')
      const handled = await runLocalSlash(plan)
      if (!handled) setTextFor(submissionSessionKey, content)
      textareaRef.current?.focus()
      return
    }
    const sendOptions: SendOptions = plan?.kind === 'send' ? { command: { name: plan.name, text: plan.text } } : {}
    armSendReset()
    store.clearFor(submissionSessionKey)
    textareaRef.current?.focus()
    setIsSubmitting(true)
    try {
      const message = content.trim() || t('attach.reviewPrompt')
      const ok = await (sendOptions.command ? onSend(message, outgoing, sendOptions) : onSend(message, outgoing))
      if (ok) removeAttachmentsById(attachmentIds)
      if (!ok) {
        restoreSubmission(submissionSessionKey, attachmentIds, content)
        cancelSendReset()
      }
    } catch {
      restoreSubmission(submissionSessionKey, attachmentIds, content)
      cancelSendReset()
    } finally {
      setIsSubmitting(false)
    }
  }

  handleSendRef.current = handleSend

  async function runLocalSlash(plan: Exclude<SlashPlan, { kind: 'send' }>): Promise<boolean> {
    if (plan.kind === 'mode') {
      onModeChange(plan.mode)
      return true
    }
    if (plan.name === 'help') {
      setText('/')
      return true
    }
    if (plan.name === 'model') {
      const wanted = plan.text ? models.find((model) => model.alias === plan.text || model.id === plan.text) : undefined
      if (wanted) onUseModel(wanted)
      else setModelSignal((value) => value + 1)
      return true
    }
    if (!onUiCommand) return false
    try {
      return await onUiCommand(plan.name, plan.text)
    } catch {
      return false
    }
  }

  function completeSlash(command: SlashCommand) {
    setText(`/${command.name} `)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  function pickSlash(command: SlashCommand) {
    if (!runsOnPick(command)) {
      completeSlash(command)
      return
    }
    setText(`/${command.name}`)
    void handleSend()
  }

  const canSend = paneMention ? paneMention.message.length > 0 : (!!text.trim() || attachments.length > 0)

  async function prepareOne(item: AttachmentRef) {
    if (!onPrepareAttachments) {
      // Borrador sin sesión: se prepara al enviar; aquí solo cambia la elección.
      updateAttachmentById(item.id, { ...item, status: undefined, error: undefined })
      return
    }
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
      updateAttachmentById(item.id, { status: 'error', error: error instanceof Error ? error.message : t('attach.prepareFailed') })
    }
  }

  function addAttachment(item: AttachmentRef) {
    const currentAttachments = useComposerStore.getState().getDraft(draftKey).attachments
    if (currentAttachments.some(current => current.path === item.path && current.name === item.name)) return
    if (currentAttachments.length >= 8) {
      setAttachmentNotice(t('attach.limitCount'))
      return
    }
    setAttachmentNotice(undefined)
    const pending = onPrepareAttachments
      ? { ...item, status: 'preparing' as const, error: undefined }
      : item
    addAttachmentFor(draftKey, pending)
    if (onPrepareAttachments) void prepareOne(pending)
  }

  /** Cómo leer las imágenes: píxeles (visión), texto (OCR) o ambos. */
  const imageReadMode: ImageReadMode | undefined = (() => {
    const modes = new Set(imageAttachments.map(file => !file.ocr ? 'image' : file.keepImage ? 'both' : 'text'))
    return modes.size === 1 ? [...modes][0] as ImageReadMode : undefined
  })()
  function setImageReadMode(mode: ImageReadMode) {
    const ocr = mode !== 'image'
    const keepImage = mode === 'both'
    for (const file of imageAttachments) {
      if (Boolean(file.ocr) === ocr && Boolean(file.keepImage) === keepImage) continue
      void prepareOne({ ...file, ocr, keepImage: keepImage || undefined, derivedUri: ocr ? file.derivedUri : undefined })
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
      setPreviewText(t('attach.previewFailed'))
    } finally {
      setPreviewLoading(false)
    }
  }

  function addBrowserFile(file: File) {
    if (file.size > 25 * 1024 * 1024) {
      setAttachmentNotice(t('attach.limitSize', { name: file.name }))
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

  useChatFileReceiver(files => { for (const file of files) addBrowserFile(file) })

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    for (const file of Array.from(event.clipboardData.files)) addBrowserFile(file)
  }

  async function chooseFiles() {
    const paths = (await platform().dialog.openFiles({ multiple: true, directory: false, title: t('attach.attachFiles') })) ?? []
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
    })
  }

  function choosePaneTarget(target: PaneMentionTarget) {
    setText(`@${target.label} `)
    setFileMatches([])
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
  }

  function chooseWorkspaceFile(file: { path: string; relative_path: string; name: string }) {
    addAttachment({ id: `att_${Date.now().toString(36)}_${file.path}`, path: file.path, name: file.relative_path, source: 'workspace', kind: /\.(png|jpe?g|webp)$/i.test(file.path) ? 'image' : undefined, status: 'ready' })
    setText(text.replace(/(?:^|\s)@[^\s]*$/, (match) => `${match.startsWith(' ') ? ' ' : ''}@${file.relative_path} `))
    setFileMatches([])
  }

  return (
    <div ref={rootRef} className="composer-root relative">
      <div onDrop={event => event.preventDefault()} onDragOver={event => event.preventDefault()} data-working={isStreaming || undefined} className="composer-surface rounded-[22px] border p-2.5 transition-colors">
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5 px-1">
            {attachments.map((file) => (
              <span key={`${file.path}:${file.name}`} className="inline-flex max-w-[320px] items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-1 text-[11px] text-[var(--text-muted)]">
                <button type="button" onClick={() => void openAttachmentPreview(file)} className="inline-flex min-w-0 items-center gap-1.5 rounded px-0.5 text-left hover:text-[var(--text)]" title={t('attach.openPreview')}>
                  {file.previewUrl ? <img src={file.previewUrl} alt="" className="size-7 rounded object-cover" /> : file.kind === 'image' ? <ImageIcon size={12} className="shrink-0" /> : <FileText size={12} className="shrink-0" />}
                  <span className="truncate">{file.name}</span>
                </button>
                <ReadingBadges attachment={file} />
                {file.warning && <span title={file.warning} className="text-amber-300">⚠</span>}
                {file.kind === 'pdf' && <details className="relative"><summary className="cursor-pointer rounded px-1 text-[10px] text-[var(--text-subtle)] hover:text-[var(--text)]">PDF</summary><div className="absolute top-full right-0 z-40 mt-1 w-56 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 shadow-xl"><label className="block text-[10px] text-[var(--text-subtle)]">{t('attach.pdfPages')}<input disabled={file.status === 'preparing'} defaultValue={file.pageRange ?? ''} onChange={(event) => updateAttachmentFor(draftKey, file.id, { pageRange: event.target.value || undefined })} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-subtle)] px-1.5 py-1 font-mono text-[11px] text-[var(--text)] outline-none disabled:opacity-50" /></label><label className="mt-2 block text-[10px] text-[var(--text-subtle)]">{t('attach.pdfVisualPages')}<input disabled={file.status === 'preparing'} defaultValue={file.visualPages?.join(',') ?? ''} onChange={(event) => updateAttachmentFor(draftKey, file.id, { visualPages: event.target.value.split(',').map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0) })} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-subtle)] px-1.5 py-1 font-mono text-[11px] text-[var(--text)] outline-none disabled:opacity-50" /></label><button type="button" disabled={file.status === 'preparing'} onClick={() => void prepareOne(useComposerStore.getState().getDraft(draftKey).attachments.find((candidate) => candidate.id === file.id) ?? file)} className="mt-2 rounded border border-[var(--border)] px-2 py-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-50">{t('attach.pdfPrepareAgain')}</button></div></details>}
                {file.status === 'preparing' && <><LoaderCircle size={12} className="animate-spin text-[var(--accent-2)]" /><button type="button" aria-label={t('attach.cancelPrepare', { name: file.name })} onClick={() => void cancelAttachment(file)} className="cursor-pointer rounded p-0.5 hover:bg-[var(--bg-hover)]"><Square size={10} /></button></>}
                {file.status === 'error' && <><span title={file.error} className="text-red-400">{file.error || 'Error'}</span><button type="button" aria-label={t('attach.retry', { name: file.name })} onClick={() => void prepareOne(file)} className="cursor-pointer rounded p-0.5 hover:bg-[var(--bg-hover)]"><RefreshCw size={11} /></button></>}
                <button type="button" aria-label={t('attach.remove', { name: file.name })} onClick={() => removeAttachmentFor(draftKey, file.id)} className="cursor-pointer rounded p-0.5 hover:bg-[var(--bg-hover)]"><X size={11} /></button>
              </span>
            ))}
          </div>
        )}
        {attachmentNotice && <div className="mb-2 rounded-lg border border-red-400/30 bg-red-400/5 px-2.5 py-2 text-[11px] text-red-300">{attachmentNotice}</div>}
        {visionUnavailable && <div role="alert" className="mb-2 rounded-lg border border-amber-400/30 p-2 text-xs">{visionRoute?.reason}</div>}
        {visualAttachments.length > 0 && visionRoute?.key === visionRouteKey && visionRoute.available && <p className="mb-2 text-[11px] text-[var(--text-subtle)]">{t('attach.visionRoute', { destination: visionRoute.destination })}</p>}
        {imageAttachments.length > 0 && onPrepareAttachments && (
          <div role="radiogroup" aria-label={t('attach.read.label')} className="mb-2 flex flex-wrap items-center gap-1 px-1 text-[11px]">
            <span className="mr-1 text-[var(--text-subtle)]">{t('attach.read.label')}</span>
            {(['image', 'text', 'both'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={imageReadMode === mode}
                title={t(`attach.read.${mode}Hint`)}
                disabled={imageAttachments.some(file => file.status === 'preparing')}
                onClick={() => setImageReadMode(mode)}
                className={cn('rounded-md border px-2 py-0.5 transition-colors disabled:opacity-50', imageReadMode === mode ? 'border-[var(--accent-2)]/50 bg-[var(--accent-2)]/10 text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]')}
              >
                {t(`attach.read.${mode}`)}
              </button>
            ))}
          </div>
        )}
        {paneMention && (
          <div className="mb-2 flex items-center gap-2 text-[11px] text-[var(--accent-2)]" data-testid="pane-mention-chip">
            <MessageSquareShare size={12} aria-hidden="true" />
            <span>{t('composer.paneMention.direct', { label: paneMention.target.label })}</span>
            <span className="text-[var(--text-subtle)]">· {paneMention.message ? t('composer.paneMention.hint') : t('composer.paneMention.empty')}</span>
          </div>
        )}
        {menuOpen && menuBox && createPortal(
          <div
            ref={menuRef}
            data-testid="composer-suggestions"
            style={{ position: 'fixed', left: menuBox.left, width: menuBox.width, bottom: menuBox.bottom }}
            className="r-pop z-50 max-h-64 overflow-auto rounded-[var(--r-lg)] p-1.5" data-state="open"
          >
            {slashMatches.length > 0 && (
              <div role="listbox" aria-label={t('composer.slash.heading')} data-testid="slash-command-list">
                <p className="px-2.5 pt-1 pb-0.5 text-[10px] font-semibold tracking-wider text-[var(--text-subtle)] uppercase">{t('composer.slash.heading')}</p>
                {slashMatches.map((command, index) => {
                  const key = SLASH_DESCRIPTION_KEYS[command.name]
                  return (
                    <button
                      key={command.name}
                      type="button"
                      role="option"
                      aria-selected={index === slashHighlight}
                      onMouseEnter={() => setSlashHighlight(index)}
                      onClick={() => pickSlash(command)}
                      className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${index === slashHighlight ? 'bg-[var(--bg-hover)] text-[var(--text)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]'}`}
                    >
                      <span className="shrink-0 font-mono text-[var(--text)]">/{command.name}</span>
                      {command.args && <span className="shrink-0 font-mono text-[var(--text-subtle)]">{command.args}</span>}
                      <span className="min-w-0 flex-1 truncate text-[var(--text-subtle)]">{command.source === 'builtin' && key ? t(key) : command.description}</span>
                      {command.source === 'skill' && <span className="shrink-0 rounded-md border border-[var(--border)] px-1.5 text-[10px] text-[var(--text-subtle)]">{t('composer.slash.skill')}</span>}
                    </button>
                  )
                })}
              </div>
            )}
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
          </div>,
          document.body,
        )}
        <textarea
          ref={textareaRef}
          value={text}
          rows={placement === 'centered' ? 2 : 1}
          aria-label={t('composer.message')}
          placeholder={canSteer ? t('composer.placeholderSteer') : isStreaming ? t('composer.placeholderStreaming') : t('composer.placeholder')}
          onChange={(e) => {
            setText(e.target.value)
          }}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (slashMatches.length > 0 && !e.nativeEvent.isComposing) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSlashHighlight((index) => (index + 1) % slashMatches.length); return }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSlashHighlight((index) => (index - 1 + slashMatches.length) % slashMatches.length); return }
              if (e.key === 'Tab') { e.preventDefault(); completeSlash(slashMatches[slashHighlight] ?? slashMatches[0]); return }
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); pickSlash(slashMatches[slashHighlight] ?? slashMatches[0]); return }
              if (e.key === 'Escape') { e.preventDefault(); setText(''); return }
            }
            if (paneMatches.length > 0 && !e.nativeEvent.isComposing) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setPaneHighlight((index) => (index + 1) % paneMatches.length); return }
              if (e.key === 'ArrowUp') { e.preventDefault(); setPaneHighlight((index) => (index - 1 + paneMatches.length) % paneMatches.length); return }
              if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); choosePaneTarget(paneMatches[paneHighlight] ?? paneMatches[0]); return }
              if (e.key === 'Escape') { e.preventDefault(); setText(text.replace(/^@/, '')); return }
            }
            const sendWithEnter = useUIStore.getState().enterToSend
            const mod = e.ctrlKey || e.metaKey
            if (canSteer && onQueue && e.key === 'Tab' && !e.shiftKey && text.trim() && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void handleSteer(true)
              return
            }
            if (
              e.key === 'Enter' &&
              !e.nativeEvent.isComposing &&
              (sendWithEnter ? !e.shiftKey : mod)
            ) {
              e.preventDefault()
              void (canSteer ? handleSteer(false) : handleSend())
            }
          }}
          className="composer-textarea block max-h-[240px] min-h-13 w-full resize-none border-0 bg-transparent text-[15px] leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)] focus:outline-none focus-visible:outline-none"
        />
        <div className="composer-toolbar">
          <div className="composer-tools">
          <DictationButton textareaRef={textareaRef} disabled={isSubmitting} onText={insertDictation} />
          <Popover open={attachmentOpen} onOpenChange={setAttachmentOpen}>
            <PopoverTrigger asChild>
              <button type="button" disabled={isStreaming} aria-label={t('attach.attachFiles')} title={t('attach.addToMessage')} className="composer-chip composer-chip-icon">
                <Plus size={16} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-60 p-1.5">
              <p className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold tracking-wider text-[var(--text-subtle)] uppercase">{t('attach.addToMessage')}</p>
              <button type="button" onClick={() => { setAttachmentOpen(false); void chooseFiles() }} className="flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]">
                <FileText size={15} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
                <span><span className="block text-[13px] text-[var(--text)]">{t('attach.fromComputer')}</span><span className="block text-[11px] text-[var(--text-subtle)]">{t('attach.fromComputerHint')}</span></span>
              </button>
              <button type="button" onClick={beginWorkspaceAttachment} className="flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]">
                <Search size={15} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
                <span><span className="block text-[13px] text-[var(--text)]">{t('attach.fromProject')}</span><span className="block text-[11px] text-[var(--text-subtle)]">{t('attach.fromProjectHint')}</span></span>
              </button>
            </PopoverContent>
          </Popover>
          <Popover open={permissionOpen} onOpenChange={setPermissionOpen}>
            <PopoverTrigger asChild>
              <button type="button" disabled={isStreaming} title={t('perm.title')} className="composer-chip">
                <Shield size={13} style={{ color: permissionColors[sessionMode === 'plan' || sessionMode === 'review' ? permissionProfile : effectivePermissionProfile] }} />
                <span className="composer-chip-label">{sessionMode === 'plan' || sessionMode === 'review' ? (permissionProfile === 'full-access' ? t('perm.readFull') : permissionProfile === 'workspace' ? t('perm.readWorkspace') : t('perm.readOnly')) : effectivePermissionProfile === 'read-only' ? t('perm.readOnly') : effectivePermissionProfile === 'full-access' ? t('perm.fullAccess') : 'Workspace'}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-1.5">
              {currentMode !== 'build' && <p className="px-2.5 py-2 text-[11px] text-[var(--text-subtle)]">{t('perm.readModesNote')}</p>}
              {([
                ['read-only', t('perm.readOnly'), t('perm.readOnlyHint')],
                ['workspace', 'Workspace', t('perm.workspaceHint')],
                ['full-access', t('perm.fullAccess'), t('perm.fullAccessHint')],
              ] as const).map(([value, label, description]) => (
                <button key={value} type="button" disabled={isStreaming || (value === 'full-access' && !permissionProfilesV2)} title={value === 'full-access' && !permissionProfilesV2 ? t('perm.fullAccessNeedsUpdate') : undefined} onClick={() => { setPermissionOpen(false); onPermissionChange(value) }} className="flex w-full cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-default disabled:opacity-40">
                  <span className="min-w-0 flex-1"><span className="block text-[13px]" style={{ color: permissionColors[value] }}>{label}</span><span className="block text-[11px] text-[var(--text-subtle)]">{sessionMode === 'plan' || sessionMode === 'review' ? t('perm.readModesHint') : description}</span></span>
                  {permissionProfile === value && <Check size={14} className="mt-0.5" style={{ color: permissionColors[value] }} />}
                </button>
              ))}
            </PopoverContent>
          </Popover>
          </div>
          <div
            ref={modesGroupRef}
            role="group"
            aria-label={t('mode.change')}
            className="composer-modes relative inline-flex items-center rounded-full border p-0.5"
          >
            <span
              aria-hidden="true"
              data-testid="mode-pill"
              ref={pillRef}
              className="composer-mode-pill absolute top-0.5 bottom-0.5 left-0 rounded-full"
              style={{
                transition:
                  pillArmed
                    ? 'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), width 0.22s cubic-bezier(0.22, 1, 0.36, 1)'
                    : 'none',
              }}
            />
            {MODES.map((mode) => {
              const selected = currentMode === mode
              return (
                <button
                  key={mode}
                  type="button"
                  ref={(element) => {
                    if (element) modeButtonRefs.current.set(mode, element)
                    else modeButtonRefs.current.delete(mode)
                  }}
                  disabled={sessionMode === null || isStreaming}
                  onClick={() => {
                    userModeRef.current = mode
                    onModeChange(mode)
                  }}
                  aria-pressed={selected}
                  title={t(`mode.${mode}` as 'mode.plan')}
                  className={`relative rounded-full px-2.5 py-1 font-mono text-[10px] tracking-wide transition-colors disabled:opacity-40 ${
                    selected ? 'font-bold text-white' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  <span className="relative">{t(`mode.${mode}` as 'mode.plan')}</span>
                </button>
              )
            })}
          </div>
          <div className="composer-model-controls">
          <ContextRing sessionId={sessionId} modelId={activeModel?.id ?? null} providerAlias={activeModel?.provider ?? models.find(model => model.alias === activeAlias)?.provider ?? null} />
          <ModelPicker
            models={models}
            providers={providers}
            activeAlias={activeAlias}
            activeModel={activeModel}
            onUseModel={onUseModel}
            onDiscoverModels={onDiscoverModels}
            onRefreshModels={onRefreshModels}
            onOpenProviders={onOpenProviders}
            disabled={isStreaming}
            openSignal={modelSignal}
          />
          <EffortPicker
            value={reasoningEffort}
            capabilities={activeModel?.capabilities ?? models.find(model => model.alias === activeAlias)?.capabilities}
            disabled={isStreaming}
            onChange={onReasoningChange}
          />

          {canSteer && text.trim() ? (
            <button
              type="button"
              onClick={() => void handleSteer(false)}
              disabled={isSubmitting}
              aria-label={t('composer.steer')}
              title={t('composer.steer')}
              className="composer-send"
            >
              <ArrowUp size={17} aria-hidden="true" />
            </button>
          ) : isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              aria-label={t('composer.stop')}
              title={t('composer.stop')}
              className="composer-send is-stop"
            >
              <Square size={13} aria-hidden="true" fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!canSend || isSubmitting || visionUnavailable || attachments.some((item) => item.status === 'preparing' || item.status === 'error')}
              aria-label={t('composer.send')}
              title={t('composer.send')}
              className="composer-send"
            >
              <ArrowUp size={17} aria-hidden="true" />
            </button>
          )}
          </div>
        </div>
      </div>
      <p className="mt-1.5 px-1 text-center text-[11px] text-[var(--text-subtle)]">
        {canSteer ? t(onQueue ? 'composer.steerHint' : 'composer.steerHintNow') : t('composer.hint')}
      </p>
      {previewAttachment && (
        <AttachmentPreview name={previewAttachment.name} open onOpenChange={(open) => { if (!open) setPreviewAttachment(null) }}>
          {previewLoading && <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--text-muted)]"><LoaderCircle size={16} className="animate-spin" /> {t('attach.previewLoading')}</div>}
          {previewAttachment.coverage && <p className="mb-3 text-xs text-[var(--text-muted)]">{t('attach.coverage.pages', { read: previewAttachment.coverage.prepared_pages, total: previewAttachment.coverage.total_pages })} · {coverageDetail(previewAttachment.coverage, t)}</p>}
          {!previewLoading && previewAttachment.ocr && previewAttachment.kind === 'image' && previewAttachment.derivedUri && <RecognizedPreview attachment={previewAttachment} previewUrl={previewUrl} />}
          {!previewLoading && previewUrl && previewAttachment.kind === 'image' && !(previewAttachment.ocr && previewAttachment.derivedUri) && <img src={previewUrl} alt={previewAttachment.name} className="mx-auto max-h-[65vh] max-w-full rounded-lg object-contain" />}
          {!previewLoading && previewText !== undefined && <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[var(--text-muted)]">{previewText}</pre>}
          {!previewLoading && !previewUrl && previewText === undefined && !(previewAttachment.ocr && previewAttachment.derivedUri) && <p className="py-10 text-center text-sm text-[var(--text-muted)]">{t('attach.previewUnavailable')}</p>}
        </AttachmentPreview>
      )}
    </div>
  )
}
