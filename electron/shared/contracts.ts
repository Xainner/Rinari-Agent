/**
 * Contratos compartidos entre main y preload (documento 02 §3.1 y §6.1).
 *
 * Los canales son un conjunto cerrado y con nombre. El preload no expone
 * `invoke(channel: string)` ni `ipcRenderer`: publica funciones estrechas que
 * escriben en estos canales, y el main valida en ejecución lo que llega —el
 * tipado de TypeScript no valida nada en tiempo de ejecución—.
 */

/** Canales petición/respuesta del renderer de confianza hacia el main. */
export const CHANNEL = {
  engineStatus: 'rinari:engine.status',
  engineStart: 'rinari:engine.start',
  engineShutdown: 'rinari:engine.shutdown',
  engineRestart: 'rinari:engine.restart',
  /** Despachador de dominio: método de la allowlist + parámetros. */
  command: 'rinari:command',
  windowMinimize: 'rinari:window.minimize',
  windowToggleMaximize: 'rinari:window.toggleMaximize',
  windowRequestClose: 'rinari:window.requestClose',
  windowClampToWorkArea: 'rinari:window.clampToWorkArea',
  dialogOpenFiles: 'rinari:dialog.openFiles',
  openerOpenUrl: 'rinari:opener.openUrl',
  contextMenuShow: 'rinari:contextMenu.show',
  notificationsSupport: 'rinari:notifications.support',
  notificationsSend: 'rinari:notifications.send',
  updatesCheck: 'rinari:updates.check',
  updatesInstall: 'rinari:updates.installAndRelaunch',
  /** El renderer pide el handoff pendiente del arranque en frío. */
  initialOpenRequest: 'rinari:handoff.initial',
} as const

/** Canales de main hacia el renderer (unidireccionales). */
export const PUSH = {
  engineEvent: 'rinari:push.engineEvent',
  engineStatus: 'rinari:push.engineStatus',
  menuAction: 'rinari:push.menuAction',
  openRequest: 'rinari:push.openRequest',
  windowState: 'rinari:push.windowState',
  /** Una acción del menú contextual nativo volvió al renderer. */
  contextMenuAction: 'rinari:push.contextMenuAction',
  /** El usuario pulsó una notificación: el renderer resuelve el destino. */
  notificationActivated: 'rinari:push.notificationActivated',
} as const

export type RequestChannel = (typeof CHANNEL)[keyof typeof CHANNEL]
export type PushChannel = (typeof PUSH)[keyof typeof PUSH]

export interface WindowState {
  maximized: boolean
  fullScreen: boolean
  focused: boolean
}

export type EngineState =
  | 'stopped'
  | 'starting'
  | 'handshaking'
  | 'ready'
  | 'degraded'
  | 'restarting'
  | 'failed'

/** Estado del Engine tal como lo ve el renderer. Lo produce el supervisor. */
export interface EngineStatus {
  state: EngineState
  engine_version: string | null
  protocol_version: number | null
  detail: string | null
  capabilities: Record<string, boolean>
  /** Del hello: espacia por home el estado de presentación por sesión. */
  home_id: string | null
}

export interface OpenRequest {
  project: string | null
  session: string | null
}

export interface UpdateAvailable {
  version: string
  body?: string
}

/**
 * Resultado de un canal petición/respuesta. Los errores viajan como datos, no
 * como excepciones serializadas: una excepción cruzando el puente pierde el
 * código de máquina que la UI necesita para decidir.
 */
export type BridgeResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } }

/**
 * Un elemento del menú contextual tal como cruza el puente: la función que
 * ejecuta el renderer no es serializable, así que viaja su identificador y la
 * elección vuelve por `PUSH.contextMenuAction`.
 */
/** Operaciones de edición que implementa el sistema, no Rinari. */
export const CONTEXT_MENU_ROLES = ['cut', 'copy', 'paste', 'selectAll'] as const
export type ContextMenuRole = (typeof CONTEXT_MENU_ROLES)[number]

export type ContextMenuItemWire =
  | { kind: 'role'; role: ContextMenuRole; text: string }
  | { kind: 'action'; text: string; id: string }

export interface ContextMenuRequest {
  items: ContextMenuItemWire[]
  x: number
  y: number
}

export interface NotificationSupport {
  canSend: boolean
  canActivateTarget: boolean
}

export interface NotificationTarget {
  sessionId?: string
  turnId?: string
}

export interface SystemNotificationRequest {
  title: string
  body: string
  target?: NotificationTarget
}

export interface OpenFilesRequest {
  multiple?: boolean
  directory?: boolean
  title?: string
}
