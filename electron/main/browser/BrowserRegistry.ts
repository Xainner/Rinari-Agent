/**
 * Contextos y targets del browser nativo (documento 03 §6.1, §6.2, §8.1).
 *
 * Aquí viven las vistas y **aquí se acuñan sus identificadores**. El §5.3 lo
 * pide explícito: «crear ids en los componentes confiables y mapearlos a
 * objetos internos; nunca usar `webContents.fromId` con un id suministrado
 * libremente desde el modelo». Por eso un `target_id` es una cadena opaca de
 * este mapa y no el id numérico de Electron: aunque se filtrara, no nombra
 * nada fuera de su contexto.
 *
 * La geometría sigue lo que midió la sonda de viabilidad
 * (`docs/architecture/browser-native.md`): una `View` contenedora con el
 * rectángulo **visible** y la `WebContentsView` dentro con los bounds
 * **lógicos**. El contenedor recorta, así que desplazar el board no encoge el
 * viewport del documento, que es lo que exige el §8.2.
 */

import {
  View,
  WebContentsView,
  session as electronSession,
  type BaseWindow,
  type DownloadItem,
} from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { isAbsolute, resolve, sep } from 'node:path'

import { isNavigableUrl, safeDownloadName } from './operations'
import type { ResolvedLayout } from './ViewLayoutCoordinator'

/** Quién puede mutar la página ahora mismo (§7). */
export type ControlOwner = 'agent' | 'user'

/**
 * Tamaño lógico de una página que todavía no tiene slot, en DIP.
 *
 * Un turno puede usar el browser antes de que el usuario abra el panel. Sin
 * esto la vista nace en 0×0 y todo lo que dependa de la maquetación —click,
 * snapshot, captura— describe una página que no existe.
 */
const DEFAULT_LOGICAL_SIZE = { width: 1280, height: 800 }

/**
 * Lo mínimo que el contenedor ocupa cuando no hay nada que presentar.
 *
 * No es cosmética: una `WebContentsView` que **nunca se compone** no maqueta.
 * Medido, con la jerarquía del §8.2 y la página cargada:
 *
 * | contenedor            | `innerWidth` | `capturePage` |
 * |-----------------------|--------------|---------------|
 * | 0×0                   | 0            | 0 bytes       |
 * | con tamaño, escondido | 0            | 0 bytes       |
 * | 0×0 + emulación       | 1280         | 0 bytes       |
 * | **1×1 visible**       | 1280         | 4714 bytes    |
 * | escondido **después** | 799          | 5556 bytes    |
 *
 * O sea: la vista toma su viewport de sus propios bounds aunque el contenedor
 * la recorte a un píxel, pero si nunca llegó a componerse no tiene viewport
 * ninguno y todo lo que dependa de la maquetación —coordenadas de un click,
 * `loading="lazy"`, la captura— describe una página que no existe. La
 * emulación de dispositivo arregla la maquetación pero no la composición, así
 * que tampoco basta.
 *
 * El §8.3 pide que ocultar el panel no rompa una herramienta que esté usando
 * ese target, así que el contenedor no se esconde del todo: baja a este suelo.
 */
const LAYOUT_FLOOR = { x: 0, y: 0, width: 1, height: 1 }


/** Métodos CDP que se bufferizan para consola y red (§6.3). */
const CONSOLE_METHODS = new Set(['Runtime.consoleAPICalled', 'Runtime.exceptionThrown'])
const NETWORK_METHODS = new Set([
  'Network.requestWillBeSent',
  'Network.responseReceived',
  'Network.loadingFailed',
])

/**
 * Tope del buffer por clase y target.
 *
 * Una página que registra en bucle no puede crecer sin límite en el host: el
 * §6.3 pide «buffers limitados». Al llenarse se descartan los más viejos, que
 * es lo que una herramienta que consulta lo reciente quiere de todos modos.
 */
const MAX_BUFFERED = 500

