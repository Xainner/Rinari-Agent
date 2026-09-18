/**
 * Proceso principal de Rinari Agent bajo Electron (documento 02).
 *
 * Aquí se monta el host y nada más: ventanas, IPC validado, supervisión del
 * Engine y servicios de escritorio. Las sesiones, turnos, políticas,
 * herramientas y proveedores siguen siendo del Engine Python.
 */

import { app, protocol, BrowserWindow, Menu, dialog, shell } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { APP_ORIGIN, APP_SCHEME, contentTypeFor, resolveAppUrl } from './appScheme'
import { EngineCommandError, EngineSupervisor } from './engine/EngineSupervisor'
import { translateCommand } from './engine/translateCommand'
import { registerIpc, type HostServices } from './ipc/register'
import { SenderRegistry, originOf } from './ipc/validateSender'
import { canPush } from './ipc/pushGuard'
import { QuitCoordinator } from './lifecycle/QuitCoordinator'
import { HandoffQueue, parseOpenRequest } from './native/handoff'
import { buildApplicationMenu } from './native/menu'
import { createNotifications } from './native/notifications'
import { createContextMenu, createDialogs, createOpener, createUpdates } from './native/services'
import { clampToWorkArea, createMainWindow } from './window'
import { PUSH, type EngineStatus, type OpenRequest } from '../shared/contracts'

const DEV_SERVER = process.env.RINARI_DEV_SERVER_URL
const isDev = Boolean(DEV_SERVER)

/** Raíz del renderer construido: en los recursos si está empaquetado. */
function rendererRoot(): string {
  return app.isPackaged ? join(process.resourcesPath, 'app', 'dist') : join(__dirname, '..', 'dist')
}

// El esquema propio debe declararse antes de que la app esté lista.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
])

let mainWindow: BrowserWindow | null = null
let unregisterIpc: (() => void) | null = null
/**
 * Origen del renderer de confianza: el esquema propio en producción y el del
 * dev server cuando lo hay. El registro del emisor usa **este** valor, no
 * `APP_ORIGIN` a secas: en desarrollo la página se carga desde Vite y, con la
 * comparación exacta, todo el IPC respondía FORBIDDEN.
 */
const TRUSTED_ORIGIN = DEV_SERVER ? (originOf(DEV_SERVER) ?? APP_ORIGIN) : APP_ORIGIN
const registry = new SenderRegistry(TRUSTED_ORIGIN)
const handoff = new HandoffQueue()

function send(channel: string, payload: unknown): void {
  // Solo al renderer de confianza, y solo mientras siga en su origen: si
  // cargara otro contenido, dejaría de recibir eventos del Engine aunque ya
  // no pudiera invocar IPC privilegiado.
  const window = mainWindow
  if (!window || window.isDestroyed()) return
  const target = { url: window.webContents.getURL(), destroyed: false }
  if (!canPush(target, TRUSTED_ORIGIN, originOf)) return
  window.webContents.send(channel, payload)
}

const engine = new EngineSupervisor({
  onEvent: (event) => send(PUSH.engineEvent, event),
  onStatus: (status: EngineStatus) => send(PUSH.engineStatus, status),
  onStderr: (line) => console.error(`[rinari-engine] ${line}`),
  resourceDir: process.resourcesPath,
  packaged: app.isPackaged,
})

const notifications = createNotifications({
  onActivate: (target) => send(PUSH.notificationActivated, target),
  focusWindow: () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  },
})

/** Sirve el renderer construido desde el esquema propio. */
function registerAppScheme(root: string): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const resolved = resolveAppUrl(request.url, root)
    if (!resolved.ok) return new Response('Not found', { status: 404 })
    try {
      const body = await readFile(resolved.path)
      return new Response(body, { headers: { 'Content-Type': contentTypeFor(resolved.path) } })
    } catch {
      // Una ruta de la SPA que no existe como fichero ya cayó en index.html;
      // lo que llegue aquí sin fichero es un 404 honesto.
      return new Response('Not found', { status: 404 })
    }
  })
}

