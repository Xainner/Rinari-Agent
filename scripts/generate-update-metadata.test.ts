import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { generateReleaseManifest, generateUpdateMetadata } from './generate-update-metadata.mjs'

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

  it('publishes the pinned Engine next to the setup for rinari update', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rinari-release-manifest-'))
    const setup = join(root, 'Rinari-Agent-Setup-0.2.1-x64.exe')
    await writeFile(setup, 'setup')
    const metadata = await generateUpdateMetadata({ version: '0.2.1', setup, output: join(root, 'latest.yml') })
    const sha = 'a'.repeat(40)
    const release = await generateReleaseManifest({
      metadata,
      manifest: { engine_repository: 'Xainner/Rinari-CLI', engine_git_sha: sha, protocol_version: 1 },
      output: join(root, 'rinari-release.json'),
    })
    const written = JSON.parse(await readFile(join(root, 'rinari-release.json'), 'utf8'))
    expect(written).toEqual(release)
    expect(written).toMatchObject({
      version: '0.2.1',
      engine_git_sha: sha,
      setup: { name: 'Rinari-Agent-Setup-0.2.1-x64.exe', sha512: metadata.sha512, size: 5 },
    })
    await expect(generateReleaseManifest({
      metadata,
      manifest: { engine_git_sha: 'abc' },
      output: join(root, 'x.json'),
    })).rejects.toThrow('engine_git_sha')
  })
})
