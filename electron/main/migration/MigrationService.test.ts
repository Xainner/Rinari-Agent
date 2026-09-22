import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MIGRATION_SCHEMA, canonicalPreferences } from '../../shared/migration'
import { defaultMigrationDirectory, MigrationService } from './MigrationService'

const directories: string[] = []

async function service(): Promise<MigrationService> {
  const directory = await mkdtemp(join(tmpdir(), 'rinari-migration-'))
  directories.push(directory)
  return new MigrationService(directory)
}

function manifest(preferences: Record<string, string>, overrides: Record<string, unknown> = {}) {
  return {
    schema: MIGRATION_SCHEMA,
    export_id: 'export-test',
    source: 'tauri',
    source_version: '0.1.3',
    engine_namespace: process.env.RINARI_HOME?.trim() || 'default',
    created_at: '2026-09-19T00:00:00Z',
    checksum: createHash('sha256').update(canonicalPreferences(preferences), 'utf8').digest('hex'),
    preferences,
    ...overrides,
  }
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('MigrationService', () => {
  it('resolves the same platform-neutral migration directory as the Tauri exporter', () => {
    expect(defaultMigrationDirectory({ LOCALAPPDATA: String.raw`C:\Users\Rinari\AppData\Local` }, 'win32')).toBe(
      String.raw`C:\Users\Rinari\AppData\Local\Rinari\migration`,
    )
    expect(defaultMigrationDirectory({ XDG_DATA_HOME: '/var/lib/rinari', HOME: '/ignored' }, 'linux')).toBe(
      '/var/lib/rinari/Rinari/migration',
    )
    expect(defaultMigrationDirectory({ HOME: '/home/rinari' }, 'linux')).toBe(
      '/home/rinari/.local/share/Rinari/migration',
    )
    expect(() => defaultMigrationDirectory({}, 'linux')).toThrow('local data directory is unavailable')
  })

  it('stages, commits and archives a valid restricted export', async () => {
    const migration = await service()
    const preferences = { 'rinari.lang': 'es', 'rinari.theme': 'dark' }
    await writeFile(migration.sourcePath, JSON.stringify(manifest(preferences)), 'utf8')

    const staged = await migration.stage()
    expect(staged?.preferences).toEqual(preferences)
    expect((await migration.status()).state).toBe('staged')
    await migration.commit(staged!.token, preferences)
    const verified = await migration.verify(staged!.token)

    expect(verified.state).toBe('verified')
    expect(verified.pending).toBe(false)
    await expect(readFile(migration.sourcePath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(join(migration.directory, 'tauri-to-electron-v1.export-test.imported.json'), 'utf8')).toContain('export-test')
  })

  it('fails closed on unknown keys and preserves the source', async () => {
    const migration = await service()
    const preferences = { credential: 'never' }
    await writeFile(migration.sourcePath, JSON.stringify(manifest(preferences)), 'utf8')

    await expect(migration.stage()).rejects.toThrow('not allowed')
    expect((await migration.status()).state).toBe('failed')
    expect(await readFile(migration.sourcePath, 'utf8')).toContain('never')
  })

  it('rejects tampering and a commit that differs from the staged payload', async () => {
    const tampered = await service()
    await writeFile(
      tampered.sourcePath,
      JSON.stringify(manifest({ 'rinari.lang': 'es' }, { checksum: '0'.repeat(64) })),
      'utf8',
    )
    await expect(tampered.stage()).rejects.toThrow('checksum')

    const changed = await service()
    await writeFile(changed.sourcePath, JSON.stringify(manifest({ 'rinari.lang': 'es' })), 'utf8')
    const staged = await changed.stage()
    await expect(changed.commit(staged!.token, { 'rinari.lang': 'en' })).rejects.toThrow('different')
  })

  it('requires an explicit retry after a failed validation', async () => {
    const migration = await service()
    await writeFile(migration.sourcePath, '{}', 'utf8')
    await expect(migration.stage()).rejects.toThrow()
    expect((await migration.status()).state).toBe('failed')
    await expect(migration.stage()).rejects.toThrow('unsupported migration schema')
    expect((await migration.retry()).state).toBe('not_started')
  })
})
