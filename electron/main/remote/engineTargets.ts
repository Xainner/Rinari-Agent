/**
 * «Conectar a mi servidor»: con qué Engine trabaja la app.
 *
 * Uno a la vez: el de este equipo (el sidecar de siempre) o el de un servidor
 * con Rinari Gateway, emparejado con un código de un solo uso. El token del
 * dispositivo se guarda cifrado con `safeStorage` (DPAPI en Windows) en
 * `userData/engines.json`; nunca viaja al renderer.
 */

import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { dirname } from 'node:path'

import type { EnginesView, RemoteEngine } from '../../shared/contracts'

export type { EnginesView, RemoteEngine } from '../../shared/contracts'

export const LOCAL = 'local'

export type EngineTarget =
  | { kind: 'local' }
  | { kind: 'remote'; id: string; name: string; server: string; token: string }

interface StoredRemote extends RemoteEngine {
  /** Token cifrado con safeStorage, en base64. */
  token: string
}

interface Stored {
  active: string
  remotes: StoredRemote[]
}

export interface EngineTargetsDeps {
  read(): Stored | null
  write(value: Stored): void
  canEncrypt(): boolean
  encrypt(text: string): Buffer
  decrypt(data: Buffer): string
  fetch: typeof fetch
  deviceName(): string
  now?: () => Date
}

/** `userData/engines.json`, escrito de forma atómica. Un archivo roto vale como vacío. */
export function enginesFile(path: string): Pick<EngineTargetsDeps, 'read' | 'write'> {
  return {
    read: () => {
      try {
        return JSON.parse(readFileSync(path, 'utf8')) as Stored
      } catch {
        return null
      }
    },
    write: (value) => {
      mkdirSync(dirname(path), { recursive: true })
      const temporary = `${path}.tmp`
      writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 })
      renameSync(temporary, path)
    },
  }
}

export class RemoteSetupError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'RemoteSetupError'
  }
}

const PAIR_SCHEME = 'rinari:'

/** Tailscale y otras superposiciones CGNAT. */
function inCgnat(parts: number[]): boolean {
  return parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127
}

/** loopback, LAN o Tailscale: ahí se admite `http`, que no sale a internet. */
export function isPrivateHost(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (bare === 'localhost' || bare.endsWith('.localhost')) return true
  const kind = isIP(bare)
  if (kind === 4) {
    const p = bare.split('.').map(Number)
    return (
      p[0] === 127 || p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) || inCgnat(p)
    )
  }
  if (kind === 6) return bare === '::1' || bare.startsWith('fc') || bare.startsWith('fd') || bare.startsWith('fe80')
  return false
}

/** Normaliza la dirección del servidor a su origen; exige HTTPS fuera de la red privada. */
export function checkServer(input: string): string {
  let url: URL
  try {
    url = new URL(input.trim().includes('://') ? input.trim() : `https://${input.trim()}`)
  } catch {
    throw new RemoteSetupError('INVALID_SERVER', 'The server address is not valid')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new RemoteSetupError('INVALID_SERVER', 'The server address must start with https://')
  }
  if (url.username || url.password) throw new RemoteSetupError('INVALID_SERVER', 'The server address cannot carry a user')
  if (url.protocol === 'http:' && !isPrivateHost(url.hostname)) {
    throw new RemoteSetupError('INSECURE_SERVER', 'Use https:// for a server outside your private network')
  }
  return url.origin
}

/** Acepta el enlace del panel (`rinari://pair?url=…&code=…`) o dirección y código sueltos. */
export function parsePairing(input: { link?: string; server?: string; code?: string }): { server: string; code: string } {
  let server = input.server?.trim() ?? ''
  let code = input.code?.trim() ?? ''
  const link = input.link?.trim()
  if (link) {
    let url: URL
    try {
      url = new URL(link)
    } catch {
      throw new RemoteSetupError('INVALID_LINK', 'That is not a pairing link')
    }
    if (url.protocol !== PAIR_SCHEME || url.hostname !== 'pair') {
      throw new RemoteSetupError('INVALID_LINK', 'That is not a pairing link')
    }
    code = url.searchParams.get('code')?.trim() || code
    server = url.searchParams.get('url')?.trim() || server
  }
  if (!server) throw new RemoteSetupError('MISSING_SERVER', 'Write the server address')
  if (!/^[A-Za-z0-9]{4,64}$/.test(code)) throw new RemoteSetupError('MISSING_CODE', 'Write the pairing code')
  return { server: checkServer(server), code: code.toUpperCase() }
}

