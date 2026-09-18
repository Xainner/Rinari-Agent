/**
 * Transporte NDJSON sobre el stdio del proceso del Engine (documento 02 §4).
 *
 * Port de `src-tauri/src/engine/transport.rs` con lo que el §4.2 añade para
 * este host: decodificación UTF-8 incremental, LF y CRLF, límite de bytes por
 * línea, un solo escritor con contrapresión, drenaje de stderr desde el primer
 * byte y época de conexión para no confundir una respuesta tardía de la
 * instancia vieja con una válida de la nueva.
 *
 * Aquí no hay lógica de dominio: sesiones, turnos, políticas y herramientas
 * siguen siendo del Engine.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'

import {
  classifyLine,
  parseHello,
  type EngineError,
  type EngineEvent,
  type Hello,
  type OutgoingRequest,
} from '../../shared/protocol'

/** Plazo de la primera línea de stdout (hello) tras el spawn. */
export const HANDSHAKE_TIMEOUT_MS = 15_000
/**
 * Techo por defecto de una ida y vuelta. La ejecución de un turno es
 * asíncrona: se acepta de inmediato y el estado terminal llega por eventos.
 */
export const REQUEST_TIMEOUT_MS = 60_000
/**
 * Máximo de una línea de protocolo. Las capturas del browser viajan como JPEG
 * en base64 de hasta 2 MB, así que el límite se mide contra la carga real y no
 * contra lo que parecería suficiente para logs.
 */
export const MAX_LINE_BYTES = 16 * 1024 * 1024
/** stderr se registra acotado: es diagnóstico, no un canal de datos. */
export const MAX_STDERR_LINE_CHARS = 2_000

export type TransportErrorKind = 'spawn' | 'handshake' | 'io' | 'timeout' | 'engine' | 'shutdown'

export class TransportError extends Error {
  constructor(
    readonly kind: TransportErrorKind,
    message: string,
    readonly engineError?: EngineError,
  ) {
    super(message)
    this.name = 'TransportError'
  }
}

export interface TransportHandlers {
  /** La época acompaña a cada evento: un consumidor puede descartar los viejos. */
  onEvent: (event: EngineEvent, epoch: number) => void
  onStderr?: (line: string) => void
  /** El proceso murió: la UI no puede seguir marcando «ready» tras un exit. */
  onExit?: (info: { code: number | null; signal: NodeJS.Signals | null; epoch: number }) => void
}

export interface SpawnOptions extends TransportHandlers {
  program: string
  args: readonly string[]
  cwd?: string
  /** Época de conexión: identifica a esta instancia frente a las anteriores. */
  epoch: number
  /** Plazo del handshake; solo los tests lo acortan. */
  handshakeTimeoutMs?: number
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: TransportError) => void
  timer: NodeJS.Timeout
}

/**
 * Divide un flujo de bytes en líneas completas.
 *
 * Trabaja sobre bytes y solo decodifica la línea entera, de modo que un
 * carácter multibyte partido entre dos chunks no se corrompe. Acepta LF y
 * CRLF, y corta si una línea supera el límite en vez de crecer sin fin.
 */
export class LineSplitter {
  private buffer: Buffer = Buffer.alloc(0)

  constructor(private readonly maxBytes: number = MAX_LINE_BYTES) {}

  /** Líneas completas del chunk. Lanza si lo acumulado excede el límite. */
  push(chunk: Buffer): string[] {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk])
    const lines: string[] = []
    let start = 0
    for (;;) {
      const newline = this.buffer.indexOf(0x0a, start)
      if (newline === -1) break
      let end = newline
      if (end > start && this.buffer[end - 1] === 0x0d) end -= 1 // CRLF
      // El límite se comprueba **antes** de materializar la línea: si llega
      // entera dentro de un chunk, el búfer restante queda vacío y la
      // comprobación posterior no la vería.
      if (end - start > this.maxBytes) {
        const size = end - start
        this.buffer = Buffer.alloc(0)
        throw new TransportError(
          'io',
          `engine line exceeded ${this.maxBytes} bytes (${size}); dropping the stream`,
        )
      }
      lines.push(this.buffer.subarray(start, end).toString('utf8'))
      start = newline + 1
    }
    if (start > 0) this.buffer = this.buffer.subarray(start)
    if (this.buffer.length > this.maxBytes) {
      const overflow = this.buffer.length
      this.buffer = Buffer.alloc(0)
      throw new TransportError(
        'io',
        `engine line exceeded ${this.maxBytes} bytes (${overflow}); dropping the stream`,
      )
    }
    return lines
  }
}

