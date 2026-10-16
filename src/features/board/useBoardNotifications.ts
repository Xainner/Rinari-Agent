import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useI18n, type I18nKey } from '../../i18n'
import { getWindowAttention } from '../../hooks/useWindowAttention'
import { NOTIFICATION_GROUP_WINDOW_MS, decideChannels } from '../../services/notificationPolicy'
import { notificationSupport, sendSystemNotification } from '../../services/notifications'
import { notificationText, type NotifyOutcome } from '../../services/notificationText'
import type { SystemPermission } from '../../services/notificationPolicy'
import { useBoardStore } from '../../stores/board'
import { useBoardAttentionStore, type TerminalOutcome } from '../../stores/boardAttention'
import { notificationPrefs } from '../../stores/notificationPrefs'
import { useUIStore } from '../../stores/ui'
import type { RuntimeStore } from '../engine/runtimeStore'
import type { TurnTimeline } from '../activity/types'
import { getPendingQuestions, subscribePendingQuestions } from '../questions/usePendingQuestions'
import { parsePlan } from '../plan/planModel'
import { revealBoardAttention } from './boardCommands'

interface PendingTerminal {
  sessionId: string
  turnId: string
  outcome: TerminalOutcome
}

export interface ConversationTarget {
  sessionId: string
  turnId?: string
}

export interface UseBoardNotificationsOptions {
  runtime: RuntimeStore
  /** Nombre de cualquier conversación (no solo las del board). */
  labelFor: (sessionId: string) => string | null
  /** Proyecto de la conversación, para el título de la notificación del sistema. */
  projectFor?: (sessionId: string) => string | null
  /** Sesión abierta en Normal; en Boards cuenta el panel enfocado y expandido. */
  activeSessionId: string
  systemPermission: SystemPermission
  /** Cambia cuando cambian las sesiones vigiladas: re-suscribe preguntas. */
  memberKey: string
  /** Sesiones cuyas preguntas se vigilan (las vivas); por defecto, las del board. */
  watchedSessionIds?: string[]
  /** Abre una conversación que no está en el board, en el turno pedido. */
  openConversation?: (target: ConversationTarget) => void
}

const OUTCOME: Record<TerminalOutcome, NotifyOutcome> = { completed: 'done', failed: 'failed', stopped: 'stopped', cancelled: 'stopped' }

function finalText(turn: TurnTimeline | undefined): string | null {
  if (!turn) return null
  const final = [...turn.items].reverse().find((item) => item.type === 'model' && item.content && (item.outputKind === 'final' || !item.outputKind))
  return final && final.type === 'model' ? final.content ?? null : null
}

/**
 * Avisos de fin de turno y de «te necesita» para **todas** las conversaciones
 * (#33), no solo los paneles de Boards: un toast si estás en otra parte de la
 * app, una notificación del sistema si la ventana no está al frente (#64, con
 * el contenido si está permitido), y la campana los lista en vivo.
 *
 * Detección por **ids**, dedupe at-most-once (clave reclamada en el recibo
 * antes de avisar), agrupación de ráfagas (500 ms) y supresión cuando el
 * dueño ya atiende esa sesión. Historial, remount y reconexión no producen
 * avisos: lo que ya estaba sin leer al montar se reclama en silencio. Un
 * fallo al avisar jamás revierte el resultado.
 */
