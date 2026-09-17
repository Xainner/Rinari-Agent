/**
 * Proceso principal de Rinari Agent bajo Electron (documento 02).
 *
 * Aquí se monta el host y nada más: ventanas, IPC validado, supervisión del
 * Engine y servicios de escritorio. Las sesiones, turnos, políticas,
 * herramientas y proveedores siguen siendo del Engine Python.
 */

import { app, protocol, BrowserWindow, dialog } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { APP_ORIGIN, APP_SCHEME, contentTypeFor, resolveAppUrl } from './appScheme'
import { EngineSupervisor } from './engine/EngineSupervisor'
import { registerIpc, type HostServices } from './ipc/register'
import { SenderRegistry } from './ipc/validateSender'
import { HandoffQueue, parseOpenRequest } from './native/handoff'
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
const registry = new SenderRegistry(APP_ORIGIN)
const handoff = new HandoffQueue()

function send(channel: string, payload: unknown): void {
  // Solo al renderer registrado: nunca a un webContents cualquiera.
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

const engine = new EngineSupervisor({
  onEvent: (event) => send(PUSH.engineEvent, event),
  onStatus: (status: EngineStatus) => send(PUSH.engineStatus, status),
  onStderr: (line) => console.error(`[rinari-engine] ${line}`),
  resourceDir: process.resourcesPath,
  packaged: app.isPackaged,
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
      request: (method, params) => engine.request(method, params),
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
    contextMenu: createContextMenu(getWindow, (id) => send(PUSH.contextMenuAction, id)),
    updates: createUpdates(),
    handoff: { initial: () => parseOpenRequest(process.argv, app.isPackaged ? 1 : 2) },
  }
}

/**
 * Cierre con trabajo activo (§4.3 y documento 04 §3.3): se pregunta en vez de
 * matar turnos en marcha. Cerrar de verdad detiene los recursos del host; no
 * se introduce un daemon nuevo en esta migración.
 */
async function confirmClose(window: BrowserWindow): Promise<void> {
  // Aproximación deliberada: saber si hay trabajo realmente activo exige
  // preguntárselo al Engine. Mientras tanto se pregunta siempre que esté en
  // marcha, que peca de prudente en vez de matar un turno en silencio.
  if (engine.status().state === 'ready') {
    const { response } = await dialog.showMessageBox(window, {
      type: 'question',
      buttons: ['Cerrar Rinari', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
      message: '¿Cerrar Rinari Agent?',
      detail:
        'El Engine se detendrá. Los turnos en ejecución se interrumpen y los procesos administrados se cierran.',
    })
    if (response !== 0) return
  }
  await engine.shutdown()
  window.destroy()
}

function openWindow(): void {
  const preloadPath = join(__dirname, 'preload.cjs')
  const startUrl = DEV_SERVER ?? `${APP_ORIGIN}/index.html`

  mainWindow = createMainWindow({
    preloadPath,
    startUrl,
    extraAllowedOrigin: DEV_SERVER,
    onState: (state) => send(PUSH.windowState, state),
    onCloseRequested: (window) => {
      void confirmClose(window)
    },
  })

  registry.trust(mainWindow.webContents.id)
  handoff.open((request: OpenRequest) => send(PUSH.openRequest, request))

  // La autorización es del contenido: si navega fuera, se revoca hasta que
  // vuelva a cargarse el origen propio.
  mainWindow.webContents.on('did-navigate', (_event, url) => {
    if (url.startsWith(APP_ORIGIN) || (DEV_SERVER && url.startsWith(DEV_SERVER))) {
      registry.trust(mainWindow!.webContents.id)
    } else {
      registry.revoke()
    }
  })

  mainWindow.on('closed', () => {
    registry.revoke()
    handoff.close()
    mainWindow = null
  })

  if (process.env.RINARI_SMOKE) attachSmoke(mainWindow)
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
    setTimeout(() => app.exit(ok ? 0 : 1), 50)
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
    unregisterIpc = registerIpc(registry, buildServices())
    handoff.push(parseOpenRequest(process.argv, app.isPackaged ? 1 : 2))
    openWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) openWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    unregisterIpc?.()
    unregisterIpc = null
    void engine.shutdown()
  })
}
