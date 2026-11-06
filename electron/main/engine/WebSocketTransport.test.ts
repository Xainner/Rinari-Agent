// «Conectar a mi servidor»: el transporte WebSocket contra un socket falso.
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EngineCommandError, EngineSupervisor, REQUIRED_CAPABILITIES } from './EngineSupervisor'
import { TransportError } from './NdjsonTransport'
import { WebSocketTransport, engineSocketUrl, type SocketFactory, type SocketLike } from './WebSocketTransport'

type Listener = (event: never) => void

/** Un WebSocket falso: el test hace de Gateway. */
export class FakeSocket implements SocketLike {
  readyState = 0
  readonly sent: Array<Record<string, unknown>> = []
  closedWith: { code?: number; reason?: string } | null = null
  private readonly listeners = new Map<string, Listener[]>()

  constructor(
    readonly url: string,
    readonly headers: Record<string, string>,
  ) {}

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }

  private emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) (listener as (e: unknown) => void)(event)
  }

  open(hello: Record<string, unknown> = HELLO): void {
    this.readyState = 1
    this.emit('open', {})
    this.message(hello)
  }

  message(frame: unknown): void {
    this.emit('message', { data: typeof frame === 'string' ? frame : JSON.stringify(frame) })
  }

  /** El Gateway cierra el socket con un código. */
  drop(code: number, reason = ''): void {
    this.readyState = 3
    this.emit('close', { code, reason })
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>)
  }

  close(code?: number, reason?: string): void {
    this.closedWith = { code, reason }
    this.drop(code ?? 1000, reason)
  }
}

export const HELLO = {
  type: 'hello',
  protocol: 'rinari-engine',
  protocol_version: 1,
  engine_version: '0.4.3',
  capabilities: Object.fromEntries(REQUIRED_CAPABILITIES.map((name) => [name, true])),
  engine_instance_id: 'srv-1',
  home_id: 'server-home',
}

function factory() {
  const sockets: FakeSocket[] = []
  const socket: SocketFactory = (url, headers) => {
    const created = new FakeSocket(url, headers)
    sockets.push(created)
    return created
  }
  return { sockets, socket }
}

async function connected(onEvent = vi.fn(), onExit = vi.fn()) {
  const { sockets, socket } = factory()
  const pending = WebSocketTransport.connect({ server: 'https://rinari.example.test', token: 'tok', epoch: 1, socket, onEvent, onExit })
  await vi.waitFor(() => expect(sockets).toHaveLength(1))
  sockets[0].open()
  return { transport: await pending, socket: sockets[0], onEvent, onExit }
}

describe('engineSocketUrl', () => {
  it('turns the server origin into its Engine socket', () => {
    expect(engineSocketUrl('https://rinari.example.test')).toBe('wss://rinari.example.test/remote/v1/engine')
    expect(engineSocketUrl('http://192.168.1.20:18751/')).toBe('ws://192.168.1.20:18751/remote/v1/engine')
  })
})

