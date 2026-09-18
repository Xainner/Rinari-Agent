/**
 * Handoff de `rinari desktop [ruta] [--session id]` (documento 02 §7).
 *
 * Port de `parse_open_request` de `commands/engine.rs`, con el mismo contrato:
 * solo argumentos explícitos, y lo que no se reconoce se ignora en vez de
 * interpretarse.
 *
 * Una segunda instancia no abre otra ventana: entrega su petición a la que ya
 * está y esta se enfoca. Si llega antes de que el renderer esté listo se
 * encola y se entrega **una** vez, para no crear sesiones paralelas.
 */

import type { OpenRequest } from '../../shared/contracts'

/**
 * Lee la petición de los argumentos del proceso.
 *
 * `argv[0]` es el ejecutable y se salta, igual que en el host anterior. En una
 * app empaquetada Electron pasa los argumentos del usuario tal cual; en
 * desarrollo, el primer argumento tras el ejecutable es el script, de ahí
 * `skip`.
 */
export function parseOpenRequest(argv: readonly string[], skip = 1): OpenRequest {
  let project: string | null = null
  let session: string | null = null
  const rest = argv.slice(skip)
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index]
    if (argument === '--project') {
      project = rest[++index] ?? null
    } else if (argument === '--session') {
      session = rest[++index] ?? null
    } else if (!argument.startsWith('--') && project === null) {
      // El primer posicional es el proyecto; los siguientes se ignoran.
      project = argument
    }
  }
  return { project, session }
}

export function hasRequest(request: OpenRequest): boolean {
  return request.project !== null || request.session !== null
}

/**
 * Cola del handoff: guarda lo que llega antes de que el renderer pueda
 * recibirlo y lo entrega una sola vez.
 */
export class HandoffQueue {
  private pending: OpenRequest | null = null
  private deliver: ((request: OpenRequest) => void) | null = null

  /** Una petición nueva sustituye a la pendiente: la última es la que quiso el usuario. */
  push(request: OpenRequest): void {
    if (!hasRequest(request)) return
    if (this.deliver) {
      this.deliver(request)
      return
    }
    this.pending = request
  }

  /** El renderer está listo: desde ahora se entrega directo. */
  open(deliver: (request: OpenRequest) => void): void {
    this.deliver = deliver
    const queued = this.pending
    this.pending = null
    if (queued) deliver(queued)
  }

  /** La ventana se fue: lo que llegue vuelve a encolarse. */
  close(): void {
    this.deliver = null
  }
}
