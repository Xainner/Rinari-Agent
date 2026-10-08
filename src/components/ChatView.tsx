import type { SendOptions } from '../features/engine/useEngineSession'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Virtualizer, type VirtualizerHandle } from 'virtua'
import type { AttachmentRef, ChatMessage } from '../types'
import type { ModelRefreshResult, ModelSummary, ProviderSummary } from '../services/engine'
import type { TurnTimeline } from '../features/activity/types'
import { buildChatStream } from '../features/activity/buildChatStream'
import { selectLatestTurn } from '../features/engine/sessionSelectors'
import TurnTimelineView from '../features/activity/TurnTimelineView'
import { ActivityLayoutContext, type ActivityLayout } from '../features/activity/activityLayout'
import { useI18n } from '../i18n'
import { useUIStore } from '../stores/ui'
import Composer from './composer/Composer'
import { ChatFileDropZone } from './composer/ChatFileDropZone'
import type { PaneMentionTarget } from './composer/paneMention'
import HomeWelcome from '../features/home/HomeWelcome'
import type { HomeContext } from '../features/home/suggestions'
import Questions from '../features/questions/Questions'
import ProcessesDock from '../features/processes/ProcessesDock'
import { FileTurnContext } from '../features/files/FileWorkspace'
import MessageBubble from './MessageBubble'
import { REVEAL_TURN_EVENT, takeQueuedTurnReveal } from '../features/board/boardCommands'
import { readScrollAnchor, saveScrollAnchor, type ScrollAnchor } from '../features/engine/scrollAnchors'
import ScrollToBottom from './chat/ScrollToBottom'
import type { HistoryPhase } from '../features/engine/useSessionList'

export type ConversationPresentation = 'loading' | 'error' | 'empty' | 'conversation'

export function conversationPresentation(
  historyPhase: HistoryPhase,
  streamLength: number,
): ConversationPresentation {
  if (historyPhase === 'unloaded' || historyPhase === 'loading') return 'loading'
  if (historyPhase === 'error') return 'error'
  return streamLength === 0 ? 'empty' : 'conversation'
}

interface ChatViewProps {
  homeContext?: Omit<HomeContext, 'attachmentCount'>
  messages: ChatMessage[]
  sessionId: string
  isStreaming: boolean
  engineReady: boolean
  onSend: (text: string, attachments?: AttachmentRef[], options?: SendOptions) => Promise<boolean>
  /** Comandos `/` de interfaz (nueva, compactar, cambios…). Sin él, esos comandos no se ofrecen. */
  onUiCommand?: (name: string, text: string) => boolean | Promise<boolean>
  onPrepareAttachments?: (attachments: AttachmentRef[]) => Promise<AttachmentRef[]>
  onCancelAttachmentPreparation?: (attachments: AttachmentRef[]) => Promise<void>
  onStop: () => void
  /** El Engine anuncia `turn_steering_v1`: escribir mientras trabaja la guía. */
  onSteer?: (text: string) => Promise<boolean>
  onQueue?: (text: string) => Promise<boolean>
  /** Mensajes que esperan al final del turno, sobre el compositor. */
  queue?: ReactNode
  onImplementPlan?: () => Promise<boolean>
  onOpenProviders: () => void
  models: ModelSummary[]
  /** Catálogo de proveedores: el composer resuelve el logo por alias/endpoint. */
  providers: ProviderSummary[]
  activeAlias: string | null
  activeModel?: ModelSummary | null
  onUseModel: (model: ModelSummary) => void
  onDiscoverModels: () => void
  onRefreshModels?: () => Promise<ModelRefreshResult>
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
  /**
   * Los procesos viven en el panel Terminal (pestaña «Rinari»): no se pinta
   * la barra sobre el compositor. Sin terminal integrada, la barra sigue.
   */
  processesInPanel?: boolean
  historyPhase?: HistoryPhase
  onRetryHistory?: () => void
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
  /** Clave del borrador del composer cuando aún no hay sesión (conversación nueva). */
  composerDraftKey?: string
}

