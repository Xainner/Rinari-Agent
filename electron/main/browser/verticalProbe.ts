/**
 * Prueba vertical del browser nativo (documento 03 §3).
 *
 * Los ocho pasos del §3, con un Engine real, el pipeline real de herramientas
 * y policy, y un modelo falso que sirve llamadas a herramienta guionizadas. Lo
 * único fingido es **qué pide el modelo**; el adaptador del proveedor, el
 * bucle de turno, la policy y la ejecución de herramientas son los de
 * producción, que es lo que pide el §3 al decir que la prueba «no depende de
 * que un LLM produzca casualmente el comando correcto».
 *
 * Corre en main a propósito: cada paso se comprueba mirando **la vista
 * nativa**, no lo que diga el resultado de la herramienta. Que
 * `browser.fill` devuelva `ok` no demuestra que el DOM cambiara en la página
 * que el usuario tiene delante, y eso es justo lo que el §1 exige demostrar.
 */

import { readdirSync, rmSync } from 'node:fs'
import { basename, resolve as resolvePath } from 'node:path'

import type { WebContentsView } from 'electron'

import type { BrowserRegistry } from './BrowserRegistry'
import type { NativeBrowserHost } from './NativeBrowserHost'

export type StepStatus = 'ok' | 'failed' | 'skipped'

export interface StepResult {
  id: string
  title: string
  status: StepStatus
  detail: string
  evidence?: unknown
}

/** Una herramienta y cómo terminó: `completed`, `failed` o `cancelled`. */
type ToolOutcome = Record<string, unknown> & { outcome: string }

