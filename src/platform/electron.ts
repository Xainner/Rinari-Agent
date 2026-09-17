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
  DesktopCommand,
  EngineEventMessage,
  OpenFilesOptions,
  OpenRequest,
  Unsubscribe,
  UpdateAvailable,
} from './contract'

/** Superficie que expone el preload. Debe coincidir con `electron/preload`. */
interface DesktopHostApi {
  engine: {
    status(): Promise<unknown>
    start(): Promise<unknown>
    shutdown(): Promise<void>
    restart(): Promise<unknown>
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
  dialog: { openFiles(options?: OpenFilesOptions): Promise<string[] | null> }
  opener: { openUrl(url: string): Promise<void> }
  contextMenu: { show(items: ContextMenuItem[], position: { x: number; y: number }): Promise<void> }
  updates: { check(): Promise<UpdateAvailable | null>; installAndRelaunch(): Promise<void> }
  handoff: {
    initial(): Promise<OpenRequest>
    onOpenRequest(callback: (request: OpenRequest) => void): Unsubscribe
  }
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
  command<T>(name: DesktopCommand, args?: Record<string, unknown>): Promise<T> {
    return required().command<T>(name, args)
  },

  events: {
    onEngineEvent: (callback) => ready(required().engine.onEvent(callback)),
    onMenuAction: (callback) => ready(required().menu.onAction(callback)),
    onOpenRequest: (callback) => ready(required().handoff.onOpenRequest(callback)),
  },

  window: {
    clampToWorkArea: () => required().window.clampToWorkArea(),
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

  updates: {
    check: () => required().updates.check(),
    installAndRelaunch: () => required().updates.installAndRelaunch(),
  },

  isDesktop: () => hostApi() !== undefined,
}
