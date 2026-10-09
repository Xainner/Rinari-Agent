// Registros de diagnóstico, redacción y paquete ZIP, sin Electron.
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inflateRawSync, crc32 } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'

import { createDiagnostics, bundleFileName } from './index'
import { createRedactor } from './redact'
import { RotatingLog } from './rotatingLog'
import { createZip } from './zip'

const dirs: string[] = []
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rinari-diag-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  dirs.length = 0
})

/** Lee un ZIP propio: nombres y contenido, comprobando el CRC de cada entrada. */
function unzip(buffer: Buffer): Record<string, Buffer> {
  const files: Record<string, Buffer> = {}
  let offset = 0
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8)
    const crc = buffer.readUInt32LE(offset + 14)
    const compressed = buffer.readUInt32LE(offset + 18)
    const nameLength = buffer.readUInt16LE(offset + 26)
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString('utf8')
    const start = offset + 30 + nameLength
    const body = buffer.subarray(start, start + compressed)
    const data = method === 8 ? inflateRawSync(body) : Buffer.from(body)
    expect(crc32(data) >>> 0).toBe(crc)
    files[name] = data
    offset = start + compressed
  }
  expect(buffer.readUInt32LE(offset)).toBe(0x02014b50)
  return files
}

describe('redacción', () => {
  const redact = createRedactor('C:\\Users\\Ana')

  it('quita claves, tokens y credenciales en URL', () => {
    const text = [
      'Authorization: Bearer abcdef1234567890',
      'api_key=sk-proj-AAAAAAAAAAAAAAAAAAAAAAAA',
      'token: "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345"',
      'https://user:hunter2@example.com/x',
      'AIzaSyA1234567890abcdefghijklmnop',
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.c2lnbmF0dXJlc2lnbg',
    ].join(' | ')
    const clean = redact(text)
    for (const secret of ['abcdef1234567890', 'sk-proj-AAAA', 'ghp_ABCD', 'hunter2', 'AIzaSyA', 'eyJhbGci']) {
      expect(clean).not.toContain(secret)
    }
    expect(clean).toContain('api_key=[redacted]')
  })

  it('reduce la carpeta personal a ~ en ambos separadores', () => {
    expect(redact('C:\\Users\\Ana\\proyecto y C:/Users/Ana/otro')).toBe('~\\proyecto y ~/otro')
  })

  it('no toca texto normal', () => {
    expect(redact('engine ready: protocol 1, 23 capabilities')).toBe('engine ready: protocol 1, 23 capabilities')
  })
})

describe('RotatingLog', () => {
  it('escribe líneas con fecha y nivel, redactadas y en una sola línea', async () => {
    const dir = tempDir()
    const log = new RotatingLog({ dir, name: 'app', redact: createRedactor('C:\\Users\\Ana'), now: () => new Date('2026-10-08T10:00:00Z') })
    log.write('error', 'falló en C:\\Users\\Ana\\x\ncon token=abc123')
    await log.flush()
    expect(readFileSync(log.path, 'utf8')).toBe('2026-10-08T10:00:00.000Z ERROR falló en ~\\x ⏎ con token=[redacted]\n')
  })

  it('rota por tamaño y conserva solo los archivos indicados', async () => {
    const dir = tempDir()
    const log = new RotatingLog({ dir, name: 'engine', maxBytes: 200, keep: 2, redact: (t) => t })
    for (let i = 0; i < 30; i++) log.write('info', `línea ${i} ${'x'.repeat(40)}`)
    await log.flush()
    expect(readdirSync(dir).sort()).toEqual(['engine.1.log', 'engine.2.log', 'engine.log'])
    expect(readFileSync(log.path, 'utf8')).toContain('línea 29')
    expect(log.files()).toHaveLength(3)
  })

  it('acota una línea enorme', async () => {
    const dir = tempDir()
    const log = new RotatingLog({ dir, name: 'app', maxLineChars: 50, redact: (t) => t })
    log.write('info', 'y'.repeat(500))
    await log.flush()
    expect(readFileSync(log.path, 'utf8')).toContain('… (+450)')
  })
})

