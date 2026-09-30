import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

import { UpdateService, type UpdateText } from './UpdateService'
import type { UpdateState } from '../../shared/contracts'

const UPDATE_E2E_ENABLED = process.env.RINARI_BUILD_UPDATE_E2E === '1'

export interface CreateUpdatesOptions {
  requestApply(confirmed: boolean): Promise<boolean>
  onState(state: UpdateState): void
  text(): UpdateText
}

/** Canal separado del `latest.json` de Tauri 0.1.x. */
export function createUpdates(options: CreateUpdatesOptions): UpdateService {
  const testFeed = UPDATE_E2E_ENABLED ? process.env.RINARI_UPDATE_FEED_URL?.trim() : undefined
  const enabled = app.isPackaged || Boolean(testFeed)
  autoUpdater.setFeedURL(
    testFeed
      ? { provider: 'generic', url: testFeed }
      : { provider: 'github', owner: 'Xainner', repo: 'Rinari-Agent' },
  )
  if (!app.isPackaged && testFeed) autoUpdater.forceDevUpdateConfig = true
  // Persistente: en la app instalada la consola no se ve, y un «no hizo nada»
  // al aplicar no dejaba ningún rastro.
  const logFile = join(app.getPath('userData'), 'logs', 'updater.log')
  const log = (level: string, message?: unknown) => {
    const text = message instanceof Error ? message.stack ?? message.message : String(message)
    try {
      mkdirSync(join(logFile, '..'), { recursive: true })
      appendFileSync(logFile, `${new Date().toISOString()} ${level} ${text}\n`)
    } catch {
      // Sin disco para el log, el actualizador sigue igual.
    }
  }
  autoUpdater.logger = {
    info: (message?: unknown) => { console.log('[rinari-updater]', message); log('info', message) },
    warn: (message?: unknown) => { console.warn('[rinari-updater]', message); log('warn', message) },
    error: (message?: unknown) => { console.error('[rinari-updater]', message); log('error', message) },
    debug: (message?: unknown) => console.debug('[rinari-updater]', message),
  }
  return new UpdateService({
    updater: autoUpdater,
    currentVersion: app.getVersion(),
    enabled,
    requestApply: options.requestApply,
    onState: options.onState,
    text: options.text,
    log: (line) => log('info', line),
    launchInstaller: (path, args) => {
      const child = spawn(path, args, { detached: true, stdio: 'ignore', windowsHide: true })
      child.on('error', (error) => log('error', error))
      child.unref()
    },
  })
}
