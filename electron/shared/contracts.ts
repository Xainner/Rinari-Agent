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
  filesOpenExternal: 'rinari:files.openExternal',
  contextMenuShow: 'rinari:contextMenu.show',
  notificationsSupport: 'rinari:notifications.support',
  notificationsSend: 'rinari:notifications.send',
  updatesCheck: 'rinari:updates.check',
  updatesDownload: 'rinari:updates.download',
  updatesApply: 'rinari:updates.apply',
  migrationStatus: 'rinari:migration.status',
  migrationStage: 'rinari:migration.importPending',
  migrationCommit: 'rinari:migration.commit',
  migrationVerify: 'rinari:migration.verify',
  migrationFail: 'rinari:migration.fail',
  migrationRetry: 'rinari:migration.retry',
  /** El renderer pide el handoff pendiente del arranque en frío. */
  initialOpenRequest: 'rinari:handoff.initial',

  // Browser nativo (documento 03 §6.1). Intenciones estrechas: metadata,
  // presentación, pestaña, control y navegación autorizada. **No** hay canal
  // para `host.browser.*` ni para `debugger.sendCommand`: el broker es de
  // main, y una respuesta suya no es un permiso que el renderer pueda guardar.
  // Flujos (`project_flow_v1`). Va como intención y **no** como
  // `DesktopCommand`: el inventario de comandos es la captura histórica de
  // Tauri 0.1.3, y `flow.get` no existía entonces. Añadirlo allí sería
  // afirmar un comando que nunca hubo.
  flowGet: 'rinari:flow.get',
  browserContext: 'rinari:browser.context',
  browserPrepare: 'rinari:browser.prepare',
  browserAttachSlot: 'rinari:browser.attachSlot',
  browserUpdateSlot: 'rinari:browser.updateSlot',
  browserDetachSlot: 'rinari:browser.detachSlot',
  browserSelectTarget: 'rinari:browser.selectTarget',
  browserSetControl: 'rinari:browser.setControl',
  browserNavigate: 'rinari:browser.navigate',
  browserPreview: 'rinari:browser.preview',
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
  /**
   * Cambió el contexto del browser de una sesión: pestañas, control o estado.
   * Se empuja para que la toolbar no tenga que sondear —el §10 limita el poll
   * al visor de capturas, y el nativo no lo necesita—.
   */
  browserContextChanged: 'rinari:push.browserContext',
  /** Progreso y estados del updater Electron; nunca contiene rutas ni tokens. */
  updateState: 'rinari:push.updateState',
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
  /** Hasta que exista Authenticode, la UI y evidencia deben decirlo. */
  unsigned: boolean
}

export interface UpdateProgress {
  percent: number
  bytes_per_second: number
  transferred: number
  total: number
}

export interface UpdateState {
  phase: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'applying' | 'error'
  current_version: string
  available_version: string | null
  progress: UpdateProgress | null
  message: string | null
  unsigned: boolean
}

export type { MigrationStage, MigrationStatus } from './migration'

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

export interface OpenExternalFileRequest {
  session_id: string
  path: string
  turn_id?: string
}

export interface OpenFilesRequest {
  multiple?: boolean
  directory?: boolean
  title?: string
}

// -- browser nativo (documento 03 §6.1) --------------------------------------

/** Una pestaña del contexto. Metadata segura: nada operable desde fuera. */
export interface BrowserTargetView {
  target_id: string
  url: string
  title: string
  active: boolean
}

/**
 * Lo que la UI puede saber del browser de una sesión.
 *
 * Soporte del protocolo, binding vivo y contexto listo son **tres cosas
 * distintas** (§5.2): anunciar `ready` por tener binding haría que la UI
 * mostrara un browser que aún no puede enseñar nada.
 */
export interface BrowserContextView {
  session_id: string
  supported: boolean
  host_registered: boolean
  context_state: 'absent' | 'creating' | 'ready' | 'disconnected' | 'disposed'
  available: boolean
  backend: string | null
  control?: 'agent' | 'user'
  control_state?: 'agent' | 'taking-user-control' | 'user' | 'uncertain'
  control_revision?: number
  active_target_id?: string | null
  targets?: BrowserTargetView[]
}

export interface BrowserControlView {
  control: 'agent' | 'user'
  control_state: string
  control_revision: number
}

export interface BrowserPreviewView {
  target_id: string
  url: string
  image: string
  width: number
  height: number
}

/**
 * Alcance de un flujo: exactamente un id, y el cursor opcional.
 *
 * `before` es el id de una etapa. La respuesta dice si truncó y por dónde
 * seguir; el cliente no compone índices, que se recalculan en cada
 * proyección.
 */
export interface FlowScopeRequest {
  project_id?: string | null
  session_id?: string | null
  before?: string | null
}

/** Geometría que el renderer reserva; main decide dónde se pinta. */
export interface BrowserSlotLayoutRequest {
  slot_id: string
  logical_bounds: { x: number; y: number; width: number; height: number }
  visible_bounds: { x: number; y: number; width: number; height: number }
  shown: boolean
  layout_revision: number
  overlay_depth: number
  occlusions?: Array<{ x: number; y: number; width: number; height: number }>
}

export interface BrowserSlotLease {
  slot_id: string
  session_id: string
}