interface TargetEntry {
  targetId: string
  view: WebContentsView
  /** Lo que hay que deshacer al cerrar; el §6.2 avisa de que quitar un nodo
   *  de React no libera una vista nativa [E8]. */
  dispose: Array<() => void>
  /**
   * Eventos observados de esta página, por clase.
   *
   * El backend externo los toma del buffer de su `CdpSession`; aquí no hay
   * ninguna, así que los recoge el host desde el debugger. Se guardan sólo los
   * métodos de la allowlist: escuchar todo sería observar la aplicación
   * entera, no esta página (§6.3).
   */
  console: Array<Record<string, unknown>>
  network: Array<Record<string, unknown>>
}

export interface ContextEntry {
  contextId: string
  /**
   * El id que el Engine acuñó para este contexto. Los dos lados acuñan el
   * suyo, así que el host recuerda el ajeno para rechazar una solicitud que
   * traiga otro: un `context_id` de otra sesión no alcanza esta vista (§5.3).
   */
  engineContextId: string | null
  /**
   * Generación del contexto según el Engine. No retrocede: una solicitud de
   * una generación anterior describe un contexto que ya no existe.
   */
  generation: number
  sessionId: string
  partition: string
  container: View
  targets: Map<string, TargetEntry>
  /** Orden de creación, para elegir superviviente al cerrar una pestaña. */
  order: string[]
  /**
   * La pestaña que se ve y sobre la que opera una solicitud sin `target_id`.
   *
   * Antes no existía: todas las vistas se apilaban en el mismo rectángulo y la
   * operación por defecto iba a la primera creada, que no tiene por qué ser la
   * que el usuario está mirando. Eso hace que «el Engine opera exactamente la
   * página visible» deje de ser cierto en cuanto hay dos pestañas.
   */
  activeTargetId: string | null
  control: ControlOwner
  /** Superposición nativa que bloquea al usuario mientras muta el agente. */
  barrier: WebContentsView | null
  /**
   * Qué hace esta partición con una descarga. `directory` nulo es el estado de
   * reposo: se cancelan, para que ninguna página abra el diálogo de guardado
   * del sistema por su cuenta.
   */
  downloads: { directory: string | null; dispose: () => void } | null
  geometry: ResolvedLayout | null
}

export interface RegistryDeps {
  window: BaseWindow
  /** Se avisa al broker de pérdidas de control y crashes (§5.2). */
  onEvent: (event: { kind: string; contextId: string; targetId?: string; detail?: unknown }) => void
}

/**
 * Nombre libre dentro del directorio.
 *
 * Dos descargas del mismo fichero no se pisan: la segunda es un fichero nuevo,
 * no una versión del primero, y sobrescribir perdería el anterior sin decirlo.
 */
function uniqueName(directory: string, name: string): string {
  if (!existsSync(resolve(directory, name)) && !existsSync(resolve(directory, `${name}.part`))) {
    return name
  }
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : ''
  for (let n = 1; n < 1000; n += 1) {
    const candidate = `${stem} (${n})${extension}`
    if (
      !existsSync(resolve(directory, candidate)) &&
      !existsSync(resolve(directory, `${candidate}.part`))
    ) {
      return candidate
    }
  }
  // Mil colisiones es un directorio que ya no describe nada; se desempata con
  // algo que no puede chocar en vez de sobrescribir.
  return `${stem}-${randomUUID()}${extension}`
}

export class BrowserRegistry {
  private readonly contexts = new Map<string, ContextEntry>()
  /** Un contexto por sesión: el §6.2 no contempla dos para la misma. */
  private readonly bySession = new Map<string, string>()

  constructor(private readonly deps: RegistryDeps) {}

