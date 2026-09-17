import type { NotificationDeliverySupport, SystemPermission } from './notificationPolicy'

/**
 * Adaptador de notificaciones del sistema. Este build **no incluye** el plugin
 * oficial (`tauri-plugin-notification`): añadirlo es una dependencia nueva que
 * requiere autorización (PR N del plan). Hasta entonces el canal nativo se
 * declara no soportado: el ajuste lo muestra como no disponible y la política
 * nunca lo elige. No se declara activación por clic sin backend validado.
 */
export const notificationSupport: NotificationDeliverySupport = { canSend: false, canActivateTarget: false }

export async function querySystemPermission(): Promise<SystemPermission> {
  return 'unsupported'
}

/** Solo se llama cuando el usuario activa la opción; nunca al arrancar. */
export async function requestSystemPermission(): Promise<SystemPermission> {
  return 'unsupported'
}

export interface NativeNotification {
  title: string
  body: string
}

export async function sendSystemNotification(_notification: NativeNotification): Promise<boolean> {
  return false
}