export class EngineTargets {
  constructor(private readonly deps: EngineTargetsDeps) {}

  private load(): Stored {
    const stored = this.deps.read()
    if (!stored || !Array.isArray(stored.remotes)) return { active: LOCAL, remotes: [] }
    const remotes = stored.remotes.filter((r) => r && typeof r.id === 'string' && typeof r.token === 'string')
    const active = remotes.some((r) => r.id === stored.active) ? stored.active : LOCAL
    return { active, remotes }
  }

  view(): EnginesView {
    const stored = this.load()
    return {
      active: stored.active,
      remotes: stored.remotes.map(({ token: _token, ...remote }) => remote),
    }
  }

  /** El Engine con el que arrancar. Un token que ya no se puede descifrar vuelve a «este equipo». */
  target(): EngineTarget {
    const stored = this.load()
    const remote = stored.remotes.find((r) => r.id === stored.active)
    if (!remote) return { kind: 'local' }
    try {
      const token = this.deps.decrypt(Buffer.from(remote.token, 'base64'))
      return { kind: 'remote', id: remote.id, name: remote.name, server: remote.server, token }
    } catch {
      return { kind: 'local' }
    }
  }

  /** Canjea el código en el servidor y guarda el dispositivo. No lo activa. */
  async pair(input: { link?: string; server?: string; code?: string; name?: string }): Promise<RemoteEngine> {
    const { server, code } = parsePairing(input)
    if (!this.deps.canEncrypt()) {
      throw new RemoteSetupError('NO_SECURE_STORAGE', 'This computer cannot store the server key securely')
    }
    let response: Response
    try {
      response = await this.deps.fetch(`${server}/remote/v1/pair`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, name: this.deps.deviceName() }),
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
      })
    } catch (reason) {
      throw new RemoteSetupError('SERVER_UNREACHABLE', reason instanceof Error ? reason.message : String(reason))
    }
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
    if (!response.ok) {
      const error = (body?.error ?? {}) as { code?: string; message?: string }
      throw new RemoteSetupError(error.code ?? `HTTP_${response.status}`, error.message ?? response.statusText)
    }
    const token = body?.token
    const deviceId = body?.device_id
    if (typeof token !== 'string' || !token || typeof deviceId !== 'string') {
      throw new RemoteSetupError('BAD_RESPONSE', 'The server did not return a device key')
    }
    const stored = this.load()
    const host = new URL(server).host
    const name = input.name?.trim().slice(0, 80) || host
    const remote: StoredRemote = {
      id: randomUUID(),
      name,
      server,
      device_id: deviceId,
      paired_at: (this.deps.now?.() ?? new Date()).toISOString(),
      token: this.deps.encrypt(token).toString('base64'),
    }
    this.deps.write({ ...stored, remotes: [...stored.remotes, remote] })
    const { token: _token, ...view } = remote
    return view
  }

  /** Cambia el Engine activo. El llamador reinicia la conexión. */
  use(id: string): EnginesView {
    const stored = this.load()
    if (id !== LOCAL && !stored.remotes.some((r) => r.id === id)) {
      throw new RemoteSetupError('NOT_FOUND', 'That server is not paired')
    }
    this.deps.write({ ...stored, active: id })
    return this.view()
  }

  /** Olvida un servidor en este equipo. Revocarlo del todo se hace en su panel. */
  forget(id: string): EnginesView {
    const stored = this.load()
    const remotes = stored.remotes.filter((r) => r.id !== id)
    if (remotes.length === stored.remotes.length) throw new RemoteSetupError('NOT_FOUND', 'That server is not paired')
    this.deps.write({ active: stored.active === id ? LOCAL : stored.active, remotes })
    return this.view()
  }
}
