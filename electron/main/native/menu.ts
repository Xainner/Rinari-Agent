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

const ZOOM_STEP = 0.1
const ZOOM_MIN = 0.5
const ZOOM_MAX = 2

export interface MenuDeps {
  getWindow: () => BrowserWindow | null
  /** Acción que decide el renderer; viaja por su id, igual que antes. */
  onAction: (id: string) => void
  onQuit: () => void
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

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Archivo',
      submenu: [
        item('new-chat', 'Nueva conversación', 'CmdOrCtrl+N'),
        item('open-folder', 'Abrir carpeta…', 'CmdOrCtrl+O'),
        item('close-session', 'Cerrar sesión', 'CmdOrCtrl+W'),
        item('settings', 'Configuración…', 'CmdOrCtrl+,'),
        { type: 'separator' },
        item('quit', 'Salir', process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4'),
      ],
    },
    {
      label: 'Editar',
      submenu: [
        // Deshacer y rehacer los implementa el renderer sobre el campo con
        // foco, igual que en el menú contextual.
        item('undo', 'Deshacer'),
        item('redo', 'Rehacer'),
        { type: 'separator' },
        { role: 'cut', label: 'Cortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Pegar' },
        { role: 'selectAll', label: 'Seleccionar todo' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        // Selección idempotente y sin acelerador nativo a propósito.
        item('view-normal', 'Normal'),
        item('view-boards', 'Boards'),
        item('view-flows', 'Flujos'),
        { type: 'separator' },
        item('sidebar', 'Barra lateral', 'CmdOrCtrl+B'),
        item('files', 'Panel de archivos', 'CmdOrCtrl+Shift+E'),
        // El navegador vive en el mismo dock que los archivos, así que se abre
        // igual. Sin esta entrada sólo se llegaba abriendo Archivos y cambiando
        // de pestaña dentro, que no es «abrir Browser» (documento 03 §1).
        item('browser', 'Panel de navegador', 'CmdOrCtrl+Shift+U'),
        // Sin atajo propio: comparte ruta con la barra superior y la paleta,
        // y no compite con la vista global de Workspace.
        item('workspace-panel', 'Panel de Workspace'),
        // El mismo atajo que en los editores; no es una combinación de texto.
        item('terminal', 'Terminal', 'CmdOrCtrl+`'),
        item('commands', 'Paleta de comandos', 'CmdOrCtrl+K'),
        item('zoom-in', 'Acercar', 'CmdOrCtrl+Plus'),
        item('zoom-out', 'Alejar', 'CmdOrCtrl+-'),
        item('zoom-reset', 'Tamaño real', 'CmdOrCtrl+0'),
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        item('about', 'Acerca de Rinari Agent'),
        item('engine', 'Estado del motor'),
        item('updates', 'Buscar actualizaciones'),
      ],
    },
  ]

  return Menu.buildFromTemplate(template)
}
