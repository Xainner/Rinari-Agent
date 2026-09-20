import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  MIGRATION_ALLOWED_KEYS,
  MIGRATION_MAX_ENTRIES,
  MIGRATION_MAX_TOTAL_BYTES,
  MIGRATION_MAX_VALUE_BYTES,
  MIGRATION_SCHEMA,
  canonicalPreferences,
  type MigrationManifest,
  type MigrationStage,
  type MigrationState,
  type MigrationStatus,
} from '../../shared/migration'

interface PersistedState extends MigrationStatus {
  token?: string
  checksum?: string
  preferences?: Record<string, string>
}

export class MigrationError extends Error {
  readonly code = 'MIGRATION_FAILED'
}

const allowed = new Set<string>(MIGRATION_ALLOWED_KEYS)

function checksum(preferences: Record<string, string>): string {
  return createHash('sha256').update(canonicalPreferences(preferences), 'utf8').digest('hex')
}

function engineNamespace(): string {
  const configured = process.env.RINARI_HOME?.trim()
  return configured || 'default'
}

function validatePreferences(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MigrationError('preferences must be an object')
  }
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length > MIGRATION_MAX_ENTRIES) throw new MigrationError('too many preference entries')
  let total = 0
  const result: Record<string, string> = Object.create(null) as Record<string, string>
  for (const [key, raw] of entries) {
    if (!allowed.has(key)) throw new MigrationError(`preference key is not allowed: ${key}`)
    if (typeof raw !== 'string') throw new MigrationError(`preference value must be text: ${key}`)
    const bytes = Buffer.byteLength(raw, 'utf8')
    if (bytes > MIGRATION_MAX_VALUE_BYTES) throw new MigrationError(`preference value is too large: ${key}`)
    total += bytes + Buffer.byteLength(key, 'utf8')
    if (total > MIGRATION_MAX_TOTAL_BYTES) throw new MigrationError('preference export is too large')
    result[key] = raw
  }
  return result
}

function validateManifest(value: unknown): MigrationManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MigrationError('invalid export')
  const raw = value as Record<string, unknown>
  if (raw.schema !== MIGRATION_SCHEMA) throw new MigrationError('unsupported migration schema')
  if (raw.source !== 'tauri') throw new MigrationError('unsupported migration source')
  for (const field of ['export_id', 'source_version', 'engine_namespace', 'created_at', 'checksum']) {
    if (typeof raw[field] !== 'string' || !(raw[field] as string).trim()) {
      throw new MigrationError(`missing migration field: ${field}`)
    }
  }
  if (raw.source_version !== '0.1.3') throw new MigrationError('the transition export must come from Tauri 0.1.3')
  if (raw.engine_namespace !== engineNamespace()) {
    throw new MigrationError('the export belongs to a different Rinari Engine namespace')
  }
  const preferences = validatePreferences(raw.preferences)
  if (raw.checksum !== checksum(preferences)) throw new MigrationError('migration checksum mismatch')
  return { ...raw, preferences } as MigrationManifest
}

/**
 * Estado durable del importador. El archivo fuente vive en una ruta neutral a
 * ambos perfiles y se archiva solo después de verificar lo escrito.
 */
export class MigrationService {
  readonly sourcePath: string
  readonly statePath: string

  constructor(readonly directory: string) {
    this.sourcePath = join(directory, 'tauri-to-electron-v1.json')
    this.statePath = join(directory, 'electron-import-state-v1.json')
  }

  private async readState(): Promise<PersistedState | null> {
    try {
      return JSON.parse(await readFile(this.statePath, 'utf8')) as PersistedState
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw new MigrationError(`could not read migration state: ${String(error)}`)
    }
  }

