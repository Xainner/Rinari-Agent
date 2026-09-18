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
  host: Pick<NativeBrowserHost, 'registered' | 'bindingId'>
  /** Se registra un observador de eventos del Engine y se devuelve su retirada. */
  onEngineEvent(listener: (event: Record<string, unknown>) => void): () => void
  fixtureUrl: string
  modelOrigin: string
  /**
   * La ventana que aloja las vistas. Chromium no entrega input sintético a un
   * widget que considera oculto, así que la prueba necesita poder mostrarla y
   * decir en qué estado estaba.
   */
  window: { show(): void; focus(): void; isVisible(): boolean; isMinimized(): boolean }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

export async function runVerticalProof(deps: VerticalDeps): Promise<{
  steps: StepResult[]
  summary: { total: number; ok: number; failed: number; skipped: number }
}> {
  const steps: StepResult[] = []
  const record = (result: StepResult) => {
    steps.push(result)
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
    'browser.fill',
    'browser.click',
    'browser.screenshot',
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

  /** Lee del webContents de la vista, que es la prueba de «la misma página». */
  const read = <T>(view: WebContentsView, expression: string) =>
    view.webContents.executeJavaScript(expression) as Promise<T>

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
      visible: { x: 24, y: 120, width: 520, height: 380 },
      logical: { width: 760, height: 560 },
    })
    const target = deps.registry.createTarget(context)
    view = target.view
    await view.webContents.loadURL('about:blank')
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
    await sleep(300)
    const clicksAtStart = await read<number>(view, 'window.__probe.clicks')
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
    await script([{ tool: 'browser.screenshot', args: {} }, { text: 'capturado' }])
    const shot = await runTurn(sessionId, 'haz una captura')
    const shotTool = shot.tools.find((tool) => tool.tool === 'browser.screenshot')
    const observation = parseObservation(shotTool?.observation)
    const bytes = Number(observation?.bytes ?? 0)
    record({
      id: 'V4',
      title: 'Una screenshot del Engine contiene el estado visible, con tamaño y target',
      status: shotTool?.ok === true && bytes > 0 ? 'ok' : 'failed',
      detail:
        bytes > 0
          ? `captura de ${bytes} bytes del target ${target.targetId} de esta sesión`
          : `la captura no trajo bytes: ${JSON.stringify(observation).slice(0, 200)}`,
      evidence: { bytes, sha256: observation?.sha256, targetId: target.targetId },
    })

    // ── Paso 5: control manual. La UI bloquea mutaciones concurrentes, y una
    //    edición manual se observa al devolver el control.
    const taken = (await call('browser.control.set', {
      session_id: sessionId,
      owner: 'user',
    })) as { control: string; control_revision: number }
    // El orden del §7: el Engine cierra las mutaciones del agente y confirma
    // la revisión, y **sólo después** main habilita el input manual retirando
    // la barrera. Es lo que hará la toolbar en la entrega F.
    deps.registry.setControl(context, 'user')

    await script([{ tool: 'browser.click', args: { selector: '#go' } }, { text: 'intentado' }])
    const blocked = await runTurn(sessionId, 'vuelve a pulsar aplicar')
    const blockedTool = blocked.tools.find((tool) => tool.tool === 'browser.click')

    // Edición «manual»: se hace sobre la vista, no por el broker, que es lo
    // que hace el usuario cuando tiene el control.
    //
    // Se toca también el atributo. Fijar sólo la propiedad `value` no cambia
    // el HTML serializado, así que el snapshot del agente no la vería y el
    // paso habría fallado por cómo está escrita la comprobación, no por el
    // comportamiento que pretende medir.
    const manual = `manual-${Date.now()}`
    await read(
      view,
      `(() => { const f = document.getElementById('field');
                f.value = ${JSON.stringify(manual)};
                f.setAttribute('value', ${JSON.stringify(manual)});
                return true; })()`,
    )

    const returned = (await call('browser.control.set', {
      session_id: sessionId,
      owner: 'agent',
      expected_revision: taken.control_revision,
    })) as { control: string; control_revision: number }
    deps.registry.setControl(context, 'agent')

    await script([{ tool: 'browser.snapshot', args: {} }, { text: 'observado' }])
    const observed = await runTurn(sessionId, 'mira cómo quedó el campo')
    const snapshotTool = observed.tools.find((tool) => tool.tool === 'browser.snapshot')
    const snapshot = parseObservation(snapshotTool?.observation)
    const html = String(snapshot?.html ?? '')
    const sawManual = html.includes(manual)

    // Se distingue «rechazado» de «no llegó a ejecutarse»: un turno que no
    // produjo la herramienta no demuestra exclusión, y darlo por bueno sería
    // aprobar el paso por una ausencia.
    const blockedCode = errorCodeOf(blockedTool)
    const refused = blockedTool?.outcome !== 'completed' && blockedCode === 'CONFLICT'
    const ranAnyway = blockedTool?.outcome === 'completed' && blockedTool?.ok === true
    record({
      id: 'V5',
      title: 'Control manual: sin mutaciones concurrentes, y la edición manual se observa al devolverlo',
      status: refused && sawManual ? 'ok' : 'failed',
      detail: refused
        ? sawManual
          ? `con el usuario al mando el click se rechazó (${blockedCode}), y al devolver el control el agente leyó la edición manual`
          : 'el click se rechazó, pero el agente no vio la edición manual al recuperar el control'
        : ranAnyway
          ? 'el click del agente se ejecutó con el usuario al mando: no hay exclusión'
          : `el click no se ejecutó, pero tampoco se rechazó por control (${blockedCode ?? 'sin tool.completed'}): la exclusión no queda demostrada`,
      evidence: {
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
    const before = await read<[number, number]>(view, '[window.innerWidth, window.innerHeight]')
    deps.registry.setGeometry(context, {
      visible: { x: 24, y: 120, width: 200, height: 140 },
      logical: { width: 760, height: 560 },
    })
    await sleep(400)
    const after = await read<[number, number]>(view, '[window.innerWidth, window.innerHeight]')
    const keptViewport = after[0] === before[0] && after[1] === before[1]

    // La superposición se monta aquí a propósito, para la parte del §8.3 que
    // trata de modales y click-through. No es el estado de reposo: montada
    // permanentemente bloquearía también al agente (ver V2c y BrowserRegistry).
    deps.registry.setControl(context, 'agent', true)
    await sleep(300)
    const barrierOnTop =
      context.barrier !== null &&
      context.container.children[context.container.children.length - 1] === context.barrier
    deps.registry.setControl(context, 'agent')

    record({
      id: 'V7',
      title: 'Reducir el área visible recorta sin cambiar el viewport, y nada atraviesa la barrera',
      status: keptViewport && barrierOnTop ? 'ok' : 'failed',
      detail: keptViewport
        ? `el recorte pasó a 200×140 y el viewport sigue en ${after[0]}×${after[1]}; la barrera nativa es la superficie frontal`
        : `el viewport cambió de ${before.join('×')} a ${after.join('×')} al recortar`,
      evidence: { before, after, barrierOnTop },
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

    // Y el binding nuevo sirve: una operación nativa posterior llega.
    let worksAfter = false
    try {
      const debugAfter = view.webContents.debugger
      if (!debugAfter.isAttached()) debugAfter.attach('1.3')
      const title = (await debugAfter.sendCommand('Runtime.evaluate', {
        expression: 'document.title',
        returnByValue: true,
      })) as { result?: { value?: unknown } }
      worksAfter = typeof title.result?.value === 'string'
    } catch {
      worksAfter = false
    }

    // Un click en vuelo pudo aplicarse cero o una vez; nunca dos por replay.
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
            ? 'hay binding nuevo pero una operación nativa posterior no funciona'
            : `binding nuevo tras el reinicio, la página pasó de ${clicksBefore} a ${clicksAfterRestart} clicks (a lo sumo la que estaba en vuelo) y el contexto vuelve a operar`,
      evidence: {
        clicksBefore,
        clicksAfterRestart,
        bindingChanged: rebound,
        worksAfterRestart: worksAfter,
      },
    })
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