function buildServices(): HostServices {
  const getWindow = () => mainWindow
  return {
    engine: {
      status: () => engine.status(),
      start: () => engine.start(),
      shutdown: () => engine.shutdown(),
      restart: () => engine.restart(),
      // El renderer llama por nombre de comando; el Engine habla por método
      // del protocolo y con otras claves. Sin traducir, ninguna llamada de
      // dominio llegaría a su destino.
      request: (name, params) => {
        const call = translateCommand(name, params ?? {})
        return engine.request(call.method, call.params)
      },
    },
    window: {
      minimize: () => getWindow()?.minimize(),
      toggleMaximize: () => {
        const window = getWindow()
        if (!window) return
        if (window.isMaximized()) window.unmaximize()
        else window.maximize()
      },
      requestClose: () => getWindow()?.close(),
      clampToWorkArea: async () => {
        const window = getWindow()
        if (window) clampToWorkArea(window)
      },
    },
    dialog: createDialogs(getWindow),
    opener: createOpener(),
    files: {
      /**
       * Port de `workspace_file_open` (documento 02 §6.2): **primero** el
       * Engine valida la raíz y la procedencia del turno, y solo se abre la
       * ruta que devuelve. Nunca `shell.openPath(rutaDelRenderer)`.
       */
      async openExternal(request) {
        const call = translateCommand('workspace_file_read', {
          session_id: request.session_id,
          path: request.path,
          turn_id: request.turn_id,
        })
        const preview = (await engine.request(call.method, call.params)) as { path?: unknown }
        const approved = typeof preview?.path === 'string' ? preview.path : null
        if (!approved) throw new EngineCommandError('ENGINE_ERROR', 'Engine returned no file path')
        const failure = await shell.openPath(approved)
        if (failure) throw new EngineCommandError('HOST_ERROR', failure)
      },
    },
    contextMenu: createContextMenu(getWindow, (id) => send(PUSH.contextMenuAction, id)),
    notifications,
    updates: createUpdates(),
    handoff: { initial: () => parseOpenRequest(process.argv, app.isPackaged ? 1 : 2) },
  }
}

/**
 * Salida de la aplicación (§4.3 y documento 04 §3.3).
 *
 * Una sola autoridad para el botón X, el menú Salir, `Cmd+Q`/`Alt+F4` y
 * `app.quit()`: se pregunta **antes** de detener el Engine, y cancelar no
 * toca nada. Antes había dos rutas y la de `before-quit` cerraba el Engine
 * antes del diálogo.
 */
