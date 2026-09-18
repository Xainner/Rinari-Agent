/**
 * Traduce una llamada del renderer a una petición del protocolo (documento 02 §2).
 *
 * El nombre del comando **no** es el método, y los argumentos se renombran:
 * `session_get({reference})` es `session.get({ref})`. El host anterior hacía
 * esto en 130 handlers Rust; aquí la tabla se genera de ese mismo código
 * (`commandMap.generated.ts`) y este módulo solo la aplica.
 *
 * Dos reglas que no son cosméticas:
 * - Una clave opcional que falta **se omite**, no se envía nula. El Engine
 *   distingue «no me lo dijiste» de «me dijiste nulo».
 * - Un argumento con valor por defecto en el host anterior lo conserva, o una
 *   llamada sin él cambiaría de significado al portarla.
 */

import { COMMAND_ADAPTERS } from './commandAdapters'
import { COMMAND_MAP, type CommandTranslation } from './commandMap.generated'

export { COMMAND_MAP }
export type { CommandTranslation }

export class UnknownCommand extends Error {
  readonly code = 'UNKNOWN_COMMAND'
}

export interface EngineCall {
  method: string
  params?: Record<string, unknown>
}

export function translateCommand(name: string, args: Record<string, unknown> = {}): EngineCall {
  const translation = COMMAND_MAP[name]
  if (!translation) throw new UnknownCommand(`no protocol method for command ${name}`)

  // Marcado como manual: su traducción vive en `commandAdapters.ts`. Si
  // falta, se falla en vez de mandar una traducción incompleta al Engine.
  if (translation.manual) {
    const adapter = COMMAND_ADAPTERS[name]
    if (!adapter) {
      throw new UnknownCommand(
        `${name} needs a manual translation; add it to commandAdapters.ts`,
      )
    }
    return adapter(args)
  }

  // El argumento es el objeto de parámetros entero: envolverlo lo rompería.
  if (translation.passthrough) {
    const value = args[translation.passthrough]
    return { method: translation.method, params: (value ?? {}) as Record<string, unknown> }
  }

  const params: Record<string, unknown> = {}
  for (const binding of translation.params) {
    const value = binding.from === null ? undefined : args[binding.from]
    if (value === undefined || value === null) {
      if (binding.fallback !== undefined) {
        params[binding.key] = binding.fallback
        continue
      }
      // Opcional ausente: se omite. Obligatoria ausente: también se omite y
      // el Engine responde con su propio error, que es más informativo que
      // uno inventado aquí.
      continue
    }
    params[binding.key] = value
  }
  return Object.keys(params).length > 0
    ? { method: translation.method, params }
    : { method: translation.method }
}
