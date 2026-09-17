/**
 * Ciclo de vida del Engine (documento 02 §4.1 y §4.3).
 *
 * Port de `src-tauri/src/engine/supervisor.rs`: los mismos estados, los mismos
 * códigos de error y la misma tabla de plazos por método —que el §4.2 pide
 * conservar en vez de aplanar a 60 s—.
 *
 * Una instancia por aplicación, no una por panel: los eventos salen por un
 * único canal hacia el store de runtime del renderer.
 */

import { locateEngine, EngineNotFound, type EngineCommand } from './engineLocator'
import { NdjsonTransport, TransportError } from './NdjsonTransport'
import type { EngineEvent, Hello } from '../../shared/protocol'

export type EngineState =
  | 'stopped'
  | 'starting'
  | 'handshaking'
  | 'ready'
  | 'degraded'
  | 'restarting'
  | 'failed'

export interface EngineStatus {
  state: EngineState
  engine_version: string | null
  protocol_version: number | null
  detail: string | null
  capabilities: Record<string, boolean>
  /** Del hello: espacia por home el estado de presentación por sesión. */
  home_id: string | null
}

export interface CommandError {
  code: string
  message: string
}

export class EngineCommandError extends Error implements CommandError {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'EngineCommandError'
  }

  toJSON(): CommandError {
    return { code: this.code, message: this.message }
  }
}

/** La capability sin la que este desktop no puede ejecutar un turno. */
export const REQUIRED_CAPABILITY = 'desktop_turn_runtime_v3'

/**
 * Capabilities exigidas al conectar. Un Engine viejo se rechaza aquí, con un
 * mensaje que dice qué hacer, en vez de fallar luego a mitad de un turno.
 */
export const REQUIRED_CAPABILITIES = [
  REQUIRED_CAPABILITY,
  'tool_contracts_v1',
  'desktop_workspace_v1',
  'interactive_questions_v1',
  'web_preview_v1',
  'plan_read_scope_v1',
  'persistent_context_compaction_v1',
  'recoverable_tool_results_v1',
] as const

const INCOMPATIBLE_MESSAGE =
  'The active Rinari Engine is outdated and does not support the desktop turn runtime required ' +
  'by this app. Rebuild the packaged engine or use the current Rinari-CLI checkout.'

/**
 * Plazo por método del protocolo. Los 60 s son el techo de compatibilidad, no
 * la respuesta por defecto a toda operación.
 */
const TEN_SECOND_METHODS = new Set([
  'session.list',
  'session.get',
  'session.create',
  'session.open',
  'session.rename',
  'session.archive',
  'session.restore',
  'session.fork',
  'session.close',
  'session.history',
])
const FIVE_SECOND_METHODS = new Set(['project.status', 'session.turn.start', 'model.discovery.start'])

export function deadlineFor(method: string): number {
  if (FIVE_SECOND_METHODS.has(method)) return 5_000
  if (TEN_SECOND_METHODS.has(method)) return 10_000
  return 60_000
}

function toCommandError(error: unknown): EngineCommandError {
  if (error instanceof EngineCommandError) return error
  if (error instanceof EngineNotFound) return new EngineCommandError(error.code, error.message)
  if (error instanceof TransportError) {
    switch (error.kind) {
      case 'engine':
        return new EngineCommandError(
          error.engineError?.code ?? 'ENGINE_ERROR',
          error.engineError?.message ?? error.message,
        )
      case 'timeout':
        return new EngineCommandError('ENGINE_TIMEOUT', error.message)
      case 'shutdown':
        return new EngineCommandError('ENGINE_DOWN', 'engine is not running')
      case 'spawn':
        return new EngineCommandError('ENGINE_SPAWN', error.message)
      case 'handshake':
        return new EngineCommandError('ENGINE_HANDSHAKE', error.message)
      default:
        return new EngineCommandError('ENGINE_IO', error.message)
    }
  }
  return new EngineCommandError('ENGINE_ERROR', error instanceof Error ? error.message : String(error))
}

export interface SupervisorOptions {
  /** Reenvío al renderer. Un solo canal, no un lector por panel. */
  onEvent: (event: EngineEvent, epoch: number) => void
  onStderr?: (line: string) => void
  /** Cambio de estado observable: la UI no puede seguir en «ready» tras un exit. */
  onStatus?: (status: EngineStatus) => void
  resourceDir?: string
  packaged?: boolean
  env?: NodeJS.ProcessEnv
}

