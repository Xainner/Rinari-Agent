import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { generateUpdateMetadata } from './generate-update-metadata.mjs'

describe('latest.yml generation', () => {
  it('binds the exact setup bytes and labels the unsigned channel', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rinari-update-metadata-'))
    const setup = join(root, 'Rinari-Agent-Setup-0.2.1-x64.exe')
    const output = join(root, 'latest.yml')
    const bytes = Buffer.from('review setup')
    await writeFile(setup, bytes)
    const result = await generateUpdateMetadata({
      version: '0.2.1',
      setup,
      output,
      releaseDate: '2026-09-20T00:00:00.000Z',
    })
    const expected = createHash('sha512').update(bytes).digest('base64')
    const yaml = await readFile(output, 'utf8')
    expect(result.sha512).toBe(expected)
    expect(yaml).toContain(`sha512: ${JSON.stringify(expected)}`)
    expect(yaml).toContain('rinariUnsigned: true')
  })

  it('rejects mismatched artifact versions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rinari-update-version-'))
    const setup = join(root, 'Rinari-Agent-Setup-0.2.0-x64.exe')
    await writeFile(setup, 'x')
    await expect(generateUpdateMetadata({
      version: '0.2.1',
      setup,
      output: join(root, 'latest.yml'),
      releaseDate: '2026-09-20T00:00:00.000Z',
    })).rejects.toThrow('does not contain version')
  })
})
