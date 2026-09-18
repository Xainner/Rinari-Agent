/**
 * Host del browser nativo: ejecuta lo que el Engine pide (documento 03 §5, §6).
 *
 * El Engine emite `host.browser.request` como evento efímero y espera un
 * `host.browser.reply`. Main intercepta esas solicitudes y **nunca** las
 * entrega al renderer como eventos de conversación (§5.4): no son actividad
 * del usuario y no pertenecen al timeline.
 *
 * La allowlist se cumple dos veces, aquí y en el Engine. Que esté en los dos
 * extremos no es redundancia por gusto: la sonda de viabilidad midió que desde
 * una sesión page-level responden `Target.getTargets`, `Browser.getVersion` y
 * `Browser.setDownloadBehavior`, y que la enumeración cruza particiones. Una
 * operación que se colara tendría ámbito mayor que su propio target, así que
 * ninguno de los dos lados confía en que el otro filtre.
 */

import { randomUUID } from 'node:crypto'

import { BrowserRegistry, type ContextEntry } from './BrowserRegistry'
import {
  hostRequestOf,
  isHostChannelEvent,
  isNavigableUrl,
  resolveOperation,
  type HostRequest,
} from './operations'

export type { HostRequest }

/** Capabilities que este host anuncia al registrarse (§5.2). */
export const HOST_CAPABILITIES = ['browser_native_view_v1'] as const

/**
 * La que el Engine tiene que anunciar para que registrarse tenga sentido.
 * Sin ella no se le manda `host.browser.register`: el §5.2 pide que un Engine
 * antiguo se degrade, no que reciba métodos desconocidos repetidamente.
 */
export const ENGINE_BROKER_CAPABILITY = 'browser_host_bridge_v1'

/** Tope propio de operaciones a la vez; el Engine tiene el suyo (§5.4). */
const MAX_CONCURRENT = 8

export interface HostBinding {
  binding_id: string
  engine_instance_id: string
  generation: number
}

export interface NativeBrowserHostDeps {
  registry: BrowserRegistry
  /** Envía un método al Engine; es el canal privado de stdio (§5.1). */
  request: (method: string, params: unknown) => Promise<unknown>
  onError?: (message: string, detail?: unknown) => void
}

class OperationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message)
  }
}

export class NativeBrowserHost {
  private binding: HostBinding | null = null
  private readonly hostInstanceId = randomUUID()
  private inFlight = 0
  /**
   * Época de conexión al Engine. Sube cada vez que el Engine deja de estar
   * listo, de modo que un registro en vuelo de la instancia anterior no puede
   * instalarse como binding de la nueva.
   */
  private epoch = 0
  /** Un solo registro por época; las llamadas simultáneas lo comparten. */
  private registering: Promise<HostBinding | null> | null = null

  constructor(private readonly deps: NativeBrowserHostDeps) {}

  get registered(): boolean {
    return this.binding !== null
  }

  /** El binding actual, para distinguir «sigue el de antes» de «hay uno nuevo». */
  get bindingId(): string | null {
    return this.binding?.binding_id ?? null
  }

  /**
   * El Engine dejó de estar listo: se pierde el binding.
   *
   * Antes esto no existía, y `registered` era simplemente `binding !== null`.
   * Reiniciar el Engine sin cerrar la ventana dejaba ese booleano en `true`,
   * así que **la instancia nueva no se registraba nunca** y los contextos
   * seguían apuntando a una que ya no estaba. Un test que sólo mirase ese
   * booleano tampoco lo habría detectado.
   */
  onEngineLost(reason: string): void {
    if (this.binding === null && this.registering === null) return
    this.epoch += 1
    this.binding = null
    this.registering = null
    // Los contextos siguen existiendo como vistas, pero ya no tienen
    // autoridad: su próxima solicitud llegará con un binding que el Engine
    // nuevo no reconoce, y se rechaza antes de tocar la página.
    this.deps.onError?.(`the browser host binding was revoked: ${reason}`)
  }

