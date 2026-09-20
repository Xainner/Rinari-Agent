import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { verifyUploadFile } from './uploadProvenance'

const roots: string[] = []
const root = () => {
  const value = mkdtempSync(join(tmpdir(), 'rinari-upload-'))
  roots.push(value)
  return value
}
const identity = (path: string, bytes: Buffer) => ({
  path: resolve(path),
  bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
})

afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe('BR-09 — procedencia de uploads', () => {
  it('acepta un nombre unicode largo con la misma identidad', async () => {
    const dir = root()
    const nested = join(dir, 'a'.repeat(80), 'b'.repeat(80))
    mkdirSync(nested, { recursive: true })
    const path = join(nested, '猫 payload.txt')
    const bytes = Buffer.from('payload verificado')
    writeFileSync(path, bytes)
    expect(await verifyUploadFile(path, identity(path, bytes))).toEqual({ ok: true, path })
  })

  it('rechaza contenido cambiado aunque la ruta siga igual', async () => {
    const path = join(root(), 'swap.txt')
    const before = Buffer.from('AAAA')
    writeFileSync(path, before)
    const expected = identity(path, before)
    writeFileSync(path, Buffer.from('BBBB'))
    expect(await verifyUploadFile(path, expected)).toMatchObject({ ok: false })
  })

  it('rechaza desaparición, directorio y procedencia malformada', async () => {
    const dir = root()
    const gone = join(dir, 'gone.txt')
    writeFileSync(gone, 'x')
    const expected = identity(gone, Buffer.from('x'))
    rmSync(gone)
    expect(await verifyUploadFile(gone, expected)).toMatchObject({ ok: false })
    expect(await verifyUploadFile(dir, { ...expected, path: dir })).toMatchObject({ ok: false })
    expect(await verifyUploadFile(dir, { path: dir, bytes: -1, sha256: 'x' })).toMatchObject({ ok: false })
  })

  it('rechaza un alias simbólico distinto de la ruta validada', async () => {
    const dir = root()
    const target = join(dir, 'target.txt')
    const alias = join(dir, 'alias.txt')
    const bytes = Buffer.from('secret')
    writeFileSync(target, bytes)
    try {
      symlinkSync(target, alias, 'file')
    } catch {
      return // Windows sin permiso de symlink: los demás casos siguen siendo obligatorios.
    }
    expect(await verifyUploadFile(alias, { ...identity(target, bytes), path: alias })).toMatchObject({ ok: false })
  })
})