describe('WebSocketTransport', () => {
  it('sends the device key and waits for the server hello', async () => {
    const { transport, socket } = await connected()
    expect(socket.url).toBe('wss://rinari.example.test/remote/v1/engine')
    expect(socket.headers.authorization).toBe('Bearer tok')
    expect(transport.engineHello.home_id).toBe('server-home')
    expect(transport.isRunning()).toBe(true)
  })

  it('matches answers by id and passes events through', async () => {
    const { transport, socket, onEvent } = await connected()
    const reply = transport.request('model.list', {})
    const sent = socket.sent[0]
    expect(sent).toMatchObject({ method: 'model.list', params: {} })
    socket.message({ type: 'event', event: 'turn.delta', payload: { text: 'hola' } })
    socket.message({ id: sent.id, ok: true, result: { models: [] } })
    await expect(reply).resolves.toEqual({ models: [] })
    expect(onEvent).toHaveBeenCalledWith({ type: 'event', event: 'turn.delta', payload: { text: 'hola' } }, 1)
  })

  it('turns an Engine error into a transport error with its code', async () => {
    const { transport, socket } = await connected()
    const reply = transport.request('model.use', { ref: 'x' })
    socket.message({ id: socket.sent[0].id, ok: false, error: { code: 'MODEL_NOT_FOUND', message: 'no', retryable: false, details: {} } })
    await expect(reply).rejects.toMatchObject({ kind: 'engine', engineError: { code: 'MODEL_NOT_FOUND' } })
  })

  it('fails pending requests when the server closes, and reports the close code', async () => {
    const { transport, socket, onExit } = await connected()
    const reply = transport.request('session.list', {})
    socket.drop(1012, 'engine restarted')
    await expect(reply).rejects.toBeInstanceOf(TransportError)
    expect(onExit).toHaveBeenCalledWith({ code: null, signal: null, epoch: 1, closeCode: 1012 })
    expect(transport.isRunning()).toBe(false)
  })

  it('reports an unpaired device during the handshake as REMOTE_UNPAIRED', async () => {
    const { sockets, socket } = factory()
    const pending = WebSocketTransport.connect({ server: 'https://rinari.example.test', token: 'old', epoch: 1, socket, onEvent: vi.fn() })
    await vi.waitFor(() => expect(sockets).toHaveLength(1))
    sockets[0].readyState = 1
    sockets[0].drop(4401, 'unauthorized')
    await expect(pending).rejects.toMatchObject({ kind: 'engine', engineError: { code: 'REMOTE_UNPAIRED' } })
  })

  it('closes its socket on shutdown without touching the server Engine', async () => {
    const { transport, socket } = await connected()
    await transport.shutdown()
    expect(socket.closedWith).toEqual({ code: 1000, reason: 'client closing' })
    await expect(transport.request('session.list')).rejects.toMatchObject({ kind: 'shutdown' })
  })
})

describe('EngineSupervisor with a server', () => {
  const supervisors: EngineSupervisor[] = []
  afterEach(async () => {
    vi.useRealTimers()
    for (const engine of supervisors.splice(0)) await engine.shutdown()
  })

  function remoteSupervisor() {
    const { sockets, socket } = factory()
    const statuses: string[] = []
    const engine = new EngineSupervisor({
      onEvent: () => {},
      onStatus: (status) => statuses.push(status.state),
      target: () => ({ kind: 'remote', id: 'srv', name: 'Saturno', server: 'https://rinari.example.test', token: 'tok' }),
      socket,
    })
    supervisors.push(engine)
    return { engine, sockets, statuses }
  }

  it('connects to the server and says so in its status', async () => {
    const { engine, sockets } = remoteSupervisor()
    const started = engine.start()
    await vi.waitFor(() => expect(sockets).toHaveLength(1))
    sockets[0].open()
    const status = await started
    expect(status.state).toBe('ready')
    expect(status.remote).toEqual({ id: 'srv', name: 'Saturno', server: 'https://rinari.example.test' })
    expect(status.home_id).toBe('server-home')
  })

  it('stays failed when the server revokes the device', async () => {
    const { engine, sockets } = remoteSupervisor()
    const started = engine.start()
    await vi.waitFor(() => expect(sockets).toHaveLength(1))
    sockets[0].open()
    await started
    sockets[0].drop(4401, 'revoked')
    expect(engine.status().state).toBe('failed')
    expect(engine.status().detail).toMatch(/^REMOTE_UNPAIRED/)
    await new Promise((resolve) => setTimeout(resolve, 1_200))
    expect(sockets).toHaveLength(1) // no reconnection
  })

  it('reconnects by itself when the connection drops', async () => {
    const { engine, sockets, statuses } = remoteSupervisor()
    const started = engine.start()
    await vi.waitFor(() => expect(sockets).toHaveLength(1))
    sockets[0].open()
    await started
    sockets[0].drop(1006)
    expect(engine.status().state).toBe('degraded')
    await vi.waitFor(() => expect(sockets).toHaveLength(2), { timeout: 3_000 })
    sockets[1].open()
    await vi.waitFor(() => expect(engine.status().state).toBe('ready'))
    expect(statuses).toContain('degraded')
  })

  it('maps an unreachable handshake to an error the app can show', async () => {
    const { engine, sockets } = remoteSupervisor()
    const started = engine.start().catch((error: unknown) => error)
    await vi.waitFor(() => expect(sockets.length).toBeGreaterThanOrEqual(1))
    sockets[0].readyState = 1
    sockets[0].drop(4401)
    const error = await started
    expect(error).toBeInstanceOf(EngineCommandError)
    expect((error as EngineCommandError).code).toBe('REMOTE_UNPAIRED')
  })
})
