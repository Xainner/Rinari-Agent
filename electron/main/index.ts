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
import { BrowserRegistry } from './browser/BrowserRegistry'
import { isHostChannelEvent, isNavigableUrl } from './browser/operations'
import { ViewLayoutCoordinator } from './browser/ViewLayoutCoordinator'
import { ENGINE_BROKER_CAPABILITY, NativeBrowserHost } from './browser/NativeBrowserHost'
import { EngineCommandError, EngineSupervisor } from './engine/EngineSupervisor'
import { translateCommand } from './engine/translateCommand'
import { registerIpc, type HostServices } from './ipc/register'
import { SenderRegistry, originOf } from './ipc/validateSender'
import { canPush } from './ipc/pushGuard'
import { QuitCoordinator } from './lifecycle/QuitCoordinator'
import { defaultMigrationDirectory, MigrationService } from './migration/MigrationService'
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
const migration = new MigrationService(defaultMigrationDirectory())

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

/**
 * Host del browser nativo (documento 03 §5, §6). Se construye tarde porque
 * necesita la ventana; hasta entonces, `browserHost` es `null` y los eventos
 * del Engine siguen su camino normal.
 */
let browserHost: NativeBrowserHost | null = null
let browserRegistry: BrowserRegistry | null = null
let layoutCoordinator: ViewLayoutCoordinator | null = null
/** Observadores de eventos del Engine; sólo los usa la prueba vertical. */
const engineEventTaps = new Set<(event: Record<string, unknown>) => void>()