  /** Crea el contexto de una sesión, o devuelve el que ya tenga. */
  ensureContext(sessionId: string): ContextEntry {
    const known = this.bySession.get(sessionId)
    if (known) {
      const existing = this.contexts.get(known)
      if (existing) return existing
    }

    const contextId = randomUUID()
    // Partición propia y **no persistente**: distinta del almacenamiento del
    // renderer de Rinari y de las demás sesiones (§6.2). Sin `persist:`, se va
    // con el proceso; un modo persistente exige UX y limpieza propias.
    const partition = `rinari-browser-${contextId}`
    const container = new View()
    // En el suelo, no a cero: ver `LAYOUT_FLOOR`. Un contexto que se usa antes
    // de que el usuario abra el panel tiene que maquetar igual.
    container.setBounds({ ...LAYOUT_FLOOR })
    this.deps.window.contentView.addChildView(container)

    const entry: ContextEntry = {
      contextId,
      engineContextId: null,
      generation: 0,
      sessionId,
      partition,
      container,
      targets: new Map(),
      order: [],
      activeTargetId: null,
      control: 'agent',
      barrier: null,
      downloads: null,
      geometry: null,
    }
    this.contexts.set(contextId, entry)
    this.bySession.set(sessionId, contextId)
    this.hardenPartition(entry)
    // Descargas cerradas mientras nadie las pida con un destino.
    this.installDownloadHandler(entry, null)
    // El contexto nace **sin** barrera aunque el control sea del agente.
    //
    // La prueba vertical midió que, en la ventana de la aplicación, una
    // superposición nativa bloquea también el input que el broker despacha por
    // CDP: con la barrera puesta el click del agente no llega, y sin ella sí.
    // Montarla por defecto dejaba al agente sin manos. La medición aislada de
    // la sonda decía lo contrario, y esa discrepancia está sin resolver
    // (`docs/architecture/browser-native.md`), así que mientras tanto la
    // barrera es explícita y no un estado de reposo.
    return entry
  }

  context(contextId: string): ContextEntry | undefined {
    return this.contexts.get(contextId)
  }

  /** El contexto de una sesión, sin crearlo si no existe. */
  contextForSession(sessionId: string): ContextEntry | undefined {
    const contextId = this.bySession.get(sessionId)
    return contextId ? this.contexts.get(contextId) : undefined
  }

  /**
   * Resuelve un target dentro de **su** contexto.
   *
   * Un `target_id` válido de otra sesión es inválido para esta (§5.3), y aquí
   * es que ni siquiera se encuentra: el mapa es por contexto.
   */
  target(contextId: string, targetId: string | null): TargetEntry | undefined {
    const context = this.contexts.get(contextId)
    if (!context) return undefined
    if (targetId === null) {
      // La pestaña **activa**, no la primera creada. Usar la primera hacía que
      // una operación sin target fuera a una página que el usuario ya no está
      // viendo, mientras la captura y el click describían páginas distintas.
      const active = context.activeTargetId
      return active ? context.targets.get(active) : undefined
    }
    return context.targets.get(targetId)
  }

  /**
   * Elige la pestaña visible del contexto.
   *
   * Sólo una se muestra: el contenedor recorta un rectángulo y dos vistas
   * superpuestas ahí compiten por el mismo espacio y por el input.
   */
  setActiveTarget(context: ContextEntry, targetId: string): boolean {
    if (!context.targets.has(targetId)) return false
    context.activeTargetId = targetId
    this.applyGeometry(context)
    return true
  }

