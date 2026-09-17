import { platform, type UpdateAvailable } from '../platform'

export type { UpdateAvailable }

/** Dev (`vite`) o build sin updater: `check()` lanza; se propaga al llamador. */
export function checkForUpdates(): Promise<UpdateAvailable | null> {
  return platform().updates.check()
}

export function installUpdateAndRelaunch(): Promise<void> {
  return platform().updates.installAndRelaunch()
}