function ChatView({
  homeContext = { projectName: null, changedFiles: null },
  messages,
  sessionId,
  isStreaming,
  engineReady,
  onSend,
  onUiCommand,
  onPrepareAttachments,
  onCancelAttachmentPreparation,
  onStop,
  onSteer,
  onQueue,
  queue,
  onImplementPlan,
  onOpenProviders,
  models,
  providers,
  activeAlias,
  activeModel,
  onUseModel,
  onDiscoverModels,
  onRefreshModels,
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
  processesInPanel = false,
  historyPhase = 'loaded',
  onRetryHistory,
  composerPrimary = true,
  composerAcceptsGlobalFocus = true,
  homeVariant = 'home',
  onReviewChanges,
  mentionTargets,
  onSendToTarget,
  composerDraftKey,
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
  const presentation = conversationPresentation(historyPhase, stream.length)
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

  // Tras un salto pedido (enviar o guiar) y mientras llega esa respuesta, solo
  // un gesto de la persona apaga «seguir el final». Los `scroll` que provoca
  // el virtualizador al medir y recolocar filas no cuentan: antes uno de ellos
  // podía caer antes del salto y dejar el panel a medio camino. Termina con
  // el gesto o cuando la respuesta acaba y el panel está abajo.
  const jumpRef = useRef(false)
  const streamingRef = useRef(isStreaming)
  streamingRef.current = isStreaming
  const userScrolls = () => { jumpRef.current = false }
  useEffect(() => {
    if (!isStreaming) jumpRef.current = false
  }, [isStreaming])

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (jumpRef.current && !bottom) return
    if (jumpRef.current && !streamingRef.current) jumpRef.current = false
    setAtBottom(bottom)
    followRef.current = bottom
    anchorRef.current = snapshotAnchor()
  }

  const activityLayout = useMemo<ActivityLayout>(() => ({
    begin(anchor, manual = true) {
      const scroll = scrollRef.current
      if (!scroll || (!manual && followRef.current)) return () => {}
      const viewport = scroll.getBoundingClientRect()
      const top = anchor.getBoundingClientRect().top
      // Updates above/below the viewport must not pull the reader to this turn.
      if (!manual && (anchor.getBoundingClientRect().bottom < viewport.top || top > viewport.bottom)) return () => {}
      followRef.current = false
      jumpRef.current = false
      setAtBottom(false)
      const offset = Math.max(viewport.top, Math.min(top, viewport.bottom - 40))
      return () => {
        const restore = () => {
          if (!anchor.isConnected || scrollRef.current !== scroll) return
          scroll.scrollTop += anchor.getBoundingClientRect().top - offset
          anchorRef.current = snapshotAnchor()
        }
        restore()
        requestAnimationFrame(restore)
      }
    },
  }), [sessionId])

  // Al montar o cambiar de sesión: sin ancla guardada (o con «seguir el
  // final») el scroll va al fondo antes de pintar, sin destello; con ancla de
  // lectura se restaura cuando las filas existan. Al salir, se guarda la
  // última ancla conocida de la sesión que se deja.
  useLayoutEffect(() => {
    jumpRef.current = false
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
    if (stream.length > 0 && historyPhase === 'loaded') {
      restoreRef.current = null
      followRef.current = true
      setAtBottom(true)
      anchorRef.current = { follow: true }
      virtRef.current?.scrollToIndex(stream.length - 1, { align: 'end' })
    }
  }, [stream, historyPhase])

  // «Ir al resultado» desde un aviso o desde Flujos: mostrar el turno sin
  // marcarlo leído (eso solo ocurre cuando su bloque queda visible). Si la
  // fila aún no existe (historial cargando), la petición espera a que llegue.
  const pendingRevealRef = useRef<string | null>(null)
  // Cuenta las navegaciones explícitas: un envío que termina después de una
  // de ellas no se lleva al lector a otro sitio.
  const navigationRef = useRef(0)
  const revealTurn = useCallback((turnId: string): boolean => {
    const index = streamRef.current.findIndex((row) => row.kind === 'timeline' ? row.timeline.turnId === turnId : row.message.turnId === turnId)
    if (index < 0) return false
    navigationRef.current += 1
    jumpRef.current = false
    followRef.current = false
    setAtBottom(false)
    restoreRef.current = null
    virtRef.current?.scrollToIndex(index, { align: 'start' })
    const request = navigationRef.current
    let frames = 0
    const revealResult = () => {
      if (request !== navigationRef.current || !contentRef.current) return
      const scroll = scrollRef.current
      const result = [...(contentRef.current?.querySelectorAll<HTMLElement>('[data-testid="turn-result"]') ?? [])].find(el => el.dataset.turnId === turnId)
      if (!scroll) return
      if (!result) { if (++frames < 60) requestAnimationFrame(revealResult); return }
      scroll.scrollTop += result.getBoundingClientRect().top - scroll.getBoundingClientRect().top
      anchorRef.current = snapshotAnchor()
    }
    requestAnimationFrame(() => { revealResult(); requestAnimationFrame(revealResult) })
    return true
  }, [])
  useEffect(() => {
    function onReveal(event: Event) {
      const detail = (event as CustomEvent<{ sessionId: string; turnId: string }>).detail
      if (!detail || detail.sessionId !== sessionId) return
      takeQueuedTurnReveal(sessionId)
      pendingRevealRef.current = revealTurn(detail.turnId) ? null : detail.turnId
    }
    window.addEventListener(REVEAL_TURN_EVENT, onReveal)
    return () => window.removeEventListener(REVEAL_TURN_EVENT, onReveal)
  }, [sessionId, revealTurn])
  useEffect(() => {
    const pending = pendingRevealRef.current
    if (pending && revealTurn(pending)) pendingRevealRef.current = null
  }, [stream, revealTurn])
  useEffect(() => {
    // Al cambiar de sesión solo sobrevive la petición en cola para esta sesión.
    const queued = takeQueuedTurnReveal(sessionId)
    pendingRevealRef.current = queued && !revealTurn(queued) ? queued : null
  }, [sessionId, revealTurn])

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
  }, [autoFollow, presentation, sessionId])

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
  }, [autoFollow, sessionId, presentation, stream.length])

  useEffect(() => {
    // Autoscroll inteligente: solo sigue si el usuario ya estaba abajo
    // y la preferencia está activa; nunca mientras se restaura un ancla.
    if (autoFollow && atBottom && stream.length > 0 && !restoreRef.current) {
      virtRef.current?.scrollToIndex(stream.length - 1, { align: 'end' })
    }
  }, [stream, isStreaming, atBottom, autoFollow])

  // Enviar (o guiar) es una intención nueva: aunque se estuviera leyendo
  // arriba, se va al final en cuanto el Engine acepta el mensaje. Con
  // «seguir el final» desactivado es un salto único: los efectos de
  // seguimiento siguen condicionados a la preferencia. Un envío fallido, el
  // cambio de sesión durante la espera o una navegación explícita posterior
  // no mueven nada.
  const sessionRef = useRef(sessionId)
  sessionRef.current = sessionId
  const goToEnd = useCallback(() => {
    jumpRef.current = true
    followRef.current = true
    setAtBottom(true)
    anchorRef.current = { follow: true }
    restoreRef.current = null
    pendingRevealRef.current = null
    requestAnimationFrame(() => {
      const last = streamRef.current.length - 1
      if (last >= 0) virtRef.current?.scrollToIndex(last, { align: 'end' })
    })
  }, [])
  const afterOwnMessage = useCallback(async (accepted: Promise<boolean>): Promise<boolean> => {
    const origin = sessionRef.current
    const navigation = navigationRef.current
    const ok = await accepted
    if (ok && sessionRef.current === origin && navigationRef.current === navigation) goToEnd()
    return ok
  }, [goToEnd])
  const send = useCallback(
    (text: string, attachments?: AttachmentRef[], options?: SendOptions) => afterOwnMessage(onSend(text, attachments, options)),
    [afterOwnMessage, onSend],
  )
  const steer = useMemo(
    () => onSteer && ((text: string) => afterOwnMessage(onSteer(text))),
    [afterOwnMessage, onSteer],
  )

  const composer = (
    <Composer
      placement={presentation === 'empty' ? 'centered' : 'bottom'}
      onSend={send}
      onUiCommand={onUiCommand}
      onPrepareAttachments={onPrepareAttachments}
      onCancelAttachmentPreparation={onCancelAttachmentPreparation}
      sessionId={sessionId}
      draftKey={sessionId ? undefined : composerDraftKey}
      primary={composerPrimary}
      acceptsGlobalFocus={composerAcceptsGlobalFocus}
      isStreaming={isStreaming}
      onStop={onStop}
      onSteer={steer}
      onQueue={onQueue}
      models={models}
      providers={providers}
      activeAlias={activeAlias}
      activeModel={activeModel}
      onUseModel={onUseModel}
      onDiscoverModels={onDiscoverModels}
      onRefreshModels={onRefreshModels}
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
    <ChatFileDropZone draftKey={sessionId || composerDraftKey || 'draft'} enabled={presentation === 'empty' || presentation === 'conversation'}>
    <HomeWelcome key={sessionId} sessionId={sessionId} context={homeContext} engineReady={engineReady} conversationActive={presentation !== 'empty'} variant={homeVariant} transcript={presentation === 'conversation' ? (
        <div key={sessionId + ':ready'} className="conversation-enter flex min-h-full flex-col">
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto" onScroll={handleScroll} onWheel={userScrolls} onTouchStart={userScrolls} onPointerDown={userScrolls} onKeyDown={userScrolls}>
            {historyNote?.hasMore && (
              <p className="mx-auto max-w-3xl px-4 pt-4 text-center text-[11px] text-[var(--text-subtle)]">
                {t('history.hasMore', { n: historyNote.total })}
              </p>
            )}
            <div ref={contentRef}>
            <ActivityLayoutContext.Provider value={activityLayout}>
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
                      planActions={pendingPlan && row.timeline.turnId === latestTurn.turnId && onImplementPlan ? <div className="flex items-center gap-2 border-t border-[var(--border)] pt-3 text-sm"><span className="flex-1">{t('plan.implementQuestion')}</span><button type="button" disabled={planStarting} onClick={() => setDismissedPlans(current => new Set(current).add(latestTurn.turnId))} className="rounded-lg px-3 py-2 hover:bg-[var(--bg-hover)]">{t('plan.notNow')}</button><button type="button" disabled={planStarting} className="rounded-lg bg-[var(--accent)] px-3 py-2 text-white disabled:opacity-50" onClick={async () => { if (planStartingRef.current) return; planStartingRef.current = true; setPlanStarting(true); try { await onImplementPlan() } finally { planStartingRef.current = false; setPlanStarting(false) } }}>{planStarting ? t('plan.starting') : t('plan.implement')}</button></div> : undefined}
                    />
                  ) : <MessageBubble message={row.message} />}
                  </FileTurnContext.Provider>
                </div>
              )}
            </Virtualizer>
            </ActivityLayoutContext.Provider>
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
    ) : presentation === 'loading' ? (
        <div key={sessionId + ':loading'} aria-busy="true" data-testid="chat-loading" className="flex min-h-full flex-col">
          {[72, 100, 86, 94].map((width, group) => (
            <div key={group} className="mx-auto w-full max-w-3xl space-y-2 px-4 pt-6">
              <div className="h-3 rounded bg-[var(--bg-active)] motion-safe:animate-pulse" style={{ width: width + '%' }} />
              <div className="h-3 rounded bg-[var(--bg-active)] motion-safe:animate-pulse" style={{ width: Math.max(40, width - 25) + '%' }} />
            </div>
          ))}
        </div>
    ) : presentation === 'error' ? (
        <div role="alert" data-testid="chat-history-error" className="m-auto flex max-w-md flex-col items-center gap-3 px-6 text-center">
          <p className="text-sm text-[var(--text-muted)]">{t('history.loadFailed')}</p>
          <button type="button" onClick={onRetryHistory} className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm text-white">
            {t('history.retry')}
          </button>
        </div>
    ) : undefined}>
      {!processesInPanel && (presentation === 'empty' || presentation === 'conversation') && sessionId !== '' && (
        <ProcessesDock key={`processes:${sessionId}`} sessionId={sessionId} openSignal={processesOpenSignal} />
      )}
      {(presentation === 'empty' || presentation === 'conversation') && (
        <>
          <Questions key={`questions:${sessionId}`} sessionId={sessionId} />
          {queue}
          {composer}
        </>
      )}
    </HomeWelcome>
    </ChatFileDropZone>
  )
}

/** Memoizado: cada instancia solo repinta cuando cambian sus props (su sesión). */
export default memo(ChatView)
