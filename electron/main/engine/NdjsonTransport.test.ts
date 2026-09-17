// Tests del transporte contra un Engine falso (documento 02 §8): hello,
// eventos intercalados, Unicode partido, respuestas tardías, EOF, stderr
// voluminoso y cierre. Nada de red ni de proveedores reales.
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import type { EngineEvent } from '../../shared/protocol'
import { LineSplitter, NdjsonTransport, TransportError } from './NdjsonTransport'

const FAKE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fakeEngine.mjs')

const open: NdjsonTransport[] = []

async function connect(scenario = 'default', epoch = 1) {
  const events: Array<{ event: EngineEvent; epoch: number }> = []
  const stderr: string[] = []
  const exits: Array<{ code: number | null }> = []
  const previous = process.env.RINARI_FAKE_SCENARIO
  process.env.RINARI_FAKE_SCENARIO = scenario
  try {
    const transport = await NdjsonTransport.spawn({
      program: process.execPath,
      args: [FAKE],
      epoch,
      onEvent: (event, at) => events.push({ event, epoch: at }),
      onStderr: (line) => stderr.push(line),
      onExit: (info) => exits.push({ code: info.code }),
    })
    open.push(transport)
    return { transport, events, stderr, exits }
  } finally {
    if (previous === undefined) delete process.env.RINARI_FAKE_SCENARIO
    else process.env.RINARI_FAKE_SCENARIO = previous
  }
}

/** ¿Sigue vivo ese proceso? `kill(pid, 0)` no lo mata: solo pregunta. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

type FailedSpawn = TransportError & { pids: number[] }

/** El error del handshake, con los PID que el Engine falso anunció. */
async function expectSpawnToFail(
  scenario: string,
  handshakeTimeoutMs?: number,
): Promise<FailedSpawn | null> {
  const previous = process.env.RINARI_FAKE_SCENARIO
  process.env.RINARI_FAKE_SCENARIO = scenario
  const pids: number[] = []
  try {
    return await NdjsonTransport.spawn({
      program: process.execPath,
      args: [FAKE],
      epoch: 1,
      handshakeTimeoutMs,
      onEvent: () => {},
      onStderr: (line) => {
        const match = /^PID (\d+)$/.exec(line)
        if (match) pids.push(Number(match[1]))
      },
    }).then(
      (transport) => {
        open.push(transport)
        return null
      },
      (error: TransportError) => Object.assign(error, { pids }) as FailedSpawn,
    )
  } finally {
    if (previous === undefined) delete process.env.RINARI_FAKE_SCENARIO
    else process.env.RINARI_FAKE_SCENARIO = previous
  }
}

/** Tras un handshake fallido, el hijo no puede seguir vivo. */
async function expectChildGone(scenario: string, handshakeTimeoutMs?: number): Promise<FailedSpawn> {
  const error = await expectSpawnToFail(scenario, handshakeTimeoutMs)
  expect(error, `${scenario} debía fallar el handshake`).not.toBeNull()
  await new Promise((resolve) => setTimeout(resolve, 400))
  for (const pid of error!.pids) {
    expect(alive(pid), `el proceso ${pid} de '${scenario}' sigue vivo`).toBe(false)
  }
  return error!
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((transport) => transport.shutdown()))
})

describe('LineSplitter', () => {
  it('no corrompe un carácter multibyte partido entre chunks', () => {
    const splitter = new LineSplitter()
    const bytes = Buffer.from('{"t":"ñandú 🌱"}\n', 'utf8')
    const cut = 10
    expect(splitter.push(bytes.subarray(0, cut))).toEqual([])
    expect(splitter.push(bytes.subarray(cut))).toEqual(['{"t":"ñandú 🌱"}'])
  })

  it('acepta LF y CRLF sin dejar el retorno de carro dentro', () => {
    const splitter = new LineSplitter()
    expect(splitter.push(Buffer.from('uno\r\ndos\ntres\r\n', 'utf8'))).toEqual(['uno', 'dos', 'tres'])
  })

  it('NDJSON-01 — una línea incompleta que pasa el límite falla', () => {
    const splitter = new LineSplitter(64)
    expect(() => splitter.push(Buffer.alloc(128, 0x61))).toThrow(/exceeded 64 bytes/)
  })

  it('NDJSON-02 — una línea ya completa que pasa el límite también falla', () => {
    // Con el newline dentro del chunk, el búfer restante queda vacío: la
    // comprobación posterior no la vería y la línea entera pasaría.
    const splitter = new LineSplitter(64)
    const chunk = Buffer.concat([Buffer.alloc(128, 0x61), Buffer.from('\n')])
    expect(() => splitter.push(chunk)).toThrow(/exceeded 64 bytes/)
  })

  it('NDJSON-03 — una línea justo dentro del límite se acepta', () => {
    const splitter = new LineSplitter(64)
    const chunk = Buffer.concat([Buffer.alloc(64, 0x61), Buffer.from('\n')])
    expect(splitter.push(chunk)).toEqual(['a'.repeat(64)])
  })

  it('una línea vacía es una línea, no un final', () => {
    const splitter = new LineSplitter()
    expect(splitter.push(Buffer.from('\n\na\n', 'utf8'))).toEqual(['', '', 'a'])
  })
})

