import { useSyncExternalStore } from 'react'

/**
 * Interruptor de lo que la UI hace sola con el navegador: revelar el panel
 * cuando el contexto queda listo (`SessionWorkspace`) y repartir el control
 * entre turnos (`useNativeBrowser`). Encendido siempre en la app; sólo la
 * prueba vertical lo apaga, porque maqueta la vista y mueve el control a mano
 * y comprueba cada geometría y cada revisión.
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