  /** `host.browser.register`: se llama cuando el Engine queda listo. */
  register(): Promise<HostBinding | null> {
    if (this.binding !== null) return Promise.resolve(this.binding)
    if (this.registering) return this.registering

    const epoch = this.epoch
    const run = async (): Promise<HostBinding | null> => {
      try {
        const reply = (await this.deps.request('host.browser.register', {
          host_instance_id: this.hostInstanceId,
          capabilities: [...HOST_CAPABILITIES],
        })) as HostBinding
        if (epoch !== this.epoch) {
          // El Engine se cayó mientras se registraba: esta respuesta es de la
          // instancia anterior y no puede instalarse sobre la actual.
          return null
        }
        this.binding = reply
        return reply
      } catch (error) {
        // Un Engine sin la extensión no es un fallo del host: se queda sin
        // browser nativo y la UI usará el visor de capturas (§5.2).
        this.deps.onError?.('the engine did not accept the browser host binding', error)
        if (epoch === this.epoch) this.binding = null
        return null
      }
    }

    this.registering = run().finally(() => {
      if (epoch === this.epoch) this.registering = null
    })
    return this.registering
  }

  async unregister(): Promise<void> {
    const binding = this.binding
    this.binding = null
    this.registering = null
    this.epoch += 1
    if (!binding) return
    try {
      await this.deps.request('host.browser.unregister', { binding_id: binding.binding_id })
    } catch {
      // Si el Engine ya no está, el binding se fue con él.
    }
  }

  /**
   * Intercepta un evento del Engine.
   *
   * Devuelve `true` cuando lo ha consumido, para que quien llama **no** lo
   * reenvíe al renderer.
   */
  handleEngineEvent(event: unknown): boolean {
    // Se decide por namespace, no por validez: un frame del canal privado se
    // consume siempre, esté bien formado o no. Devolver `false` por un payload
    // roto lo mandaba al renderer como evento de conversación.
    if (!isHostChannelEvent(event)) return false
    const request = hostRequestOf(event)
    if (!request) {
      // Se diagnostica sin volcar params, binding ni expression.
      const name = (event as { event?: unknown }).event
      this.deps.onError?.(`a malformed frame arrived on the private browser channel: ${String(name)}`)
      return true
    }
    void this.execute(request)
    return true
  }

  /**
   * Avisa al Engine de un cambio observado en un contexto (§5.2).
   *
   * Viaja el `context_id` **del Engine**, no el id local de main. Los dos
   * lados acuñan el suyo, así que mandar el propio hacía que el Engine no
   * reconociera el contexto y no pudiera acotar el daño a esa sesión.
   */
  notify(kind: string, contextId: string, targetId?: string, detail?: unknown): void {
    const binding = this.binding
    if (!binding) return
    const context = this.deps.registry.context(contextId)
    const engineContextId = context?.engineContextId
    if (!engineContextId) {
      // Aún no ha llegado ninguna solicitud para este contexto, así que el
      // Engine no tiene nada en vuelo contra él y no hay qué invalidar.
      return
    }
    void this.deps
      .request('host.browser.event', {
        binding_id: binding.binding_id,
        engine_instance_id: binding.engine_instance_id,
        kind,
        context_id: engineContextId,
        target_id: targetId ?? null,
        detail: detail === undefined ? null : String(detail),
      })
      .catch(() => {
        // Informar de una pérdida de control no puede provocar otra.
      })
  }

  private async execute(request: HostRequest): Promise<void> {
    let result: Record<string, unknown> | null = null
    let failure: OperationError | null = null

    const binding = this.binding
    if (!binding || request.binding_id !== binding.binding_id) {
      // Una solicitud de un binding que ya no es el nuestro no se ejecuta.
      // Tampoco se contesta: el Engine la habrá invalidado ya.
      return
    }
    if (request.engine_instance_id !== binding.engine_instance_id) return

    if (this.inFlight >= MAX_CONCURRENT) {
      failure = new OperationError(
        'RESOURCE_EXHAUSTED',
        `the desktop host is already running ${MAX_CONCURRENT} browser operations`,
        true,
      )
    } else {
      this.inFlight += 1
      try {
        result = await this.run(request)
      } catch (error) {
        failure =
          error instanceof OperationError
            ? error
            : new OperationError('BROWSER_PROTOCOL', messageOf(error))
      } finally {
        this.inFlight -= 1
      }
    }

    // La respuesta replica la correlación (§5.3). Si el binding cambió
    // mientras se ejecutaba, el Engine la rechazará: es lo correcto, porque su
    // solicitud ya no existe.
    try {
      await this.deps.request('host.browser.reply', {
        request_id: request.request_id,
        binding_id: request.binding_id,
        engine_instance_id: request.engine_instance_id,
        ...(failure
          ? { error: { code: failure.code, message: failure.message, retryable: failure.retryable } }
          : { result: result ?? {} }),
      })
    } catch (error) {
      this.deps.onError?.('the reply to a browser operation could not be delivered', error)
    }
  }

