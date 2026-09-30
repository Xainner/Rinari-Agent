import { cpSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { VERSION_SITES, bumpVersion, readVersions } from './bump-version.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('versión de Rinari Agent', () => {
  it('todos los sitios llevan la misma versión que package.json', () => {
    // Un release con una atrasada anunciaría una versión y registraría otra.
    const versions = readVersions(ROOT)
    const expected = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version
    expect(versions.filter(({ version }) => version !== expected)).toEqual([])
  })

  it('el cambio llega a cada sitio y a nada más', () => {
    const copy = mkdtempSync(join(tmpdir(), 'rinari-bump-'))
    for (const file of new Set(VERSION_SITES.map((site) => site.file))) {
      cpSync(join(ROOT, file), join(copy, file), { recursive: true })
    }
    const before = readFileSync(join(copy, 'package-lock.json'), 'utf8')
    const after = bumpVersion('9.8.7', copy)
    expect(after.every(({ version }) => version === '9.8.7')).toBe(true)
    // En el lock solo cambian las dos entradas del propio paquete.
    const lock = readFileSync(join(copy, 'package-lock.json'), 'utf8')
    const changed = before.split('\n').filter((line, index) => line !== lock.split('\n')[index])
    expect(changed).toHaveLength(2)
    expect(() => bumpVersion('latest', copy)).toThrow('invalid version')
  })
})
