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

import type { AttentionIndicators } from '../../electron/shared/indicators'
import type { FlowResult } from '../types/protocol.generated'
import type {
  ContextMenuItem,
  DesktopBridge,
  WorkspaceMedia,
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
  BackgroundPatch,
  BackgroundSettings,
  DiagnosticsExportResult,
  DiagnosticsPreview,
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
  flow: { get(scope: unknown): Promise<unknown> }
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
      automatic?: boolean,
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
    snapshot(): Promise<UpdateState>
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
  files: {
    openExternal(input: { session_id: string; path: string; turn_id?: string }): Promise<void>
    revealInFolder(input: { session_id: string; path: string; turn_id?: string }): Promise<void>
    media(input: { session_id: string; path: string; turn_id?: string }): Promise<WorkspaceMedia>
  }
  clipboard: { writeText(text: string): Promise<void> }
  diagnostics: {
    preview(): Promise<DiagnosticsPreview>
    export(): Promise<DiagnosticsExportResult>
  }
  app: {
    background(): Promise<BackgroundSettings>
    setBackground(patch: BackgroundPatch): Promise<BackgroundSettings>
    setLanguage(language: 'es' | 'en'): Promise<void>
    setIndicators(state: AttentionIndicators): Promise<void>
  }
  menu: { onAction(callback: (action: string) => void): Unsubscribe }
}

declare global {
  interface Window {
    rinariDesktop?: DesktopHostApi
  }
}

/** Un fallo del host con lo que el main y el Engine dijeron de él. */
export class HostError extends Error {
  readonly code: string
  readonly retryable?: boolean
  readonly details?: Record<string, unknown>
  constructor(raw: { code: string; message?: unknown; retryable?: unknown; details?: unknown }) {
    super(typeof raw.message === 'string' ? raw.message : raw.code)
    this.name = 'HostError'
    this.code = raw.code
    if (typeof raw.retryable === 'boolean') this.retryable = raw.retryable
    if (raw.details && typeof raw.details === 'object' && !Array.isArray(raw.details)) this.details = raw.details as Record<string, unknown>
  }
}

function toHostError(error: unknown): unknown {
  if (error instanceof Error) return error
  if (error && typeof error === 'object' && (error as { rinariBridgeError?: unknown }).rinariBridgeError === true && typeof (error as { code?: unknown }).code === 'string') {
    return new HostError(error as { code: string })
  }
  return error
}

const wrapped = new WeakMap<object, object>()

/**
 * La API del preload con sus fallos vueltos `HostError`: una copia que envuelve
 * cada función (también en objetos anidados) sin cambiar lo que devuelve. Una
 * promesa rechazada o un `throw` síncrono pasan por `toHostError`. Es una copia
 * y no un Proxy porque `contextBridge` entrega objetos congelados.
 */
function withHostErrors<T extends object>(target: T): T {
  const cached = wrapped.get(target)
  if (cached) return cached as T
  const copy: Record<string, unknown> = {}
  for (const key of Object.keys(target)) {
    const value = (target as Record<string, unknown>)[key]
    if (typeof value === 'function') {
      copy[key] = (...args: unknown[]) => {
        let result: unknown
        try {
          result = (value as (...a: unknown[]) => unknown).apply(target, args)
        } catch (error) {
          throw toHostError(error)
        }
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          return (result as Promise<unknown>).then(undefined, (error) => { throw toHostError(error) })
        }
        return result
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      copy[key] = withHostErrors(value as object)
    } else {
      copy[key] = value
    }
  }
  wrapped.set(target, copy)
  return copy as T
}

export function hostApi(): DesktopHostApi | undefined {
  if (typeof window === 'undefined' || !window.rinariDesktop) return undefined
  return withHostErrors(window.rinariDesktop)
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
    revealInFolder: (input) => required().files.revealInFolder(input),
    media: (input) => required().files.media(input),
  },

  clipboard: {
    writeText: (text) => required().clipboard.writeText(text),
  },

  diagnostics: {
    preview: () => required().diagnostics.preview(),
    export: () => required().diagnostics.export(),
  },

  app: {
    backgroundSettings: () => required().app.background(),
    setBackgroundSettings: (patch) => required().app.setBackground(patch),
    setLanguage: (language) => required().app.setLanguage(language),
    setIndicators: (state) => required().app.setIndicators(state),
  },

  events: {
    onEngineEvent: (callback) => ready(required().engine.onEvent(callback)),
    onMenuAction: (callback) => ready(required().menu.onAction(callback)),
    onOpenRequest: (callback) => ready(required().handoff.onOpenRequest(callback)),
  },

  window: {
    clampToWorkArea: () => required().window.clampToWorkArea(),
  },

  // Flujos: se delega tal cual. Quien valida el alcance es main, que es el
  // lado que no se puede modificar desde el renderer.
  flow: {
    get: (scope) => required().flow.get(scope) as Promise<FlowResult>,
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
    setControl: (sessionId, owner, expectedRevision, automatic) =>
      required().browser.setControl(sessionId, owner, expectedRevision, automatic),
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
    snapshot: () => required().updates.snapshot(),
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
