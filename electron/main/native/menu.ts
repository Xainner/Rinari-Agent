/**
 * Menú de aplicación (documento 02 §5.2 y §7).
 *
 * Menú compatible con el host 0.1.3, con las mismas entradas, etiquetas y
 * aceleradores. Dos decisiones del host anterior que se conservan porque son
 * de comportamiento, no de estilo:
 *
 * - **Salir y el zoom los resuelve el host**; el resto se emite al renderer
 *   por `rinari-menu-action`. El zoom es del webContents, no estado de la app.
 * - **Normal y Boards no llevan acelerador nativo.** El atajo configurable lo
 *   gestiona el frontend, y un acelerador duplicado dispararía la acción dos
 *   veces (§5.2: «Evitar duplicar un acelerador de menú y listener DOM para la
 *   misma acción»).
 */

import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'

import type { HostText } from './hostText'

const ZOOM_STEP = 0.1
const ZOOM_MIN = 0.5
const ZOOM_MAX = 2

export interface MenuDeps {
  getWindow: () => BrowserWindow | null
  /** Acción que decide el renderer; viaja por su id, igual que antes. */
  onAction: (id: string) => void
  onQuit: () => void
  /** Etiquetas en el idioma de la interfaz; el menú se reconstruye al cambiarlo. */
  text: HostText
}

/** Nivel de zoom del webContents. Una sola ventana, como en el host anterior. */
export function nextZoom(current: number, id: string): number {
  if (id === 'zoom-in') return Math.min(ZOOM_MAX, current + ZOOM_STEP)
  if (id === 'zoom-out') return Math.max(ZOOM_MIN, current - ZOOM_STEP)
  return 1
}

/** `zoomFactor` del webContents a partir del nivel lógico. */
export function applyZoom(window: BrowserWindow | null, factor: number): void {
  if (window && !window.isDestroyed()) window.webContents.setZoomFactor(factor)
}

export function buildApplicationMenu(deps: MenuDeps): Menu {
  let zoom = 1

  const item = (id: string, label: string, accelerator?: string): MenuItemConstructorOptions => ({
    id,
    label,
    accelerator,
    click: () => {
      if (id === 'quit') {
        deps.onQuit()
        return
      }
      if (id.startsWith('zoom-')) {
        zoom = nextZoom(zoom, id)
        applyZoom(deps.getWindow(), zoom)
        return
      }
      deps.onAction(id)
    },
  })

  const text = deps.text
  const template: MenuItemConstructorOptions[] = [
    {
      label: text.menuFile,
      submenu: [
        item('new-chat', text.menuNewChat, 'CmdOrCtrl+N'),
        item('open-folder', text.menuOpenFolder, 'CmdOrCtrl+O'),
        item('close-session', text.menuCloseSession, 'CmdOrCtrl+W'),
        item('settings', text.menuSettings, 'CmdOrCtrl+,'),
        { type: 'separator' },
        item('quit', text.menuQuit, process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4'),
      ],
    },
    {
      label: text.menuEdit,
      submenu: [
        // Deshacer y rehacer los implementa el renderer sobre el campo con
        // foco, igual que en el menú contextual.
        item('undo', text.menuUndo),
        item('redo', text.menuRedo),
        { type: 'separator' },
        { role: 'cut', label: text.menuCut },
        { role: 'copy', label: text.menuCopy },
        { role: 'paste', label: text.menuPaste },
        { role: 'selectAll', label: text.menuSelectAll },
      ],
    },
    {
      label: text.menuView,
      submenu: [
        // Selección idempotente y sin acelerador nativo a propósito.
        item('view-normal', text.menuNormal),
        item('view-boards', text.menuBoards),
        item('view-flows', text.menuFlows),
        { type: 'separator' },
        item('sidebar', text.menuSidebar, 'CmdOrCtrl+B'),
        item('files', text.menuFiles, 'CmdOrCtrl+Shift+E'),
        // El navegador vive en el mismo dock que los archivos, así que se abre
        // igual. Sin esta entrada sólo se llegaba abriendo Archivos y cambiando
        // de pestaña dentro, que no es «abrir Browser» (documento 03 §1).
        item('browser', text.menuBrowser, 'CmdOrCtrl+Shift+U'),
        // Sin atajo propio: comparte ruta con la barra superior y la paleta,
        // y no compite con la vista global de Workspace.
        item('workspace-panel', text.menuWorkspace),
        // El mismo atajo que en los editores; no es una combinación de texto.
        item('terminal', text.menuTerminal, 'CmdOrCtrl+`'),
        item('commands', text.menuCommands, 'CmdOrCtrl+K'),
        item('zoom-in', text.menuZoomIn, 'CmdOrCtrl+Plus'),
        item('zoom-out', text.menuZoomOut, 'CmdOrCtrl+-'),
        item('zoom-reset', text.menuZoomReset, 'CmdOrCtrl+0'),
      ],
    },
    {
      label: text.menuHelp,
      submenu: [
        item('about', text.menuAbout),
        item('engine', text.menuEngine),
        item('updates', text.menuUpdates),
      ],
    },
  ]

  return Menu.buildFromTemplate(template)
}
