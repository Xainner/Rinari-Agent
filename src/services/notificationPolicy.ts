/**
 * Política pura de avisos del board (§8.8–8.10). Sin dependencias de Tauri ni
 * de React: decide **qué canal** puede usarse para un suceso dado el estado de
 * atención, las preferencias y el soporte nativo; no envía nada.
 */
import type { BoardNotificationPrefs } from '../stores/board'

export type BoardEventKind = 'terminal' | 'intervention' | 'peer'

export interface NotificationDeliverySupport {
  /** El host puede mostrar una notificación del sistema. */
  canSend: boolean
  /** Un clic en la notificación puede activar un destino concreto (no verificado en desktop). */
  canActivateTarget: boolean
}

export type SystemPermission = 'disabled' | 'permission-needed' | 'granted' | 'denied' | 'unsupported' | 'error'

export interface ChannelDecision {
  toast: boolean
  system: boolean
}

export interface ChannelInput {
  kind: BoardEventKind
  prefs: BoardNotificationPrefs
  /** La ventana está visible y con foco. */
  windowAttended: boolean
  /** El resultado/solicitud está realmente visible (panel expandido y enfocado en Boards, o Normal con esa sesión). */
  targetVisible: boolean
  support: NotificationDeliverySupport
  permission: SystemPermission
}

/**
 * - toast interno: `toasts` y (para intervención) `needsYou`; nunca si el
 *   destino ya está visible con la ventana atendida.
 * - nativo: `system` + permiso concedido + ventana NO atendida; intervención
 *   añade `needsYou`. Los peers no usan canal nativo (tienen su propio toast).
 * - si se envía nativo con la app en segundo plano, no se muestra además el
 *   toast individual al volver: el badge y la lista interna siguen.
 */
export function decideChannels(input: ChannelInput): ChannelDecision {
  const { kind, prefs, windowAttended, targetVisible, support, permission } = input
  if (kind === 'peer') return { toast: false, system: false }
  const interventionAllowed = kind !== 'intervention' || prefs.needsYou
  const attendedHere = windowAttended && targetVisible
  const system = prefs.system && support.canSend && permission === 'granted' && !windowAttended && interventionAllowed
  const toast = prefs.toasts && interventionAllowed && !attendedHere && !system
  return { toast, system }
}

/** Cuerpo nativo genérico por defecto: nada de rutas, fragmentos ni prompts. */
export function nativeBody(kind: BoardEventKind, details: { label?: string | null; provider?: string | null; model?: string | null } | null, showDetails: boolean): string {
  const generic = kind === 'intervention' ? 'Un panel necesita tu intervención' : 'Un panel necesita revisión'
  if (!showDetails || !details?.label) return generic
  const attribution = [details.provider, details.model].filter(Boolean).join(' › ')
  return attribution ? `${details.label} · ${attribution}` : details.label
}

/** Ventana de agrupación de ráfagas (varios paneles terminan casi a la vez). */
export const NOTIFICATION_GROUP_WINDOW_MS = 500
