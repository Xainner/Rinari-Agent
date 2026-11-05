import { useCallback, useEffect, useRef } from 'react'
import { useStore } from 'zustand'
import { toast } from 'sonner'
import { commandMessage, engineApi, isCommandError, onEngineEvent, type EngineEventMsg } from '../../services/engine'
import { TRIGGERS_SESSION_REFRESH, engineEventAction, type TimelineAction } from '../activity/turnTimelineReducer'
import { useComposerStore } from '../../stores/composer'
import { translate } from '../../i18n'
import { useUIStore } from '../../stores/ui'
import { createRuntimeStore, type RuntimeStore } from './runtimeStore'
import { useActivityDisclosure } from '../../stores/activityDisclosure'
import { applyChecklistEvent } from '../checklist/checklistStore'
import { applyGoalEvent } from '../goal/goalStore'
import { syncReasoningFromTurn } from '../../stores/sessionUi'
import { applyResumeEvent } from '../resume/resumeStore'
import { applyExternalBrowserEvent } from '../browser/externalBrowserStore'
import { applyTrustChangedEvent } from '../projects/trustWarning'
import { markRenamedFromEvent } from '../../stores/titleMotion'
import { onProfileEvent } from '../profiles/profileStore'
import { applyFollowupEvent } from '../followups/followupStore'
import { applyChildEvent } from '../children/childrenStore'
import type { AttachmentRef } from '../../types'

/**
 * Events that arrive many times a second while a turn streams. They are
 * applied in one batch per frame: one store update and one render for
 * everything that arrived since the last frame. Any other event (a turn that
 * ends, an approval, a question…) first applies what is queued and then
 * itself, so the order never changes.
 */
const BATCHED_EVENTS = new Set(['model.content.delta', 'model.tool_input', 'tool.output.delta', 'usage.updated', 'agent.activity'])
/** A hidden window gets no frames: the batch is applied after this at most. */
const BATCH_MAX_WAIT_MS = 100

/** Trailing debounce for the secondary session-list fetch (§4.4). */
export const SESSION_REFRESH_DEBOUNCE_MS = 150
/** Upper bound: with several panes streaming a refresh still lands within this window. */
export const SESSION_REFRESH_MAX_WAIT_MS = 1000

/**
 * Engine-owned timeline state: live events, historical replay and snapshot
 * reconciliation. One listener, one store, one reducer. Consumers subscribe
 * to their own session through `sessionSelectors`; the legacy fields returned
 * here keep `EngineConsole`/tests working and re-render only their owner.
 */
