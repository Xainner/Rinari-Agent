import { useSyncExternalStore } from 'react'

/**
 * Interruptor de lo que la UI hace sola con el navegador: revelar el panel
 * cuando el contexto queda listo (`SessionWorkspace`). Encendido siempre en la
 * app; sólo la prueba vertical lo apaga, porque maqueta la vista a mano y
 * comprueba cada geometría y cada revisión. (El control ya no lo reparte la
 * UI: lo toma el dueño usando la página, plan 0.4.0 #46.)
 */
let enabled = true
const listeners = new Set<() => void>()

export function setAutomaticBrowserUi(next: boolean): void {
  if (enabled === next) return
  enabled = next
  for (const listener of listeners) listener()
}

export function automaticBrowserUiEnabled(): boolean {
  return enabled
}

export function useAutomaticBrowserUi(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => enabled,
  )
}
