/**
 * Servicios nativos del host (documento 02 §7).
 *
 * Son adaptadores finos: traducen la intención del contrato a la API de
 * Electron y no deciden nada de dominio. Lo que todavía no existe se declara
 * no disponible en vez de simularse.
 */

import { BrowserWindow, Menu, dialog, shell, type MenuItemConstructorOptions } from 'electron'

import type { ContextMenuRequest, OpenFilesRequest, UpdateAvailable } from '../../shared/contracts'

/** Diálogos nativos: selección explícita del usuario, no permisos persistentes. */
export function createDialogs(getWindow: () => BrowserWindow | null) {
  return {
    async openFiles(options: OpenFilesRequest): Promise<string[] | null> {
      const window = getWindow()
      const properties: Array<'openFile' | 'openDirectory' | 'multiSelections'> = options.directory
        ? ['openDirectory']
        : ['openFile']
      if (options.multiple) properties.push('multiSelections')
      const result = window
        ? await dialog.showOpenDialog(window, { properties, title: options.title })
        : await dialog.showOpenDialog({ properties, title: options.title })
      // Cancelar devuelve `null`, no una lista vacía: son cosas distintas.
      if (result.canceled || result.filePaths.length === 0) return null
      return result.filePaths
    },
  }
}

/** Abre fuera de la app. El esquema ya viene validado por `register.ts`. */
export function createOpener() {
  return {
    async openUrl(url: string): Promise<void> {
      await shell.openExternal(url)
    },
  }
}

const ROLE_MAP = {
  cut: 'cut',
  copy: 'copy',
  paste: 'paste',
  selectAll: 'selectAll',
} as const

/**
 * Menú contextual nativo. Las acciones propias vuelven al renderer por su id:
 * la función vive allí y no cruza el puente.
 */
export function createContextMenu(getWindow: () => BrowserWindow | null, onAction: (id: string) => void) {
  return {
    async show(request: ContextMenuRequest): Promise<void> {
      const window = getWindow()
      if (!window) return
      const template: MenuItemConstructorOptions[] = request.items.map((item) =>
        item.kind === 'role'
          ? { role: ROLE_MAP[item.role], label: item.text }
          : { label: item.text, click: () => onAction(item.id) },
      )
      const menu = Menu.buildFromTemplate(template)
      await new Promise<void>((resolve) => {
        menu.popup({ window, x: Math.round(request.x), y: Math.round(request.y), callback: () => resolve() })
      })
    },
  }
}

export class UpdatesUnavailable extends Error {
  readonly code = 'UPDATES_UNAVAILABLE'
}

/**
 * Actualizaciones.
 *
 * El canal de Electron tiene otro contrato de metadata y de firma que el
 * `latest.json` de Tauri, y reutilizar el texto de una firma Tauri como firma
 * Electron no es una actualización validada. Mientras el canal firmado no
 * exista (documento 04 §8, entrega G), esto se declara **no disponible**: un
 * permiso ausente se muestra como ausente, no como éxito simulado.
 */
export function createUpdates() {
  return {
    async check(): Promise<UpdateAvailable | null> {
      throw new UpdatesUnavailable(
        'The Electron update channel is not configured yet; update manually from the release page.',
      )
    },
    async installAndRelaunch(): Promise<void> {
      throw new UpdatesUnavailable('The Electron update channel is not configured yet.')
    },
  }
}
