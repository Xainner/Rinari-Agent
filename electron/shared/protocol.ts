/**
 * Engine Protocol v1, lado desktop (documento 02 §4).
 *
 * Port de `src-tauri/src/engine/protocol.rs`. Es NDJSON con hello, envolturas
 * de petición/respuesta y eventos: **no** es JSON-RPC estándar por tener ids,
 * y tratarlo como tal rompería la compatibilidad con el Engine.
 *
 * Los campos desconocidos se ignoran al parsear, para que una adición menor
 * del Engine no tumbe un cliente viejo.
 */

export const PROTOCOL_NAME = 'rinari-engine'
/** Versión mayor que habla este cliente; otra distinta es rechazo, no aviso. */
export const PROTOCOL_VERSION = 1

export interface OutgoingRequest {
  id: string
  method: string
  params?: unknown
}

export interface Hello {
  type: string
  protocol: string
  protocol_version: number
  engine_version: string
  capabilities: Record<string, boolean>
  /**
   * Identidad estable del Engine home (digest de su ruta resuelta). A
   * diferencia de `engine_instance_id` sobrevive a los reinicios; los engines
   * antiguos la omiten.
   */
  home_id?: string | null
}

export interface EngineError {
  code: string
  message: string
  retryable: boolean
  details: unknown
}

export interface IncomingResponse {
  id: string | null
  ok: boolean
  result?: unknown
  error?: EngineError
}

/** Evento asíncrono: `{"type":"event","event":"<nombre>","payload":{…}}`. */
export interface EngineEvent {
  type: string
  event: string
  payload: unknown
}

export type Frame =
  | { kind: 'hello'; hello: Hello }
  | { kind: 'response'; response: IncomingResponse }
  | { kind: 'event'; event: EngineEvent }
  | { kind: 'ignored' }

export function engineErrorMessage(error: EngineError): string {
  return `${error.code}: ${error.message}`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function toEngineError(value: unknown): EngineError | undefined {
  const raw = asRecord(value)
  if (!raw || typeof raw.code !== 'string' || typeof raw.message !== 'string') return undefined
  return {
    code: raw.code,
    message: raw.message,
    retryable: raw.retryable === true,
    details: raw.details ?? null,
  }
}

function toHello(value: unknown): Hello | null {
  const raw = asRecord(value)
  if (!raw) return null
  if (
    typeof raw.type !== 'string' ||
    typeof raw.protocol !== 'string' ||
    typeof raw.protocol_version !== 'number' ||
    typeof raw.engine_version !== 'string'
  ) {
    return null
  }
  const capabilities: Record<string, boolean> = {}
  const rawCapabilities = asRecord(raw.capabilities)
  if (rawCapabilities) {
    for (const [name, enabled] of Object.entries(rawCapabilities)) {
      if (typeof enabled === 'boolean') capabilities[name] = enabled
    }
  }
  return {
    type: raw.type,
    protocol: raw.protocol,
    protocol_version: raw.protocol_version,
    engine_version: raw.engine_version,
    capabilities,
    home_id: typeof raw.home_id === 'string' ? raw.home_id : null,
  }
}

/** Valida el handshake. Los mensajes son los del host anterior, a propósito. */
export function parseHello(value: unknown): { ok: true; hello: Hello } | { ok: false; error: string } {
  const hello = toHello(value)
  if (!hello) return { ok: false, error: 'invalid hello' }
  if (hello.type !== 'hello') return { ok: false, error: 'first line is not a hello' }
  if (hello.protocol !== PROTOCOL_NAME) {
    return { ok: false, error: `unexpected protocol: ${hello.protocol}` }
  }
  if (hello.protocol_version !== PROTOCOL_VERSION) {
    return {
      ok: false,
      error:
        `incompatible protocol version: engine=${hello.protocol_version}, ` +
        `client=${PROTOCOL_VERSION} (refusing to connect)`,
    }
  }
  return { ok: true, hello }
}

/**
 * Clasifica una línea de stdout. Una línea ilegible se ignora y **no** es
 * fatal: el Engine puede ganar tipos de envoltura que este cliente no conoce.
 */
export function classifyLine(line: string): Frame {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    return { kind: 'ignored' }
  }
  const raw = asRecord(value)
  if (!raw) return { kind: 'ignored' }

  if (raw.type === 'hello') {
    const hello = toHello(raw)
    return hello ? { kind: 'hello', hello } : { kind: 'ignored' }
  }
  if (raw.type === 'event') {
    if (typeof raw.event !== 'string') return { kind: 'ignored' }
    return {
      kind: 'event',
      event: { type: 'event', event: raw.event, payload: raw.payload ?? null },
    }
  }
  // Una respuesta necesita ambos: un `id` suelto no identifica una envoltura.
  if ('id' in raw && 'ok' in raw) {
    return {
      kind: 'response',
      response: {
        id: typeof raw.id === 'string' ? raw.id : null,
        ok: raw.ok === true,
        result: raw.result,
        error: toEngineError(raw.error),
      },
    }
  }
  return { kind: 'ignored' }
}
