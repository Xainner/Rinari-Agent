import { useEffect, useRef } from 'react'
import { useEngineData, useRuntimeStore } from '../engine/EngineContext'
import {
  derivePaneStatus,
  samePaneStatus,
  selectSessionApprovals,
  selectSessionTimelines,
  terminalOutcomeOf,
  type PaneStatus,
  type TerminalOutcome,
} from '../engine/sessionSelectors'
import type { TurnTimeline } from '../activity/types'
import { useBoardStore } from '../../stores/board'
import { unreadPeerCount, unreadResultCount, useBoardAttentionStore, type TerminalSource } from '../../stores/boardAttention'
import { useBoardStatusStore } from '../../stores/boardStatus'
import { getPendingQuestions, subscribePendingQuestions } from '../questions/usePendingQuestions'

const ACTIVE = new Set(['running', 'approval', 'cancelling'])

interface SessionWatch {
  /** Último estado conocido por turno para detectar transiciones. */
  statuses: Map<string, string>
  /** Terminales vistos en vivo antes de inicializar (no se degradan a baseline). */
  liveBeforeInit: Set<string>
}

/**
 * Controlador sin UI, montado **una vez** bajo el contexto del Engine. Sigue a
 * las sesiones miembro del board mientras el shell viva (Normal, Boards o
 * Ajustes) y traduce el runtime a recibos de lectura:
 *
 * - primera observación con historial cargado → los terminales existentes son
 *   baseline (no "resultados nuevos");
 * - un turno activo se rastrea; si termina (en vivo o tras reconectar) queda
 *   unread salvo cancelación voluntaria;
 * - la distinción live/history/snapshot sale de la transición observada, no
 *   de un enum: un turno que aparece ya terminado no es un suceso nuevo.
 *
 * No abre otro stream del Engine ni decide avisos: solo recibos.
 */
export default function BoardActivityController() {
  const data = useEngineData()
  const store = useRuntimeStore()
  const watches = useRef(new Map<string, SessionWatch>())
  const members = useBoardStore((state) => state.panes)
  const memberIds = members.map((pane) => pane.sessionId).join('|')

  // Reinicio del Engine: las transiciones anteriores ya no son comparables.
  useEffect(() => {
    watches.current.clear()
  }, [data.engineGeneration])

  useEffect(() => {
    const ids = new Set(memberIds ? memberIds.split('|') : [])
    for (const id of [...watches.current.keys()]) if (!ids.has(id)) watches.current.delete(id)
    for (const id of ids) if (!watches.current.has(id)) watches.current.set(id, { statuses: new Map(), liveBeforeInit: new Set() })

    const attention = useBoardAttentionStore.getState()

    const observe = (turn: TurnTimeline, watch: SessionWatch, previousStatus: string | undefined) => {
      const outcome = terminalOutcomeOf(turn)
      const wasActive = previousStatus !== undefined && ACTIVE.has(previousStatus)
      const session = useBoardAttentionStore.getState().sessions[turn.sessionId]
      if (!outcome) {
        if (ACTIVE.has(turn.status) && session?.initialized) attention.trackActiveTurn(turn.sessionId, turn.turnId)
        return
      }
      if (!session?.initialized) {
        // Antes del baseline: recordar los que terminaron delante de nosotros.
        if (wasActive) watch.liveBeforeInit.add(turn.turnId)
        return
      }
      const source: TerminalSource = wasActive ? 'live' : previousStatus === undefined ? 'history' : 'snapshot'
      attention.observeTerminal(turn.sessionId, turn.turnId, outcome, source, turn.completedAt)
    }

    const scan = () => {
      const timelines = store.getState().timelines
      const historyInfo = data.historyInfo
      for (const [sessionId, watch] of watches.current) {
        const turns = Object.values(timelines).filter((turn) => turn.sessionId === sessionId)
        const session = useBoardAttentionStore.getState().sessions[sessionId]
        if (!session?.initialized && historyInfo[sessionId]) {
          // Historial cargado: los terminales conocidos son baseline.
          const terminals = turns.flatMap((turn) => {
            const outcome = terminalOutcomeOf(turn)
            return outcome ? [{ turnId: turn.turnId, outcome: outcome as TerminalOutcome, completedAt: turn.completedAt }] : []
          })
          attention.initializeSessionAttention(sessionId, terminals, { liveTerminalTurnIds: [...watch.liveBeforeInit] })
          watch.liveBeforeInit.clear()
          for (const turn of turns) if (ACTIVE.has(turn.status)) attention.trackActiveTurn(sessionId, turn.turnId)
        }
        for (const turn of turns) {
          const previous = watch.statuses.get(turn.turnId)
          if (previous === turn.status) continue
          observe(turn, watch, previous)
          watch.statuses.set(turn.turnId, turn.status)
        }
      }
    }

    scan()
    return store.subscribe(scan)
  }, [store, memberIds, data.historyInfo, data.engineGeneration])

  // -- estado derivado central por panel (toolbar, barra superior, título) ----
  const memberKey = members.map((pane) => `${pane.paneId}:${pane.sessionId}`).join('|')
  useEffect(() => {
    const panes = memberKey ? memberKey.split('|').map((item) => { const [paneId, sessionId] = item.split(':'); return { paneId, sessionId } }) : []
    const sessionIds = [...new Set(panes.map((pane) => pane.sessionId))]
    const publish = () => {
      const runtime = store.getState()
      const attention = useBoardAttentionStore.getState().sessions
      const previous = useBoardStatusStore.getState().byPane
      const next: Record<string, PaneStatus> = {}
      let changed = Object.keys(previous).length !== panes.length
      for (const pane of panes) {
        const receipts = attention[pane.sessionId]
        const status = derivePaneStatus({
          sessionId: pane.sessionId,
          timelines: selectSessionTimelines(runtime, pane.sessionId),
          pendingApprovals: selectSessionApprovals(runtime, pane.sessionId).length,
          pendingQuestions: getPendingQuestions(pane.sessionId).length,
          unreadResultCount: unreadResultCount(receipts),
          unreadPeerCount: unreadPeerCount(receipts),
          availability: !data.ready ? 'disconnected' : data.sessionsById[pane.sessionId] ? 'ready' : 'loading',
        })
        const before = previous[pane.paneId] ?? null
        if (samePaneStatus(before, status)) next[pane.paneId] = before as PaneStatus
        else { next[pane.paneId] = status; changed = true }
      }
      if (changed) useBoardStatusStore.getState().publish(next)
    }
    publish()
    const unsubscribers = [
      store.subscribe(publish),
      useBoardAttentionStore.subscribe(publish),
      ...sessionIds.map((sessionId) => subscribePendingQuestions(sessionId, publish)),
    ]
    return () => {
      for (const stop of unsubscribers) stop()
    }
  }, [store, memberKey, data.ready, data.sessionsById])

  return null
}
