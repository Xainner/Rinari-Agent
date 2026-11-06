import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EngineTargets, LOCAL, checkServer, enginesFile, isPrivateHost, parsePairing } from './engineTargets'

describe('isPrivateHost', () => {
  it('admits loopback, LAN and Tailscale addresses', () => {
    for (const host of ['localhost', '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.9.9', '192.168.1.20', '100.64.0.1', '[::1]', 'fd00::1']) {
      expect(isPrivateHost(host), host).toBe(true)
    }
  })

  it('rejects public names and addresses', () => {
    for (const host of ['rinari.example.com', '8.8.8.8', '172.32.0.1', '100.128.0.1', '2001:db8::1']) {
      expect(isPrivateHost(host), host).toBe(false)
    }
  })
})

describe('checkServer', () => {
  it('normalises to the origin and defaults to https', () => {
    expect(checkServer('rinari.example.com')).toBe('https://rinari.example.com')
    expect(checkServer(' https://rinari.example.com/panel?x=1 ')).toBe('https://rinari.example.com')
    expect(checkServer('http://192.168.1.20:18751')).toBe('http://192.168.1.20:18751')
  })

  it('refuses plain http outside the private network', () => {
    expect(() => checkServer('http://rinari.example.com')).toThrow(expect.objectContaining({ code: 'INSECURE_SERVER' }))
  })

  it('refuses other schemes and credentials in the address', () => {
    expect(() => checkServer('ftp://rinari.example.com')).toThrow(expect.objectContaining({ code: 'INVALID_SERVER' }))
    expect(() => checkServer('https://user:pw@rinari.example.com')).toThrow(expect.objectContaining({ code: 'INVALID_SERVER' }))
    expect(() => checkServer('https://')).toThrow(expect.objectContaining({ code: 'INVALID_SERVER' }))
  })
})

describe('parsePairing', () => {
  it('reads the server and code from the panel link', () => {
    const link = `rinari://pair?url=${encodeURIComponent('https://rinari.example.com')}&code=abcd2345`
    expect(parsePairing({ link })).toEqual({ server: 'https://rinari.example.com', code: 'ABCD2345' })
  })

  it('accepts the address and code typed separately', () => {
    expect(parsePairing({ server: '192.168.1.20:18751', code: ' K7P2Q9XZ ' })).toEqual({
      server: 'https://192.168.1.20:18751',
      code: 'K7P2Q9XZ',
    })
  })

  it('says what is missing or wrong', () => {
    expect(() => parsePairing({ link: 'https://rinari.example.com' })).toThrow(expect.objectContaining({ code: 'INVALID_LINK' }))
    expect(() => parsePairing({ link: 'nope' })).toThrow(expect.objectContaining({ code: 'INVALID_LINK' }))
    expect(() => parsePairing({ code: 'ABCD2345' })).toThrow(expect.objectContaining({ code: 'MISSING_SERVER' }))
    expect(() => parsePairing({ server: 'rinari.example.com', code: 'a b' })).toThrow(expect.objectContaining({ code: 'MISSING_CODE' }))
  })
})