  /** Crea una página en el contexto. La vista nace oculta hasta tener slot. */
  createTarget(context: ContextEntry): TargetEntry {
    const view = new WebContentsView({
      webPreferences: {
        partition: context.partition,
        // §9: cada vista remota va con sandbox, aislamiento, sin Node y sin
        // preload privilegiado. No hay puente que exponer.
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
        allowRunningInsecureContent: false,
        experimentalFeatures: false,
      },
    })

    const targetId = randomUUID()
    const entry: TargetEntry = { targetId, view, dispose: [], console: [], network: [] }
    const contents = view.webContents

    // Nada de ventanas nuevas decididas por la página: un popup heredaría el
    // contexto, no privilegios (§6.3), y mientras no exista esa gestión se
    // deniega en vez de abrirse por ahí.
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))

    // El esquema interno de Rinari y el renderer de confianza no son destinos
    // navegables para contenido remoto (§9).
    const guardNavigation = (event: { preventDefault(): void }, url: string) => {
      if (!isNavigableUrl(url)) event.preventDefault()
    }
    contents.on('will-navigate', guardNavigation)
    contents.on('will-redirect', guardNavigation)

    // Permisos: deny por defecto (§9). Una UX propia los concederá, no la
    // petición de una página.
    contents.session.setPermissionRequestHandler((_c, _p, callback) => callback(false))
    contents.session.setPermissionCheckHandler(() => false)

    // Pérdida de control: la sonda midió que en 44.4.1 abrir DevTools no
    // desengancha el debugger, pero el evento sigue siendo la señal correcta y
    // la versión puede cambiarlo. Se observa y se informa (§3 [E5]).
    const onDetach = (_event: unknown, reason: string) => {
      this.deps.onEvent({ kind: 'detached', contextId: context.contextId, targetId, detail: reason })
    }
    contents.debugger.on('detach', onDetach)
    const onCrash = (_event: unknown, details: unknown) => {
      this.deps.onEvent({ kind: 'crashed', contextId: context.contextId, targetId, detail: details })
    }
    contents.on('render-process-gone', onCrash)

    entry.dispose.push(() => {
      contents.debugger.off('detach', onDetach)
      contents.off('render-process-gone', onCrash)
      contents.off('will-navigate', guardNavigation)
      contents.off('will-redirect', guardNavigation)
    })

    context.targets.set(targetId, entry)
    context.order.push(targetId)
    context.container.addChildView(view)
    // El tamaño se lo da `applyGeometry`, que ahora también atiende al contexto
    // sin slot. Darlo aquí no bastaba: la vista tenía bounds, pero el
    // contenedor estaba a 0×0 y la recortaba a nada, así que no se componía y
    // la página se quedaba sin viewport igual.
    // Una pestaña nueva pasa a ser la visible, como en cualquier navegador.
    context.activeTargetId = targetId
    // La barrera vuelve arriba: el orden de hijos decide quién recibe el
    // click, así que una página creada después se pondría delante de ella.
    this.raiseBarrier(context)
    this.applyGeometry(context)
    return entry
  }

  /** Adjunta el debugger si hace falta. Es la vía CDP page-level del §6.3. */
  attach(entry: TargetEntry): void {
    const debug = entry.view.webContents.debugger
    if (debug.isAttached()) return
    debug.attach('1.3')

    // Observación de consola y red. Se recoge aquí porque el backend externo
    // la toma del buffer de su `CdpSession` y aquí no hay ninguna. Sólo los
    // métodos de la allowlist: escuchar todo sería observar la aplicación
    // entera en vez de esta página (§6.3).
    const onMessage = (_event: unknown, method: string, params: Record<string, unknown>) => {
      const bucket = CONSOLE_METHODS.has(method)
        ? entry.console
        : NETWORK_METHODS.has(method)
          ? entry.network
          : null
      if (!bucket) return
      bucket.push({ method, params })
      // Se descarta lo más viejo: una página que registra en bucle no puede
      // crecer sin límite en el host.
      if (bucket.length > MAX_BUFFERED) bucket.splice(0, bucket.length - MAX_BUFFERED)
    }
    debug.on('message', onMessage)
    entry.dispose.push(() => debug.off('message', onMessage))

    // Sin habilitar los dominios no llega ningún evento.
    for (const domain of ['Runtime', 'Network']) {
      void debug.sendCommand(`${domain}.enable`, {}).catch(() => {
        // Un dominio que no se puede habilitar deja su observación vacía, que
        // es mejor que tumbar la operación que pidió adjuntar.
      })
    }
  }

  /**
   * Vacía y devuelve lo observado de una clase.
   *
   * Drenar en vez de copiar: cada consulta ve lo nuevo desde la anterior, que
   * es el contrato del backend externo.
   */
  drainObserved(entry: TargetEntry, kind: 'console' | 'network', limit: number): unknown[] {
    const bucket = entry[kind]
    const taken = bucket.splice(0, Math.max(0, limit))
    return taken
  }

  /**
   * Cookies de **esta** partición (§6.3).
   *
   * Por la API de `session` y no por CDP: las cookies pertenecen a la
   * partición del contexto, no a una página, y `Network.getCookies` sobre un
   * debugger page-level no es la misma pregunta. Así dos sesiones con el mismo
   * origen no comparten nada.
   *
   * El valor **no sale de aquí**. El contrato de la herramienta ya lo redacta,
   * pero mandarlo por el broker sería pasear una credencial sin necesidad.
   */
  async cookies(context: ContextEntry): Promise<Array<Record<string, unknown>>> {
    const jar = electronSession.fromPartition(context.partition).cookies
    const cookies = await jar.get({})
    return cookies.map((cookie) => ({
      name: cookie.name,
      domain: cookie.domain,
      path: cookie.path,
      httpOnly: Boolean(cookie.httpOnly),
      secure: Boolean(cookie.secure),
    }))
  }

  /**
   * Acepta descargas de esta partición y las deja en `directory` (§6.3).
   *
   * Por la API de `session` y no por `Browser.setDownloadBehavior`: la sonda
   * midió que el dominio `Browser` responde desde una sesión page-level y que
   * su ámbito **cruza particiones**, así que reenviarlo daría a una página
   * mando sobre las descargas de las demás sesiones. Esto sólo alcanza a la
   * partición de este contexto.
   *
   * El fichero se escribe con sufijo `.part` y se renombra al terminar. El
   * Engine vigila el directorio para saber cuándo hay algo nuevo, y sin eso
   * recogería un fichero a medio bajar y calcularía su sha256 sobre bytes
   * incompletos.
   */
  beginDownload(context: ContextEntry, directory: string): { directory: string } {
    if (!isAbsolute(directory)) {
      throw new Error('the download directory has to be an absolute path')
    }
    const target = resolve(directory)
    mkdirSync(target, { recursive: true })
    this.installDownloadHandler(context, target)
    return { directory: target }
  }

  /**
   * Qué hace esta partición con una descarga.
   *
   * Con `directory`, se guarda ahí. Sin él, **se cancela**: es el estado de
   * reposo, y no por prudencia abstracta. Sin ningún manejador, Electron abre
   * el diálogo de guardado del sistema, así que la primera página que el
   * agente visite con una descarga automática le plantaría al usuario un
   * cuadro modal que no pidió, sobre una ruta que nadie acotó. El §9 pide deny
   * por defecto y aquí eso además evita una UI sorpresa.
   */
  private installDownloadHandler(context: ContextEntry, directory: string | null): void {
    // Un solo oyente: reenganchar sustituye, porque dos guardarían dos veces.
    context.downloads?.dispose()
    const partition = electronSession.fromPartition(context.partition)

    const onWillDownload = (_event: unknown, item: DownloadItem) => {
      if (directory === null) {
        item.cancel()
        this.deps.onEvent({
          kind: 'download-blocked',
          contextId: context.contextId,
          detail: { suggested: item.getFilename() },
        })
        return
      }
      const target = directory
      // El nombre lo propone la página. Se sanea y se comprueba **después**
      // de resolver: un nombre que pase el filtro pero acabe fuera del
      // directorio no se escribe, se cancela.
      const name = uniqueName(target, safeDownloadName(item.getFilename()))
      const finalPath = resolve(target, name)
      if (!finalPath.startsWith(target + sep)) {
        item.cancel()
        this.deps.onEvent({
          kind: 'download-rejected',
          contextId: context.contextId,
          detail: { suggested: item.getFilename() },
        })
        return
      }
      const partPath = `${finalPath}.part`
      item.setSavePath(partPath)
      item.once('done', (_doneEvent: unknown, state: string) => {
        if (state !== 'completed') {
          rmSync(partPath, { force: true })
          return
        }
        try {
          renameSync(partPath, finalPath)
        } catch {
          // Si no se puede renombrar, el `.part` se queda y el Engine no lo
          // recoge: mejor que publicar un fichero cuyo nombre no controlamos.
        }
      })
    }

    partition.on('will-download', onWillDownload)
    context.downloads = {
      directory,
      dispose: () => {
        partition.off('will-download', onWillDownload)
        context.downloads = null
      },
    }
  }

  async setCookie(
    context: ContextEntry,
    input: { name: string; value: string; url?: string },
  ): Promise<void> {
    // `cookies.set` exige una URL; CDP la infería de la página. Se toma la de
    // la pestaña activa para conservar ese comportamiento.
    const active = this.target(context.contextId, null)
    const url = input.url || active?.view.webContents.getURL() || ''
    if (!isNavigableUrl(url)) {
      throw new Error('setting a cookie needs an http(s) url or a page to take it from')
    }
    await electronSession
      .fromPartition(context.partition)
      .cookies.set({ url, name: input.name, value: input.value })
  }

  closeTarget(context: ContextEntry, targetId: string): boolean {
    const entry = context.targets.get(targetId)
    if (!entry) return false
    const wasActive = context.activeTargetId === targetId
    // El superviviente se elige **antes** de borrar, para poder tomar el
    // vecino en el orden y no siempre el primero.
    const index = context.order.indexOf(targetId)
    this.disposeTarget(context, entry)
    context.targets.delete(targetId)
    context.order = context.order.filter((id) => id !== targetId)
    if (wasActive) {
      context.activeTargetId = context.order[Math.min(index, context.order.length - 1)] ?? null
      this.applyGeometry(context)
    }
    return true
  }

  /**
   * ¿Se está componiendo este contexto?
   *
   * Lo pregunta la captura antes de pedirla. No es una comprobación de cortesía:
   * con el contenedor a cero, `capturePage` sobre una vista con el debugger
   * enganchado **bloquea el proceso principal** —medido: ni los temporizadores
   * de main vuelven a correr—, así que un plazo en JavaScript no salvaría nada
   * porque no llegaría a dispararse. La única salida es no llamarla.
   *
   * Con `LAYOUT_FLOOR` esto siempre es cierto; queda como cierre por si alguien
   * vuelve a bajar el contenedor a cero.
   */
  isComposited(context: ContextEntry): boolean {
    const bounds = context.container.getBounds()
    return bounds.width > 0 && bounds.height > 0
  }

  /** Geometría del slot (§8.1): main coloca, React sólo reserva el espacio. */
  setGeometry(context: ContextEntry, layout: ResolvedLayout): void {
    context.geometry = layout
    this.applyGeometry(context)
  }

  /**
   * Retira la presentación sin cerrar nada (§8.3).
   *
   * Hacía falta y no existía. Soltar el lease del slot sólo hace que main deje
   * de admitir geometría; el contenedor seguía compuesto sobre la ventana con
   * sus últimos bounds, así que cerrar el panel o cambiar a Archivos dejaba la
   * vista nativa encima de lo que el renderer pintara —tapándolo y quedándose
   * además con el input de ese rectángulo, porque una vista nativa no la tapa
   * ningún `z-index`—.
   *
   * El tamaño lógico se conserva y sólo se marca no presentado: el §8.3 pide
   * que ocultar no cambie la página, y reescribir los bounds le cambiaría el
   * viewport al documento. El contenedor baja al suelo de `LAYOUT_FLOOR` en vez
   * de esconderse, porque una vista que deja de componerse del todo se lleva la
   * maquetación por delante y con ella la captura.
   */
  hidePresentation(context: ContextEntry): void {
    if (!context.geometry || !context.geometry.visible) return
    context.geometry = { ...context.geometry, visible: false }
    this.applyGeometry(context)
  }

  private applyGeometry(context: ContextEntry): void {
    const geometry = context.geometry
    // Se aplica también sin geometría: antes esto volvía sin hacer nada, así
    // que un contexto que nadie había presentado dejaba sus vistas sin bounds
    // y la página sin viewport.
    const presented = geometry !== null && geometry.visible
    const container = presented ? geometry.container : LAYOUT_FLOOR
    // El tamaño lógico se conserva escondido: el §8.3 pide que ocultar el panel
    // no le cambie el viewport al documento, y reescribirlo lo cambiaría.
    const page = geometry ? geometry.page : { x: 0, y: 0, ...DEFAULT_LOGICAL_SIZE }
    context.container.setBounds({ ...container })
    // Nunca `setVisible(false)`: una vista que no se compone no maqueta, y en
    // el suelo ya no ocupa nada que se vea.
    context.container.setVisible(true)

    // La página va **desplazada** dentro del contenedor, que es quien recorta:
    // `page.x` es negativo cuando el scroll recortó por la izquierda, y el
    // tamaño sigue siendo el lógico para que el viewport no se entere (§8.2).
    // En DIP: la sonda midió que `setBounds` no lleva `devicePixelRatio`.
    //
    // Sólo la activa se muestra. Las demás siguen vivas —su página conserva
    // DOM, historial y almacenamiento— pero ocultas: apiladas en el mismo
    // rectángulo competirían por el espacio y por el input.
    for (const targetId of context.order) {
      const entry = context.targets.get(targetId)
      if (!entry) continue
      const active = targetId === context.activeTargetId
      entry.view.setVisible(active)
      if (active) entry.view.setBounds({ ...page })
    }
    if (context.barrier) {
      context.barrier.setBounds({ x: 0, y: 0, width: container.width, height: container.height })
    }
  }

  /**
   * Arbitraje del §7. La barrera es una vista nativa por encima, no
   * `pointer-events` ni intercepción de eventos: la sonda midió que
   * `before-input-event`, `before-mouse-event` e `Input.setIgnoreInputEvents`
   * bloquean también el input que el broker despacha por CDP, así que
   * cerrarlos dejaría al agente sin manos.
   */
  setControl(context: ContextEntry, owner: ControlOwner, barrier = false): void {
    context.control = owner
    // La barrera es explícita: sólo se monta cuando quien llama la pide, y hoy
    // eso es la prueba de overlays. Ver `ensureContext` para por qué no es el
    // estado de reposo del control del agente.
    if (owner === 'agent' && barrier) {
      if (!context.barrier) {
        const barrier = new WebContentsView({
          webPreferences: {
            partition: `${context.partition}-barrier`,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
          },
        })
        // Página vacía y propia: no carga nada remoto y sólo existe para
        // recibir el click que no debe llegar a la página del agente.
        void barrier.webContents.loadURL('data:text/html,<body style="background:transparent">')
        context.barrier = barrier
        context.container.addChildView(barrier)
        this.applyGeometry(context)
      }
      return
    }
    // El usuario toma el control: se retira la barrera.
    if (context.barrier) {
      context.container.removeChildView(context.barrier)
      context.barrier.webContents.close()
      context.barrier = null
    }
  }

  /** Devuelve la barrera al frente del contenedor. */
  private raiseBarrier(context: ContextEntry): void {
    const barrier = context.barrier
    if (!barrier) return
    context.container.removeChildView(barrier)
    context.container.addChildView(barrier)
  }

  disposeContext(contextId: string): void {
    const context = this.contexts.get(contextId)
    if (!context) return
    for (const entry of context.targets.values()) this.disposeTarget(context, entry)
    context.targets.clear()
    context.order = []
    if (context.barrier) {
      context.barrier.webContents.close()
      context.barrier = null
    }
    // El oyente de descargas vive en la partición, no en la vista: quitar las
    // vistas no lo suelta.
    context.downloads?.dispose()
    this.deps.window.contentView.removeChildView(context.container)
    this.contexts.delete(contextId)
    this.bySession.delete(context.sessionId)
  }

  disposeAll(): void {
    for (const contextId of [...this.contexts.keys()]) this.disposeContext(contextId)
  }

  /** Metadata pública de los targets de un contexto (§5.3). */
  describeTargets(
    context: ContextEntry,
  ): Array<{ target_id: string; url: string; title: string; active: boolean }> {
    return context.order.flatMap((targetId) => {
      const entry = context.targets.get(targetId)
      if (!entry || entry.view.webContents.isDestroyed()) return []
      return [
        {
          target_id: targetId,
          url: entry.view.webContents.getURL(),
          title: entry.view.webContents.getTitle(),
          // Cuál es la visible viaja con la lista: el Engine y la UI tienen
          // que coincidir en qué página describe una operación sin target.
          active: targetId === context.activeTargetId,
        },
      ]
    })
  }

  private disposeTarget(context: ContextEntry, entry: TargetEntry): void {
    for (const undo of entry.dispose) {
      try {
        undo()
      } catch {
        // Un listener que ya no está no impide cerrar el resto.
      }
    }
    const contents = entry.view.webContents
    try {
      if (contents.debugger.isAttached()) contents.debugger.detach()
    } catch {
      // Ya desenganchado.
    }
    try {
      context.container.removeChildView(entry.view)
    } catch {
      // La vista podía no estar colocada.
    }
    if (!contents.isDestroyed()) contents.close()
  }

  private hardenPartition(context: ContextEntry): void {
    const partition = electronSession.fromPartition(context.partition)
    partition.setPermissionRequestHandler((_c, _p, callback) => callback(false))
    partition.setPermissionCheckHandler(() => false)
  }
}