const quitCoordinator = new QuitCoordinator({
  // Aproximación deliberada: saber si hay trabajo realmente activo exige
  // preguntárselo al Engine. Mientras tanto se pregunta siempre que esté en
  // marcha, que peca de prudente en vez de matar un turno en silencio.
  shouldConfirm: () => engine.status().state === 'ready',
  async confirm() {
    const target = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
    const options = {
      type: 'question' as const,
      buttons: ['Cerrar Rinari', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
      message: '¿Cerrar Rinari Agent?',
      detail:
        'El Engine se detendrá. Los turnos en ejecución se interrumpen y los procesos administrados se cierran.',
    }
    const { response } = target
      ? await dialog.showMessageBox(target, options)
      : await dialog.showMessageBox(options)
    return response === 0
  },
  shutdown: () => engine.shutdown().then(() => undefined),
  commit() {
    unregisterIpc?.()
    unregisterIpc = null
    app.quit()
  },
  onShutdownError(error, reason) {
    // Ni se fuerza la salida ni se oculta: queda registrado y se puede
    // reintentar, en vez de terminar con el Engine a medio cerrar.
    console.error(`[rinari] el cierre del Engine falló (${reason}):`, error)
  },
})

function openWindow(): void {
  const preloadPath = join(__dirname, 'preload.cjs')
  const startUrl = DEV_SERVER ?? `${APP_ORIGIN}/index.html`

  mainWindow = createMainWindow({
    preloadPath,
    startUrl,
    trustedOrigin: TRUSTED_ORIGIN,
    cspMode: isDev ? 'development' : 'production',
    onState: (state) => send(PUSH.windowState, state),
    onCloseRequested: () => {
      // El manejador de ventana no detiene el Engine por su cuenta: delega.
      void quitCoordinator.requestQuit('window-close')
    },
    isQuitCommitted: () => quitCoordinator.isCommitted(),
  })

  registry.trust(mainWindow.webContents.id)
  handoff.open((request: OpenRequest) => send(PUSH.openRequest, request))

  // La autorización es del contenido: si navega fuera, se revoca hasta que
  // vuelva a cargarse el origen propio.
  mainWindow.webContents.on('did-navigate', (_event, url) => {
    // La autorización es del contenido: se conserva solo mientras siga en el
    // origen de confianza, sea el esquema propio o el dev server.
    // `originOf` resuelve también el esquema propio, cuyo `URL.origin` es
    // la cadena "null" por no ser un esquema especial.
    if (originOf(url) === TRUSTED_ORIGIN) registry.trust(mainWindow!.webContents.id)
    else registry.revoke()
  })

  mainWindow.on('closed', () => {
    registry.revoke()
    handoff.close()
    mainWindow = null
  })

  if (process.env.RINARI_SMOKE) attachSmoke(mainWindow)
  if (process.env.RINARI_PARITY) attachParityProbe(mainWindow)
}

/**
 * Cierra el Engine antes de terminar una sonda.
 *
 * `app.exit()` salta el ciclo de vida normal: el host muere y su hijo se
 * queda vivo con el home temporal sujeto. Por eso el cierre es explícito,
 * sin diálogo, y solo después se sale.
 */
async function finishProbe(code: number): Promise<void> {
  const ok = await quitCoordinator.shutdownWithoutPrompt('parity')
  app.exit(ok ? code : 1)
}

/**
 * Sonda de paridad (documento 02 §8): arranca el Engine **real** desde el host
 * y ejercita un corte transversal de los doce módulos de comandos por el
 * camino completo —renderer, preload, IPC validado, traducción y protocolo—.
 *
 * Es lo que distingue «la app abre» de «la app habla con el Engine». Lo
 * ejecuta el renderer, no el main, para que ningún atajo se salte el puente.
 */
function attachParityProbe(window: BrowserWindow): void {
  window.webContents.on('did-finish-load', () => {
    void window.webContents
      // La sonda vive en el renderer y usa `engineApi`/`desktopApi`: así
      // recorre `src/services` y `src/platform`, que es justo el tramo que
      // una llamada directa a `window.rinariDesktop` se saltaba.
      .executeJavaScript('window.__rinariParityProbe ? window.__rinariParityProbe() : Promise.resolve({ error: "probe not registered" })')
      .then((report: Record<string, unknown>) => {
        console.log(`RINARI_PARITY ${JSON.stringify(report)}`)
        void finishProbe(0)
      })
      .catch((error: unknown) => {
        console.log(`RINARI_PARITY ${JSON.stringify({ error: String(error) })}`)
        void finishProbe(1)
      })
  })
}

/**
 * Smoke de arranque (documento 02 §8): comprueba que el host abre de verdad y
 * que el renderer carga por el esquema propio con el puente puesto, y termina.
 * No sustituye a la matriz de paridad; solo evita declarar «Electron funciona»
 * porque el proceso no se cayó.
 */
function attachSmoke(window: BrowserWindow): void {
  const report = (ok: boolean, detail: Record<string, unknown>) => {
    console.log(`RINARI_SMOKE ${JSON.stringify({ ok, ...detail })}`)
    void finishProbe(ok ? 0 : 1)
  }
  window.webContents.on('did-fail-load', (_event, code, description, url) => {
    report(false, { stage: 'load', code, description, url })
  })
  window.webContents.on('did-finish-load', () => {
    void window.webContents
      .executeJavaScript(
        `({
           bridge: typeof window.rinariDesktop,
           commands: typeof window.rinariDesktop?.command,
           leaked: typeof window.require !== 'undefined' || typeof window.process !== 'undefined',
           origin: window.location.origin,
           root: Boolean(document.getElementById('root')),
         })`,
      )
      .then((probe: Record<string, unknown>) => {
        const ok = probe.bridge === 'object' && probe.commands === 'function' && probe.leaked === false
        report(ok, { stage: 'renderer', ...probe, engine: engine.status().state })
      })
      .catch((error: unknown) => report(false, { stage: 'probe', error: String(error) }))
  })
}

// Una sola instancia: la segunda entrega su handoff y enfoca a la primera.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    handoff.push(parseOpenRequest(argv, app.isPackaged ? 1 : 2))
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  void app.whenReady().then(() => {
    if (!isDev) registerAppScheme(rendererRoot())
    Menu.setApplicationMenu(
      buildApplicationMenu({
        getWindow: () => mainWindow,
        onAction: (id) => send(PUSH.menuAction, id),
        // El menú entra por la misma autoridad que el resto.
        onQuit: () => void quitCoordinator.requestQuit('menu'),
      }),
    )
    unregisterIpc = registerIpc(registry, buildServices())
    handoff.push(parseOpenRequest(process.argv, app.isPackaged ? 1 : 2))
    openWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) openWindow()
    })
  })

  // En macOS cerrar la última ventana no termina la aplicación: se conserva
  // esa semántica y `activate` vuelve a abrirla.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') void quitCoordinator.requestQuit('window-all-closed')
  })

  app.on('before-quit', (event) => {
    // Ya confirmado: se deja pasar, o habría un bucle salir → cerrar → salir.
    if (quitCoordinator.isCommitted()) return
    event.preventDefault()
    void quitCoordinator.requestQuit('app')
  })
}
