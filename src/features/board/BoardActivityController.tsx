import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useEngineData, useOptionalEngineCommands, useRuntimeStore } from '../engine/EngineContext'
import { onNotificationActivated, onNotificationReplied } from '../../services/notifications'
import { requestTurnReveal } from './boardCommands'
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
import { isDraftPane, useBoardStore } from '../../stores/board'
import { unreadResultCount, useBoardAttentionStore, type TerminalSource } from '../../stores/boardAttention'
import { useBoardStatusStore } from '../../stores/boardStatus'
import { getPendingQuestions, subscribePendingQuestions } from '../questions/usePendingQuestions'
import { useAttentionIndicators } from '../notifications/attentionIndicators'
import { useUIStore } from '../../stores/ui'
import { getWindowAttention } from '../../hooks/useWindowAttention'
import { hasResultBlock } from '../activity/resultBlock'
import { lookupSession } from '../notifications/sessionDirectory'
import { switchToProfileOf } from '../profiles/useProfileWorkspace'
import { useWindowTitle } from '../../hooks/useWindowTitle'
import { projectDisplayName } from '../projects/workspaceModel'
import { useI18n } from '../../i18n'
import { useBoardNotifications, type ConversationTarget } from './useBoardNotifications'
import { useCallback } from 'react'

const ACTIVE = new Set(['running', 'approval', 'cancelling'])

/** Sesiones con un turno vivo, como clave estable (preguntas que vigilar). */
function activeSessionKey(timelines: Record<string, TurnTimeline>): string {
  const ids = new Set<string>()
  for (const turn of Object.values(timelines)) if (ACTIVE.has(turn.status)) ids.add(turn.sessionId)
  return [...ids].sort().join('|')
}

interface SessionWatch {
  /** Último estado conocido por turno para detectar transiciones. */
  statuses: Map<string, string>
  /** Terminales vistos en vivo antes de inicializar (no se degradan a baseline). */
  liveBeforeInit: Set<string>
}

