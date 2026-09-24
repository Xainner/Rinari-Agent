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
import { CHROME_BACKGROUND, CHROME_OVERLAY_HEIGHT, CHROME_SYMBOL } from '../shared/chrome'
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
  /** Se pide cerrar: el coordinador de salida decide qué hacer. */
  onCloseRequested: (window: BrowserWindow) => void
  /**
   * ¿La salida ya está confirmada? Entonces el cierre se deja pasar. Sin
   * esto, el `preventDefault` incondicional impediría que `app.quit()`
   * terminara nunca: salir cerraría la ventana, y la ventana bloquearía la
   * salida.
   */
  isQuitCommitted: () => boolean
  /**
   * Arranque al iniciar sesión con la bandeja activa: la ventana carga pero no
   * se muestra hasta que el usuario la abre (`presentWindow`).
   */
  startHidden?: boolean
}

type RevealWindow = Pick<BrowserWindow, 'isDestroyed' | 'isVisible' | 'maximize' | 'show'>

/**
 * Maximizar es la operación de revelado. Electron muestra una ventana oculta
 * al maximizarla; `show()` queda únicamente como respaldo del siguiente tick.
 */
export function revealMaximized(window: RevealWindow, publish: () => void): void {
  window.maximize()
  setImmediate(() => {
    if (window.isDestroyed()) return
    if (!window.isVisible()) window.show()
    publish()
  })
}

type ExistingWindow = Pick<BrowserWindow, 'isMinimized' | 'restore' | 'focus' | 'isVisible' | 'show'>

/** Ventanas que ya se revelaron una vez (la primera vez se maximizan). */
const revealed = new WeakSet<object>()

/**
 * Una segunda instancia, la bandeja o una notificación traen la ventana al
 * frente: la muestran si estaba oculta en la bandeja y conservan la elección
 * de tamaño del usuario.
 */
export function focusExistingWindow(window: ExistingWindow): void {
  if (!window.isVisible()) window.show()
  if (window.isMinimized()) window.restore()
  window.focus()
}

/**
 * Como `focusExistingWindow`, pero una ventana que arrancó oculta y nunca se
 * mostró se revela maximizada, igual que en un arranque normal.
 */
export function presentWindow(window: ExistingWindow & RevealWindow, publish: () => void = () => {}): void {
  if (window.isDestroyed()) return
  if (!revealed.has(window)) {
    revealed.add(window)
    revealMaximized(window, publish)
    window.focus()
    return
  }
  focusExistingWindow(window)
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
      : {
          titleBarOverlay: {
            // El mismo color que `.app-topbar`, no uno parecido: la franja de
            // los controles nativos es la continuación de esa barra.
            color: CHROME_BACKGROUND,
            symbolColor: CHROME_SYMBOL,
            height: CHROME_OVERLAY_HEIGHT,
          },
        }),
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

  /**
   * Mostrar la ventana, una sola vez.
   *
   * La ruta buena es `ready-to-show`, que espera al primer pintado y evita el
   * parpadeo en blanco. Pero ese evento **no llega si la página no llega a
   * pintar** —un error en el arranque de React, por ejemplo—, y entonces la
   * aplicación se queda sin ventana: el proceso vivo, el renderer cargado y
   * nada en pantalla. Un fallo así no puede dejar al usuario sin nada que
   * mirar, ni sin poder abrir DevTools para ver qué pasó.
   */
  let shown = false
  const reveal = (reason: string) => {
    if (shown || window.isDestroyed()) return
    shown = true
    if (reason !== 'ready-to-show') {
      console.error(`[rinari] la ventana se muestra por ${reason}: la página no llegó a pintar`)
    }
    // Arranque en la bandeja: se queda oculta hasta que el usuario la abra.
    if (deps.startHidden) return
    revealed.add(window)
    revealMaximized(window, push)
  }
  window.once('ready-to-show', () => reveal('ready-to-show'))
  // Respaldo: la página terminó de cargar pero no pintó.
  window.webContents.once('did-finish-load', () => setTimeout(() => reveal('did-finish-load'), 1_500))
  // Y si ni siquiera carga, se muestra igual para poder diagnosticar.
  window.webContents.once('did-fail-load', (_event, code, description) =>
    reveal(`did-fail-load ${code}: ${description}`),
  )

  // Errores del renderer al proceso principal: sin esto, una excepción en el
  // arranque de React no aparece en ningún sitio que se pueda leer.
  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) console.error(`[renderer] ${message} (${sourceId}:${line})`)
  })
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[renderer] el proceso se fue: ${details.reason}`)
  })

  window.on('close', (event) => {
    if (deps.isQuitCommitted()) return
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
