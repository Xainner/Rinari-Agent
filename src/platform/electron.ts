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
  NativeBrowserPreview,
  NotificationTarget,
  OpenFilesOptions,
  OpenRequest,
  SystemNotification,
  Unsubscribe,
  UpdateAvailable,
  UpdateState,
  MigrationStatus,
} from './contract'

/** Superficie que expone el preload. Debe coincidir con `electron/preload`. */
interface DesktopHostApi {
  parityMode?: boolean
  browserVerticalMode?: boolean
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
      occlusions?: Array<{ x: number; y: number; width: number; height: number }>
    }): Promise<void>
    detachSlot(slotId: string): Promise<void>
    selectTarget(sessionId: string, targetId: string): Promise<unknown>
    setControl(
      sessionId: string,
      owner: 'agent' | 'user',
      expectedRevision?: number,
    ): Promise<NativeBrowserControl>
    navigate(sessionId: string, url: string): Promise<unknown>
    preview(sessionId: string): Promise<NativeBrowserPreview | null>
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
  updates: {
    check(): Promise<UpdateAvailable | null>
    download(): Promise<UpdateState>
    apply(): Promise<void>
    onState(callback: (state: UpdateState) => void): Unsubscribe
  }
  migration: {
    status(): Promise<MigrationStatus>
    stage(): Promise<{ token: string; status: MigrationStatus; preferences: Record<string, string> } | null>
    commit(token: string, preferences: Record<string, string>): Promise<MigrationStatus>
    verify(token: string): Promise<MigrationStatus>
    fail(token: string | undefined, message: string): Promise<MigrationStatus>
    retry(): Promise<MigrationStatus>
  }
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
        occlusions: layout.occlusions,
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
    preview: (sessionId) => required().browser.preview(sessionId),
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
    download: () => required().updates.download(),
    apply: () => required().updates.apply(),
    onState: (callback) => ready(required().updates.onState(callback)),
  },

  migration: {
    status: () => required().migration.status(),
    async importPending(): Promise<MigrationStatus> {
      const api = required().migration
      const stage = await api.stage()
      if (!stage) return api.status()
      const before = new Map<string, string | null>()
      try {
        for (const [key, value] of Object.entries(stage.preferences)) {
          before.set(key, window.localStorage.getItem(key))
          window.localStorage.setItem(key, value)
        }
        const applied: Record<string, string> = Object.create(null) as Record<string, string>
        for (const [key, value] of Object.entries(stage.preferences)) {
          const current = window.localStorage.getItem(key)
          if (current !== value) throw new Error(`could not verify imported preference: ${key}`)
          applied[key] = current
        }
        await api.commit(stage.token, applied)
        return await api.verify(stage.token)
      } catch (error) {
        for (const [key, value] of before) {
          if (value === null) window.localStorage.removeItem(key)
          else window.localStorage.setItem(key, value)
        }
        const message = error instanceof Error ? error.message : String(error)
        await api.fail(stage.token, message).catch(() => undefined)
        throw error
      }
    },
    retry: () => required().migration.retry(),
  },

  isDesktop: () => hostApi() !== undefined,
}
