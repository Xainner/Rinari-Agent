import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { onEngineEvent, type PeerMessage } from '../../services/engine'

export interface UsePeerNotificationsOptions {
  supported: boolean
  /** Etiqueta del panel de una sesión o `null` si no está en el board. */
  labelFor: (sessionId: string) => string | null
  /** Sesión del panel enfocado: sus entregas no generan aviso. */
  focusedSessionId: string | null
  focusSession: (sessionId: string) => boolean
}

/**
 * Aviso discreto cuando llega un mensaje de par a un panel que no está
 * enfocado, y cuando una entrega queda en pausa (Stop, grupo cambiado). El
 * estado "no leído" persistente es de PR 3A; aquí solo el toast con acción.
 */
export function usePeerNotifications(options: UsePeerNotificationsOptions): void {
  const { supported } = options
  const { t } = useI18n()
  const latest = useRef(options)
  latest.current = options

  useEffect(() => {
    if (!supported) return
    let unlisten: (() => void) | undefined
    let disposed = false
    void onEngineEvent((event) => {
      if (event.event !== 'session.peer.message' && event.event !== 'session.peer.message.updated') return
      const message = event.payload as Partial<PeerMessage>
      if (typeof message.to_session_id !== 'string' || typeof message.message_id !== 'string') return
      const { labelFor: label, focusedSessionId: focused, focusSession: focus } = latest.current
      const to = label(message.to_session_id)
      if (!to) return
      const from = (message.from_session_id && label(message.from_session_id)) || message.origin?.source_label || t('board.peers.unknown')
      const target = message.to_session_id
      if (event.event === 'session.peer.message' && message.origin?.kind === 'peer') {
        if (focused === target) return
        toast(t('board.peers.toast', { from, to }), {
          id: `peer-${message.message_id}`,
          action: { label: t('board.peers.goToPane'), onClick: () => void focus(target) },
        })
        return
      }
      if (event.event === 'session.peer.message.updated' && message.state === 'paused') {
        toast.warning(t('board.peers.toastPaused', { to }), {
          id: `peer-${message.message_id}`,
          action: { label: t('board.peers.goToPane'), onClick: () => void focus(target) },
        })
      }
    }).then((stop) => {
      if (disposed) stop()
      else unlisten = stop
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [supported, t])
}
