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
  // El valor de una bandera nunca es otra bandera: si falta, la bandera se
  // queda sin valor en vez de tragarse la siguiente.
  const valueAt = (index: number): string | null => {
    const value = rest[index]
    return value !== undefined && !value.startsWith('--') ? value : null
  }
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index]
    if (argument === '--project') {
      project = valueAt(index + 1)
      if (project !== null) index += 1
    } else if (argument === '--session') {
      session = valueAt(index + 1)
      if (session !== null) index += 1
    } else if (!argument.startsWith('--') && project === null) {
      // El primer posicional es el proyecto; los siguientes se ignoran.
      project = argument
    }
  }
  return { project, session }
}

const MAX_HANDOFF_TEXT = 4096

/**
 * La petición que la segunda instancia manda ya leída (`additionalData`).
 *
 * El `argv` que llega a `second-instance` no sirve: Chromium lo vuelve a
 * serializar con las banderas primero y los posicionales después, así que
 * `--project C:\demo --session abc` llegaba como `--project --session …
 * C:\demo abc` y la sesión se leía como proyecto. La segunda instancia sí ve
 * su `process.argv` en orden, lo lee ella y lo pasa como dato. Aquí se valida:
 * viene de otro proceso.
 */
export function openRequestFromData(data: unknown): OpenRequest | null {
  if (typeof data !== 'object' || data === null) return null
  const request = (data as { handoff?: unknown }).handoff
  if (typeof request !== 'object' || request === null) return null
  const field = (value: unknown): string | null | undefined =>
    value === null ? null : typeof value === 'string' && value.length > 0 && value.length <= MAX_HANDOFF_TEXT ? value : undefined
  const project = field((request as { project?: unknown }).project)
  const session = field((request as { session?: unknown }).session)
  if (project === undefined || session === undefined) return null
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
