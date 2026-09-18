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
import { hostRequestOf, isNavigableUrl, resolveOperation, type HostRequest } from './operations'

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

  constructor(private readonly deps: NativeBrowserHostDeps) {}

  get registered(): boolean {
    return this.binding !== null
  }

  /** `host.browser.register`: se llama cuando el Engine queda listo. */
  async register(): Promise<HostBinding | null> {
    try {
      const reply = (await this.deps.request('host.browser.register', {
        host_instance_id: this.hostInstanceId,
        capabilities: [...HOST_CAPABILITIES],
      })) as HostBinding
      this.binding = reply
      return reply
    } catch (error) {
      // Un Engine sin la extensión no es un fallo del host: se queda sin
      // browser nativo y la UI usará el visor de capturas (§5.2).
      this.deps.onError?.('the engine did not accept the browser host binding', error)
      this.binding = null
      return null
    }
  }

  async unregister(): Promise<void> {
    const binding = this.binding
    this.binding = null
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
    const request = hostRequestOf(event)
    if (!request) return false
    void this.execute(request)
    return true
  }

  /** Avisa al Engine de un cambio observado en un contexto (§5.2). */
  notify(kind: string, contextId: string, targetId?: string, detail?: unknown): void {
    const binding = this.binding
    if (!binding) return
    void this.deps
      .request('host.browser.event', {
        binding_id: binding.binding_id,
        engine_instance_id: binding.engine_instance_id,
        kind,
        context_id: contextId,
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
    // El contexto lo resuelve **la sesión**, no el `context_id` que venga: un
    // id de otra sesión no puede alcanzar esta vista (§5.3). El id del Engine
    // se recuerda la primera vez y después tiene que coincidir.
    const context = registry.ensureContext(request.session_id)
    if (request.context_id) {
      if (context.engineContextId === null) {
        context.engineContextId = request.context_id
      } else if (context.engineContextId !== request.context_id) {
        throw new OperationError(
          'TARGET_NOT_FOUND',
          'the browser context does not belong to this session',
        )
      }
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
