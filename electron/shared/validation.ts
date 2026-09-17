/**
 * Validadores de lo que llega por IPC (documento 02 §3.1).
 *
 * «Las validaciones TypeScript no sustituyen validaciones en ejecución»: el
 * renderer es de confianza por diseño, pero un fallo suyo —o contenido que
 * lograse hablar por su canal— no debe convertirse en una llamada arbitraria
 * al host. Se rechaza lo desconocido, lo sobrante y lo desmedido.
 */

import { DESKTOP_COMMANDS, type DesktopCommand } from '../../src/platform/commands.generated'

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
