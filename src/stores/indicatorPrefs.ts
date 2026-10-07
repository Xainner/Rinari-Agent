import { create } from 'zustand'

/**
 * Número de chats pendientes en la barra de tareas y marca en la bandeja.
 * Independiente de sonidos y notificaciones: es un estado, no una interrupción.
 */
interface IndicatorPrefs {
  enabled: boolean
  setEnabled(enabled: boolean): void
}

const KEY = 'rinari.indicators.v1'

function load(): boolean {
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as { enabled?: unknown }) : null
    return typeof parsed?.enabled === 'boolean' ? parsed.enabled : true
  } catch {
    return true
  }
}

export const useIndicatorPrefs = create<IndicatorPrefs>((set) => ({
  enabled: typeof window === 'undefined' ? true : load(),
  setEnabled(enabled) {
    set({ enabled })
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ enabled }))
    } catch {
      // Sin almacenamiento la preferencia dura la sesión.
    }
  },
}))
