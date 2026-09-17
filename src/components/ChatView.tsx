import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Virtualizer, type VirtualizerHandle } from 'virtua'
import type { AttachmentRef, ChatMessage } from '../types'
import type { ModelSummary, ProviderSummary } from '../services/engine'
import type { TurnTimeline } from '../features/activity/types'
import { buildChatStream } from '../features/activity/buildChatStream'
import { selectLatestTurn } from '../features/engine/sessionSelectors'
import TurnTimelineView from '../features/activity/TurnTimelineView'
import { useI18n } from '../i18n'
import { useUIStore } from '../stores/ui'
import Composer from './composer/Composer'
import type { PaneMentionTarget } from './composer/paneMention'
import HomeWelcome from '../features/home/HomeWelcome'
import type { HomeContext } from '../features/home/suggestions'
import Questions from '../features/questions/Questions'
import ProcessesDock from '../features/processes/ProcessesDock'
import { FileTurnContext } from '../features/files/FileWorkspace'
import MessageBubble from './MessageBubble'
import { REVEAL_TURN_EVENT } from '../features/board/boardCommands'
import { readScrollAnchor, saveScrollAnchor, type ScrollAnchor } from '../features/engine/scrollAnchors'
import ScrollToBottom from './chat/ScrollToBottom'

interface ChatViewProps {
  homeContext?: Omit<HomeContext, 'attachmentCount'>
  messages: ChatMessage[]
  sessionId: string
  isStreaming: boolean
  engineReady: boolean
  onSend: (text: string, attachments?: AttachmentRef[]) => Promise<boolean>
  onPrepareAttachments?: (attachments: AttachmentRef[]) => Promise<AttachmentRef[]>
  onCancelAttachmentPreparation?: (attachments: AttachmentRef[]) => Promise<void>
  onStop: () => void
  onImplementPlan?: () => Promise<boolean>
  onOpenProviders: () => void
  models: ModelSummary[]
  /** Catálogo de proveedores: el composer resuelve el logo por alias/endpoint. */
  providers: ProviderSummary[]
  activeAlias: string | null
  activeModel?: ModelSummary | null
  onUseModel: (model: ModelSummary) => void
  onDiscoverModels: () => void
  timelines: Record<string, TurnTimeline>
  onResolveApproval: (id: string, decision: string) => void
  historyNote: { total: number; hasMore: boolean } | null
  sessionMode: string | null
  onModeChange: (mode: string) => void
  reasoningEffort: import('../lib/reasoning').ReasoningEffort
  onReasoningChange: (effort: import('../lib/reasoning').ReasoningEffort) => void
  permissionProfile: 'read-only' | 'workspace' | 'full-access'
  effectivePermissionProfile: 'read-only' | 'workspace' | 'full-access'
  permissionProfilesV2: boolean
  onPermissionChange: (profile: string) => void
  onSearchFiles: (query: string) => Promise<{ root: string; files: Array<{ path: string; relative_path: string; name: string }> }>
  processesOpenSignal?: number
  /** Historial de la sesión activa aún cargando: se muestra esqueleto
   * de conversación en vez del home transitorio. */
  historyLoading?: boolean
  /** Instancia Normal del Composer (espejo legacy del borrador). Los paneles pasan `false`. */
  composerPrimary?: boolean
  /** Solo el panel enfocado recibe foco global/autofocus. */
  composerAcceptsGlobalFocus?: boolean
  /** `pane`: home reducido dentro de un panel del board. */
  homeVariant?: 'home' | 'pane'
  /**
   * Abre la superficie de cambios de la sesión para un turno con changeset
   * (acción de la fila de metadatos). El contenido del turno nunca se
   * duplica: Normal y Boards comparten `TurnResult`/`TurnMeta`.
   */
  onReviewChanges?: (timeline: TurnTimeline) => void
  /** Paneles a los que se puede escribir con `@Panel mensaje` (solo Boards). */
  mentionTargets?: readonly PaneMentionTarget[]
  onSendToTarget?: (targetId: string, text: string) => Promise<boolean>
}