  private async save(state: PersistedState): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    const temporary = `${this.statePath}.${process.pid}.tmp`
    await rm(temporary, { force: true })
    await writeFile(temporary, JSON.stringify(state, null, 2), { encoding: 'utf8', flag: 'wx' })
    await rm(this.statePath, { force: true })
    await rename(temporary, this.statePath)
  }

  async status(): Promise<MigrationStatus> {
    const state = await this.readState()
    if (state) return this.publicStatus(state)
    return { state: 'not_started', pending: existsSync(this.sourcePath) }
  }

  async stage(): Promise<MigrationStage | null> {
    const prior = await this.readState()
    if (prior?.state === 'verified') return null
    if (prior?.state === 'failed') throw new MigrationError(prior.error || 'migration requires retry')
    if (prior?.state === 'staged' && prior.token && prior.preferences) {
      return { token: prior.token, status: this.publicStatus(prior), preferences: prior.preferences }
    }
    if (!existsSync(this.sourcePath)) return null
    try {
      const manifest = validateManifest(JSON.parse(await readFile(this.sourcePath, 'utf8')))
      const validated: PersistedState = {
        state: 'validated', pending: true, export_id: manifest.export_id,
        source_version: manifest.source_version, checksum: manifest.checksum,
      }
      await this.save(validated)
      const staged: PersistedState = {
        ...validated,
        state: 'staged',
        token: randomUUID(),
        preferences: manifest.preferences,
      }
      await this.save(staged)
      return { token: staged.token!, status: this.publicStatus(staged), preferences: staged.preferences! }
    } catch (error) {
      await this.fail(undefined, error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  async commit(token: string, preferences: Record<string, string>): Promise<MigrationStatus> {
    const state = await this.requireToken(token, 'staged')
    const received = validatePreferences(preferences)
    if (checksum(received) !== state.checksum || canonicalPreferences(received) !== canonicalPreferences(state.preferences!)) {
      throw new MigrationError('renderer committed different preferences than the validated export')
    }
    const committed: PersistedState = { ...state, state: 'committed', preferences: undefined }
    await this.save(committed)
    return this.publicStatus(committed)
  }

  async verify(token: string): Promise<MigrationStatus> {
    const state = await this.requireToken(token, 'committed')
    const verified: PersistedState = { ...state, state: 'verified', pending: false, token: undefined }
    await this.save(verified)
    const archive = join(this.directory, `tauri-to-electron-v1.${state.export_id}.imported.json`)
    if (existsSync(this.sourcePath)) await rename(this.sourcePath, archive)
    return this.publicStatus(verified)
  }

  async fail(token: string | undefined, message: string): Promise<MigrationStatus> {
    const prior = await this.readState()
    if (token && prior?.token && token !== prior.token) throw new MigrationError('stale migration token')
    const failed: PersistedState = {
      state: 'failed', pending: existsSync(this.sourcePath), export_id: prior?.export_id,
      source_version: prior?.source_version, error: message.slice(0, 2_000),
    }
    await this.save(failed)
    return this.publicStatus(failed)
  }

  async retry(): Promise<MigrationStatus> {
    const prior = await this.readState()
    if (prior?.state !== 'failed') return this.status()
    const reset: PersistedState = { state: 'not_started', pending: existsSync(this.sourcePath) }
    await this.save(reset)
    return this.publicStatus(reset)
  }

  private async requireToken(token: string, expected: MigrationState): Promise<PersistedState> {
    const state = await this.readState()
    if (!state || state.state !== expected || !state.token || state.token !== token) {
      throw new MigrationError(`migration is not in ${expected} state`)
    }
    return state
  }

  private publicStatus(state: PersistedState): MigrationStatus {
    return {
      state: state.state,
      pending: state.pending,
      ...(state.export_id ? { export_id: state.export_id } : {}),
      ...(state.source_version ? { source_version: state.source_version } : {}),
      ...(state.error ? { error: state.error } : {}),
    }
  }
}

export function defaultMigrationDirectory(): string {
  const base = process.env.LOCALAPPDATA?.trim()
  if (!base) throw new MigrationError('LOCALAPPDATA is unavailable')
  return join(base, 'Rinari', 'migration')
}