describe('ZIP', () => {
  it('se puede leer y cada entrada conserva su contenido', () => {
    const zip = createZip([
      { name: 'summary.json', data: '{"ok":true}' },
      { name: 'logs/app.log', data: 'a'.repeat(10_000) },
      { name: 'crashes/x.dmp', data: Buffer.from([1, 2, 3, 4]) },
    ])
    const files = unzip(zip)
    expect(Object.keys(files)).toEqual(['summary.json', 'logs/app.log', 'crashes/x.dmp'])
    expect(files['logs/app.log'].toString()).toBe('a'.repeat(10_000))
    expect([...files['crashes/x.dmp']]).toEqual([1, 2, 3, 4])
  })
})

describe('createDiagnostics', () => {
  function setup(engineDiagnostics: () => Promise<unknown> = async () => ({ diagnostics: { storage: { sessions: 3 } } })) {
    const userData = tempDir()
    const logsDir = join(userData, 'logs')
    const crashDir = join(userData, 'Crashpad')
    mkdirSync(join(crashDir, 'reports'), { recursive: true })
    writeFileSync(join(crashDir, 'reports', 'one.dmp'), Buffer.from('MDMP'))
    const diagnostics = createDiagnostics({
      logsDir,
      crashDir,
      appVersion: '0.2.5',
      versions: { electron: '44.0.0' },
      os: { platform: 'win32', release: '10.0.26200', arch: 'x64' },
      engine: { status: () => ({ state: 'ready' }), diagnostics: engineDiagnostics },
    })
    return { diagnostics, logsDir }
  }

  it('registra estados del Engine sin repetir y comandos fallidos sin argumentos', async () => {
    const { diagnostics } = setup()
    diagnostics.engineStatus({ state: 'ready', detail: null })
    diagnostics.engineStatus({ state: 'ready', detail: null })
    diagnostics.engineStatus({ state: 'degraded', detail: 'engine process exited' })
    diagnostics.commandFailed('session_history', 'RESPONSE_TOO_LARGE')
    diagnostics.engineStderr('engine: response to session.history is 17000000 bytes; sent as an error')
    await diagnostics.app.flush()
    await diagnostics.engine.flush()
    const app = readFileSync(diagnostics.app.path, 'utf8')
    expect(app.match(/engine ready/g)).toHaveLength(1)
    expect(app).toContain('WARN  engine degraded: engine process exited')
    expect(app).toContain('command session_history failed: RESPONSE_TOO_LARGE')
    expect(readFileSync(diagnostics.engine.path, 'utf8')).toContain('sent as an error')
  })

  it('la vista previa lista el resumen, los registros y los volcados', async () => {
    const { diagnostics } = setup()
    diagnostics.log('info', 'arranque')
    const preview = await diagnostics.preview()
    expect(preview.files.map((file) => file.name)).toEqual(['summary.json', 'logs/app.log', 'crashes/one.dmp'])
    expect(preview.totalBytes).toBeGreaterThan(0)
  })

  it('el paquete lleva el resumen del Engine y sobrevive a un Engine caído', async () => {
    const { diagnostics } = setup()
    diagnostics.engineStatus({ state: 'ready' })
    const files = unzip(await diagnostics.bundle())
    const summary = JSON.parse(files['summary.json'].toString())
    expect(summary.app.version).toBe('0.2.5')
    expect(summary.engine.diagnostics.storage.sessions).toBe(3)
    expect(summary.engine_states[0].state).toBe('ready')
    expect(files['logs/app.log'].toString()).toContain('engine ready')

    const down = setup(async () => { throw new Error('engine is not running') })
    const fallback = JSON.parse(unzip(await down.diagnostics.bundle())['summary.json'].toString())
    expect(fallback.engine.error).toBe('engine is not running')
  })

  it('nombra el archivo con fecha y hora locales', () => {
    expect(bundleFileName(new Date(2026, 9, 8, 9, 5))).toBe('rinari-diagnostico-20261008-0905.zip')
  })
})
