/**
 * Sonda de viabilidad del browser nativo (documento 03 §3).
 *
 * El documento 03 dice que esta etapa «prueba viabilidad de la integración
 * elegida, no paridad total de herramientas», y manda registrar las decisiones
 * de clipping, DPI, input y métodos CDP. Esta sonda es de dónde salen esos
 * datos: abre Electron de verdad, hace las preguntas que pueden invalidar el
 * diseño y publica lo que observó.
 *
 * Deliberadamente **no** afirma nada que no haya medido. Una comprobación que
 * no se pudo ejecutar sale como `inconclusive`, no como aprobada: el valor de
 * esto es que `docs/architecture/browser-native.md` se escriba con hechos.
 *
 *   npm run browser:probe
 */

import {
  app,
  BaseWindow,
  WebContentsView,
  View,
  desktopCapturer,
  screen,
  session,
  type NativeImage,
} from 'electron'

import { startFixture, SLOT_COLOR, BACKDROP_COLOR, type Fixture } from './fixture'

/** Geometría de la prueba: el slot visible es más pequeño que la página. */
const WINDOW = { width: 900, height: 700 }
const CLIP = { x: 60, y: 80, width: 400, height: 300 }
const LOGICAL = { width: 760, height: 560 }

type Status = 'ok' | 'failed' | 'inconclusive'

interface Check {
  id: string
  question: string
  status: Status
  /** La conclusión en una frase: es lo que se cita en el documento. */
  finding: string
  detail?: unknown
}

const checks: Check[] = []
function record(check: Check): Check {
  checks.push(check)
  return check
}

function fail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Cuenta píxeles cercanos a un color en un bitmap BGRA. */
function countColor(
  image: NativeImage,
  color: { r: number; g: number; b: number },
  tolerance = 24,
): number {
  const bitmap = image.toBitmap()
  let hits = 0
  for (let index = 0; index + 3 < bitmap.length; index += 4) {
    const b = bitmap[index]
    const g = bitmap[index + 1]
    const r = bitmap[index + 2]
    if (
      Math.abs(r - color.r) <= tolerance &&
      Math.abs(g - color.g) <= tolerance &&
      Math.abs(b - color.b) <= tolerance
    ) {
      hits += 1
    }
  }
  return hits
}

/** Vista remota endurecida (documento 03 §9): sin Node, sin preload, aislada. */
function remoteView(partition: string): WebContentsView {
  return new WebContentsView({
    webPreferences: {
      partition,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      // Sin preload: el contenido remoto no recibe ningún puente.
    },
  })
}

async function load(view: WebContentsView, url: string): Promise<void> {
  const done = new Promise<void>((resolve, reject) => {
    view.webContents.once('did-finish-load', () => resolve())
    view.webContents.once('did-fail-load', (_event, code, description) =>
      reject(new Error(`did-fail-load ${code}: ${description}`)),
    )
  })
  await view.webContents.loadURL(url)
  await done
}

// ─────────────────────────────────────────────────────────────────────────────
// Clipping y viewport (§8.2, §8.3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La pregunta del §8.3: ¿recorta algo una vista nativa?
 *
 * La hipótesis que se prueba es la jerarquía de vistas: una `View` contenedora
 * con los bounds del recorte y la `WebContentsView` dentro con bounds lógicos
 * mayores. Si el padre recorta, se obtiene lo que pide el §8.2 —«mantener
 * bounds lógicos y clip separados»— sin encoger el viewport del documento.
 */
