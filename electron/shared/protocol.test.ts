// Port de los tests de `src-tauri/src/engine/protocol.rs`: el contrato de
// envolturas del Engine no cambia por cambiar de host (documento 02 §4).
import { describe, expect, it } from 'vitest'

import { classifyLine, parseHello } from './protocol'

function helloValue(overrides: Record<string, unknown> = {}) {
  return {
    type: 'hello',
    protocol: 'rinari-engine',
    protocol_version: 1,
    engine_version: '0.1.0',
    capabilities: { chat: true, projects: true },
    future_field: ['ignorado'],
    ...overrides,
  }
}

describe('handshake', () => {
  it('acepta un engine compatible y conserva capabilities', () => {
    const parsed = parseHello(helloValue())
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.hello.engine_version).toBe('0.1.0')
    expect(parsed.hello.capabilities.chat).toBe(true)
  })

  it('conserva home_id cuando el engine lo envía y null cuando no', () => {
    const withHome = parseHello(helloValue({ home_id: 'home_1' }))
    expect(withHome.ok && withHome.hello.home_id).toBe('home_1')
    const without = parseHello(helloValue())
    expect(without.ok && without.hello.home_id).toBeNull()
  })

  it('rechaza otro protocolo', () => {
    const parsed = parseHello(helloValue({ protocol: 'otro-engine' }))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.error).toContain('unexpected protocol')
  })

  it('rechaza una versión mayor incompatible en vez de avisar', () => {
    const parsed = parseHello(helloValue({ protocol_version: 2 }))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.error).toContain('incompatible protocol version')
  })

  it('rechaza una primera línea que no es un hello', () => {
    const parsed = parseHello({ type: 'event', protocol: 'rinari-engine', protocol_version: 1, engine_version: 'x' })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.error).toBe('first line is not a hello')
  })
})

describe('clasificación de envolturas', () => {
  it('resuelve respuestas por id e ignora campos desconocidos', () => {
    const frame = classifyLine('{"id":"req_7","ok":true,"result":{"sessions":[]},"extra":"ignorado"}')
    expect(frame.kind).toBe('response')
    if (frame.kind !== 'response') return
    expect(frame.response.id).toBe('req_7')
    expect(frame.response.ok).toBe(true)
  })

  it('los fallos llevan código legible por máquina', () => {
    const frame = classifyLine(
      '{"id":"r1","ok":false,"error":{"code":"TURN_RUNNING","message":"busy","retryable":false,"details":{}}}',
    )
    expect(frame.kind).toBe('response')
    if (frame.kind !== 'response') return
    expect(frame.response.ok).toBe(false)
    expect(frame.response.error?.code).toBe('TURN_RUNNING')
  })

  it('los eventos conservan session y turn', () => {
    const frame = classifyLine(
      '{"type":"event","event":"model.content.delta","payload":{"turn_id":"t1","session_id":"s1","delta":"hi"}}',
    )
    expect(frame.kind).toBe('event')
    if (frame.kind !== 'event') return
    expect(frame.event.event).toBe('model.content.delta')
    expect((frame.event.payload as { turn_id: string }).turn_id).toBe('t1')
  })

  it('una línea ilegible se ignora y no es fatal', () => {
    expect(classifyLine('no json').kind).toBe('ignored')
    // Un `id` suelto no identifica una envoltura de respuesta.
    expect(classifyLine('{"id":"x"}').kind).toBe('ignored')
    expect(classifyLine('').kind).toBe('ignored')
    expect(classifyLine('[1,2,3]').kind).toBe('ignored')
    expect(classifyLine('{"type":"algo_futuro"}').kind).toBe('ignored')
  })
})
