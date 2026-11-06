/**
 * Transporte del Engine de un servidor: «Conectar a mi servidor» (R4 del
 * Gateway, contrato en `docs/conexion-remota.md` del repo del Gateway).
 *
 * Es el mismo protocolo v1 que el NDJSON local, pero cada mensaje de texto
 * del WebSocket es una línea. El Gateway reparte el Engine entre varios
 * dispositivos: devuelve cada respuesta con el id que le dimos y nos envía
 * todos los eventos. Aquí tampoco hay lógica de dominio.
 */

import {
  classifyLine,
  parseHello,
  type Hello,
  type OutgoingRequest,
} from '../../shared/protocol'
import { HANDSHAKE_TIMEOUT_MS, REQUEST_TIMEOUT_MS, TransportError, type TransportHandlers } from './NdjsonTransport'

/** Cierres del Gateway que el supervisor distingue (docs/conexion-remota.md). */
export const CLOSE_UNPAIRED = 4401
export const CLOSE_TOO_SLOW = 4429
export const CLOSE_ENGINE_RESTART = 1012
export const CLOSE_ENGINE_UNAVAILABLE = 1013

/** Lo mínimo de un WebSocket que usamos: el global de Node/Electron o uno falso en pruebas. */
export interface SocketLike {
  readonly readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  addEventListener(type: 'open', listener: () => void): void
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
  addEventListener(type: 'close', listener: (event: { code: number; reason: string }) => void): void
  addEventListener(type: 'error', listener: () => void): void
}

export type SocketFactory = (url: string, headers: Record<string, string>) => SocketLike

/** El WebSocket de Node (undici) acepta cabeceras; el del navegador no. */
export const nodeSocket: SocketFactory = (url, headers) =>
  new WebSocket(url, { headers } as unknown as string[]) as unknown as SocketLike

export interface RemoteConnectOptions extends Omit<TransportHandlers, 'onExit'> {
  /** Dirección del servidor, p. ej. `https://rinari.example.com`. */
  server: string
  token: string
  epoch: number
  handshakeTimeoutMs?: number
  /** El socket se cerró: con su código, para distinguir revocado de reinicio. */
  onExit?: (info: { code: number | null; signal: null; epoch: number; closeCode: number }) => void
  socket?: SocketFactory
}

/** `https://host` → `wss://host/remote/v1/engine` (y `http` → `ws` en la red privada). */
export function engineSocketUrl(server: string): string {
  const url = new URL(server)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/remote/v1/engine'
  url.search = ''
  url.hash = ''
  return url.toString()
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: TransportError) => void
  timer: NodeJS.Timeout
}

const OPEN = 1

export class WebSocketTransport {
  private nextId = 1
  private readonly pending = new Map<string, PendingRequest>()
  private closed = false
  private dead: TransportError | null = null
  private hello: Hello | null = null
  private settleHandshake: ((result: { ok: true; hello: Hello } | { ok: false; error: TransportError }) => void) | null =
    null
  private closedWith: Promise<void>
  private markClosed: () => void = () => {}

  private constructor(
    private readonly socket: SocketLike,
    readonly epoch: number,
    private readonly options: RemoteConnectOptions,
  ) {
    this.closedWith = new Promise((resolve) => {
      this.markClosed = resolve
    })
    this.wire()
  }

  /** Abre el socket y espera el `hello` del Engine del servidor. */
  static async connect(options: RemoteConnectOptions): Promise<WebSocketTransport> {
    let socket: SocketLike
    try {
      socket = (options.socket ?? nodeSocket)(engineSocketUrl(options.server), {
        authorization: `Bearer ${options.token}`,
      })
    } catch (reason) {
      throw new TransportError('spawn', reason instanceof Error ? reason.message : String(reason))
    }
    const transport = new WebSocketTransport(socket, options.epoch, options)
    try {
      await transport.handshake(options.handshakeTimeoutMs)
    } catch (error) {
      await transport.shutdown()
      throw error
    }
    return transport
  }

  get engineHello(): Hello {
    if (!this.hello) throw new TransportError('handshake', 'handshake has not completed')
    return this.hello
  }

  private handshake(timeoutMs = HANDSHAKE_TIMEOUT_MS): Promise<Hello> {
    return new Promise<Hello>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.settleHandshake = null
        reject(new TransportError('handshake', 'timed out waiting for the server hello'))
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
    this.socket.addEventListener('message', (event) => {
      if (this.dead) return
      const text = typeof event.data === 'string' ? event.data : null
      if (text === null) return // el protocolo es solo texto
      if (!this.hello) {
        this.acceptHello(text)
        return
      }
      this.route(text)
    })
    this.socket.addEventListener('error', () => {
      // El detalle llega con `close`; un error sin cierre no existe en la API.
    })
    this.socket.addEventListener('close', (event) => {
      const error = new TransportError('io', `server connection closed (${event.code}${event.reason ? `: ${event.reason}` : ''})`, {
        code: event.code === CLOSE_UNPAIRED ? 'REMOTE_UNPAIRED' : 'ENGINE_EOF',
        message: event.reason || 'server connection closed',
        retryable: event.code !== CLOSE_UNPAIRED,
        details: { close_code: event.code },
      })
      this.fail(error, event.code === CLOSE_UNPAIRED ? 'REMOTE_UNPAIRED' : undefined)
      this.markClosed()
      this.options.onExit?.({ code: null, signal: null, epoch: this.epoch, closeCode: event.code })
    })
  }

  private acceptHello(text: string): void {
    let value: unknown
    try {
      value = JSON.parse(text)
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason)
      this.settleHandshake?.({ ok: false, error: new TransportError('handshake', `first message is not JSON: ${detail}`) })
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

  private route(text: string): void {
    const frame = classifyLine(text)
    if (frame.kind === 'response') {
      const id = frame.response.id
      if (!id) return
      const waiting = this.pending.get(id)
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
    if (frame.kind === 'event') this.options.onEvent(frame.event, this.epoch)
  }

  private fail(error: TransportError, handshakeCode?: string): void {
    this.dead ??= error
    if (this.settleHandshake) {
      const message = handshakeCode ?? error.message
      this.settleHandshake({
        ok: false,
        error: handshakeCode
          ? new TransportError('engine', message, error.engineError)
          : new TransportError('handshake', message),
      })
    }
    for (const [, waiting] of this.pending) {
      clearTimeout(waiting.timer)
      waiting.reject(error)
    }
    this.pending.clear()
  }

  async request(method: string, params?: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<unknown> {
    if (this.closed) throw new TransportError('shutdown', 'engine transport is shut down')
    if (this.dead) throw this.dead
    if (this.socket.readyState !== OPEN) throw new TransportError('io', 'server connection is not open')
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
    void reply.catch(() => {})
    try {
      this.socket.send(JSON.stringify(envelope))
    } catch (reason) {
      const waiting = this.pending.get(id)
      if (waiting) {
        clearTimeout(waiting.timer)
        this.pending.delete(id)
      }
      throw new TransportError('io', reason instanceof Error ? reason.message : String(reason))
    }
    return reply
  }

  isRunning(): boolean {
    return !this.closed && this.dead === null && this.socket.readyState === OPEN
  }

  /** Cierra el socket. El Engine del servidor sigue: solo se va este dispositivo. */
  async shutdown(timeoutMs = 2_000): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.fail(new TransportError('shutdown', 'engine transport is shut down'))
    try {
      this.socket.close(1000, 'client closing')
    } catch {
      return
    }
    await Promise.race([this.closedWith, new Promise((resolve) => setTimeout(resolve, timeoutMs))])
  }
}
