import type { ProviderTab } from '../../stores/ui'

/**
 * Por qué falló un turno, a partir de lo que dijo el Engine (`provider_error_code`,
 * `limit_kind`, `http_status`), nunca del texto del mensaje. Sin una causa
 * acreditada devuelve `null` y la vista muestra solo el mensaje recibido.
 */
export type FailureKind = 'quota' | 'rate' | 'limit' | 'auth' | 'access' | 'model' | 'context' | 'request' | 'upstream' | 'stream' | 'engine'

export interface TurnFailure {
  kind: FailureKind
  /** El proveedor que atendió la solicitud fallida, no el seleccionado ahora. */
  providerId?: string
  providerAlias?: string
  model?: string
  retryAfterS?: number
  httpStatus?: number
  providerCode?: string
  requestId?: string
}

const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined)
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)

export function turnFailure(details: Record<string, unknown> | undefined): TurnFailure | null {
  if (!details) return null
  const code = text(details.provider_error_code)
  const status = num(details.http_status)
  const limit = text(details.limit_kind)
  let kind: FailureKind | null = null
  if (code === 'QUOTA_EXHAUSTED') kind = 'quota'
  else if (code === 'RATE_LIMIT') kind = limit === 'rate' ? 'rate' : limit === 'quota' ? 'quota' : 'limit'
  else if (code === 'AUTH') kind = status === 403 ? 'access' : 'auth'
  else if (code === 'MODEL_NOT_FOUND' || code === 'MODEL_UNAVAILABLE') kind = 'model'
  else if (code === 'CONTEXT_OVERFLOW') kind = 'context'
  else if (code === 'INVALID_TOOL_SCHEMA' || code === 'INVALID_TOOL_ARGUMENTS' || code === 'VISION_UNSUPPORTED') kind = 'request'
  else if (code === 'SERVER_ERROR' && status !== undefined && status >= 400 && status < 500) kind = 'request'
  else if (code === 'SERVER_ERROR' || code === 'STREAM_INTERRUPTED' || code === 'TIMEOUT') kind = 'upstream'
  // La respuesta llegó a medias y terminó sin su evento final (EOF o [DONE]
  // sin finish_reason): no se culpa a nadie, se dice lo que pasó.
  else if (!code && text(details.kind) === 'STREAM_INTERRUPTED' && text(details.close)) kind = 'stream'
  // El Engine se cerró con el turno en marcha; al reabrir lo cerró él mismo.
  else if (text(details.reason) === 'engine_exited') kind = 'engine'
  if (!kind) return null
  return {
    kind,
    providerId: text(details.provider_id),
    providerAlias: text(details.provider_alias) ?? text(details.provider),
    model: text(details.model),
    retryAfterS: num(details.retry_after_s),
    httpStatus: status,
    providerCode: text(details.provider_response_code),
    requestId: text(details.request_id),
  }
}

/** Dónde se revisa cada causa en Ajustes > Proveedores; `null` = no hay pantalla que ayude. */
export function failureTab(kind: FailureKind): ProviderTab | null {
  if (kind === 'quota' || kind === 'rate' || kind === 'limit') return 'usage'
  if (kind === 'auth' || kind === 'access') return 'connection'
  if (kind === 'model') return 'models'
  return null
}
