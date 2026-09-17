/**
 * Ventana principal (documento 02 §5 y §6).
 *
 * Todo lo del §6.1 se configura de forma explícita, no por confiar en los
 * valores por defecto de la versión de turno: `nodeIntegration: false`,
 * `contextIsolation: true`, `sandbox: true`, `webSecurity: true` y CSP de
 * producción. La navegación fuera del origen propio se bloquea, y abrir
 * ventanas nuevas no es cosa del contenido.
 */

import { BrowserWindow, shell, type WebContents } from 'electron'
import { screen } from 'electron'

import { APP_ORIGIN, contentSecurityPolicy } from './appScheme'
import type { WindowState } from '../shared/contracts'

export interface WindowDeps {
  preloadPath: string
  /** URL a cargar: el esquema propio en producción, el dev server en desarrollo. */
  startUrl: string
  /**
   * Origen que el renderer de confianza carga de verdad: `app://rinari` en
   * producción y el del dev server en desarrollo. Es el mismo con el que se
   * compara el emisor del IPC, porque autorizar por ventana y cargar otro
   * origen deja el puente inservible en dev.
   */
  trustedOrigin: string
  /** `development` añade a la CSP lo justo para Vite y su HMR. */
  cspMode: 'production' | 'development'
  onState: (state: WindowState) => void
  /** Se pide cerrar: el host decide si hay trabajo activo que confirmar. */
  onCloseRequested: (window: BrowserWindow) => void
}

function stateOf(window: BrowserWindow): WindowState {
  return {
    maximized: window.isMaximized(),
    fullScreen: window.isFullScreen(),
    focused: window.isFocused(),
  }
}

/**
 * Cierra las puertas que el contenido podría empujar. Se aplica a los
 * webContents del renderer de confianza; el contenido remoto del navegador del
 * agente vive en otra partición y tiene su propia política (documento 03).
 */
function harden(contents: WebContents, allowedOrigins: string[], openExternally: (url: string) => void): void {
  // El renderer de confianza no navega fuera de su origen. Si lo intenta
  // —un enlace, un redirect—, se abre fuera y la página se queda donde está.
  contents.on('will-navigate', (event, url) => {
    if (allowedOrigins.some((origin) => url.startsWith(`${origin}/`) || url === origin)) return
    event.preventDefault()
    openExternally(url)
  })

  // Nada de ventanas nuevas decididas por el contenido.
  contents.setWindowOpenHandler(({ url }) => {
    openExternally(url)
    return { action: 'deny' }
  })

  // Un attach de webview sería una superficie con sus propias preferencias:
  // el navegador del agente es el documento 03, no esto.
  contents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })

  // Permisos del navegador: denegar por defecto. Cámara, micrófono,
  // geolocalización o notificaciones se conceden por una UX propia, no porque
  // una página lo pida.
  contents.session.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false)
  })
  contents.session.setPermissionCheckHandler(() => false)
}

export function createMainWindow(deps: WindowDeps): BrowserWindow {
  const allowedOrigins = [...new Set([APP_ORIGIN, deps.trustedOrigin])]

  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b0b0f',
    // Titlebar propia con los controles nativos superpuestos: se conserva el
    // comportamiento del sistema (doble clic, menú, snap) en vez de dibujar
    // botones y prometer una paridad que habría que demostrar (§5.2).
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 12, y: 14 } }
      : { titleBarOverlay: { color: '#0b0b0f', symbolColor: '#e6e6ea', height: 36 } }),
    webPreferences: {
      preload: deps.preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,
      spellcheck: true,
    },
  })

  const openExternally = (url: string) => {
    // Solo esquemas de red; `file:` o un esquema del sistema desde un enlace
    // sería ejecución encubierta.
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  }

  harden(window.webContents, allowedOrigins, openExternally)

  // CSP por cabecera además de la meta del documento: la cabecera gana y no
  // depende de que el HTML servido sea el que esperamos.
  window.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          contentSecurityPolicy(deps.cspMode === 'development' ? deps.trustedOrigin : undefined),
        ],
      },
    })
  })

  const push = () => deps.onState(stateOf(window))
  // Se registran uno a uno: las firmas de `on` son distintas por evento.
  window.on('maximize', push)
  window.on('unmaximize', push)
  window.on('enter-full-screen', push)
  window.on('leave-full-screen', push)
  window.on('focus', push)
  window.on('blur', push)

  window.once('ready-to-show', () => {
    window.show()
    push()
  })

  window.on('close', (event) => {
    event.preventDefault()
    deps.onCloseRequested(window)
  })

  void window.loadURL(deps.startUrl)
  return window
}

/**
 * Encaja la ventana en el área de trabajo del monitor actual si quedó mayor o
 * fuera de él. Es la intención que expone el contrato de plataforma; la
 * secuencia concreta es del host.
 */
export function clampToWorkArea(window: BrowserWindow): void {
  if (window.isMaximized() || window.isFullScreen()) return
  const bounds = window.getBounds()
  const area = screen.getDisplayMatching(bounds).workArea
  const width = Math.min(bounds.width, area.width)
  const height = Math.min(bounds.height, area.height)
  const x = Math.max(area.x, Math.min(bounds.x, area.x + area.width - width))
  const y = Math.max(area.y, Math.min(bounds.y, area.y + area.height - height))
  if (width !== bounds.width || height !== bounds.height || x !== bounds.x || y !== bounds.y) {
    window.setBounds({ x, y, width, height })
  }
}
