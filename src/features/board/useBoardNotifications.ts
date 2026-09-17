import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { getWindowAttention } from '../../hooks/useWindowAttention'
import { NOTIFICATION_GROUP_WINDOW_MS, decideChannels, nativeBody } from '../../services/notificationPolicy'
import { notificationSupport, sendSystemNotification, type NativeNotification } from '../../services/notifications'
import type { SystemPermission } from '../../services/notificationPolicy'
import { useBoardStore } from '../../stores/board'
import { useBoardAttentionStore, type TerminalOutcome } from '../../stores/boardAttention'
import { useUIStore } from '../../stores/ui'
import type { RuntimeStore } from '../engine/runtimeStore'
import { getPendingQuestions, subscribePendingQuestions } from '../questions/usePendingQuestions'
import { revealBoardAttention } from './boardCommands'

interface PendingTerminal {
  sessionId: string
  turnId: string
  outcome: TerminalOutcome
}

export interface UseBoardNotificationsOptions {
  runtime: RuntimeStore
  labelFor: (sessionId: string) => string | null
  /** Sesión abierta en Normal; en Boards cuenta el panel enfocado y expandido. */
  activeSessionId: string
  systemPermission: SystemPermission
  /** Cambia cuando cambian los miembros del board: re-suscribe preguntas. */
  memberKey: string
}

/**
 * Detección de sucesos live por **ids**, dedupe at-most-once (clave reclamada
 * en el recibo antes de avisar), agrupación de ráfagas (500 ms) y supresión
 * cuando el usuario ya atiende esa sesión. Historial, remount y reconexión no
 * producen avisos: solo los recibos que nacen `unread` sin clave reclamada.
 * Un fallo al avisar jamás revierte el resultado.
 */
export function useBoardNotifications(options: UseBoardNotificationsOptions): void {
  const { runtime, memberKey } = options
  const { t } = useI18n()
  const latest = useRef(options)
  latest.current = options
  const batch = useRef<PendingTerminal[]>([])
  const timer = useRef<number | null>(null)
  const seenRequests = useRef(new Set<string>())

  useEffect(() => {
    const targetVisible = (sessionId: string): boolean => {
      const ui = useUIStore.getState()
      const board = useBoardStore.getState()
      if (ui.view === 'chat') return latest.current.activeSessionId === sessionId
      if (ui.view !== 'board') return false
      const pane = board.panes.find((item) => item.paneId === board.focusedPaneId)
      return Boolean(pane && pane.sessionId === sessionId && !pane.collapsed)
    }
    const goBoard = () => useUIStore.getState().goBoard()
    const reveal = (sessionId: string, turnId?: string) => {
      if (!revealBoardAttention({ sessionId, turnId }, { goBoard })) {
        toast.info(t('board.toast.paneGone'))
      }
    }
    const notify = (kind: 'terminal' | 'intervention', sessionId: string, text: string, turnId?: string) => {
      const prefs = useBoardStore.getState().notifications
      const decision = decideChannels({
        kind,
        prefs,
        windowAttended: getWindowAttention().attended,
        targetVisible: targetVisible(sessionId),
        support: notificationSupport,
        permission: latest.current.systemPermission,
      })
      if (decision.system) {
        const native: NativeNotification = {
          title: 'Rinari Agent',
          body: nativeBody(kind, { label: latest.current.labelFor(sessionId) }, prefs.systemDetails),
        }
        void sendSystemNotification(native).catch(() => undefined)
      }
      if (decision.toast) {
        toast(text, {
          id: `board-${kind}-${turnId ?? sessionId}`,
          action: { label: t('board.toast.goToPane'), onClick: () => reveal(sessionId, turnId) },
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
        const label = latest.current.labelFor(item.sessionId) ?? t('board.peers.unknown')
        const key = item.outcome === 'failed' ? 'board.toast.failed' : item.outcome === 'stopped' ? 'board.toast.stopped' : 'board.toast.done'
        notify('terminal', item.sessionId, t(key, { label }), item.turnId)
        return
      }
      const sessions = new Set(items.map((item) => item.sessionId))
      const prefs = useBoardStore.getState().notifications
      if (!prefs.toasts) return
      toast(t('board.toast.grouped', { n: sessions.size }), {
        id: `board-grouped-${Date.now()}`,
        action: { label: t('board.toast.viewPending'), onClick: goBoard },
      })
    }

    const scanReceipts = () => {
      const sessions = useBoardAttentionStore.getState().sessions
      const members = new Set(useBoardStore.getState().panes.map((pane) => pane.sessionId))
      for (const [sessionId, session] of Object.entries(sessions)) {
        if (!members.has(sessionId)) continue
        for (const receipt of Object.values(session.turns)) {
          if (receipt.state !== 'unread' || receipt.notificationKey) continue
          const key = `terminal:${receipt.turnId}:${receipt.outcome}`
          if (!useBoardAttentionStore.getState().claimNotification(sessionId, receipt.turnId, key)) continue
          batch.current.push({ sessionId, turnId: receipt.turnId, outcome: receipt.outcome })
        }
      }
      if (batch.current.length > 0 && timer.current === null) {
        timer.current = window.setTimeout(flush, NOTIFICATION_GROUP_WINDOW_MS)
      }
    }

    const scanInterventions = () => {
      const members = new Set(useBoardStore.getState().panes.map((pane) => pane.sessionId))
      const approvals = runtime.getState().approvals
      for (const approval of approvals) {
        if (!approval.session_id || !members.has(approval.session_id) || approval.status === 'expired') continue
        const id = `approval:${approval.approval_id}`
        if (seenRequests.current.has(id)) continue
        seenRequests.current.add(id)
        const label = latest.current.labelFor(approval.session_id) ?? t('board.peers.unknown')
        notify('intervention', approval.session_id, t('board.toast.needsYou', { label }), approval.turn_id ?? undefined)
      }
      for (const sessionId of members) {
        for (const question of getPendingQuestions(sessionId)) {
          const id = `question:${question.request_id}`
          if (seenRequests.current.has(id)) continue
          seenRequests.current.add(id)
          const label = latest.current.labelFor(sessionId) ?? t('board.peers.unknown')
          notify('intervention', sessionId, t('board.toast.needsYou', { label }), question.turn_id || undefined)
        }
      }
    }

    scanReceipts()
    scanInterventions()
    const members = [...new Set(useBoardStore.getState().panes.map((pane) => pane.sessionId))]
    const stops = [
      useBoardAttentionStore.subscribe(scanReceipts),
      runtime.subscribe(scanInterventions),
      useBoardStore.subscribe(() => { scanReceipts(); scanInterventions() }),
      ...members.map((sessionId) => subscribePendingQuestions(sessionId, scanInterventions)),
    ]
    return () => {
      for (const stop of stops) stop()
      if (timer.current !== null) {
        window.clearTimeout(timer.current)
        timer.current = null
      }
    }
  }, [runtime, memberKey, t])
}
