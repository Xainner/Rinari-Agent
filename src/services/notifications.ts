import { platform, type NotificationTarget, type SystemNotification } from '../platform'
import type { NotificationDeliverySupport, SystemPermission } from './notificationPolicy'

/**
 * Adaptador de notificaciones del sistema.
 *
 * Lo que el host puede hacer de verdad se pregunta al host. Electron usa su
 * canal nativo; un permiso ausente se muestra como no disponible, nunca como
 * éxito simulado (documento 02 §7).
 *
 * El soporte se consulta una vez al arrancar y se guarda en un objeto que se
 * **muta en sitio**: los consumidores lo leen en el momento de decidir, así
 * que ven el valor real sin tener que volverse asíncronos.
 */
export const notificationSupport: NotificationDeliverySupport = {
  canSend: false,
  canActivateTarget: false,
}

/** Se llama una vez al arrancar la app. Idempotente. */
export async function refreshNotificationSupport(): Promise<NotificationDeliverySupport> {
  try {
    const support = await platform().notifications.support()
    notificationSupport.canSend = support.canSend
    notificationSupport.canActivateTarget = support.canActivateTarget
  } catch {
    // Sin host utilizable no hay canal nativo; el ajuste lo muestra ausente.
    notificationSupport.canSend = false
    notificationSupport.canActivateTarget = false
  }
  return notificationSupport
}

export async function querySystemPermission(): Promise<SystemPermission> {
  const support = await refreshNotificationSupport()
  return support.canSend ? 'granted' : 'unsupported'
}

/**
 * Solo se llama cuando el usuario activa la opción; nunca al arrancar.
 *
 * Electron no expone una petición de permiso separada: el sistema la resuelve
 * al mostrar la primera notificación. Por eso aquí se consulta el soporte en
 * vez de simular una concesión.
 */
export async function requestSystemPermission(): Promise<SystemPermission> {
  return querySystemPermission()
}

export interface NativeNotification {
  title: string
  body: string
  target?: NotificationTarget
}

/** `false` si no se mostró: sin soporte, o deduplicada por el host. */
export async function sendSystemNotification(notification: NativeNotification): Promise<boolean> {
  if (!notificationSupport.canSend) return false
  const payload: SystemNotification = {
    title: notification.title,
    body: notification.body,
    target: notification.target,
  }
  try {
    return await platform().notifications.send(payload)
  } catch {
    return false
  }
}

/**
 * Clic del usuario en una notificación. Resuelve el destino y nada más: no
 * envía, no reanuda, no aprueba (documento 02 §7).
 */
export function onNotificationActivated(
  callback: (target: NotificationTarget) => void,
): Promise<() => void> {
  return platform().notifications.onActivated(callback)
}
