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
}

/** Clave de dedupe: mismo título, cuerpo y destino. */
function keyOf(notification: SystemNotification): string {
  const { sessionId = '', turnId = '' } = notification.target ?? {}
  return `${notification.title}${notification.body}${sessionId}${turnId}`
}

export interface NotificationsDeps {
  /** Se llama al hacer clic: el renderer decide a dónde ir. No envía nada. */
  onActivate: (target: { sessionId?: string; turnId?: string }) => void
  /** Trae la ventana al frente cuando el usuario pulsa la notificación. */
  focusWindow: () => void
}

export function createNotifications(deps: NotificationsDeps) {
  const recent = new Map<string, number>()

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

      const native = new Notification({
        title: notification.title,
        body: notification.body,
        silent: false,
      })
      native.on('click', () => {
        deps.focusWindow()
        // Solo resuelve el destino; no reenvía ni ejecuta nada.
        deps.onActivate(notification.target ?? {})
      })
      native.show()
      return true
    },
  }
}
