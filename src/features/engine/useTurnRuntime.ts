import { useCallback, useEffect, useRef } from 'react'
import { useStore } from 'zustand'
import { toast } from 'sonner'
import { commandMessage, engineApi, isCommandError, onEngineEvent, type EngineEventMsg } from '../../services/engine'
import { TRIGGERS_SESSION_REFRESH, engineEventAction, type TimelineAction } from '../activity/turnTimelineReducer'
import { createRuntimeStore, type RuntimeStore } from './runtimeStore'

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

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let disposed = false
    void onEngineEvent((event: EngineEventMsg) => {
      const action = engineEventAction(event)
      if (action) store.getState().dispatch(action)
      if (TRIGGERS_SESSION_REFRESH.has(event.event)) scheduleSessionsChanged()
    }).then((stop) => {
      if (disposed) stop()
      else unlisten = stop
    })
    return () => {
      disposed = true
      unlisten?.()
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current)
      refreshTimer.current = null
      refreshDeadline.current = null
    }
  }, [store, scheduleSessionsChanged])

  const dispatch = useCallback((action: TimelineAction) => {
    store.getState().dispatch(action)
  }, [store])

  const restoreSnapshot = useCallback(async (): Promise<void> => {
    try {
      const result = await engineApi.snapshot()
      store.getState().dispatch({ type: 'snapshot/restored', snapshot: result.snapshot, now: Date.now() })
    } catch {
      // Recovery metadata is best-effort; authoritative live events continue.
    }
  }, [store])

  /** Nuevo proceso de Engine: la proyección anterior ya no describe nada vivo. */
  const resetForNewEngine = useCallback(() => {
    store.getState().reset()
  }, [store])

  const cancelTurn = useCallback(async (sessionId: string): Promise<void> => {
    if (!sessionId) return
    store.getState().dispatch({ type: 'turn/cancelling', sessionId })
    window.setTimeout(() => void restoreSnapshot(), 2000)
    window.setTimeout(() => {
      if (store.getState().busySessions.has(sessionId)) {
        toast.warning('El motor aún no confirma la cancelación. Puedes reiniciarlo desde Estado del motor.')
        void restoreSnapshot()
      }
    }, 5000)
    try {
      await engineApi.cancelTurn(sessionId)
    } catch (error) {
      if (isCommandError(error) && error.code === 'NO_ACTIVE_TURN') {
        try {
          const result = await engineApi.sessionTimeline(sessionId)
          store.getState().dispatch({ type: 'timeline/loaded', sessionId, turns: result.turns })
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
  }, [restoreSnapshot, store])

  const resolveApproval = useCallback(async (approvalId: string, decision: string): Promise<void> => {
    store.getState().dispatch({ type: 'approval/resolving', approvalId })
    try {
      const result = await engineApi.resolveApproval(approvalId, decision)
      if (result.status !== 'resolved') void restoreSnapshot()
    } catch (error) {
      toast.error(commandMessage(error))
      store.getState().dispatch({ type: 'approval/pending', approvalId })
    }
  }, [restoreSnapshot, store])

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
  }
}

export type TurnRuntime = ReturnType<typeof useTurnRuntime>
