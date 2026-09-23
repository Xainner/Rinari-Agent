/**
 * Validadores de lo que llega por IPC (documento 02 §3.1).
 *
 * «Las validaciones TypeScript no sustituyen validaciones en ejecución»: el
 * renderer es de confianza por diseño, pero un fallo suyo —o contenido que
 * lograse hablar por su canal— no debe convertirse en una llamada arbitraria
 * al host. Se rechaza lo desconocido, lo sobrante y lo desmedido.
 */

import { DESKTOP_COMMANDS, type DesktopCommand } from '../../src/platform/commands.generated'
import type { FlowScopeRequest } from './contracts'

export { DESKTOP_COMMANDS }
export type { DesktopCommand }

/** Allowlist en ejecución: el mismo inventario que tipa al renderer. */
const ALLOWED = new Set<string>(DESKTOP_COMMANDS)

/** Techo de una llamada de dominio; los adjuntos van por el Engine, no aquí. */
export const MAX_COMMAND_PARAMS_BYTES = 8 * 1024 * 1024

export class ValidationError extends Error {
  readonly code = 'BAD_REQUEST'
}

export function assertCommandName(value: unknown): DesktopCommand {
  if (typeof value !== 'string' || !ALLOWED.has(value)) {
    // No se devuelve el valor recibido: puede ser enorme o llevar secretos.
    throw new ValidationError('unknown command')
  }
  return value as DesktopCommand
}

/**
 * Los parámetros deben ser un objeto plano serializable y acotado. `undefined`
 * y `null` valen como «sin parámetros»; un array o un primitivo, no.
 */
export function assertCommandParams(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('command params must be an object')
  }
  let encoded: string
  try {
    encoded = JSON.stringify(value)
  } catch {
    throw new ValidationError('command params are not serializable')
  }
  if (Buffer.byteLength(encoded, 'utf8') > MAX_COMMAND_PARAMS_BYTES) {
    throw new ValidationError('command params exceed the size limit')
  }
  return value as Record<string, unknown>
}

export function assertString(value: unknown, field: string, maxLength = 4096): string {
  if (typeof value !== 'string') throw new ValidationError(`${field} must be a string`)
  if (value.length > maxLength) throw new ValidationError(`${field} is too long`)
  return value
}

export function assertFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`${field} must be a finite number`)
  }
  return value
}

/**
 * Esquemas permitidos al abrir fuera de la app. `javascript:` y `file:` no
 * están: el primero ejecuta, el segundo abre el disco del usuario desde un
 * enlace que puede venir de una página.
 */
const OPENABLE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

export function assertOpenableUrl(value: unknown): string {
  const raw = assertString(value, 'url', 8192)
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new ValidationError('url is not valid')
  }
  if (!OPENABLE_PROTOCOLS.has(parsed.protocol)) {
    throw new ValidationError(`refusing to open ${parsed.protocol} from the renderer`)
  }
  return parsed.toString()
}

/** Techo del texto que el renderer puede copiar al portapapeles del sistema. */
export const MAX_CLIPBOARD_BYTES = 1024 * 1024

/**
 * Texto para `rinari:clipboard.writeText`: cadena y, como mucho, 1 MiB medido
 * en bytes UTF-8 (no en unidades UTF-16, que infravaloran emojis y CJK).
 */
export function assertClipboardText(value: unknown): string {
  if (typeof value !== 'string') throw new ValidationError('clipboard text must be a string')
  if (Buffer.byteLength(value, 'utf8') > MAX_CLIPBOARD_BYTES) {
    throw new ValidationError('clipboard text exceeds 1 MiB')
  }
  return value
}

/** Techo de un id del Engine (proyecto, sesión, etapa) en un canal de intención. */
export const MAX_ENGINE_ID_LENGTH = 128

/**
 * Un id opcional: ausente es `null`; presente tiene que ser una cadena no
 * vacía y acotada. La cadena vacía no se lee como «ausente»: contaría como
 * ausente al decidir «exactamente uno» y como presente al llegar al Engine.
 */
function assertOptionalId(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null
  const id = assertString(value, field, MAX_ENGINE_ID_LENGTH)
  if (id.length === 0) throw new ValidationError(`${field} must not be empty`)
  return id
}

const FLOW_SCOPE_KEYS = new Set(['project_id', 'session_id', 'before'])

/**
 * Alcance de un flujo (`rinari:flow.get`): exactamente un id, y un cursor
 * opcional.
 *
 * Se valida en main porque el renderer es el lado que se puede modificar: el
 * tipo de TypeScript describe la intención, no la hace cumplir. Una clave que
 * no pertenece al alcance se rechaza en vez de descartarse, igual que el
 * resto de esta frontera.
 */
export function assertFlowScope(value: unknown): FlowScopeRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError('the flow scope has to be an object')
  }
  const raw = value as Record<string, unknown>
  for (const key of Object.keys(raw)) {
    if (!FLOW_SCOPE_KEYS.has(key)) throw new ValidationError(`unknown flow scope field: ${key}`)
  }
  const project = assertOptionalId(raw.project_id, 'project_id')
  const session = assertOptionalId(raw.session_id, 'session_id')
  if ((project === null) === (session === null)) {
    throw new ValidationError('a flow needs exactly one of project_id or session_id')
  }
  return { project_id: project, session_id: session, before: assertOptionalId(raw.before, 'before') }
}
