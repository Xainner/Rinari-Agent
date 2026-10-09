import { platform, type UpdateAvailable, type UpdateState, type Unsubscribe } from '../platform'

export type { UpdateAvailable }

/** Dev (`vite`) o build sin updater: `check()` lanza; se propaga al llamador. */
export function checkForUpdates(): Promise<UpdateAvailable | null> {
  return platform().updates.check()
}

/** Estado actual del actualizador (lo que no se vio pasar por `onUpdateState`). */
export function updateSnapshot(): Promise<UpdateState> {
  return platform().updates.snapshot()
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

/**
 * Si el error que llega por el estado merece aviso global. Los de una
 * comprobación los informa quien la pidió: la del arranque es silenciosa y la
 * de Acerca de muestra el suyo. Sólo se avisa aquí del que corta una descarga
 * o una instalación en curso.
 */
export function reportsUpdateError(previous: UpdateState['phase'] | null): boolean {
  return previous === 'downloading' || previous === 'downloaded' || previous === 'applying'
}