/** Cifrado de mentira: invertible y visible en las pruebas. */
const fakeCipher = {
  canEncrypt: () => true,
  encrypt: (text: string) => Buffer.from(`enc:${text}`),
  decrypt: (data: Buffer) => {
    const text = data.toString()
    if (!text.startsWith('enc:')) throw new Error('cannot decrypt')
    return text.slice(4)
  },
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function targets(fetchImpl: typeof fetch = vi.fn(), overrides: Partial<ConstructorParameters<typeof EngineTargets>[0]> = {}) {
  let stored: unknown = null
  const deps = {
    read: () => stored as never,
    write: (value: unknown) => {
      stored = structuredClone(value)
    },
    ...fakeCipher,
    fetch: fetchImpl,
    deviceName: () => 'Portátil',
    now: () => new Date('2026-11-06T10:00:00Z'),
    ...overrides,
  }
  return { engines: new EngineTargets(deps), stored: () => stored as { active: string; remotes: Array<Record<string, unknown>> } }
}

describe('EngineTargets', () => {
  it('starts on this computer', () => {
    const { engines } = targets()
    expect(engines.view()).toEqual({ active: LOCAL, remotes: [] })
    expect(engines.target()).toEqual({ kind: 'local' })
  })

  it('pairs with a code, stores the key encrypted and never shows it', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { device_id: 'dev-1', token: 'secret-token' }))
    const { engines, stored } = targets(fetchImpl as unknown as typeof fetch)
    const remote = await engines.pair({ server: 'https://rinari.example.com', code: 'abcd2345', name: 'Saturno' })

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://rinari.example.com/remote/v1/pair')
    expect(JSON.parse(init.body as string)).toEqual({ code: 'ABCD2345', name: 'Portátil' })
    expect(init.redirect).toBe('error')

    expect(remote).toMatchObject({ name: 'Saturno', server: 'https://rinari.example.com', device_id: 'dev-1', paired_at: '2026-11-06T10:00:00.000Z' })
    expect(remote).not.toHaveProperty('token')
    expect(JSON.stringify(engines.view())).not.toContain('secret-token')
    expect(JSON.stringify(stored())).not.toContain('secret-token')
    // Emparejar no lo activa.
    expect(engines.view().active).toBe(LOCAL)

    engines.use(remote.id)
    expect(engines.target()).toEqual({ kind: 'remote', id: remote.id, name: 'Saturno', server: 'https://rinari.example.com', token: 'secret-token' })
  })

  it('names the server after its host when no name is given', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { device_id: 'dev-1', token: 't' }))
    const { engines } = targets(fetchImpl as unknown as typeof fetch)
    expect((await engines.pair({ server: 'rinari.example.com:8443', code: 'ABCD2345' })).name).toBe('rinari.example.com:8443')
  })

  it('passes the server error code through', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(400, { error: { code: 'BAD_CODE', message: 'The code is not valid' } }))
    const { engines, stored } = targets(fetchImpl as unknown as typeof fetch)
    await expect(engines.pair({ server: 'https://rinari.example.com', code: 'ABCD2345' })).rejects.toMatchObject({ code: 'BAD_CODE' })
    expect(stored()).toBeNull()
  })

  it('reports an unreachable server', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    const { engines } = targets(fetchImpl as unknown as typeof fetch)
    await expect(engines.pair({ server: 'https://rinari.example.com', code: 'ABCD2345' })).rejects.toMatchObject({ code: 'SERVER_UNREACHABLE' })
  })

  it('refuses to pair without secure storage, before contacting the server', async () => {
    const fetchImpl = vi.fn()
    const { engines } = targets(fetchImpl as unknown as typeof fetch, { canEncrypt: () => false })
    await expect(engines.pair({ server: 'https://rinari.example.com', code: 'ABCD2345' })).rejects.toMatchObject({ code: 'NO_SECURE_STORAGE' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a response without a key', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { device_id: 'dev-1' }))
    const { engines } = targets(fetchImpl as unknown as typeof fetch)
    await expect(engines.pair({ server: 'https://rinari.example.com', code: 'ABCD2345' })).rejects.toMatchObject({ code: 'BAD_RESPONSE' })
  })

  it('switches back and forgets servers', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { device_id: 'dev-1', token: 't' }))
    const { engines } = targets(fetchImpl as unknown as typeof fetch)
    const remote = await engines.pair({ server: 'https://rinari.example.com', code: 'ABCD2345' })
    expect(engines.use(remote.id).active).toBe(remote.id)
    expect(engines.use(LOCAL).active).toBe(LOCAL)
    engines.use(remote.id)
    expect(engines.forget(remote.id)).toEqual({ active: LOCAL, remotes: [] })
    expect(() => engines.use(remote.id)).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }))
    expect(() => engines.forget(remote.id)).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }))
  })

  it('falls back to this computer when the key can no longer be decrypted', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { device_id: 'dev-1', token: 't' }))
    const { engines, stored } = targets(fetchImpl as unknown as typeof fetch)
    const remote = await engines.pair({ server: 'https://rinari.example.com', code: 'ABCD2345' })
    engines.use(remote.id)
    stored().remotes[0].token = Buffer.from('garbage').toString('base64')
    expect(engines.target()).toEqual({ kind: 'local' })
  })
})

describe('enginesFile', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('round-trips and treats a broken file as empty', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rinari-engines-'))
    dirs.push(dir)
    const path = join(dir, 'nested', 'engines.json')
    const file = enginesFile(path)
    expect(file.read()).toBeNull()
    file.write({ active: LOCAL, remotes: [] })
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ active: LOCAL, remotes: [] })
    writeFileSync(path, '{broken')
    expect(file.read()).toBeNull()
  })
})