const engine = new EngineSupervisor({
  onEvent: (event) => {
    // El canal privado del broker se descarta **antes** de mirar si hay host.
    // El §5.4 prohíbe entregar esas solicitudes a `runtimeStore`/React, y eso
    // vale también cuando llegan antes de que exista la ventana: sin esta
    // comprobación, un frame privado en ese hueco acababa en el renderer.
    if (isHostChannelEvent(event)) {
      browserHost?.handleEngineEvent(event)
      return
    }
    // Una transición de control ya confirmada: main aplica la barrera aquí y
    // no al pedirla, porque el Engine la resuelve en un worker (§7).
    const frame = event as { event?: unknown; payload?: Record<string, unknown> }
    if (frame.event === 'browser.control.changed' && frame.payload) {
      const sessionId = frame.payload.session_id
      const state = frame.payload.control_state
      if (typeof sessionId === 'string' && typeof state === 'string') {
        browserHost?.applyControl(sessionId, state)
      }
    }
    for (const tap of engineEventTaps) tap(event as unknown as Record<string, unknown>)
    send(PUSH.engineEvent, event)
  },
  onStatus: (status: EngineStatus) => {
    send(PUSH.engineStatus, status)
    // Dejar de estar listo revoca el binding. Sin esto, reiniciar el Engine
    // sin cerrar la ventana dejaba `registered` en `true` para siempre y la
    // instancia nueva no se registraba nunca.
    if (status.state !== 'ready') {
      browserHost?.onEngineLost(status.state)
    }
    // El binding se pide cuando hay Engine listo, no al abrir la ventana: el
    // registro sólo significa algo contra una instancia viva, y un Engine que
    // se reinicia acuña una nueva (§5.2).
    //
    // Se comprueba la capability antes de llamar: un Engine antiguo se degrada
    // al visor de capturas y **no** recibe métodos desconocidos una y otra vez.
    if (
      status.state === 'ready' &&
      browserHost &&
      !browserHost.registered &&
      status.capabilities[ENGINE_BROKER_CAPABILITY] === true
    ) {
      void browserHost.register()
    }
  },
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

/**
 * Avisa al renderer de que el contexto de una sesión cambió.
 *
 * Se empuja en vez de sondear: el §10 limita el poll al visor de capturas, y
 * el nativo no necesita ninguno.
 */
function publishBrowserContext(sessionId: string): void {
  void engine
    .request('browser.context.get', { session_id: sessionId })
    .then((view) => send(PUSH.browserContextChanged, view))
    .catch(() => {
      // Un Engine que aún no responde no puede tumbar la UI.
    })
}

/**
 * Esconde la vista nativa de una sesión. El contexto sigue vivo (§8.3).
 *
 * Se llama desde los dos sitios donde el panel deja de estar: cuando el
 * renderer suelta su slot, y cuando el renderer entero desaparece sin llegar a
 * soltarlo.
 */
function retirePresentation(sessionId: string): void {
  const context = browserRegistry?.contextForSession(sessionId)
  if (context) browserRegistry?.hidePresentation(context)
}

/**
 * Servicios del browser nativo (documento 03 §6.1).
 *
 * Todo lo que el renderer puede pedir está aquí, y es intención: metadata,
 * presentación, pestaña, control y navegación. El broker, el debugger y los
 * identificadores del host no cruzan el puente.
 */
function browserServices(): HostServices['browser'] {
  /**
   * Una acción manual sobre la página sólo vale si manda el usuario (§7).
   *
   * Se comprueba **en main** y no sólo en React. El renderer deshabilita los
   * controles, pero eso es presentación: la autoridad no puede estar en el
   * lado que se puede modificar. El estado que se mira es el que el Engine
   * confirmó, que es el mismo que hace cumplir el arbitraje del otro lado.
   */
  const requireUserControl = (context: { control: string }, what: string) => {
    if (context.control === 'user') return
    throw Object.assign(
      new Error(`${what} needs manual control of this browser; take control first`),
      { code: 'BROWSER_CONTROL_REQUIRED' },
    )
  }

  const requireContext = (sessionId: string) => {
    const context = browserRegistry?.contextForSession(sessionId)
    if (!context) throw Object.assign(new Error('this session has no browser context'), {
      code: 'BROWSER_ABSENT',
    })
    return context
  }

  return {
    // Consulta sin efectos: mirar el estado desde la UI no abre un navegador.
    context: (sessionId) => engine.request('browser.context.get', { session_id: sessionId }),

    // Creación explícita. La vista nace en blanco; la primera navegación la
    // pide el usuario o una herramienta.
    prepare: async (sessionId) => {
      const view = await engine.request('browser.context.prepare', { session_id: sessionId })
      const context = browserRegistry?.ensureContext(sessionId)
      if (context && context.order.length === 0) {
        const target = browserRegistry!.createTarget(context)
        await target.view.webContents.loadURL('about:blank')
        await browserRegistry!.attach(target)
        browserHost?.publishTargets(context.contextId)
      }
      return view
    },

    attachSlot: async (sessionId) => {
      if (!layoutCoordinator) throw new Error('the window is not ready')
      const lease = layoutCoordinator.attach(sessionId)
      return { slot_id: lease.slotId, session_id: lease.sessionId }
    },

    updateSlot: async (request) => {
      if (!layoutCoordinator || !browserRegistry) return
      const outcome = layoutCoordinator.update(request.slot_id, {
        logicalBounds: request.logical_bounds,
        visibleBounds: request.visible_bounds,
        shown: request.shown,
        layoutRevision: request.layout_revision,
        overlayDepth: request.overlay_depth,
        occlusions: request.occlusions,
      })
      // Una geometría rechazada —atrasada, fuera de la ventana, imposible— se
      // descarta en silencio: es una actualización perdida, no un error que
      // deba romper el render del panel.
      if (!outcome.ok) return
      const context = browserRegistry.contextForSession(outcome.lease.sessionId)
      if (context) browserRegistry.setGeometry(context, outcome.resolved)
    },

    // Retirar el slot **sólo** quita la presentación: ni cierra el contexto,
    // ni el browser, ni cancela el turno (§8.3).
    //
    // Y quitarla de verdad: antes esto sólo soltaba el lease, así que cerrar el
    // panel o cambiar a Archivos dejaba la vista nativa pintada encima de la
    // aplicación, tapando lo que hubiera debajo y comiéndose su input.
    detachSlot: async (slotId) => {
      const lease = layoutCoordinator?.detach(slotId)
      if (lease) retirePresentation(lease.sessionId)
    },

    // La elección del usuario la aplica main y se publica al Engine, para que
    // su target por defecto sea el que se ve.
    selectTarget: async (sessionId, targetId) => {
      const context = requireContext(sessionId)
      // Y exige el control, aunque no toque el DOM. Antes no lo hacía —«elegir
      // pestaña es del usuario»—, pero una operación del agente sin
      // `target_id` va a la **activa**: cambiarla mientras manda el agente le
      // redirige la siguiente herramienta a otra página sin que nadie lo
      // arbitre. Eso es una mutación concurrente aunque no lo parezca.
      requireUserControl(context, 'switching tabs')
      if (!browserRegistry!.setActiveTarget(context, targetId)) {
        throw Object.assign(new Error('no such page in this context'), { code: 'NOT_FOUND' })
      }
      browserHost?.publishTargets(context.contextId)
      publishBrowserContext(sessionId)
      return { active_target_id: targetId }
    },

    setControl: (sessionId, owner, expectedRevision) => {
      if (!browserHost) throw new Error('the browser host is not ready')
      return browserHost.setControl(sessionId, owner, expectedRevision)
    },

    // Navegación de la toolbar: es del usuario sobre su propia página, no una
    // herramienta del agente. Se cierra el esquema igual que para el contenido
    // remoto (§9) y se opera sobre la pestaña visible.
    navigate: async (sessionId, url) => {
      if (!isNavigableUrl(url)) {
        throw Object.assign(new Error(`the desktop browser will not navigate to ${url}`), {
          code: 'INVALID_ARGUMENT',
        })
      }
      const context = requireContext(sessionId)
      // Navegar la página que el agente está usando es la mutación más grande
      // que hay: se lleva por delante el DOM entero. Requiere el control.
      requireUserControl(context, 'navigating')
      const entry = browserRegistry!.target(context.contextId, null)
      if (!entry) throw Object.assign(new Error('this context has no page'), { code: 'NOT_FOUND' })
      await browserRegistry!.attach(entry)
      await entry.view.webContents.loadURL(url)
      browserHost?.publishTargets(context.contextId)
      publishBrowserContext(sessionId)
      return { url }
    },

    preview: (sessionId) => browserHost?.preview(sessionId) ?? Promise.resolve(null),
    diagnostics: () => ({ layoutSlots: layoutCoordinator?.size ?? 0 }),
  }
}

function buildServices(): HostServices {
  const getWindow = () => mainWindow
  return {
    browser: browserServices(),
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
    migration,
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

  // El browser nativo cuelga de esta ventana: sus vistas son hijas de su
  // contenido, así que nace y muere con ella (§6.2, [E8]).
  // El coordinador acota la geometría al contenido de **esta** ventana: el
  // renderer pide un slot para su sesión, no coordenadas arbitrarias.
  layoutCoordinator = new ViewLayoutCoordinator(() => {
    const size = mainWindow?.getContentBounds() ?? { width: 0, height: 0 }
    return { width: size.width, height: size.height }
  })
  browserRegistry = new BrowserRegistry({
    window: mainWindow,
    onEvent: (event) =>
      browserHost?.notify(event.kind, event.contextId, event.targetId, event.detail),
  })
  browserHost = new NativeBrowserHost({
    registry: browserRegistry,
    request: (method, params) => engine.request(method, params),
    onError: (message, detail) => console.error(`[rinari-browser] ${message}`, detail ?? ''),
    onContextChanged: (sessionId) => publishBrowserContext(sessionId),
    focusTrustedRenderer: () => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      mainWindow.webContents.focus()
    },
  })

  // La autorización es del contenido: si navega fuera, se revoca hasta que
  // vuelva a cargarse el origen propio.
  mainWindow.webContents.on('did-navigate', (_event, url) => {
    // La autorización es del contenido: se conserva solo mientras siga en el
    // origen de confianza, sea el esquema propio o el dev server.
    // `originOf` resuelve también el esquema propio, cuyo `URL.origin` es
    // la cadena "null" por no ser un esquema especial.
    if (originOf(url) === TRUSTED_ORIGIN) registry.trust(mainWindow!.webContents.id)
    else registry.revoke()

    // El renderer que reservó los slots ya no es el de antes. Una recarga no
    // ejecuta la limpieza de React, así que nadie soltaría esos leases y las
    // vistas nativas se quedarían compuestas sobre una página que ya no las
    // reserva. Se retiran aquí; si el panel vuelve a montarse pedirá su slot y
    // publicará geometría nueva.
    for (const lease of layoutCoordinator?.detachAll() ?? []) retirePresentation(lease.sessionId)
  })

  mainWindow.on('closed', () => {
    registry.revoke()
    handoff.close()
    // Cerrar la ventana no libera las vistas agregadas por sí solo (§6.2,
    // [E8]): se desmontan aquí, y el Engine se entera de que su host se fue.
    browserRegistry?.disposeAll()
    void browserHost?.unregister()
    browserHost = null
    browserRegistry = null
    layoutCoordinator = null
    mainWindow = null
  })

  if (process.env.RINARI_SMOKE) attachSmoke(mainWindow)
  if (process.env.RINARI_PARITY) attachParityProbe(mainWindow)
  if (process.env.RINARI_BROWSER_VERTICAL) attachVerticalProof()
}

/**
 * Prueba vertical del browser (documento 03 §3). Corre en main porque cada
 * paso se comprueba mirando la vista nativa, no el resultado de la
 * herramienta: que una tool devuelva `ok` no demuestra que cambiara la página
 * que el usuario tiene delante.
 */
function attachVerticalProof(): void {
  const fixtureUrl = process.env.RINARI_BROWSER_FIXTURE
  const modelOrigin = process.env.RINARI_BROWSER_MODEL
  const window = mainWindow
  if (!fixtureUrl || !modelOrigin || !browserRegistry || !browserHost || !window) {
    console.log(
      `RINARI_BROWSER_VERTICAL ${JSON.stringify({
        steps: [],
        fatal: 'faltan el fixture, el modelo falso o el host del browser',
      })}`,
    )
    void finishProbe(1)
    return
  }

  void import('./browser/verticalProbe')
    .then(({ runVerticalProof }) =>
      runVerticalProof({
        engine,
        registry: browserRegistry!,
        host: browserHost!,
        onEngineEvent: (listener) => {
          engineEventTaps.add(listener)
          return () => engineEventTaps.delete(listener)
        },
        fixtureUrl,
        modelOrigin,
        window,
        // Los mismos servicios que invoca el IPC del renderer, no una copia de
        // su lógica: la presentación se reserva y se retira por donde la pide
        // el panel de verdad.
        services: browserServices(),
        physicalClick: physicalClicker(),
        physicalType: physicalTyper(),
        renderer: {
          evaluate: <T>(code: string) => window.webContents.executeJavaScript(code, true) as Promise<T>,
        },
      }),
    )
    .then((report) => {
      console.log(`RINARI_BROWSER_VERTICAL ${JSON.stringify(report)}`)
      endVerticalProof(report.summary.failed === 0 ? 0 : 1)
    })
    .catch((error: unknown) => {
      console.log(`RINARI_BROWSER_VERTICAL ${JSON.stringify({ steps: [], fatal: String(error) })}`)
      endVerticalProof(1)
    })
}

/**
 * Click real del sistema para la prueba de click-through, cuando la
 * plataforma lo permite. El script lo aporta el runner.
 */
function physicalClicker(): ((x: number, y: number, text?: string) => Promise<void>) | undefined {
  const script = process.env.RINARI_PROBE_PS1
  if (process.platform !== 'win32' || !script) return undefined
  return (x, y, text) =>
    new Promise<void>((resolve, reject) => {
      void import('node:child_process').then(({ execFile }) => {
        execFile(
          'powershell.exe',
          [
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
            '-X', `${x}`, '-Y', `${y}`,
            ...(text ? ['-Text', text] : []),
          ],
          (error) => (error ? reject(error) : resolve()),
        )
      })
    })
}

/** Tecleo real sobre el foco actual, sin introducir un click que lo cambie. */
function physicalTyper(): ((text: string) => Promise<void>) | undefined {
  const script = process.env.RINARI_PROBE_PS1
  if (process.platform !== 'win32' || !script) return undefined
  return (text) =>
    new Promise<void>((resolve, reject) => {
      void import('node:child_process').then(({ execFile }) => {
        execFile(
          'powershell.exe',
          [
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
            '-NoClick', '-Text', text,
          ],
          (error) => (error ? reject(error) : resolve()),
        )
      })
    })
}

/**
 * Termina la prueba vertical sin quedarse colgada **y sin mentir**.
 *
 * Antes el plazo forzaba `app.exit(code)` con el mismo código, así que una
 * limpieza que no terminaba salía igualmente con éxito: el contrato de
 * lifecycle del PR #9 quedaba sin comprobar justo en el caso que importa. Si
 * hay que forzar, se sale con fallo y se dice.
 */
function endVerticalProof(code: number): void {
  browserRegistry?.disposeAll()
  const forced = setTimeout(() => {
    console.error('RINARI_BROWSER_VERTICAL_CLEANUP timeout')
    app.exit(1)
  }, 15_000)
  void finishProbe(code).finally(() => clearTimeout(forced))
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