  private async run(request: HostRequest): Promise<Record<string, unknown>> {
    const { registry } = this.deps

    // La operación se valida **antes** de tocar la registry. Resolver el
    // contexto primero convertía una solicitud desconocida u obsoleta en la
    // creación de un contexto, que es un efecto que sólo puede tener la
    // operación de creación autorizada (§5.3).
    if (resolveOperation(request.operation).kind === 'unsupported') {
      throw new OperationError(
        'BROWSER_UNSUPPORTED',
        `${request.operation} is not an operation this host implements`,
      )
    }

    // El contexto lo resuelve **la sesión**, no el `context_id` que venga: un
    // id de otra sesión no puede alcanzar esta vista (§5.3). El id del Engine
    // se recuerda la primera vez y después tiene que coincidir.
    const context = registry.ensureContext(request.session_id)
    if (context.engineContextId === null) {
      context.engineContextId = request.context_id
      context.generation = request.generation
    } else if (context.engineContextId !== request.context_id) {
      throw new OperationError(
        'TARGET_NOT_FOUND',
        'the browser context does not belong to this session',
      )
    } else if (request.generation < context.generation) {
      // Una solicitud de una generación anterior describe un contexto que ya
      // no existe; ejecutarla tocaría la página equivocada.
      throw new OperationError(
        'TARGET_NOT_FOUND',
        `this request belongs to generation ${request.generation}, ` +
          `the context is at ${context.generation}`,
      )
    } else if (request.generation > context.generation) {
      context.generation = request.generation
    }

    switch (request.operation) {
      case 'context.targets':
        return { targets: registry.describeTargets(context) }

      case 'context.newPage': {
        const url = String(request.params.url ?? 'about:blank')
        if (!isNavigableUrl(url)) {
          throw new OperationError('INVALID_ARGUMENT', `the desktop browser will not open ${url}`)
        }
        const entry = registry.createTarget(context)
        await entry.view.webContents.loadURL(url)
        return { target_id: entry.targetId, url }
      }

      case 'context.closePage': {
        if (!request.target_id) {
          throw new OperationError('INVALID_ARGUMENT', 'closing a page needs its target')
        }
        const closed = registry.closeTarget(context, request.target_id)
        if (!closed) throw new OperationError('TARGET_NOT_FOUND', 'no such page in this context')
        return { closed: request.target_id }
      }

      case 'context.setControl': {
        const owner = request.params.owner
        if (owner !== 'agent' && owner !== 'user') {
          throw new OperationError('INVALID_ARGUMENT', `unknown control owner: ${String(owner)}`)
        }
        // La barrera nativa se monta mientras manda el agente y se retira al
        // devolver el control (§7). Es la única de las opciones medidas que
        // deja pasar el input que el broker despacha por CDP.
        registry.setControl(context, owner)
        return { control: owner }
      }

      case 'context.close':
        registry.disposeContext(context.contextId)
        return { closed: true }

      default:
        return await this.runPageOperation(request, context)
    }
  }

  private async runPageOperation(
    request: HostRequest,
    context: ContextEntry,
  ): Promise<Record<string, unknown>> {
    const resolved = resolveOperation(request.operation)
    if (resolved.kind !== 'page') {
      throw new OperationError(
        'BROWSER_UNSUPPORTED',
        `${request.operation} is not an operation this host implements`,
      )
    }
    const method = resolved.method

    const entry = this.deps.registry.target(context.contextId, request.target_id)
    if (!entry || entry.view.webContents.isDestroyed()) {
      throw new OperationError('TARGET_NOT_FOUND', 'the page is gone or never existed here')
    }

    // La navegación se valida antes de tocar el target: el §9 pide cerrar el
    // esquema interno de la aplicación y los del sistema.
    if (request.operation === 'page.navigate') {
      const url = String(request.params.url ?? '')
      if (!isNavigableUrl(url)) {
        throw new OperationError('INVALID_ARGUMENT', `the desktop browser will not navigate to ${url}`)
      }
    }

    this.deps.registry.attach(entry)
    try {
      const value = await entry.view.webContents.debugger.sendCommand(method, request.params)
      return (value ?? {}) as Record<string, unknown>
    } catch (error) {
      const text = messageOf(error)
      // Un debugger desenganchado es pérdida de control, no un fallo del
      // comando: se distingue para que el Engine no reintente una mutación.
      if (/not attached|detached/i.test(text)) {
        throw new OperationError('BROWSER_DISCONNECTED', text)
      }
      throw new OperationError('BROWSER_PROTOCOL', text)
    }
  }

}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