export class EngineSupervisor {
  private state: EngineState = 'stopped'
  private detail: string | null = null
  private transport: NdjsonTransport | null = null
  private hello: Hello | null = null
  /** Época de conexión: distingue esta instancia de las anteriores. */
  private epoch = 0
  /** Serializa start/shutdown/restart: dos arranques a la vez dejarían huérfano a uno. */
  private lifecycle: Promise<unknown> = Promise.resolve()

  constructor(private readonly options: SupervisorOptions) {}

  status(): EngineStatus {
    let state = this.state
    let detail = this.detail
    // El hijo murió sin pasar por shutdown(): se muestra «degraded» en vez de
    // un «ready» rancio, para que la UI pueda ofrecer reiniciar.
    if (state === 'ready' && !this.transport?.isRunning()) {
      state = 'degraded'
      detail = 'engine process exited'
    }
    return {
      state,
      engine_version: this.hello?.engine_version ?? null,
      protocol_version: this.hello?.protocol_version ?? null,
      detail,
      capabilities: this.hello?.capabilities ?? {},
      home_id: this.hello?.home_id ?? null,
    }
  }

  private setState(state: EngineState, detail: string | null): void {
    this.state = state
    this.detail = detail
    this.options.onStatus?.(this.status())
  }

  /** Encola una operación de ciclo de vida tras la anterior. */
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.lifecycle.then(operation, operation)
    this.lifecycle = next.catch(() => {})
    return next
  }

  start(): Promise<EngineStatus> {
    return this.serialize(async () => {
      if (this.status().state === 'ready') return this.status()
      this.setState('starting', null)
      let command: EngineCommand
      try {
        command = locateEngine({
          resourceDir: this.options.resourceDir,
          packaged: this.options.packaged ?? false,
          env: this.options.env,
        })
      } catch (reason) {
        const error = toCommandError(reason)
        this.setState('failed', error.message)
        throw error
      }
      return this.startWith(command)
    })
  }

  /** Arranque explícito: sidecar, override o un engine falso en tests. */
  private async startWith(command: EngineCommand): Promise<EngineStatus> {
    this.setState('handshaking', `spawning ${command.program}`)
    this.epoch += 1
    const epoch = this.epoch
    let transport: NdjsonTransport
    try {
      transport = await NdjsonTransport.spawn({
        program: command.program,
        args: command.args,
        cwd: command.cwd,
        epoch,
        onEvent: (event, at) => {
          // Un evento de una instancia anterior no puede pasar por nuevo.
          if (at !== this.epoch) return
          this.options.onEvent(event, at)
        },
        onStderr: this.options.onStderr,
        onExit: (info) => {
          if (info.epoch !== this.epoch) return
          if (this.state === 'ready') this.setState('degraded', 'engine process exited')
        },
      })
    } catch (reason) {
      const error = toCommandError(reason)
      this.setState('failed', error.message)
      throw error
    }

    const capabilities = transport.engineHello.capabilities
    const missing = REQUIRED_CAPABILITIES.filter((name) => capabilities[name] !== true)
    if (missing.length > 0) {
      await transport.shutdown()
      this.setState('failed', INCOMPATIBLE_MESSAGE)
      throw new EngineCommandError('ENGINE_INCOMPATIBLE', INCOMPATIBLE_MESSAGE)
    }

    this.transport = transport
    this.hello = transport.engineHello
    this.setState('ready', null)
    return this.status()
  }

  /**
   * Cierre coordinado: se bloquean los comandos nuevos, se termina el proceso
   * y se limpian sus recursos. Solo mata lo propio: nunca todos los
   * `python.exe` de la máquina.
   */
  shutdown(): Promise<EngineStatus> {
    return this.serialize(async () => {
      const transport = this.transport
      this.transport = null
      this.hello = null
      if (transport) await transport.shutdown()
      this.setState('stopped', null)
      return this.status()
    })
  }

  async restart(): Promise<EngineStatus> {
    this.setState('restarting', null)
    await this.shutdown()
    return this.start()
  }

  /**
   * Una petición al Engine con el plazo de su método. El renderer no elige
   * el plazo ni el binario: solo el método permitido y sus parámetros.
   */
  async request(method: string, params?: unknown, timeoutMs?: number): Promise<unknown> {
    const transport = this.transport
    if (!transport) throw new EngineCommandError('ENGINE_DOWN', 'engine is not running')
    try {
      return await transport.request(method, params, timeoutMs ?? deadlineFor(method))
    } catch (reason) {
      throw toCommandError(reason)
    }
  }

  /** Solo para tests y para el arranque con sidecar explícito. */
  startWithCommand(command: EngineCommand): Promise<EngineStatus> {
    return this.serialize(async () => {
      if (this.status().state === 'ready') return this.status()
      return this.startWith(command)
    })
  }
}