export class NdjsonTransport {
  private nextId = 1
  private readonly pending = new Map<string, PendingRequest>()
  private writeChain: Promise<void> = Promise.resolve()
  private closed = false
  private exited = false
  /**
   * La conexión ya no puede responder (EOF, error de tubería o el proceso
   * murió). Distinto de `closed`, que es un cierre pedido por nosotros: en
   * ambos casos una petición nueva falla de inmediato en vez de esperar su
   * plazo completo a algo que no va a llegar.
   */
  private dead: TransportError | null = null
  private sawHello = false
  private hello: Hello | null = null
  private readonly splitter = new LineSplitter()
  private settleHandshake: ((result: { ok: true; hello: Hello } | { ok: false; error: TransportError }) => void) | null =
    null

  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    readonly epoch: number,
    private readonly handlers: TransportHandlers,
  ) {
    this.wire()
  }

  /** Lanza el proceso y completa el handshake; al volver, el lector corre. */
  static async spawn(options: SpawnOptions): Promise<NdjsonTransport> {
    const { program, args, cwd, epoch, handshakeTimeoutMs, ...handlers } = options
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(program, [...args], {
        cwd,
        // Nunca `shell: true`: un argumento con espacios no debe convertirse
        // en una línea de comandos interpretada.
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
      })
    } catch (reason) {
      throw new TransportError('spawn', reason instanceof Error ? reason.message : String(reason))
    }
    const transport = new NdjsonTransport(child, epoch, handlers)
    try {
      await transport.handshake(handshakeTimeoutMs)
    } catch (error) {
      // El proceso ya existe cuando el handshake falla: sin esto quedaría un
      // Engine huérfano por cada intento fallido, sujetando sus tuberías.
      await transport.shutdown()
      throw error
    }
    return transport
  }

  /** El hello del Engine. Solo tras completarse el handshake. */
  get engineHello(): Hello {
    if (!this.hello) throw new TransportError('handshake', 'handshake has not completed')
    return this.hello
  }

  private handshake(timeoutMs = HANDSHAKE_TIMEOUT_MS): Promise<Hello> {
    return new Promise<Hello>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.settleHandshake = null
        reject(new TransportError('handshake', 'timed out waiting for engine hello'))
      }, timeoutMs)
      this.settleHandshake = (result) => {
        clearTimeout(timer)
        this.settleHandshake = null
        if (result.ok) resolve(result.hello)
        else reject(result.error)
      }
    })
  }

  private wire(): void {
    // stderr se drena desde el primer byte, incluso antes del hello: si el
    // Engine muere al arrancar, su motivo está ahí y no en stdout.
    const stderrSplitter = new LineSplitter(1024 * 1024)
    this.child.stderr.on('data', (chunk: Buffer) => {
      let lines: string[]
      try {
        lines = stderrSplitter.push(chunk)
      } catch {
        return // Un stderr desbordado no tumba el transporte.
      }
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const bounded =
          trimmed.length > MAX_STDERR_LINE_CHARS
            ? `${trimmed.slice(0, MAX_STDERR_LINE_CHARS)}… (recortado)`
            : trimmed
        if (this.handlers.onStderr) this.handlers.onStderr(bounded)
        else console.error(`[rinari-engine] ${bounded}`)
      }
    })

    this.child.stdout.on('data', (chunk: Buffer) => {
      let lines: string[]
      try {
        lines = this.splitter.push(chunk)
      } catch (reason) {
        this.fail(reason as TransportError)
        return
      }
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        if (!this.sawHello) {
          this.acceptHello(trimmed)
          continue
        }
        this.route(trimmed)
      }
    })

    this.child.stdout.on('end', () => {
      // EOF: se despierta a todos los que esperan para que fallen rápido en
      // vez de colgarse hasta su plazo.
      this.fail(
        new TransportError('io', 'engine stdout closed', {
          code: 'ENGINE_EOF',
          message: 'engine stdout closed',
          retryable: false,
          details: null,
        }),
        'engine stdout closed before the hello',
      )
    })

    this.child.on('error', (error) => {
      this.fail(new TransportError('io', error.message), error.message)
    })

    this.child.on('exit', (code, signal) => {
      this.exited = true
      // La tubería de un hijo vivo no da EOF aunque cierre su stdout: el
      // stream solo termina cuando el proceso sale. Por eso la muerte del
      // proceso también tiene que soltar a los que esperan, o se quedarían
      // hasta agotar su plazo contra algo que ya no existe.
      this.fail(
        new TransportError('io', `engine exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`, {
          code: 'ENGINE_EOF',
          message: 'engine stdout closed',
          retryable: false,
          details: { exit_code: code, signal },
        }),
      )
      this.handlers.onExit?.({ code, signal, epoch: this.epoch })
    })
  }

  /** La primera envoltura debe ser el handshake; desbloquea el spawn. */
  private acceptHello(line: string): void {
    this.sawHello = true
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason)
      this.settleHandshake?.({
        ok: false,
        error: new TransportError('handshake', `first stdout line is not JSON: ${detail}`),
      })
      return
    }
    const parsed = parseHello(value)
    if (!parsed.ok) {
      this.settleHandshake?.({ ok: false, error: new TransportError('handshake', parsed.error) })
      return
    }
    this.hello = parsed.hello
    this.settleHandshake?.({ ok: true, hello: parsed.hello })
  }

  private route(line: string): void {
    const frame = classifyLine(line)
    if (frame.kind === 'response') {
      const id = frame.response.id
      if (!id) return
      const waiting = this.pending.get(id)
      // Sin quien la espere, la respuesta es tardía o ajena: se descarta.
      if (!waiting) return
      this.pending.delete(id)
      clearTimeout(waiting.timer)
      if (frame.response.ok) {
        waiting.resolve(frame.response.result ?? null)
        return
      }
      const error = frame.response.error ?? {
        code: 'MALFORMED_RESPONSE',
        message: 'response has ok=false without an error',
        retryable: false,
        details: null,
      }
      waiting.reject(new TransportError('engine', `${error.code}: ${error.message}`, error))
      return
    }
    if (frame.kind === 'event') this.handlers.onEvent(frame.event, this.epoch)
    // Un `hello` repetido y las líneas ilegibles se descartan: no son fatales.
  }

  /** Falla el handshake si aún no ocurrió, y en todo caso a los pendientes. */
  private fail(error: TransportError, handshakeMessage?: string): void {
    this.dead ??= error
    if (!this.sawHello && this.settleHandshake) {
      this.sawHello = true
      this.settleHandshake({
        ok: false,
        error: handshakeMessage ? new TransportError('handshake', handshakeMessage) : error,
      })
    }
    for (const [, waiting] of this.pending) {
      clearTimeout(waiting.timer)
      waiting.reject(error)
    }
    this.pending.clear()
  }

  /** Envía una petición y espera su envoltura de respuesta. */
  async request(method: string, params?: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<unknown> {
    if (this.closed) throw new TransportError('shutdown', 'engine transport is shut down')
    // Tras EOF o la muerte del proceso nadie va a responder: se falla ya, en
    // vez de agotar un plazo de 60 s contra una tubería cerrada.
    if (this.dead) throw this.dead
    const id = `req_${this.nextId++}`
    const envelope: OutgoingRequest = { id, method }
    if (params !== undefined) envelope.params = params

    const reply = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new TransportError('timeout', `request ${id} (${method}) timed out`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
    })
    // El cierre puede rechazar esta promesa antes de que el llamador llegue a
    // esperarla; sin un consumidor ya adjunto, Node lo reporta como rechazo no
    // gestionado. El rechazo real sigue llegando a quien la espere.
    void reply.catch(() => {})

    try {
      await this.write(`${JSON.stringify(envelope)}\n`)
    } catch (reason) {
      const waiting = this.pending.get(id)
      if (waiting) {
        clearTimeout(waiting.timer)
        this.pending.delete(id)
      }
      throw reason instanceof TransportError
        ? reason
        : new TransportError('io', reason instanceof Error ? reason.message : String(reason))
    }

    return reply
  }

  /**
   * Un solo escritor a stdin, en serie y respetando la contrapresión: con el
   * búfer lleno se espera a `drain` en vez de bloquear el hilo de main.
   */
  private write(line: string): Promise<void> {
    const send = async (): Promise<void> => {
      if (this.closed) throw new TransportError('shutdown', 'engine transport is shut down')
      if (!this.child.stdin.write(line)) await once(this.child.stdin, 'drain')
    }
    // Se encadena tanto en éxito como en fallo para no romper la serie.
    this.writeChain = this.writeChain.then(send, send)
    return this.writeChain
  }

  /** Sigue vivo el proceso. Falso tras el cierre, EOF o la muerte del hijo. */
  isRunning(): boolean {
    return !this.closed && !this.exited && this.dead === null
  }

  /**
   * Termina el hijo y suelta a los que esperan. Idempotente y acotado: nunca
   * bloquea más que su plazo, para que un nieto huérfano —el wrapper de
   * desarrollo deja vivo a python sujetando las tuberías— no cuelgue el cierre.
   */
  async shutdown(timeoutMs = 2_000): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.fail(new TransportError('shutdown', 'engine transport is shut down'))
    if (this.child.exitCode !== null || this.exited) return
    this.child.kill()
    const exited = once(this.child, 'exit')
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, timeoutMs))])
    if (this.child.exitCode === null) this.child.kill('SIGKILL')
  }
}