export function useBoardNotifications(options: UseBoardNotificationsOptions): void {
  const { runtime, memberKey } = options
  const { t, lang } = useI18n()
  const latest = useRef(options)
  latest.current = options
  const batch = useRef<PendingTerminal[]>([])
  const timer = useRef<number | null>(null)
  const seenRequests = useRef(new Set<string>())
  const primed = useRef(false)

  useEffect(() => {
    const boardMember = (sessionId: string) => useBoardStore.getState().panes.some((pane) => pane.sessionId === sessionId)
    const targetVisible = (sessionId: string): boolean => {
      const ui = useUIStore.getState()
      const board = useBoardStore.getState()
      if (ui.view === 'chat') return latest.current.activeSessionId === sessionId
      if (ui.view !== 'board') return false
      const pane = board.panes.find((item) => item.paneId === board.focusedPaneId)
      return Boolean(pane && pane.sessionId === sessionId && !pane.collapsed)
    }
    const goBoard = () => useUIStore.getState().goBoard()
    // En Boards (o si no hay cómo abrirla en Normal) se abre su panel; si no, la conversación.
    const opensPane = (sessionId: string) => boardMember(sessionId) && (useUIStore.getState().view === 'board' || !latest.current.openConversation)
    const reveal = (sessionId: string, turnId?: string) => {
      if (opensPane(sessionId)) {
        if (revealBoardAttention({ sessionId, turnId }, { goBoard })) return
      }
      if (latest.current.openConversation) latest.current.openConversation({ sessionId, turnId })
      else toast.info(t('board.toast.paneGone'))
    }
    const label = (sessionId: string) => latest.current.labelFor(sessionId) ?? t(boardMember(sessionId) ? 'board.peers.unknown' : 'notify.unknown')

    const notify = (kind: 'terminal' | 'intervention', sessionId: string, outcome: NotifyOutcome, detail: string | null, turnId?: string) => {
      const prefs = notificationPrefs()
      const decision = decideChannels({
        kind,
        prefs,
        windowAttended: getWindowAttention().attended,
        targetVisible: targetVisible(sessionId),
        support: notificationSupport,
        permission: latest.current.systemPermission,
      })
      const name = label(sessionId)
      if (decision.system) {
        const text = notificationText({ outcome, conversation: name, project: latest.current.projectFor?.(sessionId) ?? null, detail }, lang, prefs.showContent)
        void sendSystemNotification({ ...text, target: { sessionId, turnId } }).catch(() => undefined)
      }
      if (decision.toast) {
        const plan = outcome === 'plan'
        const inBoard = boardMember(sessionId)
        const key: I18nKey = inBoard && !plan
          ? (outcome === 'failed' ? 'board.toast.failed' : outcome === 'stopped' ? 'board.toast.stopped' : outcome === 'needsYou' ? 'board.toast.needsYou' : 'board.toast.done')
          : (`notify.private.${outcome}` as I18nKey)
        toast(t(key, { label: name, name }), {
          id: `notify-${kind}-${turnId ?? sessionId}`,
          action: {
            label: plan ? t('notify.reviewPlan') : opensPane(sessionId) ? t('board.toast.goToPane') : t('notify.go'),
            onClick: () => reveal(sessionId, turnId),
          },
        })
      }
    }

    const flush = () => {
      timer.current = null
      const items = batch.current
      batch.current = []
      if (items.length === 0) return
      if (items.length === 1) {
        const [item] = items
        const turn = runtime.getState().timelines[item.turnId]
        const text = finalText(turn)
        const plan = item.outcome === 'completed' && turn?.mode === 'plan' && notificationPrefs().planReady
        const outcome: NotifyOutcome = plan ? 'plan' : OUTCOME[item.outcome]
        const detail = plan
          ? (text ? parsePlan(text).title || null : null)
          : item.outcome === 'completed' ? text : turn?.error ?? null
        notify('terminal', item.sessionId, outcome, detail, item.turnId)
        return
      }
      const sessions = new Set(items.map((item) => item.sessionId))
      const prefs = notificationPrefs()
      const allInBoard = [...sessions].every(boardMember)
      const decision = decideChannels({
        kind: 'terminal',
        prefs,
        windowAttended: getWindowAttention().attended,
        targetVisible: false,
        support: notificationSupport,
        permission: latest.current.systemPermission,
      })
      if (decision.system) {
        void sendSystemNotification({ title: t('notify.groupedTitle'), body: t('notify.grouped', { n: sessions.size }) }).catch(() => undefined)
      }
      if (!decision.toast) return
      toast(allInBoard ? t('board.toast.grouped', { n: sessions.size }) : t('notify.grouped', { n: sessions.size }), {
        id: `notify-grouped-${Date.now()}`,
        action: allInBoard
          ? { label: t('board.toast.viewPending'), onClick: goBoard }
          : { label: t('notify.go'), onClick: () => reveal(items[0].sessionId, items[0].turnId) },
      })
    }

    // Turnos que avisan por su cuenta: las tareas programadas (ScheduleNotifier)
    // y las iteraciones de un objetivo que terminan bien (el dock del objetivo).
    const quietTurn = (turnId: string, outcome: TerminalOutcome) => {
      const origin = runtime.getState().timelines[turnId]?.origin
      if (origin?.kind === 'schedule') return true
      return origin?.source === 'goal' && outcome === 'completed'
    }

    const scanReceipts = () => {
      const sessions = useBoardAttentionStore.getState().sessions
      const silent = !primed.current
      for (const [sessionId, session] of Object.entries(sessions)) {
        for (const receipt of Object.values(session.turns)) {
          if (receipt.state !== 'unread' || receipt.notificationKey) continue
          const key = `terminal:${receipt.turnId}:${receipt.outcome}`
          if (!useBoardAttentionStore.getState().claimNotification(sessionId, receipt.turnId, key)) continue
          // Lo que ya estaba sin leer al montar no es un suceso nuevo.
          if (silent || quietTurn(receipt.turnId, receipt.outcome)) continue
          batch.current.push({ sessionId, turnId: receipt.turnId, outcome: receipt.outcome })
        }
      }
      primed.current = true
      if (batch.current.length > 0 && timer.current === null) {
        timer.current = window.setTimeout(flush, NOTIFICATION_GROUP_WINDOW_MS)
      }
    }

    const watched = () => latest.current.watchedSessionIds ?? useBoardStore.getState().panes.map((pane) => pane.sessionId)

    const scanInterventions = () => {
      const approvals = runtime.getState().approvals
      for (const approval of approvals) {
        if (!approval.session_id || approval.status === 'expired') continue
        const id = `approval:${approval.approval_id}`
        if (seenRequests.current.has(id)) continue
        seenRequests.current.add(id)
        const detail = approval.target || approval.description || null
        notify('intervention', approval.session_id, 'needsYou', detail, approval.turn_id ?? undefined)
      }
      for (const sessionId of new Set(watched())) {
        for (const question of getPendingQuestions(sessionId)) {
          const id = `question:${question.request_id}`
          if (seenRequests.current.has(id)) continue
          seenRequests.current.add(id)
          const first = question.questions?.[0]?.title ?? null
          notify('intervention', sessionId, 'needsYou', first, question.turn_id || undefined)
        }
      }
    }

    scanReceipts()
    scanInterventions()
    const stops = [
      useBoardAttentionStore.subscribe(scanReceipts),
      runtime.subscribe(scanInterventions),
      useBoardStore.subscribe(() => { scanReceipts(); scanInterventions() }),
      ...[...new Set(watched())].map((sessionId) => subscribePendingQuestions(sessionId, scanInterventions)),
    ]
    return () => {
      for (const stop of stops) stop()
      if (timer.current !== null) {
        window.clearTimeout(timer.current)
        timer.current = null
      }
    }
  }, [runtime, memberKey, t, lang])
}