/**
 * Controlador sin UI, montado **una vez** bajo el contexto del Engine. Sigue a
 * las sesiones del board y a las de Normal que tiene el runtime mientras el
 * shell viva (Normal, Boards o Ajustes) y traduce el runtime a recibos de
 * lectura (el número de la barra de tareas los usa):
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
  const phases = useRef(data.historyPhases)
  phases.current = data.historyPhases
  const panes = useBoardStore((state) => state.panes)
  // Los borradores no tienen sesión ni actividad que observar.
  const members = useMemo(() => panes.filter((pane) => !isDraftPane(pane)), [panes])
  const memberIds = members.map((pane) => pane.sessionId).join('|')

  // Reinicio del Engine: las transiciones anteriores ya no son comparables.
  useEffect(() => {
    watches.current.clear()
  }, [data.engineGeneration])

  useEffect(() => {
    const members = memberIds ? memberIds.split('|') : []
    // También los chats de Normal: un resultado que llega mientras miras otro
    // chat queda pendiente igual que en un panel. Sin historial cargado no se
    // inicializa (no hay baseline), así que el pasado nunca cuenta como nuevo.
    const syncWatches = () => {
      const ids = new Set(members)
      for (const turn of Object.values(store.getState().timelines)) ids.add(turn.sessionId)
      for (const id of [...watches.current.keys()]) if (!ids.has(id)) watches.current.delete(id)
      for (const id of ids) if (!watches.current.has(id)) watches.current.set(id, { statuses: new Map(), liveBeforeInit: new Set() })
    }

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
        if (!wasActive || phases.current?.[turn.sessionId] === 'loading') return
        // Una conversación cuyo historial no se carga (una hija, una tarea
        // programada) también se sigue: lo que se vio empezar y terminar en
        // vivo es nuevo; lo demás que ya conocemos, baseline (#103).
        const known = Object.values(store.getState().timelines).flatMap((other) => {
          const done = other.sessionId === turn.sessionId && other.turnId !== turn.turnId ? terminalOutcomeOf(other) : null
          return done ? [{ turnId: other.turnId, outcome: done as TerminalOutcome, completedAt: other.completedAt }] : []
        })
        watch.liveBeforeInit.delete(turn.turnId)
        attention.initializeSessionAttention(turn.sessionId, known, { liveTerminalTurnIds: [...watch.liveBeforeInit] })
        watch.liveBeforeInit.clear()
      }
      const source: TerminalSource = wasActive ? 'live' : previousStatus === undefined ? 'history' : 'snapshot'
      attention.observeTerminal(turn.sessionId, turn.turnId, outcome, source, turn.completedAt, {
        quiet: !hasResultBlock(turn),
        away: !getWindowAttention().attended,
      })
    }

    const scan = () => {
      syncWatches()
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

  // -- recibos huérfanos (#84): una conversación borrada o archivada no deja
  // un «sin leer» que nadie puede limpiar. Lo que la lista no trae se
  // pregunta una vez; si el Engine no contesta, no se borra nada.
  useEffect(() => {
    if (!data.ready || !data.sessionsLoaded || data.sessionsError) return
    let cancelled = false
    const forget = (id: string) => { if (!cancelled) useBoardAttentionStore.getState().forgetSession(id) }
    for (const id of Object.keys(useBoardAttentionStore.getState().sessions)) {
      const row = data.sessionsById[id]
      if (row) {
        if (row.state === 'archived') forget(id)
        continue
      }
      void lookupSession(id).then((entry) => { if (entry && (!entry.exists || entry.archived)) forget(id) })
    }
    return () => { cancelled = true }
  }, [data.ready, data.sessionsLoaded, data.sessionsError, data.sessionsById])

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

  // -- avisos y título de ventana -------------------------------------------------
  const { t } = useI18n()
  // Avisos de todas las conversaciones (#33): nombre de cualquiera, preguntas
  // de las que tienen un turno vivo, y «Ir» abre la conversación en el turno.
  const titleFor = useCallback((sessionId: string): string | null => {
    const record = data.sessionsById[sessionId]
    if (!record) return null
    return record.title || (record.project_root ? projectDisplayName(record.project_root) : null) || t('sidebar.newChat')
  }, [data.sessionsById, t])
  const projectFor = useCallback((sessionId: string): string | null => {
    const root = data.sessionsById[sessionId]?.project_root
    return root ? projectDisplayName(root) : null
  }, [data.sessionsById])
  const activeKey = useSyncExternalStore(store.subscribe, () => activeSessionKey(store.getState().timelines))
  const watchedSessionIds = useMemo(
    () => [...new Set([...members.map((pane) => pane.sessionId), ...(data.activeSession ? [data.activeSession] : []), ...(activeKey ? activeKey.split('|') : [])])],
    [members, data.activeSession, activeKey],
  )
  const commands = useOptionalEngineCommands()
  const openConversation = useCallback((target: ConversationTarget) => {
    if (!commands) return
    // Un aviso de otro perfil cambia antes a ese perfil (#34).
    const profile = data.sessionsById[target.sessionId]?.rinari_profile_id
    void switchToProfileOf(profile).then(() => commands.selectSession(target.sessionId)).then(() => {
      useUIStore.getState().goChat()
      if (target.turnId) requestTurnReveal({ sessionId: target.sessionId, turnId: target.turnId })
    })
  }, [commands, data.sessionsById])
  useBoardNotifications({
    runtime: store,
    labelFor: titleFor,
    projectFor,
    activeSessionId: data.activeSession,
    // Electron no pide un permiso aparte: decide el soporte del sistema.
    systemPermission: 'granted',
    memberKey: watchedSessionIds.join('|'),
    watchedSessionIds,
    openConversation,
  })
  // Clic (o «Abrir» / «Revisar plan») en la notificación del sistema de un
  // turno: abre la conversación ahí. Las de tareas programadas no llevan
  // turno; las abre ScheduleNotifier. «Responder» manda el texto a esa
  // conversación sin abrir la ventana: un mensaje nuevo, o uno durante el
  // turno si Rinari está trabajando (#64, #54).
  const openRef = useRef(openConversation)
  openRef.current = openConversation
  const commandsRef = useRef(commands)
  commandsRef.current = commands
  useEffect(() => {
    const stops: Array<() => void> = []
    let disposed = false
    const keep = (unsubscribe: () => void) => { if (disposed) unsubscribe(); else stops.push(unsubscribe) }
    void onNotificationActivated((target) => {
      if (target.sessionId && target.turnId) openRef.current({ sessionId: target.sessionId, turnId: target.turnId })
    }).then(keep).catch(() => undefined)
    void onNotificationReplied(({ target, text }) => {
      const engine = commandsRef.current
      if (!engine || !target.sessionId || !text.trim()) return
      const sessionId = target.sessionId
      const delivered = engine.isBusy(sessionId) ? engine.steerTo(sessionId, text) : engine.sendTo(sessionId, text)
      void delivered.catch(() => false)
    }).then(keep).catch(() => undefined)
    return () => { disposed = true; for (const stop of stops.splice(0)) stop() }
  }, [])
  // Una sola cuenta para el título, la barra de tareas y la bandeja.
  const { lang } = useI18n()
  const liveSessionIds = useMemo(
    () => [...new Set([...members.map((pane) => pane.sessionId), ...(data.activeSession ? [data.activeSession] : [])])],
    [members, data.activeSession],
  )
  const profileFor = useCallback((sessionId: string): string | null => {
    const record = data.sessionsById[sessionId]
    return record ? record.rinari_profile_id ?? 'default' : null
  }, [data.sessionsById])
  const summary = useAttentionIndicators(store, { ready: data.ready, lang, liveSessionIds, titleFor, profileFor })
  useWindowTitle(summary.count)

  return null
}
