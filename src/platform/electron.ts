/**
 * Implementación del contrato de plataforma sobre Electron (documento 02 §3.2).
 *
 * Consume el puente que publica el preload en `window.rinariDesktop`. No hay
 * alias que finjan que `@tauri-apps/api/core` sigue existiendo: esconderían
 * las diferencias de seguridad y de eventos entre los dos hosts.
 *
 * Si el puente falta, `isDesktop()` es falso y las operaciones fallan con un
 * error de entorno. Nunca se simula un Engine conectado para que el home
 * parezca funcionar.
 */

import type {
  ContextMenuItem,
  DesktopBridge,
  EngineBackedCommand,
  EngineStatus,
  EngineEventMessage,
  NotificationSupport,
  NativeBrowserContext,
  NativeBrowserControl,
  NotificationTarget,
  OpenFilesOptions,
  OpenRequest,
  SystemNotification,
  Unsubscribe,
  UpdateAvailable,
} from './contract'

/** Superficie que expone el preload. Debe coincidir con `electron/preload`. */
interface DesktopHostApi {
  engine: {
    status(): Promise<EngineStatus>
    start(): Promise<EngineStatus>
    shutdown(): Promise<EngineStatus>
    restart(): Promise<EngineStatus>
    onEvent(callback: (event: EngineEventMessage) => void): Unsubscribe
    onStatus(callback: (status: unknown) => void): Unsubscribe
  }
  command<T>(name: string, params?: Record<string, unknown>): Promise<T>
  window: {
    minimize(): Promise<void>
    toggleMaximize(): Promise<void>
    requestClose(): Promise<void>
    clampToWorkArea(): Promise<void>
    onState(callback: (state: unknown) => void): Unsubscribe
  }
  /** Browser nativo. Los nombres van en snake_case: es el borde del puente. */
  browser: {
    context(sessionId: string): Promise<NativeBrowserContext>
    prepare(sessionId: string): Promise<NativeBrowserContext>
    attachSlot(sessionId: string): Promise<{ slot_id: string; session_id: string }>
    updateSlot(layout: {
      slot_id: string
      logical_bounds: { x: number; y: number; width: number; height: number }
      visible_bounds: { x: number; y: number; width: number; height: number }
      shown: boolean
      layout_revision: number
      overlay_depth: number
    }): Promise<void>
    detachSlot(slotId: string): Promise<void>
    selectTarget(sessionId: string, targetId: string): Promise<unknown>
    setControl(
      sessionId: string,
      owner: 'agent' | 'user',
      expectedRevision?: number,
    ): Promise<NativeBrowserControl>
    navigate(sessionId: string, url: string): Promise<unknown>
    onContextChanged(callback: (view: NativeBrowserContext) => void): Unsubscribe
  }
  dialog: { openFiles(options?: OpenFilesOptions): Promise<string[] | null> }
  opener: { openUrl(url: string): Promise<void> }
  contextMenu: { show(items: ContextMenuItem[], position: { x: number; y: number }): Promise<void> }
  notifications: {
    support(): Promise<NotificationSupport>
    send(notification: SystemNotification): Promise<boolean>
    onActivated(callback: (target: NotificationTarget) => void): Unsubscribe
  }
  updates: { check(): Promise<UpdateAvailable | null>; installAndRelaunch(): Promise<void> }
  handoff: {
    initial(): Promise<OpenRequest>
    onOpenRequest(callback: (request: OpenRequest) => void): Unsubscribe
  }
  files: { openExternal(input: { session_id: string; path: string; turn_id?: string }): Promise<void> }
  menu: { onAction(callback: (action: string) => void): Unsubscribe }
}

declare global {
  interface Window {
    rinariDesktop?: DesktopHostApi
  }
}

export function hostApi(): DesktopHostApi | undefined {
  return typeof window === 'undefined' ? undefined : window.rinariDesktop
}

class MissingBridge extends Error {
  readonly code = 'HOST_UNAVAILABLE'
  constructor() {
    super('The Rinari desktop bridge is not available in this window.')
  }
}

function required(): DesktopHostApi {
  const api = hostApi()
  if (!api) throw new MissingBridge()
  return api
}

/** Una suscripción cuyo `unsubscribe` ya es idempotente en el preload. */
async function ready(unsubscribe: Unsubscribe): Promise<Unsubscribe> {
  return unsubscribe
}

export const electronBridge: DesktopBridge = {
  command<T>(name: EngineBackedCommand, args?: Record<string, unknown>): Promise<T> {
    return required().command<T>(name, args)
  },

  engine: {
    status: () => required().engine.status(),
    start: () => required().engine.start(),
    shutdown: () => required().engine.shutdown(),
    restart: () => required().engine.restart(),
  },

  handoff: {
    initial: () => required().handoff.initial(),
  },

  files: {
    openExternal: (input) => required().files.openExternal(input),
  },

  events: {
    onEngineEvent: (callback) => ready(required().engine.onEvent(callback)),
    onMenuAction: (callback) => ready(required().menu.onAction(callback)),
    onOpenRequest: (callback) => ready(required().handoff.onOpenRequest(callback)),
  },

  window: {
    clampToWorkArea: () => required().window.clampToWorkArea(),
  },

  // Browser nativo: se delega tal cual. El adaptador no añade lógica porque
  // no debe: quien valida geometría, control y destino es main.
  browser: {
    context: (sessionId) => required().browser.context(sessionId),
    prepare: (sessionId) => required().browser.prepare(sessionId),
    attachSlot: async (sessionId) => {
      const lease = await required().browser.attachSlot(sessionId)
      return { slotId: lease.slot_id }
    },
    updateSlot: (layout) =>
      required().browser.updateSlot({
        slot_id: layout.slotId,
        logical_bounds: layout.logicalBounds,
        visible_bounds: layout.visibleBounds,
        shown: layout.shown,
        layout_revision: layout.layoutRevision,
        overlay_depth: layout.overlayDepth,
      }),
    detachSlot: (slotId) => required().browser.detachSlot(slotId),
    selectTarget: async (sessionId, targetId) => {
      await required().browser.selectTarget(sessionId, targetId)
    },
    setControl: (sessionId, owner, expectedRevision) =>
      required().browser.setControl(sessionId, owner, expectedRevision),
    navigate: async (sessionId, url) => {
      await required().browser.navigate(sessionId, url)
    },
    onContextChanged: async (callback) => required().browser.onContextChanged(callback),
  },

  dialog: {
    openFiles: (options: OpenFilesOptions = {}) => required().dialog.openFiles(options),
  },

  opener: {
    openUrl: (url: string) => required().opener.openUrl(url),
  },

  contextMenu: {
    show: (items, position) => required().contextMenu.show(items, position),
  },

  notifications: {
    support: () => required().notifications.support(),
    send: (notification) => required().notifications.send(notification),
    onActivated: (callback) => ready(required().notifications.onActivated(callback)),
  },

  updates: {
    check: () => required().updates.check(),
    installAndRelaunch: () => required().updates.installAndRelaunch(),
  },

  isDesktop: () => hostApi() !== undefined,
}
