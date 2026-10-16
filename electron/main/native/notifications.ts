/**
 * Notificaciones del sistema (documento 02 §7).
 *
 * «Implementar el adaptador real de sistema, con detección de disponibilidad,
 * dedupe y click que resuelve sesión/turno **sin enviar nada**. Un permiso
 * ausente se muestra como no disponible, no como éxito simulado.»
 *
 * La decisión de *si* notificar no está aquí: la toma `notificationPolicy` en
 * el renderer, que ya comprueba foco y visibilidad del destino. Este módulo
 * solo sabe mostrarla y decir la verdad sobre lo que puede hacer.
 */

import { Notification } from 'electron'

/** Ventana de deduplicación: el mismo aviso repetido no se muestra dos veces. */
export const DEDUPE_WINDOW_MS = 10_000
/**
 * Notificaciones vivas que se conservan: un objeto `Notification` recogido por
 * el recolector deja de recibir el clic, los botones y la respuesta.
 */
export const LIVE_LIMIT = 20
export const REPLY_MAX = 4_000

export type NotificationActionId = 'open' | 'review-plan'

export interface NotificationSupport {
  canSend: boolean
  /** Un clic puede llevar a un destino concreto. */
  canActivateTarget: boolean
}

export interface SystemNotification {
  title: string
  body: string
  /** Qué abrir al hacer clic. Es una referencia, no una acción. */
  target?: { sessionId?: string; turnId?: string }
  /** Sin sonido del sistema: la app reproduce su propio tono. */
  silent?: boolean
  /** Botones (#64): abrir, o abrir en el plan. Nunca aprobar. */
  actions?: Array<{ id: NotificationActionId; label: string }>
  /** Caja «Responder» (#64). */
  reply?: { placeholder: string }
}

export interface ActivatedTarget {
  sessionId?: string
  turnId?: string
  action?: NotificationActionId
}

/** Clave de dedupe: mismo título, cuerpo y destino. */
function keyOf(notification: SystemNotification): string {
  const { sessionId = '', turnId = '' } = notification.target ?? {}
  return `${notification.title}${notification.body}${sessionId}${turnId}`
}

export interface NotificationsDeps {
  /** Se llama al hacer clic o al pulsar un botón: el renderer decide a dónde ir. No envía nada. */
  onActivate: (target: ActivatedTarget) => void
  /** Lo que el dueño escribió en «Responder»: el renderer lo manda a esa conversación. */
  onReply?: (reply: { target: { sessionId?: string; turnId?: string }; text: string }) => void
  /** Trae la ventana al frente cuando el usuario pulsa la notificación. */
  focusWindow: () => void
}

export function createNotifications(deps: NotificationsDeps) {
  const recent = new Map<string, number>()
  const live = new Set<Notification>()
  const keep = (native: Notification) => {
    live.add(native)
    while (live.size > LIVE_LIMIT) live.delete(live.values().next().value as Notification)
  }

  return {
    /**
     * Disponibilidad real. En Linux sin servicio de notificaciones y en
     * Windows sin permiso, `isSupported()` es falso y se dice.
     */
    support(): NotificationSupport {
      const canSend = Notification.isSupported()
      return { canSend, canActivateTarget: canSend }
    },

    /** `false` si no se mostró, por soporte o por dedupe. Nunca miente. */
    send(notification: SystemNotification): boolean {
      if (!Notification.isSupported()) return false

      const key = keyOf(notification)
      const now = Date.now()
      const last = recent.get(key)
      if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return false
      recent.set(key, now)
      // La tabla no crece sin fin: se purga lo caducado en cada envío.
      for (const [entry, at] of recent) if (now - at >= DEDUPE_WINDOW_MS) recent.delete(entry)

      const actions = notification.actions ?? []
      const reply = notification.reply && deps.onReply ? notification.reply : null
      const native = new Notification({
        title: notification.title,
        body: notification.body,
        // Con los tonos de Rinari activos, el aviso del sistema no suena aparte.
        silent: notification.silent === true,
        ...(actions.length > 0 ? { actions: actions.map((action) => ({ type: 'button' as const, text: action.label })) } : {}),
        ...(reply ? { hasReply: true, replyPlaceholder: reply.placeholder } : {}),
      })
      const target = notification.target ?? {}
      const done = () => live.delete(native)
      native.on('click', () => {
        done()
        deps.focusWindow()
        // Solo resuelve el destino; no reenvía ni ejecuta nada.
        deps.onActivate(target)
      })
      native.on('action', (details) => {
        done()
        const action = actions[details.actionIndex]
        deps.focusWindow()
        deps.onActivate(action ? { ...target, action: action.id } : target)
      })
      native.on('reply', (details) => {
        done()
        const text = details.reply.trim().slice(0, REPLY_MAX)
        // Responder no trae la ventana: el mensaje entra en esa conversación.
        if (text) deps.onReply?.({ target, text })
      })
      native.on('close', done)
      keep(native)
      native.show()
      return true
    },
  }
}
