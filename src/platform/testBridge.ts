/**
 * Implementación del contrato para tests (documento 02 §3.2): la suite no
 * necesita Tauri ni Electron.
 *
 * No simula un Engine: `command` devuelve lo que el test registre y falla si
 * le piden un comando que no preparó. Un doble que invente respuestas
 * convierte un fallo de integración en un test verde.
 */

import type {
  ContextMenuItem,
  DesktopBridge,
  DesktopCommand,
  EngineBackedCommand,
  EngineStatus,
  EngineEventMessage,
  NotificationSupport,
  NotificationTarget,
  OpenFilesOptions,
  OpenRequest,
  SystemNotification,
  Unsubscribe,
  UpdateAvailable,
} from './contract'

export type CommandHandler = (args: Record<string, unknown>) => unknown

export interface TestBridge extends DesktopBridge {
  /** Registra la respuesta de un comando. Reemplaza la anterior. */
  mockCommand(name: DesktopCommand, handler: CommandHandler): void
  /** Llamadas hechas, en orden. */
  readonly calls: Array<{ name: DesktopCommand; args: Record<string, unknown> }>
  /** Empuja un evento del Engine a los suscriptores. */
  emitEngineEvent(event: EngineEventMessage): void
  emitMenuAction(action: string): void
  emitOpenRequest(request: OpenRequest): void
  /** Menús mostrados, para comprobar el contenido sin un host nativo. */
  readonly menus: Array<{ items: ContextMenuItem[]; position: { x: number; y: number } }>
  /** Notificaciones mostradas, para comprobar qué salió y qué no. */
  readonly sentNotifications: SystemNotification[]
  notificationSupport: NotificationSupport
  /** Simula el clic del usuario en una notificación. */
  activateNotification(target: NotificationTarget): void
  /** Operaciones de ciclo de vida pedidas, en orden. */
  readonly engineCalls: string[]
  engineStatus: EngineStatus
  initialHandoff: OpenRequest
  /** Archivos que se pidió abrir con la aplicación del sistema. */
  readonly openedFiles: Array<{ session_id: string; path: string; turn_id?: string }>
  /** Respuesta del próximo `dialog.openFiles`. `null` = el usuario canceló. */
  nextFileSelection: string[] | null
  readonly openedUrls: string[]
  update: UpdateAvailable | null
  desktop: boolean
  reset(): void
}

export function createTestBridge(): TestBridge {
  const handlers = new Map<DesktopCommand, CommandHandler>()
  const engineListeners = new Set<(event: EngineEventMessage) => void>()
  const menuListeners = new Set<(action: string) => void>()
  const openListeners = new Set<(request: OpenRequest) => void>()
  const notificationListeners = new Set<(target: NotificationTarget) => void>()

  const bridge: TestBridge = {
    calls: [],
    engineCalls: [],
    engineStatus: {
      state: 'stopped',
      engine_version: null,
      protocol_version: null,
      detail: null,
      capabilities: {},
      home_id: null,
    },
    initialHandoff: { project: null, session: null },
    openedFiles: [],
    menus: [],
    sentNotifications: [],
    notificationSupport: { canSend: true, canActivateTarget: true },
    openedUrls: [],
    nextFileSelection: null,
    update: null,
    desktop: true,

    mockCommand(name, handler) {
      handlers.set(name, handler)
    },

    async command<T>(name: EngineBackedCommand, args: Record<string, unknown> = {}): Promise<T> {
      bridge.calls.push({ name, args })
      const handler = handlers.get(name)
      if (!handler) {
        throw new Error(
          `testBridge: el comando '${name}' no está preparado. Regístralo con mockCommand('${name}', …).`,
        )
      }
      return handler(args) as T
    },

    engine: {
      async status() {
        bridge.engineCalls.push('status')
        return bridge.engineStatus
      },
      async start() {
        bridge.engineCalls.push('start')
        bridge.engineStatus = { ...bridge.engineStatus, state: 'ready' }
        return bridge.engineStatus
      },
      async shutdown() {
        bridge.engineCalls.push('shutdown')
        bridge.engineStatus = { ...bridge.engineStatus, state: 'stopped' }
        return bridge.engineStatus
      },
      async restart() {
        bridge.engineCalls.push('restart')
        bridge.engineStatus = { ...bridge.engineStatus, state: 'ready' }
        return bridge.engineStatus
      },
    },

    handoff: {
      async initial() {
        return bridge.initialHandoff
      },
    },

    files: {
      async openExternal(input) {
        bridge.openedFiles.push(input)
      },
    },

    events: {
      async onEngineEvent(callback): Promise<Unsubscribe> {
        engineListeners.add(callback)
        return () => engineListeners.delete(callback)
      },
      async onMenuAction(callback): Promise<Unsubscribe> {
        menuListeners.add(callback)
        return () => menuListeners.delete(callback)
      },
      async onOpenRequest(callback): Promise<Unsubscribe> {
        openListeners.add(callback)
        return () => openListeners.delete(callback)
      },
    },

    window: {
      async clampToWorkArea() {},
    },

    dialog: {
      async openFiles(_options: OpenFilesOptions = {}) {
        return bridge.nextFileSelection
      },
    },

    opener: {
      async openUrl(url: string) {
        bridge.openedUrls.push(url)
      },
    },

    contextMenu: {
      async show(items, position) {
        bridge.menus.push({ items, position })
      },
    },

    notifications: {
      async support() {
        return bridge.notificationSupport
      },
      async send(notification) {
        bridge.sentNotifications.push(notification)
        // Sin soporte no se muestra; decirlo es el contrato.
        return bridge.notificationSupport.canSend
      },
      async onActivated(callback) {
        notificationListeners.add(callback)
        return () => notificationListeners.delete(callback)
      },
    },

    updates: {
      async check() {
        return bridge.update
      },
      async installAndRelaunch() {},
    },

    isDesktop: () => bridge.desktop,

    emitEngineEvent(event) {
      for (const listener of [...engineListeners]) listener(event)
    },
    emitMenuAction(action) {
      for (const listener of [...menuListeners]) listener(action)
    },
    emitOpenRequest(request) {
      for (const listener of [...openListeners]) listener(request)
    },
    activateNotification(target) {
      for (const listener of [...notificationListeners]) listener(target)
    },

    reset() {
      handlers.clear()
      engineListeners.clear()
      menuListeners.clear()
      openListeners.clear()
      bridge.calls.length = 0
      bridge.engineCalls.length = 0
      bridge.engineStatus = {
        state: 'stopped',
        engine_version: null,
        protocol_version: null,
        detail: null,
        capabilities: {},
        home_id: null,
      }
      bridge.initialHandoff = { project: null, session: null }
      bridge.openedFiles.length = 0
      bridge.menus.length = 0
      bridge.sentNotifications.length = 0
      bridge.notificationSupport = { canSend: true, canActivateTarget: true }
      notificationListeners.clear()
      bridge.openedUrls.length = 0
      bridge.nextFileSelection = null
      bridge.update = null
      bridge.desktop = true
    },
  }

  return bridge
}
