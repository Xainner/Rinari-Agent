import { useCallback, useEffect, useReducer, useRef } from 'react'
import { toast } from 'sonner'
import { commandMessage, engineApi, isCommandError, onEngineEvent, type EngineEventMsg } from '../../services/engine'
import {
  TRIGGERS_SESSION_REFRESH,
  createInitialTimelineState,
  engineEventAction,
  turnTimelineReducer,
} from '../activity/turnTimelineReducer'

/** Engine-owned timeline state: live events, historical replay and snapshot reconciliation. */
export function useTurnRuntime(options: { onSessionsChanged: () => void }) {
  const [state, dispatch] = useReducer(turnTimelineReducer, undefined, createInitialTimelineState)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const changedRef = useRef(options.onSessionsChanged)
  useEffect(() => {
    changedRef.current = options.onSessionsChanged
  })

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let disposed = false
    void onEngineEvent((event: EngineEventMsg) => {
      const action = engineEventAction(event)
      if (action) dispatch(action)
      if (TRIGGERS_SESSION_REFRESH.has(event.event)) changedRef.current()
    }).then((stop) => {
      if (disposed) stop()
      else unlisten = stop
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  const restoreSnapshot = useCallback(async (): Promise<void> => {
    try {
      const result = await engineApi.snapshot()
      dispatch({ type: 'snapshot/restored', snapshot: result.snapshot, now: Date.now() })
    } catch {
      // Recovery metadata is best-effort; authoritative live events continue.
    }
  }, [])

  const cancelTurn = useCallback(async (sessionId: string): Promise<void> => {
    if (!sessionId) return
    dispatch({ type: 'turn/cancelling', sessionId })
    window.setTimeout(() => void restoreSnapshot(), 2000)
    window.setTimeout(() => {
      if (stateRef.current.busySessions.has(sessionId)) {
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
  }, [restoreSnapshot])

  const resolveApproval = useCallback(async (approvalId: string, decision: string): Promise<void> => {
    dispatch({ type: 'approval/resolving', approvalId })
    try {
      const result = await engineApi.resolveApproval(approvalId, decision)
      if (result.status !== 'resolved') void restoreSnapshot()
    } catch (error) {
      toast.error(commandMessage(error))
      dispatch({ type: 'approval/pending', approvalId })
    }
  }, [restoreSnapshot])

  return {
    threads: state.threads,
    timelines: state.timelines,
    busySessions: state.busySessions,
    approvals: state.approvals,
    dispatch,
    restoreSnapshot,
    cancelTurn,
    resolveApproval,
  }
}

export type TurnRuntime = ReturnType<typeof useTurnRuntime>