export interface VerticalDeps {
  engine: {
    start(): Promise<unknown>
    restart(): Promise<unknown>
    request(method: string, params?: unknown, timeoutMs?: number): Promise<unknown>
  }
  registry: BrowserRegistry
  host: Pick<NativeBrowserHost, 'registered' | 'bindingId' | 'diagnostics'>
  /** Se registra un observador de eventos del Engine y se devuelve su retirada. */
  onEngineEvent(listener: (event: Record<string, unknown>) => void): () => void
  fixtureUrl: string
  modelOrigin: string
  /**
   * La ventana que aloja las vistas. Chromium no entrega input sintético a un
   * widget que considera oculto, así que la prueba necesita poder mostrarla y
   * decir en qué estado estaba.
   */
  window: {
    show(): void
    focus(): void
    isVisible(): boolean
    isMinimized(): boolean
    getBounds(): { x: number; y: number; width: number; height: number }
    getContentBounds(): { x: number; y: number; width: number; height: number }
  }
  /**
   * Los servicios que el IPC del renderer invoca para reservar y soltar la
   * presentación. Se pasan los de verdad y no una reimplementación: el fallo
   * que motivó el paso V9 estaba justo en ese cableado —el lease se soltaba y
   * la vista se quedaba pintada—, así que una prueba que volviera a montar la
   * lógica a mano no lo habría visto.
   */
  services: {
    attachSlot(sessionId: string): Promise<{ slot_id: string; session_id: string }>
    updateSlot(request: {
      slot_id: string
      logical_bounds: { x: number; y: number; width: number; height: number }
      visible_bounds: { x: number; y: number; width: number; height: number }
      shown: boolean
      layout_revision: number
      overlay_depth: number
      occlusions?: Array<{ x: number; y: number; width: number; height: number }>
    }): Promise<void>
    detachSlot(slotId: string): Promise<void>
    setControl(
      sessionId: string,
      owner: 'agent' | 'user',
      expectedRevision?: number,
    ): Promise<unknown>
    diagnostics(): { layoutSlots: number }
  }
  /**
   * Click real del sistema. Sin él no se puede probar el click-through: una
   * entrada sintética va dirigida a un webContents y se salta el hit-testing,
   * así que daría por buena cualquier superposición.
   */
  physicalClick?: (x: number, y: number, text?: string) => Promise<void>
  /** Escritura física sobre el foco actual, sin moverlo con otro click. */
  physicalType?: (text: string) => Promise<void>
  /** Renderer real de Rinari para el gate de Sonner/WebContentsView. */
  renderer: {
    evaluate<T>(code: string): Promise<T>
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

/** Tamaño lógico del slot, en DIP. La captura sale en físicos (§8.2). */
const LOGICAL_SIZE = { width: 760, height: 560 }

export async function runVerticalProof(deps: VerticalDeps): Promise<{
  steps: StepResult[]
  summary: { total: number; ok: number; failed: number; skipped: number }
}> {
  const steps: StepResult[] = []
  const record = (result: StepResult) => {
    steps.push(result)
    console.log(`RINARI_BROWSER_STEP ${result.id} ${result.status}`)
    return result
  }

  // ── Observación de eventos del turno. Sin esto no se sabe si una herramienta
  //    corrió ni con qué resultado, y el veredicto se apoyaría en el texto
  //    final del modelo, que es lo que menos prueba.
  const events: Record<string, unknown>[] = []
  const call = (method: string, params?: unknown) => deps.engine.request(method, params)

  // Navegar es red saliente, así que la policy pide aprobación. La prueba es
  // del browser, no de la UX de permisos: se concede por sesión, igual que
  // haría el usuario, en vez de desactivar la policy —que además se saltaría
  // el pipeline real que el §3 exige ejercitar—.
  const approvals: string[] = []
  const stopListening = deps.onEngineEvent((event) => {
    events.push(event)
    if (event.event !== 'approval.requested') return
    const payload = event.payload as Record<string, unknown> | undefined
    const approvalId = payload?.approval_id
    if (typeof approvalId !== 'string') return
    approvals.push(approvalId)
    void call('approval.resolve', { approval_id: approvalId, decision: 'allow_session' }).catch(
      () => {
        // Una aprobación que ya expiró no es un fallo de la prueba.
      },
    )
  })

  /** Herramientas del browser que el guion va a usar. */
  const BROWSER_TOOLS = [
    'browser.navigate',
    'browser.snapshot',
    'browser.a11y',
    'browser.fill',
    'browser.click',
    'browser.screenshot',
    'browser.console',
    'browser.network',
    'browser.upload',
    'browser.download',
    'browser.evaluate',
    // Para V11: el agente escribe el fichero que va a subir, así la ruta pasa
    // por el mismo sandbox que después resuelve la subida.
    'fs.write',
  ]

  /**
   * Cambia el guion del modelo falso para el siguiente turno.
   *
   * Cada guion empieza activando las herramientas del browser: son de origen
   * lazy y no están expuestas al modelo hasta que alguien las pide. Eso es
   * parte del pipeline real —el §3 pide ejercitarlo, no esquivarlo—, así que
   * el modelo falso hace lo mismo que haría uno de verdad.
   */
  const script = async (entries: unknown[]) => {
    const withActivation = [
      { tool: 'capability.activate', args: { names: BROWSER_TOOLS, scope: 'session' } },
      ...entries,
    ]
    const response = await fetch(`${deps.modelOrigin}/__script`, {
      method: 'POST',
      body: JSON.stringify(withActivation),
    })
    if (!response.ok) throw new Error(`no se pudo fijar el guion: ${response.status}`)
  }

  /** Lanza un turno y espera a su estado terminal. */
  const runTurn = async (sessionId: string, text: string, timeoutMs = 60_000) => {
    const before = events.length
    await call('session.turn.start', { session_id: sessionId, message: text })
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const slice = events.slice(before)
      const terminal = slice.find((entry) => {
        const name = entry.event
        return name === 'turn.completed' || name === 'turn.failed' || name === 'turn.cancelled'
      })
      if (terminal) {
        return {
          terminal: String(terminal.event),
          // Por qué terminó así. Sin esto, un turno que falla antes de llamar
          // al modelo sólo dice «turn.failed» y no se distingue de uno cuyas
          // herramientas fallaron.
          terminalDetail: JSON.stringify(terminal.payload ?? {}).slice(0, 400),
          // Los tres finales de una herramienta. Mirar sólo `tool.completed`
          // hacía pasar por «no se ejecutó» un rechazo, que llega como
          // `tool.failed` y es justo lo que algunos pasos quieren comprobar.
          tools: slice
            .filter(
              (entry) =>
                entry.event === 'tool.completed' ||
                entry.event === 'tool.failed' ||
                entry.event === 'tool.cancelled',
            )
            .map(
              (entry): ToolOutcome => ({
                ...(entry.payload as Record<string, unknown>),
                outcome: String(entry.event).slice('tool.'.length),
              }),
            ),
          // Traza compacta del turno: sin esto, un paso fallido sólo dice
          // «no pasó» y hay que volver a ejecutarlo para saber por qué.
          trace: slice
            .filter((entry) => String(entry.event ?? '').startsWith('tool.'))
            .map((entry) => {
              const payload = entry.payload as Record<string, unknown>
              return `${entry.event}:${payload?.tool ?? '?'}${
                payload?.ok === false ? `(${errorCodeOf(payload) ?? 'error'})` : ''
              }`
            }),
          names: [...new Set(slice.map((entry) => String(entry.event ?? '')))],
        }
      }
      await sleep(150)
    }
    throw new Error(`el turno no terminó en ${timeoutMs} ms`)
  }

  /** Inicia una herramienta, pide Stop cuando ya empezó y comprueba vida. */
  const stopDuring = async (
    sessionId: string,
    toolName: string,
    entries: unknown[],
    prompt: string,
    timeoutMs = 30_000,
  ) => {
    await script(entries)
    const before = events.length
    await call('session.turn.start', { session_id: sessionId, message: prompt })
    const startedDeadline = Date.now() + timeoutMs
    while (Date.now() < startedDeadline) {
      const started = events.slice(before).find((entry) => {
        const payload = entry.payload as Record<string, unknown> | undefined
        return entry.event === 'tool.started' && payload?.tool === toolName
      })
      if (started) break
      await sleep(20)
    }
    const stopAt = performance.now()
    const stopReply = await call('session.turn.cancel', { session_id: sessionId })
    const stopMs = performance.now() - stopAt
    const terminalDeadline = Date.now() + timeoutMs
    let terminal: Record<string, unknown> | undefined
    while (Date.now() < terminalDeadline) {
      terminal = events.slice(before).find((entry) =>
        ['turn.completed', 'turn.failed', 'turn.cancelled'].includes(String(entry.event)),
      )
      if (terminal) break
      await sleep(50)
    }
    await deps.engine.request('engine.info', {}, 5_000)
    return { stopMs, stopReply, terminal, slice: events.slice(before) }
  }

  /** Lee del webContents de la vista, que es la prueba de «la misma página». */
  const read = <T>(view: WebContentsView, expression: string) =>
    view.webContents.executeJavaScript(expression) as Promise<T>

  /**
   * Espera a que la vista produzca un fotograma de verdad.
   *
   * Un `sleep` fijo no sirve: Chromium no entrega input ni captura a una vista
   * que todavía no está compuesta, y cuánto tarda depende de la máquina y de
   * qué más esté pintando. Esperar a un `requestAnimationFrame` de la propia
   * página es la señal directa —sólo corre cuando el compositor la atiende— y
   * convierte una prueba intermitente en una que mide lo que dice medir.
   */
  const awaitPainted = async (view: WebContentsView, timeoutMs = 10_000) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        const painted = await read<boolean>(
          view,
          'new Promise((resolve) => requestAnimationFrame(() => resolve(true)))',
        )
        if (painted) return true
      } catch {
        // La página aún no puede evaluar; se reintenta.
      }
      await sleep(150)
    }
    return false
  }

  let sessionId = ''
  let secondSessionId = ''
  let view: WebContentsView | null = null

  try {
    // La ventana se muestra **antes** de crear ninguna vista. Chromium no
    // entrega input sintético a un widget que considera oculto, y una vista
    // añadida a una ventana que nunca se mostró nace en ese estado: el resto
    // de la prueba mediría entonces una página que no puede recibir clicks.
    const visibleAtStart = deps.window.isVisible()
    if (!visibleAtStart || deps.window.isMinimized()) deps.window.show()
    deps.window.focus()
    await sleep(800)

    // ── Preparación: Engine, proveedor, modelo y sesión.
    await deps.engine.start()
    for (let attempt = 0; attempt < 100 && !deps.host.registered; attempt += 1) await sleep(100)
    if (!deps.host.registered) throw new Error('el host del browser no llegó a registrarse')

    await call('provider.create', {
      alias: 'verticalfake',
      type: 'custom',
      auth_method: 'api-key',
      endpoint: `${deps.modelOrigin}/v1`,
      secret: 'sk-vertical-test',
    })
    await call('model.add', {
      provider: 'verticalfake',
      provider_model_id: 'fake-vertical',
      alias: 'verticalfake',
    })
    const created = (await call('session.create', { title: 'browser vertical' })) as {
      session: { id: string }
    }
    sessionId = created.session.id
    await call('session.permission.set', { ref: sessionId, permission_profile: 'full-access' })

    // ── Paso 1: Electron crea la vista con página en blanco y contexto
    //    registrado. Lo hace el host, no el Engine: es el orden del §3.
    const context = deps.registry.ensureContext(sessionId)
    deps.registry.setGeometry(context, {
      container: { x: 24, y: 120, width: 520, height: 380 },
      page: { x: 0, y: 0, width: LOGICAL_SIZE.width, height: LOGICAL_SIZE.height },
      visible: true,
    })
    const target = deps.registry.createTarget(context)
    view = target.view
    await view.webContents.loadURL('about:blank')
    await deps.registry.attach(target)
    const blankUrl = view.webContents.getURL()
    record({
      id: 'V1',
      title: 'Electron crea una WebContentsView en blanco con contexto de sesión registrado',
      status: blankUrl.startsWith('about:blank') && context.sessionId === sessionId ? 'ok' : 'failed',
      detail: `contexto de ${sessionId} con un target en ${blankUrl}`,
      evidence: { contextId: context.contextId, targetId: target.targetId, url: blankUrl },
    })

    // ── Paso 2: un turno del Engine navega al fixture por el backend nativo.
    await script([
      { tool: 'browser.navigate', args: { url: deps.fixtureUrl } },
      { text: 'navegado' },
    ])
    const navigated = await runTurn(sessionId, 'abre la página de prueba')
    await sleep(600)
    const urlAfter = view.webContents.getURL()
    const navigateTool = navigated.tools.find((tool) => tool.tool === 'browser.navigate')
    record({
      id: 'V2',
      title: 'Un turno del Engine navega al fixture mediante el backend nativo',
      status: urlAfter === deps.fixtureUrl && navigateTool?.ok === true ? 'ok' : 'failed',
      detail:
        urlAfter === deps.fixtureUrl
          ? `la vista que existía ya está en ${urlAfter}; no se creó otra`
          : `la vista quedó en ${urlAfter}, se esperaba ${deps.fixtureUrl}`,
      evidence: {
        turn: navigated.terminal,
        tool: navigateTool?.ok,
        url: urlAfter,
        trace: navigated.trace,
        events: navigated.names,
      },
    })

    const earlyNetwork = deps.registry.drainObserved(target, 'network', 1_000) as Array<{
      method?: string
      params?: { request?: { url?: string } }
    }>
    const sawInitialDocument = earlyNetwork.some(
      (event) =>
        event.method === 'Network.requestWillBeSent' &&
        event.params?.request?.url === deps.fixtureUrl,
    )
    record({
      id: 'V2d',
      title: 'Network observa el documento inicial desde antes de navegar',
      status: sawInitialDocument ? 'ok' : 'failed',
      detail: sawInitialDocument
        ? 'el request del documento inicial quedó en el buffer temprano'
        : 'el documento inicial se perdió antes de habilitar Network',
      evidence: { events: earlyNetwork.length, fixtureUrl: deps.fixtureUrl },
    })

    // ── BR-10: la página remota no hereda el preload privilegiado y tampoco
    //    puede navegar hacia el renderer interno de Rinari.
    const remoteBoundary = await read<{
      bridge: string
      require: string
      process: string
      popupBlocked: boolean
    }>(
      view,
      `({
        bridge: typeof window.rinariDesktop,
        require: typeof window.require,
        process: typeof window.process,
        popupBlocked: window.open('app://rinari/index.html') === null,
      })`,
    )
    const beforePrivilegedNavigation = view.webContents.getURL()
    await read(view, "location.href = 'app://rinari/index.html'; true").catch(() => false)
    await sleep(250)
    const afterPrivilegedNavigation = view.webContents.getURL()
    const isolated =
      remoteBoundary.bridge === 'undefined' &&
      remoteBoundary.require === 'undefined' &&
      remoteBoundary.process === 'undefined' &&
      remoteBoundary.popupBlocked &&
      beforePrivilegedNavigation === afterPrivilegedNavigation
    record({
      id: 'BR10',
      title: 'La página remota no alcanza Node, preload, broker ni app://rinari',
      status: isolated ? 'ok' : 'failed',
      detail: isolated
        ? 'sin rinariDesktop/require/process; popup y navegación al renderer privilegiado bloqueados'
        : 'la página remota observó una superficie privilegiada o cambió al renderer interno',
      evidence: { ...remoteBoundary, beforePrivilegedNavigation, afterPrivilegedNavigation },
    })

    // Sonda de vida entre pasos: si el loop de stdio se bloquea, conviene
    // saber tras qué turno, no sólo que se bloqueó.
    const liveness: Record<string, string> = {}
    const ping = async (label: string) => {
      try {
        await deps.engine.request('engine.info', {}, 5_000)
        liveness[label] = 'ok'
      } catch (error) {
        liveness[label] = message(error)
      }
    }
    await ping('tras-V2')
    record({
      id: 'V2b',
      title: 'El Engine sigue atendiendo su canal de control tras una operación de browser',
      status: liveness['tras-V2'] === 'ok' ? 'ok' : 'failed',
      detail:
        liveness['tras-V2'] === 'ok'
          ? 'responde a engine.info: la espera del broker no bloqueó el loop de stdio (§5.4)'
          : `no responde tras el turno del browser: ${liveness['tras-V2']}`,
    })

    // Control del mecanismo antes de culpar al Engine: un click por CDP
    // emitido aquí mismo sobre esta vista. Si tampoco llega, el problema es de
    // la vista o de la ventana, no del camino Engine → broker → host.
    view.webContents.focus()
    // Sin esto la prueba era intermitente: pulsaba antes de que la vista
    // estuviera compuesta y el click no llegaba a ninguna parte.
    const painted = await awaitPainted(view)
    const clicksAtStart = await read<number>(view, 'window.__probe.clicks')
    const fieldAtStart = await read<string>(view, "document.getElementById('field').value")
    if (deps.physicalClick) {
      const bounds = deps.window.getBounds()
      deps.window.show()
      deps.window.focus()
      await sleep(300)
      await deps.physicalClick(bounds.x + 24 + 80, bounds.y + 120 + 120, 'fisico-bloqueado')
      await sleep(300)
    }
    const clicksAfterPhysical = await read<number>(view, 'window.__probe.clicks')
    const fieldAfterPhysical = await read<string>(view, "document.getElementById('field').value")
    record({
      id: 'V2p',
      title: 'Con control del agente, mouse y teclado físicos no alcanzan la página',
      status: deps.physicalClick
        ? clicksAfterPhysical === clicksAtStart && fieldAfterPhysical === fieldAtStart
          ? 'ok'
          : 'failed'
        : 'skipped',
      detail: deps.physicalClick
        ? `clicks ${clicksAtStart} → ${clicksAfterPhysical}; campo sin cambios: ${fieldAfterPhysical === fieldAtStart}`
        : 'la síntesis física sólo está disponible en la sonda de Windows',
      evidence: { clicksAtStart, clicksAfterPhysical, fieldAtStart, fieldAfterPhysical },
    })
    const debug = view.webContents.debugger
    if (!debug.isAttached()) debug.attach('1.3')
    for (const type of ['mousePressed', 'mouseReleased'] as const) {
      await debug.sendCommand('Input.dispatchMouseEvent', {
        type,
        x: 40,
        y: 40,
        button: 'left',
        clickCount: 1,
      })
    }
    await sleep(300)
    const clicksAfterDirect = await read<number>(view, 'window.__probe.clicks')

    record({
      id: 'V2c',
      title: 'Un click por CDP sobre esta vista llega a la página',
      status: clicksAfterDirect > clicksAtStart ? 'ok' : 'failed',
      detail:
        clicksAfterDirect > clicksAtStart
          ? `el mecanismo funciona en esta ventana: ${clicksAtStart} → ${clicksAfterDirect}`
          : `ni siquiera un click directo llega (${clicksAtStart} → ${clicksAfterDirect}): el problema es de la vista o de la ventana, no del broker`,
      evidence: {
        clicksAtStart,
        clicksAfterDirect,
        painted,
        windowVisibleAtStart: visibleAtStart,
        windowVisibleNow: deps.window.isVisible(),
      },
    })

    // ── Paso 3: snapshot/a11y, llenar y hacer click. El cambio se ve en la
    //    misma vista, leído del webContents y no del resultado de la tool.
    const typed = `vertical-${Date.now()}`
    await script([
      { tool: 'browser.snapshot', args: {} },
      { tool: 'browser.fill', args: { selector: '#field', value: typed } },
      { tool: 'browser.click', args: { selector: '#go' } },
      { text: 'aplicado' },
    ])
    const mutated = await runTurn(sessionId, 'rellena el campo y pulsa aplicar')
    await sleep(400)
    const dom = await read<{ state: string | null; text: string; value: string }>(
      view,
      `({ state: document.getElementById('result').getAttribute('data-state'),
          text: document.getElementById('result').textContent,
          value: document.getElementById('field').value })`,
    )
    const names = mutated.tools.map((tool) => String(tool.tool))
    record({
      id: 'V3',
      title: 'El Engine lee snapshot, llena un campo y hace click; el DOM cambia en la misma vista',
      status: dom.state === 'applied' && dom.text.includes(typed) ? 'ok' : 'failed',
      detail:
        dom.state === 'applied'
          ? `la vista visible muestra «${dom.text}», con el valor que escribió la herramienta`
          : `la vista muestra estado ${dom.state} y texto «${dom.text}»`,
      evidence: { tools: names, trace: mutated.trace, dom, typed },
    })

    // ── Paso 4: la captura del Engine contiene el estado visible, con tamaño
    //    y target identificados.
    //    Se abre el artefacto y se comprueba **su contenido**. Exigir sólo
    //    `ok` y `bytes > 0` daba por buena cualquier imagen: no distinguía
    //    esta página de otra, ni esta sesión de otra.
    await script([{ tool: 'browser.screenshot', args: {} }, { text: 'capturado' }])
    const shot = await runTurn(sessionId, 'haz una captura')
    const shotTool = shot.tools.find((tool) => tool.tool === 'browser.screenshot')
    const observation = parseObservation(shotTool?.observation)
    const bytes = Number(observation?.bytes ?? 0)
    // Con Artifact Store la herramienta devuelve `artifact://` (lo que el chat
    // muestra) y la ruta del PNG en `path`; sin él, sólo un URI `file://`.
    const artifactUri = String(observation?.artifact ?? '')
    const artifactPath =
      typeof observation?.path === 'string' && observation.path
        ? observation.path
        : artifactUri.startsWith('file://')
          ? decodeURIComponent(new URL(artifactUri).pathname).replace(/^\/([A-Za-z]:)/, '$1')
          : artifactUri

    const { createHash } = await import('node:crypto')
    const { readFile } = await import('node:fs/promises')
    const { nativeImage } = await import('electron')

    let hashMatches = false
    let size: { width: number; height: number } | null = null
    let looksLikeFixture = false
    let artifactError: string | null = null
    try {
      const raw = await readFile(artifactPath)
      hashMatches = createHash('sha256').update(raw).digest('hex') === String(observation?.sha256)
      const image = nativeImage.createFromBuffer(raw)
      size = image.getSize()
      // El fixture es un color plano inconfundible: si la captura es de esa
      // página, domina la imagen. Sin OCR y sin depender de la fuente.
      const bitmap = image.toBitmap()
      let hits = 0
      for (let index = 0; index + 3 < bitmap.length; index += 4) {
        if (
          Math.abs(bitmap[index + 2]! - 220) <= 24 &&
          Math.abs(bitmap[index + 1]! - 30) <= 24 &&
          Math.abs(bitmap[index]! - 40) <= 24
        ) {
          hits += 1
        }
      }
      looksLikeFixture = hits > (bitmap.length / 4) * 0.5
    } catch (error) {
      artifactError = message(error)
    }

    // La captura sale en píxeles físicos; los bounds, en DIP (§8.2).
    const { screen } = await import('electron')
    const scale = screen.getPrimaryDisplay().scaleFactor
    const expected = {
      width: Math.round(LOGICAL_SIZE.width * scale),
      height: Math.round(LOGICAL_SIZE.height * scale),
    }
    const sizeMatches = size?.width === expected.width && size?.height === expected.height
    const targetIsOurs = deps.registry.target(context.contextId, target.targetId) !== undefined

    record({
      id: 'V4',
      title: 'La screenshot es de esta página y de esta sesión, no sólo bytes',
      status:
        shotTool?.ok === true && hashMatches && sizeMatches && looksLikeFixture && targetIsOurs
          ? 'ok'
          : 'failed',
      detail:
        artifactError !== null
          ? `no se pudo abrir el artefacto: ${artifactError}`
          : !hashMatches
            ? 'el sha256 del artefacto no coincide con el que declaró la herramienta'
            : !sizeMatches
              ? `la captura mide ${size?.width}×${size?.height} y el target ${expected.width}×${expected.height}`
              : !looksLikeFixture
                ? 'la imagen no es la página del fixture'
                : `${bytes} bytes, ${size?.width}×${size?.height}, sha256 verificado, contenido del fixture, target de esta sesión`,
      evidence: {
        bytes,
        sha256: observation?.sha256,
        hashMatches,
        size,
        expected,
        looksLikeFixture,
        targetId: target.targetId,
        targetIsOurs,
      },
    })

    // ── V4b: capturar un target que **no** se está presentando.
    //
    //    Es el caso real que apareció usando la app: un turno usa el browser
    //    antes de que el usuario abra el panel, o con el dock en otra
    //    superficie. `Page.captureScreenshot` se quedaba colgado hasta agotar
    //    el plazo, y el §8.3 dice que ocultar no puede romper una herramienta
    //    que esté usando ese target.
    const hiddenTarget = deps.registry.createTarget(context)
    await hiddenTarget.view.webContents.loadURL('about:blank')
    await deps.registry.attach(hiddenTarget)
    await hiddenTarget.view.webContents.loadURL(deps.fixtureUrl)
    // Vuelve a la primera: la recién creada queda viva pero sin presentar.
    deps.registry.setActiveTarget(context, target.targetId)
    await sleep(400)

    await script([
      { tool: 'browser.screenshot', args: { target_id: hiddenTarget.targetId } },
      { text: 'capturado' },
    ])
    const hiddenShot = await runTurn(sessionId, 'captura la pestaña que no se ve', 45_000)
    const hiddenTool = hiddenShot.tools.find((tool) => tool.tool === 'browser.screenshot')
    const hiddenBytes = Number(parseObservation(hiddenTool?.observation)?.bytes ?? 0)

    record({
      id: 'V4b',
      title: 'Una pestaña que no se está presentando se puede capturar igual',
      status: hiddenTool?.outcome === 'completed' && hiddenBytes > 0 ? 'ok' : 'failed',
      detail:
        hiddenBytes > 0
          ? `captura de ${hiddenBytes} bytes de un target sin presentar: ocultar no detiene el recurso`
          : `la captura de un target oculto acabó en ${hiddenTool?.outcome ?? 'nada'} (${errorCodeOf(hiddenTool) ?? 'sin código'})`,
      evidence: { hiddenBytes, outcome: hiddenTool?.outcome, targetId: hiddenTarget.targetId },
    })
    deps.registry.closeTarget(context, hiddenTarget.targetId)
    await sleep(200)

    // ── V4c: consola y red, que hasta ahora eran UNSUPPORTED (R10-13).
    //
    //    Se provoca actividad real en la página y se comprueba que el agente
    //    la observa. La red se mide con una petición que la propia página
    //    dispara, no con la navegación: así se prueba el buffer del host y no
    //    un efecto de la carga inicial.
    await read(
      view,
      `(() => { console.log('marca-consola-vertical');
                void fetch(${JSON.stringify(deps.fixtureUrl)} + '?sonda=1');
                return true; })()`,
    )
    await sleep(800)

    await script([
      { tool: 'browser.console', args: {} },
      { tool: 'browser.network', args: {} },
      { text: 'observado' },
    ])
    const observed2 = await runTurn(sessionId, 'mira la consola y la red', 45_000)
    const consoleTool = observed2.tools.find((tool) => tool.tool === 'browser.console')
    const networkTool = observed2.tools.find((tool) => tool.tool === 'browser.network')
    const consoleText = JSON.stringify(parseObservation(consoleTool?.observation) ?? {})
    const networkText = JSON.stringify(parseObservation(networkTool?.observation) ?? {})
    const sawLog = consoleText.includes('marca-consola-vertical')
    const sawRequest = networkText.includes('sonda=1')

    record({
      id: 'V4c',
      title: 'Consola y red del target se observan por el host',
      status: sawLog && sawRequest ? 'ok' : 'failed',
      detail:
        sawLog && sawRequest
          ? 'el agente leyó el mensaje de consola y la petición que lanzó la página'
          : `consola ${sawLog ? 'sí' : 'no'} · red ${sawRequest ? 'sí' : 'no'} — ` +
            `${errorCodeOf(consoleTool) ?? consoleTool?.outcome ?? 'sin evento'} / ` +
            `${errorCodeOf(networkTool) ?? networkTool?.outcome ?? 'sin evento'}`,
      evidence: { sawLog, sawRequest, trace: observed2.trace },
    })

    // ── V4d: cookies de la partición, y sin cruzar entre sesiones (§6.3).
    const cookieName = `vertical${Date.now()}`
    await deps.registry.setCookie(context, { name: cookieName, value: 'secreto' })
    await sleep(300)

    const own = await deps.registry.cookies(context)
    const mine = own.find((cookie) => cookie.name === cookieName)
    // El valor no sale del host: la credencial no pasea por el broker.
    const leaksValue = own.some((cookie) => 'value' in cookie)

    record({
      id: 'V4d',
      title: 'Las cookies son de la partición del contexto y su valor no sale',
      status: mine && !leaksValue ? 'ok' : 'failed',
      detail: !mine
        ? 'la cookie escrita no aparece en la partición del contexto'
        : leaksValue
          ? 'el host devolvió el valor de una cookie; es una credencial y no debe cruzar'
          : `la cookie ${cookieName} está en su partición y sólo viajan nombre, dominio y banderas`,
      evidence: { found: Boolean(mine), leaksValue, total: own.length },
    })

    // ── Paso 5: control manual. La UI bloquea mutaciones concurrentes, y una
    //    edición manual se observa al devolver el control.
    /** Espera al evento de transición confirmada. */
    const awaitControl = async (want: string, timeoutMs = 15_000) => {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        const seen = [...events]
          .reverse()
          .find((entry) => entry.event === 'browser.control.changed')
        const payload = seen?.payload as Record<string, unknown> | undefined
        if (payload?.control_state === want) return payload
        await sleep(100)
      }
      throw new Error(`el control no llegó a «${want}» en ${timeoutMs} ms`)
    }

    const requested = (await call('browser.control.set', {
      session_id: sessionId,
      owner: 'user',
    })) as { control: string; control_state: string; control_revision: number }

    // La petición vuelve enseguida con la admisión ya cerrada, pero **sin**
    // conceder: el Engine espera en un worker a las mutaciones ya admitidas.
    // Main no toca la barrera hasta que llega la confirmación, que es el orden
    // del §7 —«solo después main habilita input manual»—.
    const confirmed = await awaitControl('user')
    const taken = {
      control_revision: Number(confirmed.control_revision),
      control_state: String(confirmed.control_state),
    }

    await script([{ tool: 'browser.click', args: { selector: '#go' } }, { text: 'intentado' }])
    const blocked = await runTurn(sessionId, 'vuelve a pulsar aplicar')
    const blockedTool = blocked.tools.find((tool) => tool.tool === 'browser.click')

    // Edición manual **con entrada real del widget**, que es la ruta del
    // usuario. La versión anterior asignaba `value` y además `setAttribute`
    // para que el HTML serializado lo contuviera; eso probaba una edición
    // artificial y, peor, tocaba el fixture para que el snapshot viera una
    // propiedad que el producto no observa.
    const rect = await read<{ x: number; y: number }>(
      view,
      `(() => { const r = document.getElementById('field').getBoundingClientRect();
                return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`,
    )
    await read(view, "(document.getElementById('field').value = '', true)")
    const manual = `manual${Date.now()}`
    if (deps.physicalClick) {
      const bounds = deps.window.getBounds()
      deps.window.show()
      deps.window.focus()
      await sleep(300)
      await deps.physicalClick(bounds.x + 24 + rect.x, bounds.y + 120 + rect.y, manual)
    } else {
      view.webContents.focus()
      for (const type of ['mouseDown', 'mouseUp'] as const) {
        view.webContents.sendInputEvent({ type, x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
      }
      for (const char of manual) {
        view.webContents.sendInputEvent({ type: 'keyDown', keyCode: char })
        view.webContents.sendInputEvent({ type: 'char', keyCode: char })
        view.webContents.sendInputEvent({ type: 'keyUp', keyCode: char })
      }
    }
    await sleep(400)
    const typedLive = await read<string>(view, "document.getElementById('field').value")

    // User → Agent pasa por el servicio real de main. Este retira la vista y
    // devuelve el foco al renderer **antes** de pedir el cambio al Engine.
    const returnPromise = deps.services.setControl(
      sessionId,
      'agent',
      taken.control_revision,
    )
    const floorBeforeEngineReply = context.container.getBounds()
    const physicallyRetired =
      floorBeforeEngineReply.width <= 1 && floorBeforeEngineReply.height <= 1
    const remoteFocusedAfterReturn = view.webContents.isFocused()

    const focusSuffix = 'XYZ'
    if (deps.physicalType) await deps.physicalType(focusSuffix)
    await sleep(250)
    const valueAfterReturnTyping = await read<string>(view, "document.getElementById('field').value")

    // Se lanza una mutación sin esperar la respuesta del cambio. Puede entrar
    // sólo cuando el Engine confirme agent; para entonces la vista ya estaba
    // físicamente en el suelo.
    await script([{ tool: 'browser.click', args: { selector: '#go' } }, { text: 'race' }])
    const racingTurn = runTurn(sessionId, 'click inmediato al devolver control', 45_000)
    await returnPromise
    const returned = await awaitControl('agent')
    const raced = await racingTurn
    const racedTool = raced.tools.find((tool) => tool.tool === 'browser.click')
    const raceCompleted = racedTool?.outcome === 'completed' && racedTool.ok === true

    record({
      id: 'RETURN-AGENT-RACE',
      title: 'Return to Agent retira la superficie antes de reabrir mutaciones',
      status: physicallyRetired && raceCompleted ? 'ok' : 'failed',
      detail:
        physicallyRetired && raceCompleted
          ? 'main bajó la vista a 1×1 antes de esperar al Engine; el click inmediato sólo corrió después del traspaso seguro'
          : `suelo previo ${JSON.stringify(floorBeforeEngineReply)}; click ${racedTool?.outcome ?? 'ausente'}`,
      evidence: { floorBeforeEngineReply, physicallyRetired, raceCompleted, trace: raced.trace },
    })

    record({
      id: 'RETURN-AGENT-FOCUS',
      title: 'Return to Agent revoca el foco de la página remota',
      status:
        !remoteFocusedAfterReturn && (!deps.physicalType || valueAfterReturnTyping === manual)
          ? 'ok'
          : 'failed',
      detail: !remoteFocusedAfterReturn && (!deps.physicalType || valueAfterReturnTyping === manual)
        ? deps.physicalType
          ? `el foco volvió a Rinari y «${focusSuffix}» no llegó al input remoto`
          : 'el foco lógico volvió a Rinari; el gate Windows añade tecleo físico sin click'
        : `focused=${remoteFocusedAfterReturn}; valor remoto «${valueAfterReturnTyping}»`,
      evidence: {
        remoteFocusedAfterReturn,
        valueAfterReturnTyping,
        expected: manual,
        physicalMeasured: Boolean(deps.physicalType),
      },
    })

    // El agente observa el **valor vivo** por a11y, no el HTML serializado:
    // escribir en un campo no cambia su atributo, así que un snapshot no lo
    // vería y el paso mediría la forma de la comprobación en vez del
    // comportamiento.
    await script([{ tool: 'browser.a11y', args: {} }, { text: 'observado' }])
    const observed = await runTurn(sessionId, 'mira cómo quedó el campo')
    const a11yTool = observed.tools.find((tool) => tool.tool === 'browser.a11y')
    const tree = parseObservation(a11yTool?.observation)
    const sawManual = JSON.stringify(tree?.nodes ?? []).includes(manual)

    // Se distingue «rechazado» de «no llegó a ejecutarse»: un turno que no
    // produjo la herramienta no demuestra exclusión, y darlo por bueno sería
    // aprobar el paso por una ausencia.
    const blockedCode = errorCodeOf(blockedTool)
    const refused = blockedTool?.outcome !== 'completed' && blockedCode === 'CONFLICT'
    const ranAnyway = blockedTool?.outcome === 'completed' && blockedTool?.ok === true
    // La edición tiene que haber ocurrido de verdad antes de exigir que se
    // observe: si el tecleo no llegó, `sawManual` sería falso por otra razón.
    const typedForReal = typedLive === manual
    record({
      id: 'V5',
      title: 'Control manual: sin mutaciones concurrentes, y la edición manual se observa al devolverlo',
      status: refused && typedForReal && sawManual ? 'ok' : 'failed',
      detail: !typedForReal
        ? `la edición manual no llegó a la página: el campo quedó en «${typedLive}»`
        : refused
          ? sawManual
            ? `con el usuario al mando el click se rechazó (${blockedCode}); tecleado real en el campo, y al devolver el control el agente lo leyó por a11y`
            : 'el click se rechazó y el tecleo llegó, pero el agente no vio el valor vivo al recuperar el control'
          : ranAnyway
            ? 'el click del agente se ejecutó con el usuario al mando: no hay exclusión'
            : `el click no se ejecutó, pero tampoco se rechazó por control (${blockedCode ?? 'sin evento terminal'}): la exclusión no queda demostrada`,
      evidence: {
        typedLive,
        typedForReal,
        // La petición vuelve sin conceder: la confirmación llega por evento.
        requestedState: requested.control_state,
        requestedOwnerAtReply: requested.control,
        takenRevision: taken.control_revision,
        returnedRevision: returned.control_revision,
        blockedError: blockedCode,
        blockedTrace: blocked.trace,
        sawManualEdit: sawManual,
      },
    })

    // ── Paso 6: segunda sesión con la misma URL. Ni almacenamiento ni targets.
    const secondCreated = (await call('session.create', { title: 'browser vertical 2' })) as {
      session: { id: string }
    }
    secondSessionId = secondCreated.session.id
    const secondContext = deps.registry.ensureContext(secondSessionId)
    const secondTarget = deps.registry.createTarget(secondContext)
    await secondTarget.view.webContents.loadURL('about:blank')
    await deps.registry.attach(secondTarget)
    await secondTarget.view.webContents.loadURL(deps.fixtureUrl)
    await sleep(500)

    const marker = `sesion-a-${Date.now()}`
    await read(view, `(localStorage.setItem('vertical', ${JSON.stringify(marker)}), true)`)
    const ownRead = await read<string | null>(view, "localStorage.getItem('vertical')")
    const crossRead = await read<string | null>(
      secondTarget.view,
      "localStorage.getItem('vertical')",
    )
    const crossTarget = deps.registry.target(context.contextId, secondTarget.targetId)

    record({
      id: 'V6',
      title: 'Una segunda sesión con la misma URL no comparte almacenamiento ni targets',
      status: ownRead === marker && crossRead === null && crossTarget === undefined ? 'ok' : 'failed',
      detail:
        crossRead === null && crossTarget === undefined
          ? 'particiones distintas: la segunda sesión no ve el almacenamiento de la primera, y su target no se resuelve desde el contexto ajeno'
          : `fuga: almacenamiento ${crossRead}, target ajeno ${crossTarget ? 'resuelto' : 'no'}`,
      evidence: {
        ownRead,
        crossRead,
        partitions: [context.partition, secondContext.partition],
        crossTargetResolved: crossTarget !== undefined,
      },
    })

    // ── R10-08: con dos pestañas, la que opera y la que se ve son la misma.
    //
    //    Antes todas las vistas se apilaban en el mismo rectángulo y una
    //    operación sin `target_id` iba a la primera creada. Con dos pestañas
    //    eso significa que la captura y el click pueden describir páginas
    //    distintas, y «el Engine opera exactamente la página visible» deja de
    //    ser cierto.
    const first = deps.registry.target(context.contextId, null)
    const second = deps.registry.createTarget(context)
    await second.view.webContents.loadURL('about:blank')
    await deps.registry.attach(second)
    await second.view.webContents.executeJavaScript("document.title = 'segunda', true")
    await sleep(300)

    const defaultIsNew = deps.registry.target(context.contextId, null)?.targetId
    const listed = deps.registry.describeTargets(context)
    const activeCount = listed.filter((entry) => entry.active).length
    const onlyOneVisible = activeCount === 1

    // Se vuelve a la primera y el objetivo por defecto la sigue.
    deps.registry.setActiveTarget(context, first!.targetId)
    await sleep(200)
    const defaultBack = deps.registry.target(context.contextId, null)?.targetId

    // Cerrar la que no está activa no cambia la selección ni recarga la otra.
    const urlBeforeClose = first!.view.webContents.getURL()
    deps.registry.closeTarget(context, second.targetId)
    await sleep(200)
    const survivor = deps.registry.target(context.contextId, null)?.targetId
    const urlAfterClose = first!.view.webContents.getURL()

    const tabsOk =
      defaultIsNew === second.targetId &&
      onlyOneVisible &&
      defaultBack === first!.targetId &&
      survivor === first!.targetId &&
      urlAfterClose === urlBeforeClose

    record({
      id: 'V7a',
      title: 'Con dos pestañas, la operación por defecto va a la que se ve',
      status: tabsOk ? 'ok' : 'failed',
      detail: tabsOk
        ? 'una pestaña nueva pasa a ser la activa y la operación por defecto la sigue; al volver a la primera, también; cerrar la inactiva no mueve la selección ni recarga la superviviente'
        : `la selección no siguió a la pestaña visible: por defecto tras crear ${String(defaultIsNew)}, tras volver ${String(defaultBack)}, superviviente ${String(survivor)}, visibles ${activeCount}`,
      evidence: {
        created: second.targetId,
        firstTarget: first?.targetId,
        defaultAfterCreate: defaultIsNew,
        defaultAfterSelect: defaultBack,
        survivor,
        visibleCount: activeCount,
        urlPreserved: urlAfterClose === urlBeforeClose,
      },
    })

    // ── Paso 7: geometría. Se reduce el área visible y se comprueba que el
    //    viewport del documento **no** se encoge, y que una superficie por
    //    encima no deja pasar clicks.
    deps.registry.setControl(context, 'user')
    const before = await read<[number, number]>(view, '[window.innerWidth, window.innerHeight]')
    deps.registry.setGeometry(context, {
      container: { x: 24, y: 120, width: 200, height: 140 },
      page: { x: 0, y: 0, width: LOGICAL_SIZE.width, height: LOGICAL_SIZE.height },
      visible: true,
    })
    await sleep(400)
    const after = await read<[number, number]>(view, '[window.innerWidth, window.innerHeight]')
    const keptViewport = after[0] === before[0] && after[1] === before[1]

    record({
      id: 'V7',
      title: 'Reducir el área visible recorta sin cambiar el viewport del documento',
      status: keptViewport ? 'ok' : 'failed',
      detail: keptViewport
        ? `el recorte pasó a 200×140 y el viewport sigue en ${after[0]}×${after[1]}`
        : `el viewport cambió de ${before.join('×')} a ${after.join('×')} al recortar`,
      evidence: { before, after },
    })
    deps.registry.setControl(context, 'agent')

    // ── V7b: overlay y click-through, que es otra cosa que el recorte.
    //
    //    Antes se comprobaba que la barrera fuera el último hijo. Eso describe
    //    el orden de apilado, no que un click destinado a un modal llegue al
    //    modal: hace falta entrada real del sistema, porque `sendInputEvent`
    //    va dirigido a un webContents y se salta el hit-testing.
    deps.registry.setGeometry(context, {
      container: { x: 24, y: 120, width: 520, height: 380 },
      page: { x: 0, y: 0, width: LOGICAL_SIZE.width, height: LOGICAL_SIZE.height },
      visible: true,
    })
    deps.registry.setControl(context, 'agent', true)
    await sleep(500)

    if (!deps.physicalClick) {
      record({
        id: 'V7b',
        title: 'Un click destinado al overlay no atraviesa hasta la página',
        status: 'skipped',
        detail:
          'no ejecutado: la síntesis de entrada del sistema es de Windows y no está disponible aquí. El criterio de la entrega E es Windows; en otras plataformas queda por medir.',
      })
    } else {
      const bounds = deps.window.getBounds()
      const spot = { x: bounds.x + 24 + 200, y: bounds.y + 120 + 200 }
      const pageBefore = await read<number>(view, 'window.__probe.clicks')
      deps.window.show()
      deps.window.focus()
      await sleep(400)
      await deps.physicalClick(spot.x, spot.y)
      await sleep(400)
      const pageAfter = await read<number>(view, 'window.__probe.clicks')

      const blocked = pageAfter === pageBefore
      record({
        id: 'V7b',
        title: 'Un click destinado al overlay no atraviesa hasta la página',
        status: blocked ? 'ok' : 'failed',
        detail: blocked
          ? `con la superposición delante, el click del sistema no llegó a la página (${pageBefore} → ${pageAfter})`
          : `el click atravesó la superposición: la página pasó de ${pageBefore} a ${pageAfter}`,
        evidence: { pageBefore, pageAfter, spot },
      })
    }

    const barrierOnTop =
      context.barrier !== null &&
      context.container.children[context.container.children.length - 1] === context.barrier
    deps.registry.setControl(context, 'agent')

    record({
      id: 'V7c',
      title: 'La superposición es la superficie frontal del contenedor',
      status: barrierOnTop ? 'ok' : 'failed',
      detail: barrierOnTop
        ? 'la barrera es el último hijo, así que una página creada después no se pone delante'
        : 'la barrera no es la superficie frontal',
      evidence: { barrierOnTop },
    })

    // ── V9: cerrar el panel retira la vista de la ventana.
    //
    //    Por el camino del renderer —reservar slot, publicar geometría,
    //    soltarlo—, no llamando al registry a mano: el fallo estaba en ese
    //    cableado. Soltar el lease sólo hacía que main dejara de admitir
    //    geometría; el contenedor seguía compuesto con sus últimos bounds, así
    //    que al cerrar el dock o cambiar a Archivos la página se quedaba
    //    pegada encima de la aplicación y además se comía el input de ese
    //    rectángulo, porque ningún `z-index` del renderer tapa una vista
    //    nativa.
    //
    //    Y se exige lo que el §8.3 pide además de esconder: que no cierre
    //    nada. La página tiene que seguir viva y volver al reaparecer el slot.
    const lease = await deps.services.attachSlot(sessionId)
    deps.registry.setControl(context, 'user')
    const slotVisible = { x: 24, y: 120, width: 520, height: 380 }
    const slotLogical = { x: 24, y: 120, ...LOGICAL_SIZE }
    await deps.services.updateSlot({
      slot_id: lease.slot_id,
      logical_bounds: slotLogical,
      visible_bounds: slotVisible,
      shown: true,
      layout_revision: 1,
      overlay_depth: 0,
    })
    await sleep(300)
    const boundsBefore = context.container.getBounds()
    const presentedBefore = boundsBefore.width > 1 && boundsBefore.height > 1

    await deps.services.detachSlot(lease.slot_id)
    await sleep(400)
    const boundsAfter = context.container.getBounds()
    // Retirada de verdad: el contenedor baja al suelo de maquetado, que es un
    // píxel. Se mide por bounds y no por el flag de visibilidad porque el
    // contenedor **no** se esconde: una vista que deja de componerse pierde la
    // maquetación y con ella la captura.
    const retiredFromWindow = boundsAfter.width <= 1 && boundsAfter.height <= 1
    // Esconder no es cerrar: la página sigue contestando y conserva su URL.
    const urlWhileHidden = view.webContents.getURL()
    let aliveWhileHidden = false
    let viewportWhileHidden: [number, number] = [0, 0]
    let hiddenFailure = ''
    try {
      aliveWhileHidden = (await read<boolean>(view, 'document.readyState === "complete"')) === true
      viewportWhileHidden = await read<[number, number]>(view, '[innerWidth, innerHeight]')
    } catch (error) {
      hiddenFailure = message(error)
    }
    // Y lo que de verdad se rompió en manos del usuario: con el panel cerrado
    // la captura salía de **cero bytes** mientras la herramienta decía `ok`.
    let hiddenShotBytes = 0
    try {
      hiddenShotBytes = (await view.webContents.capturePage()).toPNG().length
    } catch (error) {
      hiddenFailure = hiddenFailure || message(error)
    }
    const keepsViewport =
      viewportWhileHidden[0] === LOGICAL_SIZE.width &&
      viewportWhileHidden[1] === LOGICAL_SIZE.height

    // Y vuelve: retirar la presentación no es una puerta de un solo sentido.
    // El slot se deja puesto, que es como estaba el panel antes de V9: el paso
    // siguiente despacha input por CDP y Chromium no lo entrega a un widget
    // que considera oculto.
    const back = await deps.services.attachSlot(sessionId)
    await deps.services.updateSlot({
      slot_id: back.slot_id,
      logical_bounds: slotLogical,
      visible_bounds: slotVisible,
      shown: true,
      layout_revision: 1,
      overlay_depth: 0,
    })
    await sleep(300)
    const boundsAgain = context.container.getBounds()
    const presentedAgain = boundsAgain.width > 1 && boundsAgain.height > 1

    const retired =
      presentedBefore &&
      retiredFromWindow &&
      aliveWhileHidden &&
      keepsViewport &&
      hiddenShotBytes > 0 &&
      presentedAgain
    record({
      id: 'V9',
      title: 'Cerrar el panel retira la vista de la ventana y la página sigue usable',
      status: retired ? 'ok' : 'failed',
      detail: retired
        ? `presentada en ${boundsBefore.width}×${boundsBefore.height}, al soltar el slot baja a ${boundsAfter.width}×${boundsAfter.height} conservando el viewport en ${viewportWhileHidden.join('×')} y capturando ${hiddenShotBytes} bytes, y vuelve al reservarlo otra vez`
        : `presentada antes: ${presentedBefore}; retirada de la ventana: ${retiredFromWindow} (${boundsAfter.width}×${boundsAfter.height}); página viva: ${aliveWhileHidden}; viewport conservado: ${keepsViewport} (${viewportWhileHidden.join('×')}); captura escondida: ${hiddenShotBytes} bytes; vuelve: ${presentedAgain}${hiddenFailure ? ` · ${hiddenFailure}` : ''}`,
      evidence: {
        boundsBefore,
        boundsAfter,
        boundsAgain,
        aliveWhileHidden,
        viewportWhileHidden,
        hiddenShotBytes,
        hiddenFailure,
        urlWhileHidden,
      },
    })
    deps.registry.setControl(context, 'agent')

    // ── V10: el contexto que **nunca** tuvo panel.
    //
    //    Reportado en uso real: sin abrir el dock, las capturas salían de 0
    //    bytes con la herramienta diciendo `ok`, y el DOM medía `innerWidth`
    //    0. La causa no era la captura: el contenedor nacía a 0×0 y recortaba
    //    la vista a nada, así que la página no llegaba a componerse **nunca** y
    //    no tenía viewport. Sin viewport no hay maquetación, y sin maquetación
    //    ni las coordenadas de un click ni `loading="lazy"` ni la imagen
    //    describen la página.
    //
    //    El §8.3 exige que ocultar no rompa una herramienta que use ese target;
    //    esto es el caso extremo: nunca se enseñó.
    const loneSession = `${sessionId}-sin-panel`
    const loneContext = deps.registry.ensureContext(loneSession)
    const loneTarget = deps.registry.createTarget(loneContext)
    await loneTarget.view.webContents.loadURL('about:blank')
    await deps.registry.attach(loneTarget)
    await loneTarget.view.webContents.loadURL(deps.fixtureUrl)
    await awaitPainted(loneTarget.view)
    const loneViewport = await read<[number, number]>(
      loneTarget.view,
      '[innerWidth, innerHeight]',
    )
    let loneBytes = 0
    let loneFailure = ''
    try {
      loneBytes = (await loneTarget.view.webContents.capturePage()).toPNG().length
    } catch (error) {
      loneFailure = message(error)
    }
    const loneOk = loneViewport[0] > 0 && loneViewport[1] > 0 && loneBytes > 0
    record({
      id: 'V10',
      title: 'Un contexto que nunca se presentó maqueta y se puede capturar',
      status: loneOk ? 'ok' : 'failed',
      detail: loneOk
        ? `sin haber abierto el panel nunca, la página maqueta en ${loneViewport.join('×')} y captura ${loneBytes} bytes`
        : `viewport ${loneViewport.join('×')} y captura de ${loneBytes} bytes sin panel${loneFailure ? `: ${loneFailure}` : ''}`,
      evidence: { loneViewport, loneBytes, loneFailure },
    })
    deps.registry.disposeContext(loneContext.contextId)

    // ── V11: subir un fichero (§6.3, R10-13).
    //
    //    Se comprueba en **la página**, no en el resultado de la herramienta:
    //    que `browser.upload` conteste `ok` no demuestra que el input tenga un
    //    fichero. El fichero lo escribe antes el propio agente, así que la
    //    ruta pasa por el mismo sandbox de la sesión que después la resuelve.
    const uploadName = `subida-${Date.now()}.txt`
    await script([
      { tool: 'fs.write', args: { path: uploadName, content: 'contenido de la subida vertical' } },
      { tool: 'browser.upload', args: { selector: '#adjunto', path: uploadName } },
      { text: 'listo' },
    ])
    const uploaded = await runTurn(sessionId, 'adjunta el fichero al formulario', 90_000)
    await sleep(500)
    const uploadTool = uploaded.tools.find((tool) => tool.tool === 'browser.upload')
    const inPage = await read<{ files: number; name: string }>(
      view,
      `({ files: document.getElementById('adjunto').files.length,
          name: document.getElementById('subido').getAttribute('data-name') })`,
    )
    // La procedencia es parte del contrato de la herramienta: quien lea el
    // resultado tiene que poder decir **qué** bytes se entregaron.
    const uploadObservation = parseObservation(uploadTool?.observation) as
      | { provenance?: { sha256?: unknown; bytes?: unknown; path?: unknown } }
      | null
    const provenance = uploadObservation?.provenance
    const hasProvenance =
      typeof provenance?.sha256 === 'string' && typeof provenance?.bytes === 'number'
    const uploadOk = inPage.files === 1 && inPage.name === uploadName && hasProvenance

    record({
      id: 'V11',
      title: 'El agente sube un fichero y el input de la página lo recibe',
      status: uploadOk ? 'ok' : 'failed',
      detail: uploadOk
        ? `el input tiene 1 fichero y la página lo llama «${inPage.name}», con sha256 y tamaño en la procedencia`
        : `ficheros en el input: ${inPage.files}; nombre visto por la página: ${inPage.name || 'ninguno'}; procedencia: ${hasProvenance ? 'sí' : 'no'} — ${errorCodeOf(uploadTool) ?? uploadTool?.outcome ?? 'sin evento'}`,
      evidence: { inPage, provenance, trace: uploaded.trace },
    })

    // El fichero lo escribió el agente en el directorio de trabajo de la
    // sesión, que es un checkout real. La prueba no deja nada suyo ahí.
    const uploadedPath = typeof provenance?.path === 'string' ? provenance.path : ''
    if (uploadedPath) rmSync(uploadedPath, { force: true })

    // ── V12: descargar, con el nombre que propone el servidor (BR-09).
    //
    //    El fixture manda `Content-Disposition: attachment; filename="../../CON.txt"`.
    //    Tres cosas a la vez: salto de directorio, y un nombre que en Windows
    //    es un dispositivo. Si el host lo usara tal cual, el fichero saldría
    //    del directorio de artefactos o no sería un fichero.
    //
    //    El primer `browser.download` habilita y expira —las descargas están
    //    cerradas en reposo para que ninguna página abra el diálogo de
    //    guardado del sistema—, luego se pulsa, y el segundo la recoge.
    await script([
      { tool: 'browser.download', args: { wait_s: 1 } },
      { tool: 'browser.click', args: { selector: '#bajar' } },
      { tool: 'browser.download', args: { wait_s: 15 } },
      { text: 'listo' },
    ])
    const downloaded = await runTurn(sessionId, 'descarga el fichero del enlace', 120_000)
    const downloadTools = downloaded.tools.filter((tool) => tool.tool === 'browser.download')
    const lastDownload = downloadTools[downloadTools.length - 1]
    const downloadObservation = parseObservation(lastDownload?.observation) as
      | { path?: unknown; suggested_name?: unknown; bytes?: unknown; downloads_dir?: unknown }
      | null
    const savedPath = typeof downloadObservation?.path === 'string' ? downloadObservation.path : ''
    const savedDir =
      typeof downloadObservation?.downloads_dir === 'string'
        ? downloadObservation.downloads_dir
        : ''
    const savedName = basename(savedPath)
    // Diagnóstico: qué hay de verdad en el directorio de artefactos. Sin esto,
    // un fallo sólo dice «no apareció» y no distingue «el host no guardó» de
    // «el Engine no lo vio».
    const artifactRoot = process.env.RINARI_HOME
      ? resolvePath(process.env.RINARI_HOME, 'artifacts', sessionId)
      : ''
    let onDisk: string[] = []
    try {
      if (artifactRoot) onDisk = readdirSync(artifactRoot)
    } catch (error) {
      onDisk = [`no se pudo leer: ${message(error)}`]
    }
    // Dentro del directorio de artefactos, y con el nombre saneado: el
    // separador que traía el servidor no puede haber sobrevivido.
    const stayedInside =
      savedPath !== '' && savedDir !== '' && resolvePath(savedPath) === resolvePath(savedDir, savedName)
    // No se fija el nombre exacto: Chromium ya colapsa los separadores antes
    // de `will-download` —medido: entrega `_.._CON.txt`— y clavar esa cadena
    // ataría la prueba a su versión. Lo que importa es la propiedad: que sea
    // un componente de ruta y que no empiece por el salto que mandó el
    // servidor.
    const nameSanitised =
      savedName !== '' &&
      !savedName.includes('/') &&
      !savedName.includes('\\') &&
      !savedName.startsWith('..')
    const downloadOk = lastDownload?.outcome === 'completed' && stayedInside && nameSanitised

    record({
      id: 'V12',
      title: 'Una descarga con nombre hostil aterriza saneada en los artefactos',
      status: downloadOk ? 'ok' : 'failed',
      detail: downloadOk
        ? `«../../CON.txt» se guardó como «${savedName}» dentro de ${savedDir}, ${String(downloadObservation?.bytes ?? '?')} bytes`
        : `guardado en ${savedPath || 'ningún sitio'}; nombre ${savedName || 'ninguno'}; dentro del directorio: ${stayedInside} — ${errorCodeOf(lastDownload) ?? lastDownload?.outcome ?? 'sin evento'}`,
      evidence: { savedPath, savedDir, savedName, artifactRoot, onDisk, trace: downloaded.trace },
    })

    // ── BR-13: cien ciclos reales de lifecycle. La memoria es sólo una
    //    tendencia; el gate son recursos contables que vuelven al baseline.
    const lifecycleBaseline = {
      registry: deps.registry.diagnostics(),
      host: deps.host.diagnostics(),
      layout: deps.services.diagnostics(),
    }
    const heapBefore = process.memoryUsage().heapUsed
    let lifecycleFailure = ''
    let duplicateConsoleEvents = 0
    for (let cycle = 0; cycle < 100 && !lifecycleFailure; cycle += 1) {
      const soakSession = `${sessionId}-br13-${cycle}`
      const soak = deps.registry.ensureContext(soakSession)
      const one = deps.registry.createTarget(soak)
      await one.view.webContents.loadURL('about:blank')
      await deps.registry.attach(one)
      const two = deps.registry.createTarget(soak)
      await two.view.webContents.loadURL('about:blank')
      await deps.registry.attach(two)

      const lease = await deps.services.attachSlot(soakSession)
      deps.registry.setControl(soak, 'user')
      await deps.services.updateSlot({
        slot_id: lease.slot_id,
        logical_bounds: { x: 24, y: 120, width: 320, height: 220 },
        visible_bounds: { x: 24, y: 120, width: 320, height: 220 },
        shown: true,
        layout_revision: 1,
        overlay_depth: 0,
      })

      // attach → detach → attach no puede multiplicar el listener.
      if (one.view.webContents.debugger.isAttached()) one.view.webContents.debugger.detach()
      await deps.registry.attach(one)
      deps.registry.drainObserved(one, 'console', 1_000)
      const marker = `br13-${cycle}`
      await one.view.webContents.debugger.sendCommand('Runtime.evaluate', {
        expression: `console.log(${JSON.stringify(marker)})`,
      })
      await sleep(20)
      const consoleEvents = deps.registry.drainObserved(one, 'console', 1_000)
      const copies = JSON.stringify(consoleEvents).split(marker).length - 1
      if (copies !== 1) duplicateConsoleEvents += 1

      const downloadRoot = process.env.RINARI_HOME
        ? resolvePath(process.env.RINARI_HOME, 'br13-downloads')
        : resolvePath(process.cwd(), '.rinari-br13-downloads')
      deps.registry.beginDownload(soak, downloadRoot)
      await deps.services.updateSlot({
        slot_id: lease.slot_id,
        logical_bounds: { x: 24, y: 120, width: 320, height: 220 },
        visible_bounds: { x: 24, y: 120, width: 320, height: 220 },
        shown: false,
        layout_revision: 2,
        overlay_depth: 0,
      })
      await deps.services.updateSlot({
        slot_id: lease.slot_id,
        logical_bounds: { x: 24, y: 120, width: 320, height: 220 },
        visible_bounds: { x: 24, y: 120, width: 320, height: 220 },
        shown: true,
        layout_revision: 3,
        overlay_depth: 0,
      })
      deps.registry.closeTarget(soak, two.targetId)
      await deps.services.detachSlot(lease.slot_id)
      deps.registry.disposeContext(soak.contextId)

      const now = {
        registry: deps.registry.diagnostics(),
        host: deps.host.diagnostics(),
        layout: deps.services.diagnostics(),
      }
      if (JSON.stringify(now) !== JSON.stringify(lifecycleBaseline)) {
        lifecycleFailure = `ciclo ${cycle + 1}: ${JSON.stringify(now)}`
      }
      if ((cycle + 1) % 10 === 0) console.log(`RINARI_BROWSER_BR13 ${cycle + 1}/100`)
    }
    const heapAfter = process.memoryUsage().heapUsed
    const lifecycleAfter = {
      registry: deps.registry.diagnostics(),
      host: deps.host.diagnostics(),
      layout: deps.services.diagnostics(),
    }
    const lifecycleOk =
      !lifecycleFailure &&
      duplicateConsoleEvents === 0 &&
      JSON.stringify(lifecycleAfter) === JSON.stringify(lifecycleBaseline)
    record({
      id: 'BR13',
      title: 'Cien ciclos devuelven todos los recursos contables al baseline',
      status: lifecycleOk ? 'ok' : 'failed',
      detail: lifecycleOk
        ? `100/100 ciclos limpios; listeners duplicados: 0; tendencia heap ${heapBefore} → ${heapAfter}`
        : `${lifecycleFailure || 'los contadores finales no coinciden'}; ciclos con evento duplicado: ${duplicateConsoleEvents}`,
      evidence: { lifecycleBaseline, lifecycleAfter, duplicateConsoleEvents, heapBefore, heapAfter },
    })

    // ── BR-14: frames grandes y Stop por Engine + broker reales.
    const paintNoise = async (width: number, height: number) => {
      deps.registry.setGeometry(context, {
        container: { x: 24, y: 120, width: 520, height: 380 },
        page: { x: 0, y: 0, width, height },
        visible: true,
      })
      await read(
        view!,
        `(() => {
          let canvas = document.getElementById('__br14');
          if (!canvas) { canvas = document.createElement('canvas'); canvas.id = '__br14'; document.body.prepend(canvas); }
          canvas.width = ${width}; canvas.height = ${height};
          const ctx = canvas.getContext('2d'); const image = ctx.createImageData(${width}, ${height});
          let seed = 123456789;
          for (let i = 0; i < image.data.length; i += 4) {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            image.data[i] = seed & 255; image.data[i + 1] = (seed >>> 8) & 255;
            image.data[i + 2] = (seed >>> 16) & 255; image.data[i + 3] = 255;
          }
          ctx.putImageData(image, 0, 0); return true;
        })()`,
      )
      await sleep(250)
    }

    await paintNoise(1_500, 900)
    const b1 = await stopDuring(
      sessionId,
      'browser.screenshot',
      [{ tool: 'browser.screenshot', args: {} }, { text: 'capturado' }],
      'captura grande y espera',
      45_000,
    )

    await read(
      view,
      `(() => { for (let i = 0; i < 3000; i += 1) console.log('br14-noise-' + i);
                return fetch(${JSON.stringify(`${deps.fixtureUrl}?br14=1`)}).then(() => true); })()`,
    )
    const bufferedBeforeStop = deps.registry.diagnostics()
    const b2 = await stopDuring(
      sessionId,
      'browser.console',
      [{ tool: 'browser.console', args: { limit: 200 } }, { text: 'observado' }],
      'lee el ruido y detente',
      30_000,
    )

    await paintNoise(2_200, 1_600)
    await script([{ tool: 'browser.screenshot', args: {} }, { text: 'capturado' }])
    const oversized = await runTurn(sessionId, 'captura demasiado grande', 60_000)
    const oversizedTool = oversized.tools.find((tool) => tool.tool === 'browser.screenshot')
    const oversizedRejected = errorCodeOf(oversizedTool) === 'RESOURCE_EXHAUSTED'
    await deps.engine.request('engine.info', {}, 5_000)

    deps.registry.setGeometry(context, {
      container: { x: 24, y: 120, width: 520, height: 380 },
      page: { x: 0, y: 0, width: LOGICAL_SIZE.width, height: LOGICAL_SIZE.height },
      visible: true,
    })
    await script([
      {
        tool: 'browser.evaluate',
        args: {
          expression: `new Promise(resolve => setTimeout(() => { window.__br14Settled = true; resolve('settled') }, 3000))`,
          await_promise: true,
        },
      },
      { text: 'terminado' },
    ])
    const beforeSlow = events.length
    await call('session.turn.start', { session_id: sessionId, message: 'inicia la mutación lenta' })
    const slowDeadline = Date.now() + 15_000
    while (Date.now() < slowDeadline) {
      const started = events.slice(beforeSlow).some((entry) => {
        const payload = entry.payload as Record<string, unknown> | undefined
        return entry.event === 'tool.started' && payload?.tool === 'browser.evaluate'
      })
      if (started) break
      await sleep(20)
    }
    const b4StopAt = performance.now()
    await call('session.turn.cancel', { session_id: sessionId })
    const b4StopMs = performance.now() - b4StopAt
    const taking = (await call('browser.control.set', {
      session_id: sessionId,
      owner: 'user',
    })) as { control_state?: string; control_revision?: number }
    await sleep(500)
    const settledEarly = await read<boolean>(view, 'window.__br14Settled === true')
    const grantedEarly = events.slice(beforeSlow).some((entry) => {
      const payload = entry.payload as Record<string, unknown> | undefined
      return entry.event === 'browser.control.changed' && payload?.control_state === 'user'
    })
    await sleep(3_500)
    const settledLate = await read<boolean>(view, 'window.__br14Settled === true')
    const slowSlice = events.slice(beforeSlow)
    const slowWire = JSON.stringify(slowSlice)
    const uncertain = slowWire.includes('unknown') || slowWire.includes('uncertain')
    const retried = slowWire.includes('"retryable":true')
    const userEvent = [...slowSlice].reverse().find((entry) => {
      const payload = entry.payload as Record<string, unknown> | undefined
      return entry.event === 'browser.control.changed' && payload?.control_state === 'user'
    })
    if (userEvent) {
      const payload = userEvent.payload as Record<string, unknown>
      await call('browser.control.set', {
        session_id: sessionId,
        owner: 'agent',
        expected_revision: payload.control_revision,
      })
      await awaitControl('agent')
    }
    await deps.engine.request('engine.info', {}, 5_000)

    const stopLatencies = [b1.stopMs, b2.stopMs, b4StopMs]
    const stopObjective = stopLatencies.every((latency) => latency <= 2_000)
    const br14Ok =
      Boolean(b1.terminal) &&
      Boolean(b2.terminal) &&
      oversizedRejected &&
      taking.control_state === 'taking-user-control' &&
      !settledEarly &&
      !grantedEarly &&
      settledLate &&
      uncertain &&
      !retried &&
      deps.host.diagnostics().inFlight === 0
    record({
      id: 'BR14',
      title: 'Frames grandes y Stop no bloquean el Engine ni repiten mutaciones inciertas',
      status: br14Ok ? 'ok' : 'failed',
      detail: br14Ok
        ? `B1–B4 pasan; Stop ${stopLatencies.map((value) => `${Math.round(value)} ms`).join(', ')}${stopObjective ? ' (objetivo ≤2 s)' : ' (por encima del objetivo ≤2 s)'}`
        : `B1 terminal ${Boolean(b1.terminal)}; B2 terminal ${Boolean(b2.terminal)}; sobrelímite ${oversizedRejected}; taking ${taking.control_state}; grant temprano ${grantedEarly}; settlement ${settledLate}; incierto ${uncertain}; retry ${retried}; in-flight ${deps.host.diagnostics().inFlight}`,
      evidence: {
        stopLatencies,
        stopObjective,
        bufferedBeforeStop,
        oversizedError: errorCodeOf(oversizedTool),
        taking,
        settledEarly,
        grantedEarly,
        settledLate,
        uncertain,
        retried,
        host: deps.host.diagnostics(),
      },
    })

    // ── Paso 8: se mata el Engine con una mutación en vuelo.
    //
    //    La versión anterior reiniciaba en reposo y comprobaba que
    //    `host.registered` siguiera puesto. Ese booleano **no cambiaba nunca**
    //    —era `binding !== null` y nadie lo revocaba—, así que la prueba
    //    pasaba tanto si el host se volvía a registrar como si no. Ahora se
    //    exige lo contrario: que el binding se pierda, que se acuñe uno nuevo,
    //    y que una operación nativa posterior funcione con él.
    const clicksBefore = await read<number>(view, 'window.__probe.clicks')
    const bindingBefore = deps.host.bindingId

    // Un turno que muta, lanzado y **no** esperado: el Engine muere mientras
    // la operación está viva.
    await script([{ tool: 'browser.click', args: { selector: '#go' } }, { text: 'nunca' }])
    void call('session.turn.start', { session_id: sessionId, message: 'pulsa otra vez' }).catch(
      () => {
        // El turno muere con el Engine; su error no es el resultado del paso.
      },
    )
    await sleep(700)
    await deps.engine.restart()

    for (let attempt = 0; attempt < 150; attempt += 1) {
      if (deps.host.registered && deps.host.bindingId !== bindingBefore) break
      await sleep(100)
    }
    await sleep(500)
    const clicksAfterRestart = await read<number>(view, 'window.__probe.clicks')
    const bindingAfter = deps.host.bindingId
    const rebound = bindingAfter !== null && bindingAfter !== bindingBefore

    // Y el binding nuevo sirve — **por el broker**, no por el debugger.
    //
    // Esto es lo que antes daba un falso positivo. Se comprobaba con
    // `debugger.sendCommand` desde main, y eso sólo demuestra que la
    // `WebContentsView` sigue viva; no que el Engine nuevo, con su
    // `context_id` nuevo, alcance esa misma vista. Y no la alcanzaba: el host
    // recordaba el `engineContextId` de la instancia muerta y contestaba
    // `TARGET_NOT_FOUND` a todo. El paso pasaba igual.
    //
    // Ahora se exige el camino entero: turno real → herramienta → broker →
    // host → la misma vista. Una lectura y una mutación, porque una lectura
    // sola no prueba que se pueda volver a operar.
    // El turno que se mató con el Engine deja su lease de turno tomado hasta
    // que el proceso viejo suelta el lock del sistema, y `session.turn.start`
    // contesta `CONFLICT` mientras tanto. Se cancela y se espera, que es lo
    // que el propio error sugiere hacer —«use `rinari stop`»—; sin esto el
    // paso confundía «la sesión sigue ocupada» con «el rebind no funciona».
    await call('session.turn.cancel', { session_id: sessionId }).catch(() => {
      // Si ya no hay turno que cancelar, mejor.
    })
    let sessionFree = false
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        const probe = (await call('session.get', { session_id: sessionId })) as {
          busy?: unknown
        }
        if (probe?.busy !== true) {
          sessionFree = true
          break
        }
      } catch {
        // Un Engine que aún no atiende no es una respuesta; se reintenta.
      }
      await sleep(250)
    }

    const urlBeforeRestart = view.webContents.getURL()
    const markerAfterRestart = `tras-reinicio-${Date.now()}`
    await script([
      { tool: 'browser.snapshot', args: {} },
      { tool: 'browser.fill', args: { selector: '#field', value: markerAfterRestart } },
      { tool: 'browser.click', args: { selector: '#go' } },
      { text: 'listo' },
    ])
    const afterRestart = await runTurn(sessionId, 'lee la página y vuelve a aplicar', 90_000)
    await sleep(400)
    const snapshotTool = afterRestart.tools.find((tool) => tool.tool === 'browser.snapshot')
    const fillTool = afterRestart.tools.find((tool) => tool.tool === 'browser.fill')
    // Se mira la página, no el `ok`: el DOM tiene que llevar la marca nueva y
    // la URL tiene que ser la de antes —no se recreó la vista—.
    const domAfterRestart = await read<{ text: string; url: string }>(
      view,
      `({ text: document.getElementById('result').textContent, url: location.href })`,
    )
    const readBack = snapshotTool?.outcome === 'completed'
    const mutatedAgain =
      fillTool?.outcome === 'completed' && domAfterRestart.text.includes(markerAfterRestart)
    const samePage = domAfterRestart.url === urlBeforeRestart
    const worksAfter = readBack && mutatedAgain && samePage

    // El click en vuelo pudo aplicarse cero o una vez; nunca dos por replay.
    // El de este turno es deliberado y se descuenta.
    const noReplay = clicksAfterRestart - clicksBefore <= 1

    record({
      id: 'V8',
      title: 'Matar el Engine con una mutación en vuelo: binding nuevo y sin replay',
      status: rebound && noReplay && worksAfter ? 'ok' : 'failed',
      detail: !rebound
        ? `el host no se volvió a registrar contra la instancia nueva (binding ${String(bindingAfter)})`
        : !noReplay
          ? `la página pasó de ${clicksBefore} a ${clicksAfterRestart} clicks: la mutación se reprodujo`
          : !worksAfter
            ? `hay binding nuevo pero el Engine nuevo no opera la misma vista por el broker — snapshot: ${readBack}; mutación: ${mutatedAgain}; misma URL: ${samePage} (turno ${afterRestart.terminal} ${afterRestart.terminalDetail}; eventos ${afterRestart.names.join(', ')}; traza ${afterRestart.trace.join(', ') || 'vacía'})`
            : `binding nuevo tras el reinicio; el Engine nuevo lee y muta **la misma vista** por el broker —misma URL, marca nueva en el DOM— y la mutación en vuelo no se reprodujo (${clicksBefore} → ${clicksAfterRestart})`,
      evidence: {
        clicksBefore,
        clicksAfterRestart,
        bindingChanged: rebound,
        worksAfterRestart: worksAfter,
        readBack,
        mutatedAgain,
        samePage,
        terminal: afterRestart.terminal,
        sessionFree,
        eventNames: afterRestart.names,
        urlBeforeRestart,
        domAfterRestart,
        trace: afterRestart.trace,
      },
    })

    // ── V13 / TOAST-REAL: Sonner real, renderer real y WebContentsView real.
    // El browser cubre casi todo el contenido, así que no hay un carril libre:
    // la oclusión medida debe recortar la vista nativa antes del click.
    await deps.services.setControl(sessionId, 'user')
    for (let attempt = 0; attempt < 100 && context.control !== 'user'; attempt += 1) {
      await sleep(100)
    }
    const toastLease = await deps.services.attachSlot(sessionId)
    const viewport = await deps.renderer.evaluate<{ width: number; height: number }>(
      '({ width: innerWidth, height: innerHeight })',
    )
    const toastLogical = {
      x: 8,
      y: 8,
      width: Math.max(320, viewport.width - 16),
      height: Math.max(240, viewport.height - 16),
    }
    const toastVisible = { ...toastLogical }
    await deps.services.updateSlot({
      slot_id: toastLease.slot_id,
      logical_bounds: toastLogical,
      visible_bounds: toastVisible,
      shown: true,
      layout_revision: 1,
      overlay_depth: 0,
      occlusions: [],
    })
    await sleep(300)

    const toastTargetBefore = deps.registry.target(context.contextId, null)?.targetId ?? null
    const toastUrlBefore = view.webContents.getURL()
    const toastMarker = `toast-${Date.now()}`
    await read(view, `(document.body.dataset.toastMarker = ${JSON.stringify(toastMarker)}, true)`)
    const clicksBeforeToast = await read<number>(view, 'window.__probe.clicks')
    await deps.renderer.evaluate(`window.dispatchEvent(new CustomEvent(
      'rinari:browser-vertical-toast-start',
      { detail: ${JSON.stringify({
        slotId: toastLease.slot_id,
        logicalBounds: toastLogical,
        visibleBounds: toastVisible,
        layoutRevision: 1,
      })} }
    ))`)

    type ToastUi = {
      rect: { x: number; y: number; width: number; height: number } | null
      button: { x: number; y: number; width: number; height: number } | null
      occlusions: Array<{ x: number; y: number; width: number; height: number }>
      action: number
      firstFrameProtected: boolean
    }
    let toastUi: ToastUi = {
      rect: null,
      button: null,
      occlusions: [],
      action: 0,
      firstFrameProtected: false,
    }
    let stableToastFrames = 0
    let previousToastRect = ''
    for (let attempt = 0; attempt < 100; attempt += 1) {
      toastUi = await deps.renderer.evaluate<ToastUi>(`(() => {
        const toast = document.querySelector('[data-testid="browser-vertical-toast"]')
        const button = toast?.querySelector('button')
        const box = toast?.getBoundingClientRect()
        const action = button?.getBoundingClientRect()
        let occlusions = []
        try { occlusions = JSON.parse(document.documentElement.dataset.rinariVerticalToastOcclusions || '[]') } catch {}
        return {
          rect: box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null,
          button: action ? { x: action.x, y: action.y, width: action.width, height: action.height } : null,
          occlusions,
          action: Number(document.documentElement.dataset.rinariVerticalToastAction || '0'),
          firstFrameProtected: document.documentElement.dataset.rinariVerticalToastFirstFrameProtected === 'true',
        }
      })()`)
      const rectKey = toastUi.rect ? JSON.stringify(toastUi.rect) : ''
      stableToastFrames = rectKey && rectKey === previousToastRect ? stableToastFrames + 1 : 0
      previousToastRect = rectKey
      const measuredOcclusion = Boolean(
        toastUi.rect &&
          toastUi.occlusions.some(
            (block) =>
              Math.abs(block.x - toastUi.rect!.x) <= 3 &&
              Math.abs(block.y - toastUi.rect!.y) <= 3 &&
              Math.abs(block.width - toastUi.rect!.width) <= 3 &&
              Math.abs(block.height - toastUi.rect!.height) <= 3,
          ),
      )
      const fullyVisible = Boolean(
        toastUi.rect &&
          toastUi.rect.x >= 0 &&
          toastUi.rect.y >= 0 &&
          toastUi.rect.x + toastUi.rect.width <= viewport.width + 1 &&
          toastUi.rect.y + toastUi.rect.height <= viewport.height + 1,
      )
      if (toastUi.button && measuredOcclusion && fullyVisible && stableToastFrames >= 2) break
      await sleep(100)
    }

    const nativeDuringToast = context.container.getBounds()
    const toastSeparated = Boolean(toastUi.rect && !overlaps(nativeDuringToast, toastUi.rect))
    if (toastUi.button) {
      if (deps.physicalClick) {
        deps.window.show()
        deps.window.focus()
        await sleep(300)
        const content = deps.window.getContentBounds()
        await deps.physicalClick(
          Math.round(content.x + toastUi.button.x + toastUi.button.width / 2),
          Math.round(content.y + toastUi.button.y + toastUi.button.height / 2),
        )
      } else {
        await deps.renderer.evaluate(
          `document.querySelector('[data-testid="browser-vertical-toast"] button')?.click()`,
        )
      }
    }
    await sleep(300)
    const actionAfter = await deps.renderer.evaluate<number>(
      `Number(document.documentElement.dataset.rinariVerticalToastAction || '0')`,
    )
    const clicksAfterToast = await read<number>(view, 'window.__probe.clicks')

    await deps.renderer.evaluate(
      `window.dispatchEvent(new Event('rinari:browser-vertical-toast-stop'))`,
    )
    let restoredToastGeometry = false
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const bounds = context.container.getBounds()
      restoredToastGeometry =
        bounds.x === toastVisible.x &&
        bounds.y === toastVisible.y &&
        bounds.width === toastVisible.width &&
        bounds.height === toastVisible.height
      if (restoredToastGeometry) break
      await sleep(100)
    }
    const toastTargetAfter = deps.registry.target(context.contextId, null)?.targetId ?? null
    const toastUrlAfter = view.webContents.getURL()
    const toastMarkerAfter = await read<string>(view, 'document.body.dataset.toastMarker')
    const toastOk =
      Boolean(toastUi.rect && toastUi.rect.height > 0) &&
      toastUi.firstFrameProtected &&
      toastSeparated &&
      actionAfter === 1 &&
      clicksAfterToast === clicksBeforeToast &&
      toastTargetAfter === toastTargetBefore &&
      toastUrlAfter === toastUrlBefore &&
      toastMarkerAfter === toastMarker &&
      restoredToastGeometry &&
      context.control === 'user'
    record({
      id: 'TOAST-REAL',
      title: 'Toast Sonner real queda visible y clicable sobre el browser nativo',
      status: toastOk ? 'ok' : 'failed',
      detail: toastOk
        ? `pila real ${Math.round(toastUi.rect!.width)}×${Math.round(toastUi.rect!.height)}; acción ejecutada, sin click-through y geometría restaurada`
        : `rect=${JSON.stringify(toastUi.rect)} native=${JSON.stringify(nativeDuringToast)} action=${actionAfter} clicks=${clicksBeforeToast}→${clicksAfterToast} restored=${restoredToastGeometry}`,
      evidence: {
        toastRect: toastUi.rect,
        measuredOcclusions: toastUi.occlusions,
        firstFrameProtected: toastUi.firstFrameProtected,
        nativeDuringToast,
        toastSeparated,
        actionAfter,
        clickThrough: clicksAfterToast !== clicksBeforeToast,
        sameTarget: toastTargetAfter === toastTargetBefore,
        sameUrl: toastUrlAfter === toastUrlBefore,
        sameDom: toastMarkerAfter === toastMarker,
        restoredToastGeometry,
        ownership: context.control,
        physicalClick: Boolean(deps.physicalClick),
      },
    })

    // ── RESTART-USER: un permiso manual nunca sobrevive al Engine que lo
    // concedió. La página, en cambio, sí: mismo target, URL, DOM y partición.
    const restartTargetBefore = deps.registry.target(context.contextId, null)?.targetId ?? null
    const restartUrlBefore = view.webContents.getURL()
    const restartMarker = `restart-user-${Date.now()}`
    await read(view, "(document.getElementById('field').value = '', true)")
    const restartField = await read<{ x: number; y: number }>(
      view,
      `(() => { const r = document.getElementById('field').getBoundingClientRect();
                return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
    )
    if (deps.physicalClick) {
      deps.window.show()
      deps.window.focus()
      await sleep(300)
      const content = deps.window.getContentBounds()
      const presented = context.container.getBounds()
      await deps.physicalClick(
        Math.round(content.x + presented.x + restartField.x),
        Math.round(content.y + presented.y + restartField.y),
        restartMarker,
      )
    } else {
      view.webContents.focus()
      for (const type of ['mouseDown', 'mouseUp'] as const) {
        view.webContents.sendInputEvent({
          type,
          x: restartField.x,
          y: restartField.y,
          button: 'left',
          clickCount: 1,
        })
      }
      for (const char of restartMarker) {
        view.webContents.sendInputEvent({ type: 'char', keyCode: char })
      }
    }
    await sleep(250)
    const valueBeforeUserRestart = await read<string>(view, "document.getElementById('field').value")
    const restartBindingBefore = deps.host.bindingId
    const restartUserPromise = deps.engine.restart()
    let flooredOnLoss = false
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const bounds = context.container.getBounds()
      flooredOnLoss = bounds.width <= 1 && bounds.height <= 1 && context.control === 'agent'
      if (flooredOnLoss) break
      await sleep(50)
    }
    const focusedAfterLoss = view.webContents.isFocused()
    if (deps.physicalType) await deps.physicalType('RST')
    await restartUserPromise
    for (let attempt = 0; attempt < 150; attempt += 1) {
      if (deps.host.registered && deps.host.bindingId !== restartBindingBefore) break
      await sleep(100)
    }
    const valueAfterUserRestart = await read<string>(view, "document.getElementById('field').value")
    const restartBindingAfter = deps.host.bindingId
    const restartTargetAfter = deps.registry.target(context.contextId, null)?.targetId ?? null

    const agentMarker = `agent-after-user-restart-${Date.now()}`
    await script([
      { tool: 'browser.snapshot', args: {} },
      { tool: 'browser.fill', args: { selector: '#field', value: agentMarker } },
      { tool: 'browser.click', args: { selector: '#go' } },
      { text: 'restored' },
    ])
    const afterUserRestart = await runTurn(sessionId, 'opera tras reiniciar con usuario al mando', 90_000)
    const afterUserDom = await read<{ field: string; result: string; url: string }>(
      view,
      `({ field: document.getElementById('field').value,
          result: document.getElementById('result').textContent,
          url: location.href })`,
    )
    const restartToolsOk = ['browser.snapshot', 'browser.fill', 'browser.click'].every((name) =>
      afterUserRestart.tools.some((tool) => tool.tool === name && tool.outcome === 'completed'),
    )
    const physicalProtected = deps.physicalType
      ? valueAfterUserRestart === valueBeforeUserRestart
      : true
    const restartUserOk =
      valueBeforeUserRestart === restartMarker &&
      flooredOnLoss &&
      !focusedAfterLoss &&
      physicalProtected &&
      restartBindingAfter !== null &&
      restartBindingAfter !== restartBindingBefore &&
      restartTargetAfter === restartTargetBefore &&
      afterUserDom.url === restartUrlBefore &&
      afterUserDom.field === agentMarker &&
      afterUserDom.result.includes(agentMarker) &&
      restartToolsOk &&
      context.control === 'agent'
    record({
      id: 'RESTART-USER',
      title: 'Reiniciar el Engine revoca control manual y conserva la misma página',
      status: restartUserOk ? 'ok' : 'failed',
      detail: restartUserOk
        ? 'la vista bajó a 1×1, perdió foco y no aceptó tecleo físico; el Engine nuevo reusó target/URL/DOM y volvió a operar'
        : `typed=${valueBeforeUserRestart === restartMarker}; floor=${flooredOnLoss}; focus=${focusedAfterLoss}; physical=${physicalProtected}; binding=${restartBindingBefore}→${restartBindingAfter}; target=${restartTargetBefore}→${restartTargetAfter}; tools=${restartToolsOk}`,
      evidence: {
        flooredOnLoss,
        focusedAfterLoss,
        physicalMeasured: Boolean(deps.physicalType),
        physicalProtected,
        valueBeforeUserRestart,
        valueAfterUserRestart,
        bindingBefore: restartBindingBefore,
        bindingAfter: restartBindingAfter,
        sameTarget: restartTargetAfter === restartTargetBefore,
        sameUrl: afterUserDom.url === restartUrlBefore,
        sameDom: afterUserDom.result.includes(agentMarker),
        userControlPreserved: context.control === 'user',
        toolsOk: restartToolsOk,
        trace: afterUserRestart.trace,
      },
    })
    await deps.services.detachSlot(toastLease.slot_id)
  } catch (error) {
    // ¿Sigue vivo el Engine? Distingue «se bloqueó el loop de stdio» de «se
    // bloqueó esta operación», que llevan a sitios muy distintos.
    let alive: string
    try {
      await deps.engine.request('engine.info', {}, 5_000)
      alive = 'el Engine responde a engine.info: el loop de stdio sigue atendiendo'
    } catch (probeError) {
      alive = `el Engine no responde ni a engine.info: ${message(probeError)}`
    }
    record({
      id: 'V0',
      title: 'La prueba vertical terminó',
      status: 'failed',
      detail: `abortó: ${message(error)} — ${alive}`,
      evidence: { approvals: approvals.length, lastEvents: events.slice(-12).map((e) => e.event) },
    })
  } finally {
    stopListening()
  }

  const failed = steps.filter((step) => step.status === 'failed').length
  const skipped = steps.filter((step) => step.status === 'skipped').length
  return {
    steps,
    summary: { total: steps.length, ok: steps.length - failed - skipped, failed, skipped },
  }
}

/** La observación de una herramienta viaja como JSON en texto. */
function parseObservation(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    const data = parsed.data
    return (data && typeof data === 'object' ? (data as Record<string, unknown>) : parsed) ?? null
  } catch {
    return null
  }
}

function errorCodeOf(tool: Record<string, unknown> | undefined): string | null {
  if (!tool) return null
  const error = tool.error
  if (error && typeof error === 'object') {
    const code = (error as Record<string, unknown>).code
    if (typeof code === 'string') return code
  }
  const observation = parseObservation(tool.observation)
  const code = observation?.code ?? (observation?.error as Record<string, unknown> | undefined)?.code
  return typeof code === 'string' ? code : null
}