describe('handshake', () => {
  it('conecta y expone el hello del Engine', async () => {
    const { transport } = await connect()
    expect(transport.engineHello.engine_version).toBe('fake-1.0')
    expect(transport.engineHello.home_id).toBe('home_fake')
    expect(transport.isRunning()).toBe(true)
  })

  it('acepta un hello partido por la mitad de un carácter multibyte', async () => {
    const { transport } = await connect('split-unicode')
    expect(transport.engineHello.engine_version).toBe('ñandú-🌱')
  })

  it('acepta un hello terminado en CRLF', async () => {
    const { transport } = await connect('crlf')
    expect(transport.engineHello.protocol_version).toBe(1)
  })

  it('rechaza una primera línea que no es JSON', async () => {
    const error = await expectSpawnToFail('garbage-hello')
    expect(error?.kind).toBe('handshake')
    expect(error?.message).toContain('first stdout line is not JSON')
  })

  it('rechaza otro protocolo y una versión mayor incompatible', async () => {
    expect((await expectSpawnToFail('wrong-protocol'))?.message).toContain('unexpected protocol')
    expect((await expectSpawnToFail('future-protocol'))?.message).toContain('incompatible protocol version')
  })

  it('no se queda colgado si el Engine muere antes del hello', async () => {
    const error = await expectSpawnToFail('die-before-hello')
    expect(error?.kind).toBe('handshake')
    expect(error?.message).toContain('before the hello')
  })

  it('LIFE-01 — un hello que nunca llega no deja el proceso vivo', async () => {
    // El proceso ya existe cuando el handshake falla; sin limpieza quedaría
    // un Engine huérfano por cada intento.
    const error = await expectChildGone('no-hello', 400)
    expect(error.kind).toBe('handshake')
    expect(error.pids.length).toBeGreaterThan(0)
  })

  it('LIFE-02 — una primera línea inválida tampoco lo deja vivo', async () => {
    expect((await expectChildGone('garbage-hello')).kind).toBe('handshake')
  })

  it('LIFE-03 — un hello incompatible cierra el transporte', async () => {
    expect((await expectChildGone('future-protocol')).message).toContain('incompatible')
  })
})

