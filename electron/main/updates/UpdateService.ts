import { EventEmitter } from 'node:events'

import type {
  UpdateAvailable,
  UpdateState,
} from '../../shared/contracts'

export interface UpdateInfoLike {
  version: string
  releaseName?: string | null
  releaseNotes?: string | Array<{ note?: string | null }> | null
}

export interface UpdateCheckResultLike {
  isUpdateAvailable: boolean
  updateInfo: UpdateInfoLike
}

interface UpdaterProgressLike {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

export interface UpdaterLike extends EventEmitter {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  autoRunAppAfterInstall: boolean
  disableDifferentialDownload: boolean
  disableWebInstaller: boolean
  allowDowngrade: boolean
  checkForUpdates(): Promise<UpdateCheckResultLike | null>
  downloadUpdate(): Promise<string[]>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

export interface UpdateServiceOptions {
  updater: UpdaterLike
  currentVersion: string
  enabled: boolean
  requestApply(): Promise<boolean>
  onState?(state: UpdateState): void
}

export class UpdatesUnavailable extends Error {
  readonly code = 'UPDATES_UNAVAILABLE'
}

export class UpdateNotReady extends Error {
  readonly code = 'UPDATE_NOT_READY'
}

function releaseBody(info: UpdateInfoLike): string | undefined {
  if (typeof info.releaseNotes === 'string') return info.releaseNotes
  if (Array.isArray(info.releaseNotes)) {
    const notes = info.releaseNotes
      .map((entry) => entry.note)
      .filter((note): note is string => typeof note === 'string' && note.trim() !== '')
    if (notes.length > 0) return notes.join('\n\n')
  }
  return typeof info.releaseName === 'string' && info.releaseName.trim() !== ''
    ? info.releaseName
    : undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Sin ningún release publicado no hay nada que instalar: se está al día, no es
 * un fallo. `GitHubProvider` de electron-updater 6.8.9 lo señala de dos formas:
 * con el feed de releases vacío, `ERR_XML_MISSED_ELEMENT` al buscar su primera
 * entrada; con entradas pero ninguna con tag, `ERR_UPDATER_NO_PUBLISHED_VERSIONS`.
 */
const NO_RELEASE_CODES = new Set(['ERR_XML_MISSED_ELEMENT', 'ERR_UPDATER_NO_PUBLISHED_VERSIONS'])

function isNoRelease(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' && NO_RELEASE_CODES.has(code)
}

/**
 * Máquina de estados del canal Electron 0.2.x.
 *
 * `electron-updater` valida el SHA-512 de `latest.yml` durante la descarga.
 * Authenticode es una capa distinta: esta entrega conserva `unsigned: true`
 * hasta que exista una identidad verificable y nunca presenta el hash como
 * si identificara al publicador.
 */
export class UpdateService {
  private state: UpdateState
  private available: UpdateAvailable | null = null
  private downloaded = false
  private checkInFlight: Promise<UpdateAvailable | null> | null = null
  private downloadInFlight: Promise<UpdateState> | null = null

  constructor(private readonly options: UpdateServiceOptions) {
    this.state = {
      phase: 'idle',
      current_version: options.currentVersion,
      available_version: null,
      progress: null,
      message: null,
      unsigned: true,
    }
    const updater = options.updater
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = false
    updater.autoRunAppAfterInstall = true
    updater.disableDifferentialDownload = true
    updater.disableWebInstaller = true
    updater.allowDowngrade = false

    updater.on('download-progress', (progress: UpdaterProgressLike) => {
      this.publish({
        phase: 'downloading',
        progress: {
          percent: Number.isFinite(progress.percent) ? progress.percent : 0,
          bytes_per_second: Number.isFinite(progress.bytesPerSecond) ? progress.bytesPerSecond : 0,
          transferred: Number.isFinite(progress.transferred) ? progress.transferred : 0,
          total: Number.isFinite(progress.total) ? progress.total : 0,
        },
      })
    })
    updater.on('error', (error: Error) => {
      // `check()` recibe el mismo error al rechazarse y lo trata como "al día".
      if (isNoRelease(error)) return
      this.publish({ phase: 'error', message: errorMessage(error) })
    })
  }

  snapshot(): UpdateState {
    return structuredClone(this.state)
  }

  async check(): Promise<UpdateAvailable | null> {
    this.requireEnabled()
    if ((this.downloaded || this.downloadInFlight) && this.available) return structuredClone(this.available)
    if (this.checkInFlight) return this.checkInFlight
    const run = async () => {
      this.publish({ phase: 'checking', progress: null, message: null })
      try {
        const result = await this.options.updater.checkForUpdates()
        if (!result || !result.isUpdateAvailable) {
          this.available = null
          this.downloaded = false
          this.publish({ phase: 'idle', available_version: null })
          return null
        }
        const info = result.updateInfo
        this.available = { version: info.version, body: releaseBody(info), unsigned: true }
        this.downloaded = false
        this.publish({ phase: 'available', available_version: info.version })
        return this.available
      } catch (error) {
        if (isNoRelease(error)) {
          this.available = null
          this.downloaded = false
          this.publish({ phase: 'idle', available_version: null, message: null })
          return null
        }
        this.publish({ phase: 'error', message: errorMessage(error) })
        throw error
      }
    }
    this.checkInFlight = run().finally(() => {
      this.checkInFlight = null
    })
    return this.checkInFlight
  }

  async download(): Promise<UpdateState> {
    this.requireEnabled()
    if (this.downloaded) return this.snapshot()
    if (this.downloadInFlight) return this.downloadInFlight
    const run = async () => {
      if (!this.available) await this.check()
      if (!this.available) throw new UpdateNotReady('No update is available to download.')
      this.publish({ phase: 'downloading', progress: null, message: null })
      try {
        await this.options.updater.downloadUpdate()
        this.downloaded = true
        this.publish({ phase: 'downloaded', progress: null })
        return this.snapshot()
      } catch (error) {
        this.downloaded = false
        this.publish({ phase: 'error', message: errorMessage(error) })
        throw error
      }
    }
    this.downloadInFlight = run().finally(() => {
      this.downloadInFlight = null
    })
    return this.downloadInFlight
  }

  async apply(): Promise<void> {
    this.requireEnabled()
    if (!this.downloaded) throw new UpdateNotReady('Download and verify the update before applying it.')
    this.publish({ phase: 'applying', message: null })
    const accepted = await this.options.requestApply()
    if (!accepted) this.publish({ phase: 'downloaded' })
  }

  /** Lo llama la autoridad única de lifecycle después de cerrar el Engine. */
  commitInstall(): void {
    if (!this.downloaded) throw new UpdateNotReady('The update is no longer ready to install.')
    this.options.updater.quitAndInstall(true, true)
  }

  private requireEnabled(): void {
    if (!this.options.enabled) {
      throw new UpdatesUnavailable(
        'The Electron updater is available only in an installed build or an explicit update test channel.',
      )
    }
  }

  private publish(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch }
    this.options.onState?.(this.snapshot())
  }
}