function ChatView({
  homeContext = { projectName: null, changedFiles: null },
  messages,
  sessionId,
  isStreaming,
  engineReady,
  onSend,
  onPrepareAttachments,
  onCancelAttachmentPreparation,
  onStop,
  onImplementPlan,
  onOpenProviders,
  models,
  providers,
  activeAlias,
  activeModel,
  onUseModel,
  onDiscoverModels,
  timelines,
  onResolveApproval,
  historyNote,
  sessionMode,
  onModeChange,
  reasoningEffort,
  onReasoningChange,
  permissionProfile,
  effectivePermissionProfile,
  permissionProfilesV2,
  onPermissionChange,
  onSearchFiles,
  processesOpenSignal = 0,
  historyLoading = false,
  composerPrimary = true,
  composerAcceptsGlobalFocus = true,
  homeVariant = 'home',
  onReviewChanges,
  mentionTargets,
  onSendToTarget,
}: ChatViewProps) {
  const { t } = useI18n()
  const autoFollow = useUIStore((s) => s.autoFollow)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  // Con un ancla de lectura guardada, el primer render ya arranca «sin seguir
  // el final»: así ningún efecto lleva abajo antes de restaurar la fila.
  const followRef = useRef(readScrollAnchor(sessionId)?.follow !== false)
  const virtRef = useRef<VirtualizerHandle>(null)
  const [atBottom, setAtBottom] = useState(() => readScrollAnchor(sessionId)?.follow !== false)
  const [now, setNow] = useState(Date.now())
  const [planStarting, setPlanStarting] = useState(false)
  const planStartingRef = useRef(false)
  const [dismissedPlans, setDismissedPlans] = useState<Set<string>>(() => new Set())
  const latestTurn = selectLatestTurn({ timelines }, sessionId) ?? undefined
  const pendingPlan = sessionMode === 'plan' && latestTurn?.mode === 'plan' && latestTurn.status === 'completed' && latestTurn.items.some(item => item.type === 'model' && item.outputKind === 'final' && item.content) && !dismissedPlans.has(latestTurn.turnId) && !isStreaming
  const stream = useMemo(
    () => buildChatStream(messages, timelines, sessionId),
    [messages, timelines, sessionId],
  )
  const empty = stream.length === 0
  // Historial en curso sin contenido aún: esqueleto de conversación en
  // vez del home transitorio (el destello al cambiar de sesión). Sin
  // engine no hay carga en curso: se muestra el home como antes.
  const loadingHistory = historyLoading && empty && engineReady
  const activeTimeline = Object.values(timelines).some((turn) => turn.sessionId === sessionId && ['running', 'approval', 'cancelling'].includes(turn.status))

  useEffect(() => {
    if (!activeTimeline) return
    const timer = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(timer)
  }, [activeTimeline])

  // Ancla de lectura: fila superior visible y desplazamiento dentro de ella,
  // o «seguir el final». Se actualiza en cada scroll del usuario y se guarda
  // por sesión al desmontar o cambiar de sesión (colapsar un panel, volver a
  // Normal…), para restaurarla al volver sin timeouts arbitrarios.
  const anchorRef = useRef<ScrollAnchor>({ follow: true })
  const restoreRef = useRef<ScrollAnchor | null>(null)
  const streamRef = useRef(stream)
  streamRef.current = stream

  function snapshotAnchor(): ScrollAnchor {
    const el = scrollRef.current
    const virt = virtRef.current
    if (!el || el.scrollHeight - el.scrollTop - el.clientHeight < 80) return { follow: true }
    if (!virt) return anchorRef.current
    const index = virt.findItemIndex(virt.scrollOffset)
    const row = streamRef.current[index]
    if (!row) return { follow: true }
    return { follow: false, rowId: row.id, offset: Math.max(0, virt.scrollOffset - virt.getItemOffset(index)) }
  }

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    setAtBottom(bottom)
    followRef.current = bottom
    anchorRef.current = snapshotAnchor()
  }

  // Al montar o cambiar de sesión: sin ancla guardada (o con «seguir el
  // final») el scroll va al fondo antes de pintar, sin destello; con ancla de
  // lectura se restaura cuando las filas existan. Al salir, se guarda la
  // última ancla conocida de la sesión que se deja.
  useLayoutEffect(() => {
    const saved = readScrollAnchor(sessionId)
    if (!saved || saved.follow) {
      followRef.current = true
      setAtBottom(true)
      anchorRef.current = { follow: true }
      restoreRef.current = null
      const scroller = scrollRef.current
      if (scroller) scroller.scrollTop = scroller.scrollHeight
    } else {
      followRef.current = false
      setAtBottom(false)
      anchorRef.current = saved
      restoreRef.current = saved
    }
    return () => {
      saveScrollAnchor(sessionId, anchorRef.current)
    }
  }, [sessionId])

  useLayoutEffect(() => {
    const pending = restoreRef.current
    if (!pending || pending.follow) return
    const index = stream.findIndex((row) => row.id === pending.rowId)
    if (index >= 0) {
      restoreRef.current = null
      // virtua reintenta hasta medir la fila: no hace falta esperar a ciegas.
      virtRef.current?.scrollToIndex(index, { align: 'start', offset: pending.offset })
      return
    }
    // La fila ya no existe en un transcript cargado: no hay a qué volver.
    if (stream.length > 0 && !historyLoading) {
      restoreRef.current = null
      followRef.current = true
      setAtBottom(true)
      anchorRef.current = { follow: true }
      virtRef.current?.scrollToIndex(stream.length - 1, { align: 'end' })
    }
  }, [stream, historyLoading])

  // «Ir al resultado» desde un aviso: mostrar el turno sin marcarlo leído (eso
  // solo ocurre cuando su bloque queda visible).
  useEffect(() => {
    function onReveal(event: Event) {
      const detail = (event as CustomEvent<{ sessionId: string; turnId: string }>).detail
      if (!detail || detail.sessionId !== sessionId) return
      const index = stream.findIndex((row) => row.kind === 'timeline' ? row.timeline.turnId === detail.turnId : row.message.turnId === detail.turnId)
      if (index < 0) return
      followRef.current = false
      setAtBottom(false)
      virtRef.current?.scrollToIndex(index, { align: 'start' })
    }
    window.addEventListener(REVEAL_TURN_EVENT, onReveal)
    return () => window.removeEventListener(REVEAL_TURN_EVENT, onReveal)
  }, [sessionId, stream])

  useEffect(() => {
    const content = contentRef.current
    if (!content || !autoFollow) return
    let frame = 0
    const observer = new ResizeObserver(() => {
      if (!followRef.current) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const scroller = scrollRef.current
        if (scroller && followRef.current) scroller.scrollTop = scroller.scrollHeight
      })
    })
    observer.observe(content)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [empty, autoFollow, sessionId])

  // El dock de procesos vive en la zona inferior y su inspector expande
  // esa zona, encogiendo el transcript. Si el usuario ya estaba abajo,
  // acompañar el fondo para que el último texto no quede tapado; si
  // estaba leyendo arriba, conservar su posición sin saltos.
  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller || !autoFollow) return
    let frame = 0
    const observer = new ResizeObserver(() => {
      if (!followRef.current) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const el = scrollRef.current
        if (el && followRef.current) {
          el.scrollTop = el.scrollHeight
          if (stream.length > 0) virtRef.current?.scrollToIndex(stream.length - 1, { align: 'end' })
        }
      })
    })
    observer.observe(scroller)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [autoFollow, sessionId, empty, stream.length])

  useEffect(() => {
    // Autoscroll inteligente: solo sigue si el usuario ya estaba abajo
    // y la preferencia está activa; nunca mientras se restaura un ancla.
    if (autoFollow && atBottom && stream.length > 0 && !restoreRef.current) {
      virtRef.current?.scrollToIndex(stream.length - 1, { align: 'end' })
    }
  }, [stream, isStreaming, atBottom, autoFollow])

  const composer = (
    <Composer
      placement={empty && !loadingHistory ? 'centered' : 'bottom'}
      onSend={onSend}
      onPrepareAttachments={onPrepareAttachments}
      onCancelAttachmentPreparation={onCancelAttachmentPreparation}
      sessionId={sessionId}
      primary={composerPrimary}
      acceptsGlobalFocus={composerAcceptsGlobalFocus}
      isStreaming={isStreaming}
      onStop={onStop}
      models={models}
      providers={providers}
      activeAlias={activeAlias}
      activeModel={activeModel}
      onUseModel={onUseModel}
      onDiscoverModels={onDiscoverModels}
      sessionMode={sessionMode}
      onModeChange={onModeChange}
      reasoningEffort={reasoningEffort}
      onReasoningChange={onReasoningChange}
      onOpenProviders={onOpenProviders}
      permissionProfile={permissionProfile}
      effectivePermissionProfile={effectivePermissionProfile}
      permissionProfilesV2={permissionProfilesV2}
      onPermissionChange={onPermissionChange}
      onSearchFiles={onSearchFiles}
      mentionTargets={mentionTargets}
      onSendToTarget={onSendToTarget}
    />
  )

  return (
    <HomeWelcome key={sessionId} sessionId={sessionId} context={homeContext} engineReady={engineReady} conversationActive={!empty || loadingHistory} variant={homeVariant} transcript={!empty ? (
        <div key={sessionId + ':ready'} className="conversation-enter flex min-h-full flex-col">
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto" onScroll={handleScroll}>
            {historyNote?.hasMore && (
              <p className="mx-auto max-w-3xl px-4 pt-4 text-center text-[11px] text-[var(--text-subtle)]">
                {t('history.hasMore', { n: historyNote.total })}
              </p>
            )}
            <div ref={contentRef}>
            <Virtualizer ref={virtRef} scrollRef={scrollRef} data={stream} bufferSize={800}>
              {(row, index) => (
                <div
                  key={row.id}
                  className={`mx-auto max-w-3xl px-4 ${index === 0 ? 'pt-6' : 'pt-3'} pb-3`}
                >
                  <FileTurnContext.Provider value={row.kind === 'timeline' ? row.timeline.turnId : row.message.turnId}>
                  {row.kind === 'timeline' ? (
                    <TurnTimelineView
                      timeline={row.timeline}
                      user={row.user}
                      now={now}
                      onResolveApproval={onResolveApproval}
                      onReviewChanges={onReviewChanges ? () => onReviewChanges(row.timeline) : undefined}
                      planActions={pendingPlan && row.timeline.turnId === latestTurn.turnId && onImplementPlan ? <div className="flex items-center gap-2 border-t border-[var(--border)] pt-3 text-sm"><span className="flex-1">¿Implementar este plan?</span><button type="button" disabled={planStarting} onClick={() => setDismissedPlans(current => new Set(current).add(latestTurn.turnId))} className="rounded-lg px-3 py-2 hover:bg-[var(--bg-hover)]">Ahora no</button><button type="button" disabled={planStarting} className="rounded-lg bg-[var(--accent)] px-3 py-2 text-white disabled:opacity-50" onClick={async () => { if (planStartingRef.current) return; planStartingRef.current = true; setPlanStarting(true); try { await onImplementPlan() } finally { planStartingRef.current = false; setPlanStarting(false) } }}>{planStarting ? 'Iniciando…' : 'Implementar plan'}</button></div> : undefined}
                    />
                  ) : <MessageBubble message={row.message} />}
                  </FileTurnContext.Provider>
                </div>
              )}
            </Virtualizer>
            </div>
          </div>
          <ScrollToBottom
            visible={!atBottom && stream.length > 0}
            onClick={() => {
              setAtBottom(true)
              if (stream.length > 0) {
                requestAnimationFrame(() => {
                  virtRef.current?.scrollToIndex(stream.length - 1, { align: 'end' })
                })
              }
            }}
          />
        </div>
    ) : loadingHistory ? (
        <div key={sessionId + ':loading'} aria-busy="true" data-testid="chat-loading" className="flex min-h-full flex-col">
          {[72, 100, 86, 94].map((width, group) => (
            <div key={group} className="mx-auto w-full max-w-3xl space-y-2 px-4 pt-6">
              <div className="h-3 rounded bg-[var(--bg-active)] motion-safe:animate-pulse" style={{ width: width + '%' }} />
              <div className="h-3 rounded bg-[var(--bg-active)] motion-safe:animate-pulse" style={{ width: Math.max(40, width - 25) + '%' }} />
            </div>
          ))}
        </div>
    ) : undefined}>
      {sessionId !== '' && (
        <ProcessesDock key={`processes:${sessionId}`} sessionId={sessionId} openSignal={processesOpenSignal} />
      )}
      <Questions key={`questions:${sessionId}`} sessionId={sessionId} />
      {composer}
    </HomeWelcome>
  )
}

/** Memoizado: cada instancia solo repinta cuando cambian sus props (su sesión). */
export default memo(ChatView)
