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

import { View, WebContentsView, session as electronSession, type BaseWindow } from 'electron'
import { randomUUID } from 'node:crypto'

import { isNavigableUrl } from './operations'

/** Quién puede mutar la página ahora mismo (§7). */
export type ControlOwner = 'agent' | 'user'

export interface SlotGeometry {
  /** Rectángulo visible dentro de la ventana, en DIP. */
  visible: { x: number; y: number; width: number; height: number }
  /**
   * Tamaño lógico del documento, en DIP. Puede ser mayor que el visible: el
   * contenedor recorta y el viewport no se entera (§8.2).
   */
  logical: { width: number; height: number }
}

interface TargetEntry {
  targetId: string
  view: WebContentsView
  /** Lo que hay que deshacer al cerrar; el §6.2 avisa de que quitar un nodo
   *  de React no libera una vista nativa [E8]. */
  dispose: Array<() => void>
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
  geometry: SlotGeometry | null
}

export interface RegistryDeps {
  window: BaseWindow
  /** Se avisa al broker de pérdidas de control y crashes (§5.2). */
  onEvent: (event: { kind: string; contextId: string; targetId?: string; detail?: unknown }) => void
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
    container.setBounds({ x: 0, y: 0, width: 0, height: 0 })
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
      geometry: null,
    }
    this.contexts.set(contextId, entry)
    this.bySession.set(sessionId, contextId)
    this.hardenPartition(entry)
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
    const entry: TargetEntry = { targetId, view, dispose: [] }
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
    if (!entry.view.webContents.debugger.isAttached()) {
      entry.view.webContents.debugger.attach('1.3')
    }
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

  /** Geometría del slot (§8.1): main coloca, React sólo reserva el espacio. */
  setGeometry(context: ContextEntry, geometry: SlotGeometry): void {
    context.geometry = geometry
    this.applyGeometry(context)
  }

  private applyGeometry(context: ContextEntry): void {
    const geometry = context.geometry
    if (!geometry) return
    const { visible, logical } = geometry
    context.container.setBounds({ ...visible })
    // Bounds lógicos **relativos al contenedor**, que es quien recorta. En DIP:
    // la sonda midió que `setBounds` no lleva `devicePixelRatio` (§8.2).
    //
    // Sólo la activa se muestra. Las demás siguen vivas —su página conserva
    // DOM, historial y almacenamiento— pero ocultas: apiladas en el mismo
    // rectángulo competirían por el espacio y por el input.
    for (const targetId of context.order) {
      const entry = context.targets.get(targetId)
      if (!entry) continue
      const active = targetId === context.activeTargetId
      entry.view.setVisible(active)
      if (active) {
        entry.view.setBounds({ x: 0, y: 0, width: logical.width, height: logical.height })
      }
    }
    if (context.barrier) {
      context.barrier.setBounds({ x: 0, y: 0, width: visible.width, height: visible.height })
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