describe('peticiones', () => {
  it('correlaciona la respuesta con su id', async () => {
    const { transport } = await connect()
    await expect(transport.request('echo', { a: 1 })).resolves.toEqual({
      method: 'echo',
      params: { a: 1 },
    })
  })

  it('resuelve varias peticiones en vuelo sin mezclarlas', async () => {
    const { transport } = await connect()
    const [uno, dos, tres] = await Promise.all([
      transport.request('echo', { n: 1 }),
      transport.request('unicode'),
      transport.request('echo', { n: 3 }),
    ])
    expect((uno as { params: { n: number } }).params.n).toBe(1)
    expect((dos as { text: string }).text).toBe('ñandú 🌱 日本語')
    expect((tres as { params: { n: number } }).params.n).toBe(3)
  })

  it('un fallo del Engine llega con su código, no como excepción genérica', async () => {
    const { transport } = await connect()
    const error = await transport.request('fail').catch((reason: TransportError) => reason)
    expect(error).toBeInstanceOf(TransportError)
    expect((error as TransportError).kind).toBe('engine')
    expect((error as TransportError).engineError?.code).toBe('TURN_RUNNING')
  })

  it('`ok:false` sin error se reporta como MALFORMED_RESPONSE', async () => {
    const { transport } = await connect()
    const error = await transport.request('malformed').catch((reason: TransportError) => reason)
    expect((error as TransportError).engineError?.code).toBe('MALFORMED_RESPONSE')
  })

  it('respeta el plazo de la operación y suelta el pendiente', async () => {
    const { transport } = await connect()
    const error = await transport.request('never', undefined, 120).catch((reason: TransportError) => reason)
    expect((error as TransportError).kind).toBe('timeout')
    expect((error as TransportError).message).toContain('timed out')
    // El transporte sigue utilizable tras un plazo vencido.
    await expect(transport.request('echo')).resolves.toBeTruthy()
  })

  it('descarta una respuesta tardía en vez de resolver otra petición', async () => {
    const { transport } = await connect()
    const late = await transport.request('late', undefined, 80).catch((reason: TransportError) => reason)
    expect((late as TransportError).kind).toBe('timeout')
    // La respuesta atrasada llega ahora; no debe contaminar a la siguiente.
    await new Promise((resolve) => setTimeout(resolve, 300))
    await expect(transport.request('echo', { after: true })).resolves.toEqual({
      method: 'echo',
      params: { after: true },
    })
  })

  it('las líneas ilegibles entre medias no tumban la conexión', async () => {
    const { transport } = await connect()
    await expect(transport.request('noise')).resolves.toEqual({ survived: true })
  })

  it('transporta una carga del tamaño de una captura del browser', async () => {
    const { transport } = await connect()
    const result = (await transport.request('big', { size: 2_000_000 })) as { blob: string }
    expect(result.blob).toHaveLength(2_000_000)
  })
})

describe('eventos', () => {
  it('entrega los eventos intercalados con su época', async () => {
    const { transport, events } = await connect('default', 7)
    await transport.request('with_events')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(events.map((entry) => entry.event.event)).toEqual([
      'model.content.delta',
      'model.content.delta',
    ])
    expect(events.every((entry) => entry.epoch === 7)).toBe(true)
  })
})

describe('final de la conexión', () => {
  it('EOF de stdout suelta a los que esperan en vez de colgarlos', async () => {
    const { transport } = await connect()
    // Una petición ya en vuelo cuando llega el EOF debe fallar al instante,
    // no agotar su plazo contra una tubería cerrada.
    const inFlight = transport.request('never', undefined, 5_000).catch((reason: TransportError) => reason)
    await transport.request('close_stdout')
    const error = (await inFlight) as TransportError
    expect(error.engineError?.code).toBe('ENGINE_EOF')
    expect(transport.isRunning()).toBe(false)
  })

  it('tras el EOF una petición nueva falla ya, sin esperar su plazo', async () => {
    const { transport } = await connect()
    await transport.request('close_stdout')
    await new Promise((resolve) => setTimeout(resolve, 50))
    const started = Date.now()
    const error = await transport.request('echo', undefined, 5_000).catch((reason: TransportError) => reason)
    expect((error as TransportError).engineError?.code).toBe('ENGINE_EOF')
    expect(Date.now() - started).toBeLessThan(200)
  })

  it('la muerte del proceso se avisa y deja de estar en marcha', async () => {
    const { transport, exits } = await connect()
    await transport.request('exit').catch(() => {})
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(exits).toHaveLength(1)
    expect(exits[0].code).toBe(7)
    expect(transport.isRunning()).toBe(false)
  })

  it('stderr voluminoso se drena sin perder el protocolo', async () => {
    const { transport, stderr } = await connect('loud-stderr')
    await expect(transport.request('echo')).resolves.toBeTruthy()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(stderr.length).toBeGreaterThan(100)
    expect(stderr.every((line) => line.length <= 2_100)).toBe(true)
  })

  it('el cierre es idempotente y rechaza lo que quede pendiente', async () => {
    const { transport } = await connect()
    const pending = transport.request('never', undefined, 5_000).catch((reason: TransportError) => reason)
    await transport.shutdown()
    await transport.shutdown()
    expect(((await pending) as TransportError).kind).toBe('shutdown')
    expect(transport.isRunning()).toBe(false)
    await expect(transport.request('echo')).rejects.toThrow(/shut down/)
  })
})
