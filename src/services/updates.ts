import { platform, type UpdateAvailable, type UpdateState, type Unsubscribe } from '../platform'

export type { UpdateAvailable }

/** Dev (`vite`) o build sin updater: `check()` lanza; se propaga al llamador. */
export function checkForUpdates(): Promise<UpdateAvailable | null> {
  return platform().updates.check()
}

export function downloadUpdate(): Promise<UpdateState> {
  return platform().updates.download()
}

export function applyUpdate(): Promise<void> {
  return platform().updates.apply()
}

export function onUpdateState(callback: (state: UpdateState) => void): Promise<Unsubscribe> {
  return platform().updates.onState(callback)
}