export function useTurnRuntime(options: { onSessionsChanged: () => void }) {
  const storeRef = useRef<RuntimeStore | null>(null)
  if (storeRef.current === null) storeRef.current = createRuntimeStore()
  const store = storeRef.current

  const changedRef = useRef(options.onSessionsChanged)
  useEffect(() => {
    changedRef.current = options.onSessionsChanged
  })

  // Deltas de contenido, aprobaciones y preguntas entran de inmediato al
  // reducer; solo el fetch secundario de la lista de sesiones se agrupa.
  const refreshTimer = useRef<number | null>(null)
  const refreshDeadline = useRef<number | null>(null)
  const scheduleSessionsChanged = useCallback(() => {
    const now = Date.now()
    if (refreshDeadline.current === null) refreshDeadline.current = now + SESSION_REFRESH_MAX_WAIT_MS
    const delay = Math.max(0, Math.min(SESSION_REFRESH_DEBOUNCE_MS, refreshDeadline.current - now))
    if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current)
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null
      refreshDeadline.current = null
      changedRef.current()
    }, delay)
  }, [])

  const queued = useRef<TimelineAction[]>([])
  const flushHandles = useRef<{ frame: number; timer: number } | null>(null)
  const flush = useCallback(() => {
    if (flushHandles.current) {
      cancelAnimationFrame(flushHandles.current.frame)
      window.clearTimeout(flushHandles.current.timer)
      flushHandles.current = null
    }
    if (!queued.current.length) return
    const actions = queued.current
    queued.current = []
    store.getState().dispatchMany(actions)
  }, [store])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let disposed = false
    void onEngineEvent((event: EngineEventMsg) => {
      const action = engineEventAction(event)
      if (action && BATCHED_EVENTS.has(event.event)) {
        queued.current.push(action)
        if (!flushHandles.current) flushHandles.current = { frame: requestAnimationFrame(flush), timer: window.setTimeout(flush, BATCH_MAX_WAIT_MS) }
      } else if (action) {
        queued.current.push(action)
        flush()
      }
      if (event.event === 'steer.returned') returnUnread(event.payload)
      onProfileEvent(event.event)
      if (event.event === 'checklist.updated') applyChecklistEvent(event.payload)
      if (event.event === 'goal.updated') applyGoalEvent(event.payload)
      if (event.event === 'turn.started') syncReasoningFromTurn(event.payload)
      // El aviso de «Rinari retomó…» lo da el notificador, con las reglas de los demás (#24).
      if (event.event === 'session.resume.updated') applyResumeEvent(event.payload)
      if (event.event === 'browser.external.changed') applyExternalBrowserEvent(event.payload)
      if (event.event === 'project.trust.changed') applyTrustChangedEvent(event.payload)
      applyFollowupEvent(event.event, event.payload)
      applyChildEvent(event.event, event.payload)
      if (event.event === 'session.renamed') markRenamedFromEvent(event.payload)
      if (TRIGGERS_SESSION_REFRESH.has(event.event)) scheduleSessionsChanged()
    }).then((stop) => {
      if (disposed) stop()
      else unlisten = stop
    })
    return () => {
      disposed = true
      unlisten?.()
      flush()
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current)
      refreshTimer.current = null
      refreshDeadline.current = null
    }
  }, [store, scheduleSessionsChanged, flush])

  // Own actions go after the events already received.
  const dispatch = useCallback((action: TimelineAction) => {
    flush()
    store.getState().dispatch(action)
  }, [store, flush])

  const restoreSnapshot = useCallback(async (): Promise<void> => {
    try {
      const result = await engineApi.snapshot()
      flush()
      store.getState().dispatch({ type: 'snapshot/restored', snapshot: result.snapshot, now: Date.now() })
    } catch {
      // Recovery metadata is best-effort; authoritative live events continue.
    }
  }, [store])

  /** Nuevo proceso de Engine: la proyección anterior ya no describe nada vivo. */
  const resetForNewEngine = useCallback(() => {
    useActivityDisclosure.getState().reset()
    // What the old process sent and is still queued describes nothing alive.
    queued.current = []
    store.getState().reset()
  }, [store])

  const cancelTurn = useCallback(async (sessionId: string): Promise<void> => {
    if (!sessionId) return
    dispatch({ type: 'turn/cancelling', sessionId })
    window.setTimeout(() => void restoreSnapshot(), 2000)
    window.setTimeout(() => {
      if (store.getState().busySessions.has(sessionId)) {
        toast.warning(translate(useUIStore.getState().lang, 'engine.cancelUnconfirmed'))
        void restoreSnapshot()
      }
    }, 5000)
    try {
      await engineApi.cancelTurn(sessionId)
    } catch (error) {
      if (isCommandError(error) && error.code === 'NO_ACTIVE_TURN') {
        try {
          const result = await engineApi.sessionTimeline(sessionId)
          dispatch({ type: 'timeline/loaded', sessionId, turns: result.turns })
          await restoreSnapshot()
          return
        } catch (recoveryError) {
          toast.error(commandMessage(recoveryError))
          return
        }
      }
      toast.error(commandMessage(error))
      void restoreSnapshot()
    }
  }, [restoreSnapshot, store, dispatch])

  /**
   * Mensaje para el turno en curso. El Engine lo lee tras el paso actual;
   * si el turno ya terminó, lo trata como mensaje normal.
   */
  const steerTurn = useCallback(async (sessionId: string, message: string, attachments: AttachmentRef[] = [], now = false): Promise<boolean> => {
    try {
      const result = now
        ? await engineApi.turnSteerNow(sessionId, message, attachments)
        : await engineApi.turnSteer(sessionId, message, attachments)
      if (result.delivery === 'steer') {
        dispatch({
          type: 'steer/sent',
          sessionId,
          turnId: result.turn_id,
          steerId: result.steer_id,
          content: message,
          now: Date.now(),
          ...(now ? { interrupted: true } : {}),
        })
      }
      return true
    } catch (error) {
      toast.error(commandMessage(error))
      return false
    }
  }, [dispatch])

  /** Tab mientras trabaja: espera a que termine el turno (cola del Engine). */
  const queueMessage = useCallback(async (sessionId: string, message: string): Promise<boolean> => {
    try {
      await engineApi.queueAdd(sessionId, message)
      toast(translate(useUIStore.getState().lang, 'steer.queued'))
      return true
    } catch (error) {
      toast.error(commandMessage(error))
      return false
    }
  }, [])

  const resolveApproval = useCallback(async (approvalId: string, decision: string): Promise<void> => {
    dispatch({ type: 'approval/resolving', approvalId })
    try {
      const result = await engineApi.resolveApproval(approvalId, decision)
      if (result.status !== 'resolved') void restoreSnapshot()
    } catch (error) {
      toast.error(commandMessage(error))
      dispatch({ type: 'approval/pending', approvalId })
    }
  }, [restoreSnapshot, store, dispatch])

  // Legacy projection for consumers that still read the whole state (tests,
  // EngineConsole). New code subscribes per session via sessionSelectors.
  const busySessions = useStore(store, (state) => state.busySessions)
  const approvals = useStore(store, (state) => state.approvals)

  return {
    store,
    busySessions,
    approvals,
    dispatch,
    restoreSnapshot,
    resetForNewEngine,
    cancelTurn,
    resolveApproval,
    steerTurn,
    queueMessage,
  }
}

/**
 * Lo que un turno detenido o fallido no llegó a leer vuelve al borrador de su
 * sesión, delante de lo que haya escrito, para que no se pierda ni arranque
 * trabajo que acabas de detener.
 */
function returnUnread(payload: Record<string, unknown>): void {
  const sessionId = typeof payload.session_id === 'string' ? payload.session_id : ''
  const messages = Array.isArray(payload.messages) ? payload.messages.filter((item): item is string => typeof item === 'string') : []
  if (!sessionId || messages.length === 0) return
  const composer = useComposerStore.getState()
  const current = composer.getDraft(sessionId).text
  composer.setTextFor(sessionId, [...messages, current].filter((part) => part.trim()).join('\n\n'))
  toast(translate(useUIStore.getState().lang, 'steer.returned'))
}

export type TurnRuntime = ReturnType<typeof useTurnRuntime>