async function probeClipping(
  window: BaseWindow,
  fixture: Fixture,
): Promise<{ slot: WebContentsView; clip: View | null }> {
  // Fondo plano bajo todo: lo no cubierto por el slot es medible.
  const backdrop = remoteView('probe-backdrop')
  backdrop.setBounds({ x: 0, y: 0, ...WINDOW })
  window.contentView.addChildView(backdrop)
  await load(backdrop, fixture.backdropUrl)

  const slot = remoteView('probe-session-a')

  let clip: View | null = null
  if (typeof View === 'function') {
    try {
      clip = new View()
      clip.setBounds({ ...CLIP })
      window.contentView.addChildView(clip)
      clip.addChildView(slot)
      // Bounds relativos al padre y mayores que él: si no hay recorte, la
      // página se pintará fuera del slot.
      slot.setBounds({ x: 0, y: 0, ...LOGICAL })
    } catch (error) {
      record({
        id: 'CLIP-00',
        question: '¿Se puede anidar una WebContentsView dentro de una View contenedora?',
        status: 'failed',
        finding: `anidar falló: ${fail(error)}`,
      })
      clip = null
    }
  }

  if (!clip) {
    // Sin contenedor no hay hipótesis que probar; se coloca plano para poder
    // seguir con el resto de comprobaciones.
    window.contentView.addChildView(slot)
    slot.setBounds({ x: CLIP.x, y: CLIP.y, ...LOGICAL })
    record({
      id: 'CLIP-00',
      question: '¿Existe `View` como contenedor anidable en esta versión?',
      status: 'failed',
      finding: '`View` no está disponible; no hay separación entre bounds lógicos y recorte.',
    })
  } else {
    record({
      id: 'CLIP-00',
      question: '¿Se puede anidar una WebContentsView dentro de una View contenedora?',
      status: 'ok',
      finding: 'Sí: `new View()` admite `addChildView` y acepta una WebContentsView.',
    })
  }

  await load(slot, fixture.slotUrl)
  await sleep(600)

  // ── Viewport lógico: lo que el §8.2 prohíbe romper.
  const viewport = (await slot.webContents.executeJavaScript(
    '[window.innerWidth, window.innerHeight, window.devicePixelRatio]',
  )) as [number, number, number]

  const keptLogical = viewport[0] === LOGICAL.width && viewport[1] === LOGICAL.height
  record({
    id: 'CLIP-01',
    question:
      '¿El viewport del documento conserva los bounds lógicos aunque el recorte visible sea menor?',
    status: keptLogical ? 'ok' : 'failed',
    finding: keptLogical
      ? `Sí: el recorte de ${CLIP.width}×${CLIP.height} no encogió el viewport, que sigue en ${viewport[0]}×${viewport[1]}.`
      : `No: con un recorte de ${CLIP.width}×${CLIP.height} el viewport quedó en ${viewport[0]}×${viewport[1]}, se esperaba ${LOGICAL.width}×${LOGICAL.height}.`,
    detail: {
      clip: CLIP,
      logical: LOGICAL,
      innerSize: [viewport[0], viewport[1]],
      devicePixelRatio: viewport[2],
    },
  })

  return { slot, clip }
}

/**
 * ¿Pinta la vista nativa fuera del slot? Se responde con la imagen compuesta
 * por el sistema, no con lo que diga la API: capturar el webContents de la
 * ventana no incluiría las vistas nativas hijas, que es justo lo que se mide.
 */
