import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

import { UpdateService } from './UpdateService'
import type { UpdateState } from '../../shared/contracts'

const UPDATE_E2E_ENABLED = process.env.RINARI_BUILD_UPDATE_E2E === '1'

export interface CreateUpdatesOptions {
  requestApply(): Promise<boolean>
  onState(state: UpdateState): void
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
  autoUpdater.logger = {
    info: (message?: unknown) => console.log('[rinari-updater]', message),
    warn: (message?: unknown) => console.warn('[rinari-updater]', message),
    error: (message?: unknown) => console.error('[rinari-updater]', message),
    debug: (message?: unknown) => console.debug('[rinari-updater]', message),
  }
  return new UpdateService({
    updater: autoUpdater,
    currentVersion: app.getVersion(),
    enabled,
    requestApply: options.requestApply,
    onState: options.onState,
  })
}
