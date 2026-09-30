/**
 * `rinari update` con la app abierta.
 *
 * El CLI no cierra la app ni reemplaza sus archivos por debajo: la arranca con
 * `--update` (una segunda instancia que entrega la petición a esta) y la app
 * se actualiza con su propio flujo. `apply()` pide confirmación con el diálogo
 * «Reiniciar y actualizar», así que nada se cierra sin que el dueño lo acepte.
 */

import type { UpdateService } from './UpdateService'

export type RequestedUpdateOutcome = 'current' | 'asked' | 'failed'

export async function runRequestedUpdate(
  updates: Pick<UpdateService, 'check' | 'download' | 'apply'>,
): Promise<RequestedUpdateOutcome> {
  try {
    // El CLI ya vio una versión nueva; si aquí no la hay (otro canal, feed
    // caché), no se inventa nada.
    if (!(await updates.check())) return 'current'
    await updates.download()
    await updates.apply()
    return 'asked'
  } catch (error) {
    // El estado de error ya lo publica UpdateService y el renderer lo avisa.
    console.warn('[rinari] update requested by the CLI failed:', error)
    return 'failed'
  }
}

/** `--update` en los argumentos. Una bandera suelta: el orden no importa. */
export function wantsUpdate(argv: readonly string[], skip = 1): boolean {
  return argv.slice(skip).includes('--update')
}

/** Lo mismo, leído del `additionalData` que manda la segunda instancia. */
export function updateRequestFromData(data: unknown): boolean {
  return typeof data === 'object' && data !== null && (data as { update?: unknown }).update === true
}
