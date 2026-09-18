/**
 * Implementación del contrato de plataforma sobre Tauri.
 *
 * **Temporal y aislada** (documento 02 §3): es el único archivo del renderer
 * que puede importar `@tauri-apps/*`, y se elimina entero en la entrega H,
 * cuando Electron sea el host por defecto. Añadir un import de Tauri en
 * cualquier otro sitio revierte el trabajo de la entrega C, así que el lint
 * lo prohíbe fuera de aquí.
 *
 * No hay lógica de dominio: traduce la intención del contrato a la API de
 * este host y nada más.
 */

import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { LogicalPosition } from '@tauri-apps/api/dpi'
import { Menu, type MenuOptions } from '@tauri-apps/api/menu'
import { currentMonitor, getCurrentWindow, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/window'
import { open } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import { relaunch } from '@tauri-apps/plugin-process'
import { check } from '@tauri-apps/plugin-updater'

import type {
  ContextMenuItem,
  DesktopBridge,
  EngineBackedCommand,
  EngineStatus,
  EngineEventMessage,
  NativeBrowserContext,
  NativeBrowserControl,
  OpenFilesOptions,
  OpenRequest,
  Unsubscribe,
  UpdateAvailable,
} from './contract'

const ENGINE_EVENT = 'rinari-engine-event'
const MENU_EVENT = 'rinari-menu-action'
const OPEN_REQUEST_EVENT = 'rinari-open-request'

/** `listen` resuelve tras registrar; el contrato devuelve la baja ya lista. */
async function subscribe<T>(event: string, callback: (payload: T) => void): Promise<Unsubscribe> {
  const stop = await listen<T>(event, (message) => callback(message.payload))
  let done = false
  return () => {
    if (done) return
    done = true
    stop()
  }
}

export const tauriBridge: DesktopBridge = {
  command<T>(name: EngineBackedCommand, args?: Record<string, unknown>): Promise<T> {
    return invoke<T>(name, args)
  },

  // En Tauri el ciclo de vida también son comandos del host, así que la
  // implementación es directa; lo que cambia es que el contrato ya no los
  // confunde con métodos del Engine.
  engine: {
    status: () => invoke<EngineStatus>('engine_status'),
    start: () => invoke<EngineStatus>('engine_start'),
    shutdown: () => invoke<EngineStatus>('engine_shutdown'),
    restart: () => invoke<EngineStatus>('engine_restart'),
  },

  handoff: {
    initial: () => invoke<OpenRequest>('initial_open_request'),
  },

  files: {
    openExternal: (input) => invoke<void>('workspace_file_open', input),
  },

  events: {
    onEngineEvent: (callback: (event: EngineEventMessage) => void) =>
      subscribe<EngineEventMessage>(ENGINE_EVENT, callback),
    onMenuAction: (callback: (action: string) => void) => subscribe<string>(MENU_EVENT, callback),
    onOpenRequest: (callback: (request: OpenRequest) => void) =>
      subscribe<OpenRequest>(OPEN_REQUEST_EVENT, callback),
  },

  /**
   * El host Tauri no tiene browser nativo, y lo dice.
   *
   * Fingir soporte haría que la UI enseñara una superficie que nunca aparece;
   * con `supported: false` cae al visor de capturas, que es lo que este host
   * sí puede mostrar (§10).
   */
  browser: {
    async context(sessionId: string) {
      return unsupportedBrowser(sessionId)
    },
    async prepare(sessionId: string) {
      return unsupportedBrowser(sessionId)
    },
    async attachSlot(): Promise<{ slotId: string }> {
      throw new Error('the Tauri host has no native browser surface')
    },
    async updateSlot(): Promise<void> {},
    async detachSlot(): Promise<void> {},
    async selectTarget(): Promise<void> {
      throw new Error('the Tauri host has no native browser surface')
    },
    async setControl(): Promise<NativeBrowserControl> {
      throw new Error('the Tauri host has no native browser surface')
    },
    async navigate(): Promise<void> {
      throw new Error('the Tauri host has no native browser surface')
    },
    async onContextChanged(): Promise<Unsubscribe> {
      // Nunca cambia: no hay contexto nativo del que informar.
      return () => {}
    },
  },

  window: {
    async clampToWorkArea(): Promise<void> {
      const win = getCurrentWindow()
      if (await win.isMaximized()) return
      const monitor = await currentMonitor()
      if (!monitor) return
      const outer = await win.outerSize()
      const inner = await win.innerSize()
      const position = await win.outerPosition()
      const area = monitor.workArea
      const width = Math.min(outer.width, area.size.width)
      const height = Math.min(outer.height, area.size.height)
      // setSize recibe dimensiones de cliente: hay que descontar el marco nativo.
      if (width !== outer.width || height !== outer.height) {
        await win.setSize(
          new PhysicalSize(
            Math.max(1, width - (outer.width - inner.width)),
            Math.max(1, height - (outer.height - inner.height)),
          ),
        )
      }
      const x = Math.max(area.position.x, Math.min(position.x, area.position.x + area.size.width - width))
      const y = Math.max(area.position.y, Math.min(position.y, area.position.y + area.size.height - height))
      if (x !== position.x || y !== position.y) await win.setPosition(new PhysicalPosition(x, y))
    },
  },

  dialog: {
    async openFiles(options: OpenFilesOptions = {}): Promise<string[] | null> {
      const selected = await open({
        multiple: options.multiple ?? false,
        directory: options.directory ?? false,
        title: options.title,
      })
      if (selected === null) return null
      return Array.isArray(selected) ? selected : [selected]
    },
  },

  opener: {
    openUrl: (url: string) => openUrl(url),
  },

  contextMenu: {
    async show(items: ContextMenuItem[], position: { x: number; y: number }): Promise<void> {
      const ROLES = { cut: 'Cut', copy: 'Copy', paste: 'Paste', selectAll: 'SelectAll' } as const
      const options: NonNullable<MenuOptions['items']> = items.map((item) =>
        item.kind === 'role'
          ? { item: ROLES[item.role], text: item.text }
          : { text: item.text, action: item.run },
      )
      const menu = await Menu.new({ items: options })
      try {
        await menu.popup(new LogicalPosition(position.x, position.y))
      } finally {
        await menu.close()
      }
    },
  },

  notifications: {
    // Este build no incluye `tauri-plugin-notification`: añadirlo es una
    // dependencia nueva que requiere autorización. Se declara no soportado
    // para que el ajuste lo muestre ausente y la política nunca lo elija.
    async support() {
      return { canSend: false, canActivateTarget: false }
    },
    async send() {
      return false
    },
    async onActivated() {
      return () => {}
    },
  },

  updates: {
    async check(): Promise<UpdateAvailable | null> {
      const update = await check()
      if (!update) return null
      return { version: update.version, body: update.body ?? undefined }
    },
    async installAndRelaunch(): Promise<void> {
      const update = await check()
      if (!update) return
      await update.downloadAndInstall()
      await relaunch()
    },
  },

  isDesktop: () => isTauri(),
}

/** Estado honesto de un host sin browser nativo (documento 03 §10). */
function unsupportedBrowser(sessionId: string): NativeBrowserContext {
  return {
    session_id: sessionId,
    supported: false,
    host_registered: false,
    context_state: 'absent',
    available: false,
    backend: null,
    targets: [],
    active_target_id: null,
  }
}