async function probeComposition(window: BaseWindow, scaleFactor: number): Promise<void> {
  let image: NativeImage | null = null
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: {
        width: Math.ceil(WINDOW.width * scaleFactor),
        height: Math.ceil(WINDOW.height * scaleFactor),
      },
    })
    const source = sources.find((entry) => entry.name === window.getTitle())
    image = source?.thumbnail ?? null
    if (!image || image.isEmpty()) image = null
  } catch (error) {
    record({
      id: 'CLIP-02',
      question: '¿La superficie nativa queda dentro del slot en la composición real?',
      status: 'inconclusive',
      finding: `no se pudo capturar la ventana del sistema: ${fail(error)}`,
    })
    return
  }

  if (!image) {
    record({
      id: 'CLIP-02',
      question: '¿La superficie nativa queda dentro del slot en la composición real?',
      status: 'inconclusive',
      finding:
        'el capturador no devolvió la ventana de la sonda; sin imagen compuesta no se afirma nada sobre el recorte.',
    })
    return
  }

  const size = image.getSize()
  // La miniatura se escala al tamaño pedido conservando proporción; la
  // relación real entre píxeles de captura y DIP se deduce de lo devuelto.
  const captureScale = size.width / WINDOW.width
  const slotPixels = countColor(image, SLOT_COLOR)
  const backdropPixels = countColor(image, BACKDROP_COLOR)
  const clipArea = Math.round(CLIP.width * CLIP.height * captureScale * captureScale)
  const logicalArea = Math.round(LOGICAL.width * LOGICAL.height * captureScale * captureScale)

  // El margen es amplio a propósito: entre el color del formulario, el
  // antialias y la gestión de color, el recuento nunca da exacto. Lo que se
  // decide aquí es cuál de las dos áreas —recorte o lógica— explica la imagen,
  // y se diferencian por más de tres veces.
  const nearClip = slotPixels <= clipArea * 1.15
  const overflows = slotPixels > clipArea * 1.5

  record({
    id: 'CLIP-02',
    question: '¿La superficie nativa queda dentro del slot en la composición real?',
    status: nearClip ? 'ok' : overflows ? 'failed' : 'inconclusive',
    finding: nearClip
      ? `Sí: la página ocupa ~${slotPixels} px de captura, compatible con el recorte de ${clipArea} px y muy por debajo de los ${logicalArea} px del área lógica. La View contenedora recorta.`
      : overflows
        ? `No: la página ocupa ~${slotPixels} px de captura, por encima del recorte de ${clipArea} px. Pinta fuera del slot y hace falta el fallback geométrico del §8.3.`
        : `Indeterminado: ~${slotPixels} px frente a ${clipArea} px de recorte y ${logicalArea} px de área lógica.`,
    detail: {
      captureSize: size,
      captureScale,
      slotPixels,
      backdropPixels,
      expectedClipPixels: clipArea,
      expectedLogicalPixels: logicalArea,
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// DPI (§8.2)
// ─────────────────────────────────────────────────────────────────────────────

async function probeDpi(slot: WebContentsView, scaleFactor: number): Promise<void> {
  const bounds = slot.getBounds()
  const page = (await slot.webContents.executeJavaScript(
    '[window.innerWidth, window.innerHeight, window.devicePixelRatio, window.outerWidth]',
  )) as [number, number, number, number]

  let shotSize: { width: number; height: number } | null = null
  try {
    const shot = await slot.webContents.capturePage()
    shotSize = shot.getSize()
  } catch {
    shotSize = null
  }

  // La pregunta del §8.2 es qué unidad quiere cada API. `setBounds` devolvió
  // lo mismo que se le dio y la página informa el mismo tamaño: entonces
  // `setBounds` habla en DIP/CSS, no en píxeles físicos.
  const boundsAreDip = bounds.width === LOGICAL.width && page[0] === LOGICAL.width
  record({
    id: 'DPI-01',
    question: '¿En qué unidad habla `setBounds` frente a los píxeles de la captura?',
    status: boundsAreDip ? 'ok' : 'failed',
    finding: boundsAreDip
      ? `\`setBounds\` y \`window.innerWidth\` coinciden en ${LOGICAL.width}; son DIP/CSS. La captura sale en píxeles físicos (${shotSize ? `${shotSize.width}×${shotSize.height}` : 'no disponible'}) con factor ${scaleFactor}. No se multiplica por devicePixelRatio al colocar la vista; sí al interpretar la imagen.`
      : `Discrepancia: bounds ${bounds.width}×${bounds.height}, innerSize ${page[0]}×${page[1]}, esperado ${LOGICAL.width}×${LOGICAL.height}.`,
    detail: {
      displayScaleFactor: scaleFactor,
      viewBounds: bounds,
      innerSize: [page[0], page[1]],
      devicePixelRatio: page[2],
      capturePageSize: shotSize,
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// CDP por `webContents.debugger` (§3 [E5], §6.3)
// ─────────────────────────────────────────────────────────────────────────────

async function probeCdp(slot: WebContentsView): Promise<void> {
  const debug = slot.webContents.debugger
  try {
    debug.attach('1.3')
  } catch (error) {
    record({
      id: 'CDP-01',
      question: '¿Se puede hablar CDP con el target por `webContents.debugger`?',
      status: 'failed',
      finding: `attach falló: ${fail(error)}`,
    })
    return
  }

  // Los dominios que necesitan snapshot, a11y, screenshot e input.
  const pageLevel = [
    'Page.enable',
    'DOM.enable',
    'Runtime.enable',
    'Accessibility.enable',
    'Network.enable',
    'Input.setIgnoreInputEvents',
  ]
  const supported: string[] = []
  const unsupported: Record<string, string> = {}
  for (const method of pageLevel) {
    try {
      const params = method === 'Input.setIgnoreInputEvents' ? { ignore: false } : {}
      await debug.sendCommand(method, params)
      supported.push(method)
    } catch (error) {
      unsupported[method] = fail(error)
    }
  }

  record({
    id: 'CDP-01',
    question: '¿Qué dominios CDP page-level responden por `webContents.debugger`?',
    status: unsupported['Page.enable'] || unsupported['DOM.enable'] ? 'failed' : 'ok',
    finding: `Responden ${supported.length}/${pageLevel.length}: ${supported.join(', ')}.${
      Object.keys(unsupported).length ? ` No responden: ${Object.keys(unsupported).join(', ')}.` : ''
    }`,
    detail: { supported, unsupported },
  })

  // Lo que el §6.3 advierte: las APIs browser-level no se pasan ciegamente a
  // un debugger page-level. Se comprueba, no se supone.
  const browserLevel = ['Target.getTargets', 'Browser.getVersion', 'Browser.setDownloadBehavior']
  const reachable: string[] = []
  const rejected: Record<string, string> = {}
  for (const method of browserLevel) {
    try {
      const params = method === 'Browser.setDownloadBehavior' ? { behavior: 'deny' } : {}
      await debug.sendCommand(method, params)
      reachable.push(method)
    } catch (error) {
      rejected[method] = fail(error)
    }
  }

  record({
    id: 'CDP-02',
    question: '¿Alcanza el debugger page-level a las APIs browser-level que usa el manager?',
    status: 'ok',
    finding: reachable.length
      ? `Alcanzables desde la sesión page-level: ${reachable.join(', ')}. Rechazadas: ${Object.keys(rejected).join(', ') || 'ninguna'}. Las alcanzables exponen ámbito mayor que el target y no deben pasarse a la herramienta sin acotar.`
      : `Ninguna: ${Object.keys(rejected).join(', ')} son inalcanzables desde una sesión page-level. Hay que implementar su equivalente con APIs de \`session\`/webContents o devolver incompatibilidad explícita (§6.3).`,
    detail: { reachable, rejected },
  })

  // Screenshot del target real (§6.3, paso 4 del §3).
  try {
    const shot = (await debug.sendCommand('Page.captureScreenshot', { format: 'png' })) as {
      data: string
    }
    const bytes = Buffer.from(shot.data, 'base64')
    const image = (await import('electron')).nativeImage.createFromBuffer(bytes)
    const size = image.getSize()
    record({
      id: 'CDP-03',
      question: '¿`Page.captureScreenshot` devuelve el target visible con tamaño identificable?',
      status: size.width > 0 && size.height > 0 ? 'ok' : 'failed',
      finding: `Sí: ${bytes.length} bytes PNG de ${size.width}×${size.height}, del target adjunto.`,
      detail: { bytes: bytes.length, size },
    })
  } catch (error) {
    record({
      id: 'CDP-03',
      question: '¿`Page.captureScreenshot` devuelve el target visible con tamaño identificable?',
      status: 'failed',
      finding: `falló: ${fail(error)}`,
    })
  }

  // El conflicto del [E5]: DevTools sobre la misma página desengancha el
  // debugger. Si ocurre, el broker tiene que enterarse y no prometer dos
  // controladores.
  const detached = new Promise<string>((resolve) => {
    debug.once('detach', (_event, reason) => resolve(reason))
    setTimeout(() => resolve(''), 2500)
  })
  slot.webContents.openDevTools({ mode: 'detach' })
  const reason = await detached
  slot.webContents.closeDevTools()

  record({
    id: 'CDP-04',
    question: '¿Abrir DevTools sobre la página desengancha el debugger del broker?',
    status: 'ok',
    finding: reason
      ? `Sí: el debugger recibió \`detach\` con motivo «${reason}». El broker debe observar ese evento, invalidar pendientes y declarar el contexto sin control, no reintentar a ciegas.`
      : 'No en esta versión: el debugger siguió adjunto tras abrir DevTools. Aun así el evento `detach` es la señal a la que hay que suscribirse.',
    detail: { detachReason: reason || null, stillAttached: debug.isAttached() },
  })

  if (debug.isAttached()) debug.detach()
}

// ─────────────────────────────────────────────────────────────────────────────
// Arbitraje de input (§7)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La pregunta del §7: se puede bloquear la entrada del usuario sin bloquear la
 * del agente. Si ambas rutas se bloquean a la vez, o ninguna, el arbitraje
 * necesita una barrera nativa aparte.
 */
async function probeInputArbitration(slot: WebContentsView, url: string): Promise<void> {
  const contents = slot.webContents
  const seen = { input: 0, mouse: 0 }
  // Dos interruptores separados: si se bloquean a la vez no se puede saber
  // **cuál** barrera detuvo el evento, y la decisión del §7 depende de eso.
  const block = { keyboard: false, mouse: false }

  contents.on('before-input-event', (event) => {
    seen.input += 1
    if (block.keyboard) event.preventDefault()
  })
  // `before-mouse-event` no está en todas las versiones; registrarlo no prueba
  // que exista, por eso se mide si llega a dispararse —y se mide **después**
  // de haber despachado eventos de ratón, no antes.
  ;(contents as unknown as { on: (name: string, fn: (event: Electron.Event) => void) => void }).on(
    'before-mouse-event',
    (event) => {
      seen.mouse += 1
      if (block.mouse) event.preventDefault()
    },
  )

  const reset = () => contents.executeJavaScript('window.__probe.clicks = 0, window.__probe.keys = 0')
  const state = () =>
    contents.executeJavaScript('[window.__probe.clicks, window.__probe.keys]') as Promise<
      [number, number]
    >

  /** Teclas por la vía de entrada del widget, la que usa el input físico. */
  const typeBySendInput = async (keyCode: string): Promise<number> => {
    await reset()
    contents.sendInputEvent({ type: 'keyDown', keyCode })
    contents.sendInputEvent({ type: 'char', keyCode })
    contents.sendInputEvent({ type: 'keyUp', keyCode })
    await sleep(250)
    return (await state())[1]
  }

  /** Click por la vía del widget. */
  const clickBySendInput = async (): Promise<number> => {
    await reset()
    for (const type of ['mouseDown', 'mouseUp'] as const) {
      contents.sendInputEvent({ type, x: 40, y: 40, button: 'left', clickCount: 1 })
    }
    await sleep(250)
    return (await state())[0]
  }

  const debug = contents.debugger
  /** Click por la vía del agente: la sesión CDP del broker. */
  const clickByCdp = async (): Promise<number> => {
    await reset()
    for (const type of ['mousePressed', 'mouseReleased'] as const) {
      await debug.sendCommand('Input.dispatchMouseEvent', {
        type,
        x: 40,
        y: 40,
        button: 'left',
        clickCount: 1,
      })
    }
    await sleep(250)
    return (await state())[0]
  }

  // ── INPUT-01: el teclado se cierra por `before-input-event`.
  block.keyboard = false
  const openKeys = await typeBySendInput('a')
  block.keyboard = true
  const blockedKeys = await typeBySendInput('b')
  block.keyboard = false

  record({
    id: 'INPUT-01',
    question: '¿`before-input-event` con `preventDefault` impide que la tecla llegue a la página?',
    status: openKeys > 0 && blockedKeys === 0 ? 'ok' : 'failed',
    finding:
      openKeys > 0 && blockedKeys === 0
        ? `Sí: sin bloqueo la página contó ${openKeys} keydown; con bloqueo, ${blockedKeys}. El teclado se puede cerrar por webContents.`
        : `No concluyente: sin bloqueo ${openKeys}, con bloqueo ${blockedKeys}. El teclado no se cierra de forma fiable por esta vía.`,
    detail: { openKeys, blockedKeys, beforeInputFired: seen.input },
  })

  // ── INPUT-02: ¿existe `before-mouse-event`? Ahora sí se despachan eventos de
  //    ratón antes de responder.
  const firedBefore = seen.mouse
  const openClicksWidget = await clickBySendInput()
  block.mouse = true
  const blockedClicksWidget = await clickBySendInput()
  block.mouse = false
  const mouseFired = seen.mouse - firedBefore

  const mouseBarrierWorks = openClicksWidget > 0 && blockedClicksWidget === 0
  record({
    id: 'INPUT-02',
    question: '¿Existe `before-mouse-event` y bloquea el click en la versión fijada?',
    status: mouseFired > 0 && mouseBarrierWorks ? 'ok' : mouseFired > 0 ? 'failed' : 'inconclusive',
    finding:
      mouseFired === 0
        ? `No se disparó pese a despachar ${openClicksWidget + blockedClicksWidget > 0 ? 'clicks' : 'eventos'} de ratón: el evento no existe o no cubre esta vía. No se puede afirmar cobertura de ratón, wheel, IME, touch ni drag/drop; el §7 exige entonces barrera nativa o interacción manual deshabilitada para esos casos.`
        : mouseBarrierWorks
          ? `Sí: se disparó ${mouseFired} veces y con \`preventDefault\` el click no llegó (${openClicksWidget} sin bloqueo, ${blockedClicksWidget} con bloqueo).`
          : `Se dispara (${mouseFired} veces) pero no bloquea: ${openClicksWidget} clicks sin bloqueo y ${blockedClicksWidget} con bloqueo.`,
    detail: { fired: mouseFired, openClicksWidget, blockedClicksWidget },
  })

  // ── INPUT-03: la separación que decide el arbitraje. Con la barrera puesta,
  //    ¿sigue pasando el input del agente por CDP? Se mide **con y sin**
  //    barrera: sin línea base, un cero no distingue «lo bloqueó el arbitraje»
  //    de «el click nunca funcionó», y eso llevaría a diseñar una barrera para
  //    un problema inexistente.
  let openClicksCdp = -1
  let blockedClicksCdp = -1
  try {
    if (!debug.isAttached()) debug.attach('1.3')
    block.keyboard = false
    block.mouse = false
    openClicksCdp = await clickByCdp()
    // Se cierran ambas barreras de webContents: es lo que haría el arbitraje
    // para dejar fuera al usuario.
    block.keyboard = true
    block.mouse = true
    blockedClicksCdp = await clickByCdp()
    block.keyboard = false
    block.mouse = false
  } catch (error) {
    record({
      id: 'INPUT-03',
      question: '¿El input del agente por CDP es independiente de las barreras de webContents?',
      status: 'inconclusive',
      finding: `no se pudo despachar por CDP: ${fail(error)}`,
    })
    block.keyboard = false
    block.mouse = false
    return
  }

  const independent = openClicksCdp > 0 && blockedClicksCdp > 0
  record({
    id: 'INPUT-03',
    question: '¿El input del agente por CDP es independiente de las barreras de webContents?',
    status: openClicksCdp === 0 ? 'inconclusive' : independent ? 'ok' : 'failed',
    finding:
      openClicksCdp === 0
        ? `Indeterminado: el click por CDP tampoco llegó sin barrera (${openClicksCdp}). No hay línea base, así que no se puede atribuir nada al arbitraje.`
        : independent
          ? `Sí: sin barrera ${openClicksCdp} click y con barrera ${blockedClicksCdp}. \`Input.dispatchMouseEvent\` no pasa por la intercepción de webContents, así que el arbitraje puede cerrar la ruta del usuario sin cerrar la del agente.`
          : `No: sin barrera el click por CDP llegó (${openClicksCdp}), con barrera no (${blockedClicksCdp}). Las dos rutas comparten intercepción; cerrar la entrada del usuario cerraría también la del agente.`,
    detail: { openClicksCdp, blockedClicksCdp },
  })

  // ── INPUT-04: la candidata que el §7 no contempla. `Input.setIgnoreInputEvents`
  //    existe justo para esto: ignorar la entrada del usuario dejando pasar la
  //    despachada por CDP. Si funciona, el arbitraje tiene su barrera sin
  //    inventar una nativa.
  try {
    await debug.sendCommand('Input.setIgnoreInputEvents', { ignore: true })
    const widgetUnderIgnore = await clickBySendInput()
    const cdpUnderIgnore = await clickByCdp()
    await debug.sendCommand('Input.setIgnoreInputEvents', { ignore: false })
    const afterRelease = await clickBySendInput()

    const separates = widgetUnderIgnore === 0 && cdpUnderIgnore > 0
    record({
      id: 'INPUT-04',
      question:
        '¿`Input.setIgnoreInputEvents` separa la entrada del usuario de la del agente?',
      status: separates ? 'ok' : 'failed',
      finding: separates
        ? `Sí: con \`ignore: true\` el click por la vía del widget no llegó (${widgetUnderIgnore}) y el despachado por CDP sí (${cdpUnderIgnore}); al soltarlo la vía del widget vuelve (${afterRelease}). Es la barrera del arbitraje: se activa mientras el agente muta y no le estorba.`
        : `No: con \`ignore: true\` la vía del widget dio ${widgetUnderIgnore} y la de CDP ${cdpUnderIgnore}. No separa las dos rutas.`,
      detail: { widgetUnderIgnore, cdpUnderIgnore, afterRelease },
    })
  } catch (error) {
    record({
      id: 'INPUT-04',
      question: '¿`Input.setIgnoreInputEvents` separa la entrada del usuario de la del agente?',
      status: 'inconclusive',
      finding: `no se pudo ejercitar: ${fail(error)}`,
    })
  }

  if (debug.isAttached()) debug.detach()
  void url
}

// ─────────────────────────────────────────────────────────────────────────────
// Barrera nativa y click-through (§7, §8.3; pasos 5 y 7 del §3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La última opción que nombra el §7 cuando ninguna intercepción distingue al
 * usuario del agente: «una barrera nativa probada».
 *
 * Probarla exige entrada real del sistema. `sendInputEvent` se dirige a un
 * webContents concreto y no pasa por el hit-testing, así que daría por buena
 * cualquier superposición. Aquí se sintetiza un click de ratón del sistema,
 * con línea base antes y después: sin las dos, «no llegó» no distingue barrera
 * de ventana desenfocada.
 */
async function probeNativeBarrier(
  window: BaseWindow,
  clip: View | null,
  slot: WebContentsView,
  fixture: Fixture,
): Promise<void> {
  const script = process.env.RINARI_PROBE_PS1
  if (process.platform !== 'win32' || !script || !clip) {
    record({
      id: 'BARRIER-01',
      question: '¿Una vista nativa superpuesta intercepta el click del usuario?',
      status: 'inconclusive',
      finding:
        process.platform !== 'win32'
          ? `no ejecutado: la síntesis de entrada del sistema de esta sonda es de Windows y la plataforma es ${process.platform}. El criterio de aceptación de la entrega E es Windows; en otras plataformas queda por medir.`
          : !clip
            ? 'no ejecutado: sin contenedor `View` no hay dónde superponer.'
            : 'no ejecutado: falta la ruta del script de entrada física.',
    })
    return
  }

  const { execFile } = await import('node:child_process')
  const physicalClick = (x: number, y: number) =>
    new Promise<void>((resolve, reject) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-X', `${x}`, '-Y', `${y}`],
        (error) => (error ? reject(error) : resolve()),
      )
    })

  // Punto de fondo plano: dentro del recorte, lejos del formulario, para que un
  // click no dispare la mutación del botón.
  const bounds = window.getBounds()
  const target = screen.dipToScreenPoint({
    x: bounds.x + CLIP.x + 200,
    y: bounds.y + CLIP.y + 200,
  })

  window.setAlwaysOnTop(true)
  window.focus()
  await sleep(500)

  const clicksOn = (view: WebContentsView) =>
    view.webContents.executeJavaScript('window.__probe.clicks') as Promise<number>
  const resetOn = (view: WebContentsView) =>
    view.webContents.executeJavaScript('window.__probe.clicks = 0, true')

  try {
    // ── Línea base: sin barrera, el usuario alcanza la página.
    await resetOn(slot)
    await physicalClick(target.x, target.y)
    await sleep(300)
    const baseline = await clicksOn(slot)

    // ── Con barrera: una vista nativa hermana por encima, dentro del recorte.
    const overlay = remoteView('probe-overlay')
    overlay.setBounds({ x: 0, y: 0, width: CLIP.width, height: CLIP.height })
    clip.addChildView(overlay)
    await load(overlay, fixture.slotUrl)
    await sleep(400)

    await resetOn(slot)
    await resetOn(overlay)
    await physicalClick(target.x, target.y)
    await sleep(300)
    const underBarrier = await clicksOn(slot)
    const onBarrier = await clicksOn(overlay)

    // ── Retirada: la página vuelve a ser alcanzable. Descarta que el cero de
    //    arriba viniera de perder el foco a mitad de prueba.
    clip.removeChildView(overlay)
    overlay.webContents.close()
    await sleep(400)
    await resetOn(slot)
    await physicalClick(target.x, target.y)
    await sleep(300)
    const afterRemoval = await clicksOn(slot)

    const blocks = baseline > 0 && underBarrier === 0 && afterRemoval > 0
    record({
      id: 'BARRIER-01',
      question: '¿Una vista nativa superpuesta intercepta el click del usuario?',
      status: baseline === 0 ? 'inconclusive' : blocks ? 'ok' : 'failed',
      finding:
        baseline === 0
          ? 'Indeterminado: el click del sistema no llegó ni sin barrera; sin línea base no se atribuye nada a la superposición.'
          : blocks
            ? `Sí: sin barrera ${baseline} click, con barrera ${underBarrier} en la página y ${onBarrier} en la superposición, y ${afterRemoval} al retirarla. Una vista nativa hermana por encima es una barrera real: no hay click-through y el click va a quien está delante.`
            : `No: sin barrera ${baseline}, con barrera ${underBarrier} en la página y ${onBarrier} en la superposición, ${afterRemoval} al retirarla. La superposición no intercepta de forma fiable.`,
      detail: { baseline, underBarrier, onBarrier, afterRemoval, target },
    })
  } catch (error) {
    record({
      id: 'BARRIER-01',
      question: '¿Una vista nativa superpuesta intercepta el click del usuario?',
      status: 'inconclusive',
      finding: `no se pudo sintetizar entrada del sistema: ${fail(error)}`,
    })
  } finally {
    window.setAlwaysOnTop(false)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Aislamiento entre sesiones (§6.2, paso 6 del §3)
// ─────────────────────────────────────────────────────────────────────────────

async function probeIsolation(
  window: BaseWindow,
  fixture: Fixture,
  first: WebContentsView,
): Promise<void> {
  const second = remoteView('probe-session-b')
  // Fuera del área visible: la comprobación es de almacenamiento, no de pintado.
  second.setBounds({ x: 0, y: 0, width: 10, height: 10 })
  window.contentView.addChildView(second)
  await load(second, fixture.slotUrl)

  // La sesión A marca almacenamiento; la B abre exactamente la misma URL.
  const marker = `marca-${Date.now()}`
  await first.webContents.executeJavaScript(
    `localStorage.setItem('probe', ${JSON.stringify(marker)}), true`,
  )
  const readBack = (await second.webContents.executeJavaScript(
    "localStorage.getItem('probe')",
  )) as string | null
  // Que la primera sí lo lea descarta que el aislamiento sea un fallo de
  // escritura disfrazado de aislamiento.
  const ownRead = (await first.webContents.executeJavaScript(
    "localStorage.getItem('probe')",
  )) as string | null

  const isolated = ownRead === marker && readBack === null
  record({
    id: 'ISO-01',
    question: '¿Dos sesiones con la misma URL comparten almacenamiento?',
    status: ownRead !== marker ? 'inconclusive' : isolated ? 'ok' : 'failed',
    finding:
      ownRead !== marker
        ? `Indeterminado: la propia sesión no releyó su marca (${ownRead}); la escritura no se confirmó.`
        : isolated
          ? 'No: con particiones distintas, la segunda sesión no ve el localStorage de la primera pese a cargar la misma URL.'
          : `Sí, y no debería: la segunda sesión leyó «${readBack}». Las particiones no aíslan como exige el §6.2.`,
    detail: { marker, ownRead, readBack, partitions: ['probe-session-a', 'probe-session-b'] },
  })

  // Lo que el §5.3 da por sentado: «la enumeración solo devuelve las páginas
  // registradas en ese contexto». CDP-02 mostró que `Target.getTargets`
  // responde, así que hay que ver **qué** devuelve antes de confiar en ello.
  try {
    const debug = first.webContents.debugger
    if (!debug.isAttached()) debug.attach('1.3')
    const targets = (await debug.sendCommand('Target.getTargets')) as {
      targetInfos: { type: string; url: string }[]
    }
    const foreign = targets.targetInfos.filter(
      (info) => info.url === fixture.slotUrl || info.url.startsWith('http://127.0.0.1'),
    )
    record({
      id: 'ISO-02',
      question: '¿`Target.getTargets` desde una sesión ve los targets de la otra?',
      status: foreign.length > 1 ? 'failed' : 'ok',
      finding:
        foreign.length > 1
          ? `Sí: la enumeración devolvió ${foreign.length} targets del fixture, incluidos los de otra partición. El broker no puede exponer \`Target.getTargets\` a la herramienta; tiene que servir su propia registry (§5.3).`
          : `No: la enumeración devolvió ${foreign.length} target del fixture. Aun así el broker sirve su registry, no esta llamada.`,
      detail: { total: targets.targetInfos.length, fixtureTargets: foreign.length },
    })
    if (debug.isAttached()) debug.detach()
  } catch (error) {
    record({
      id: 'ISO-02',
      question: '¿`Target.getTargets` desde una sesión ve los targets de la otra?',
      status: 'inconclusive',
      finding: `no se pudo enumerar: ${fail(error)}`,
    })
  }

  second.webContents.close()
}

// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const fixture = await startFixture()
  const display = screen.getPrimaryDisplay()
  const scaleFactor = display.scaleFactor

  const window = new BaseWindow({
    ...WINDOW,
    show: true,
    frame: false,
    title: `rinari-browser-probe-${process.pid}`,
    backgroundColor: '#101014',
  })
  window.setTitle(`rinari-browser-probe-${process.pid}`)

  // `--dpi-only` reejecuta solo la medida de unidades bajo otro factor de
  // escala: el §8.2 pide probar a 100/125/150/200 %, y el factor se fija por
  // proceso con `--force-device-scale-factor`.
  const dpiOnly = process.argv.includes('--dpi-only')

  let exitCode = 0
  try {
    const { slot, clip } = await probeClipping(window, fixture)
    if (dpiOnly) {
      await probeDpi(slot, scaleFactor)
    } else {
      // La composición se mide antes de superponer nada: el recuento de
      // píxeles distingue la página del fondo, y una barrera encima falsearía
      // el área.
      await probeComposition(window, scaleFactor)
      await probeDpi(slot, scaleFactor)
      await probeCdp(slot)
      await probeInputArbitration(slot, fixture.slotUrl)
      await probeNativeBarrier(window, clip, slot, fixture)
      await probeIsolation(window, fixture, slot)
    }
  } catch (error) {
    record({
      id: 'PROBE-00',
      question: '¿Terminó la sonda?',
      status: 'failed',
      finding: `la sonda abortó: ${fail(error)}`,
    })
    exitCode = 1
  }

  const failed = checks.filter((check) => check.status === 'failed')
  const inconclusive = checks.filter((check) => check.status === 'inconclusive')
  const report = {
    platform: `${process.platform} ${process.arch}`,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    scaleFactor,
    geometry: { window: WINDOW, clip: CLIP, logical: LOGICAL },
    checks,
    summary: {
      total: checks.length,
      ok: checks.length - failed.length - inconclusive.length,
      failed: failed.length,
      inconclusive: inconclusive.length,
    },
  }
  process.stdout.write(`RINARI_BROWSER_PROBE ${JSON.stringify(report)}\n`)

  await fixture.close()
  // Cerrar explícitamente: las vistas agregadas no se liberan por soltar la
  // referencia (§6.2, [E8]).
  for (const child of [...window.contentView.children]) {
    if (child instanceof WebContentsView && !child.webContents.isDestroyed()) {
      child.webContents.close()
    }
  }
  window.destroy()
  app.exit(exitCode)
}

// Sin sesión persistente por defecto: la sonda no deja perfil detrás.
app.whenReady().then(() => {
  session.defaultSession.clearStorageData().catch(() => {})
  main().catch((error) => {
    process.stdout.write(
      `RINARI_BROWSER_PROBE ${JSON.stringify({ checks: [], fatal: fail(error) })}\n`,
    )
    app.exit(1)
  })
})
