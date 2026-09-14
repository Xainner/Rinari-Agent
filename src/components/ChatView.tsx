import { useEffect, useMemo, useRef, useState } from 'react'
import { Virtualizer, type VirtualizerHandle } from 'virtua'
import type { AttachmentRef, ChatMessage } from '../types'
import type { ModelSummary, ProviderSummary } from '../services/engine'
import type { TurnTimeline } from '../features/activity/types'
import { buildChatStream } from '../features/activity/buildChatStream'
import TurnTimelineView from '../features/activity/TurnTimelineView'
import { useI18n } from '../i18n'
import { useUIStore } from '../stores/ui'
import Composer from './composer/Composer'
import HomeWelcome from '../features/home/HomeWelcome'
import type { HomeContext } from '../features/home/suggestions'
import Questions from '../features/questions/Questions'
import ProcessesDock from '../features/processes/ProcessesDock'
import { FileTurnContext } from '../features/files/FileWorkspace'
import MessageBubble from './MessageBubble'
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
}

export default function ChatView({
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
}: ChatViewProps) {
  const { t } = useI18n()
  const autoFollow = useUIStore((s) => s.autoFollow)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const followRef = useRef(true)
  const virtRef = useRef<VirtualizerHandle>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [now, setNow] = useState(Date.now())
  const [planStarting, setPlanStarting] = useState(false)
  const planStartingRef = useRef(false)
  const [dismissedPlans, setDismissedPlans] = useState<Set<string>>(() => new Set())
  const latestTurn = Object.values(timelines).filter(turn => turn.sessionId === sessionId).sort((a, b) => b.startedAt - a.startedAt)[0]
  const pendingPlan = sessionMode === 'plan' && latestTurn?.mode === 'plan' && latestTurn.status === 'completed' && latestTurn.items.some(item => item.type === 'model' && item.outputKind === 'final' && item.content) && !dismissedPlans.has(latestTurn.turnId) && !isStreaming
  const stream = useMemo(
    () => buildChatStream(messages, timelines, sessionId),
    [messages, timelines, sessionId],
  )
  const empty = stream.length === 0
  const activeTimeline = Object.values(timelines).some((turn) => turn.sessionId === sessionId && ['running', 'approval', 'cancelling'].includes(turn.status))

  useEffect(() => {
    if (!activeTimeline) return
    const timer = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(timer)
  }, [activeTimeline])

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
    followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  useEffect(() => {
    followRef.current = true
    setAtBottom(true)
  }, [sessionId])

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

  useEffect(() => {
    // Autoscroll inteligente: solo sigue si el usuario ya estaba abajo
    // y la preferencia está activa.
    if (autoFollow && atBottom && stream.length > 0) {
      virtRef.current?.scrollToIndex(stream.length - 1, { align: 'end' })
    }
  }, [stream, isStreaming, atBottom, autoFollow])

  const composer = (
    <Composer
      placement={empty ? 'centered' : 'bottom'}
      onSend={onSend}
      onPrepareAttachments={onPrepareAttachments}
      onCancelAttachmentPreparation={onCancelAttachmentPreparation}
      sessionId={sessionId}
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
    />
  )

  return (
    <HomeWelcome key={sessionId} sessionId={sessionId} context={homeContext} engineReady={engineReady} conversationActive={!empty} transcript={!empty ? (
        <>
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
        </>
    ) : undefined}>
      {sessionId !== '' && <ProcessesDock sessionId={sessionId} openSignal={processesOpenSignal} />}
      <Questions key={sessionId} sessionId={sessionId} />
      {composer}
    </HomeWelcome>
  )
}
