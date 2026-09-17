import { useSyncExternalStore } from 'react'

/**
 * Estado central de atención de la ventana: visibilidad del documento y foco.
 * Alimenta la elegibilidad de lectura automática y de avisos; una señal
 * desconocida no acredita lectura. Un único juego de listeners para toda la app.
 */
export interface WindowAttention {
  visible: boolean
  focused: boolean
  /** `visible && focused`: el usuario puede estar mirando la ventana. */
  attended: boolean
}

let current: WindowAttention = compute()
const listeners = new Set<() => void>()
let bound = false

function compute(): WindowAttention {
  if (typeof document === 'undefined') return { visible: true, focused: true, attended: true }
  const visible = document.visibilityState !== 'hidden'
  const focused = typeof document.hasFocus === 'function' ? document.hasFocus() : true
  return { visible, focused, attended: visible && focused }
}

function refresh() {
  const next = compute()
  if (next.visible === current.visible && next.focused === current.focused) return
  current = next
  for (const listener of listeners) listener()
}

function bind() {
  if (bound || typeof window === 'undefined') return
  bound = true
  document.addEventListener('visibilitychange', refresh)
  window.addEventListener('focus', refresh)
  window.addEventListener('blur', refresh)
  window.addEventListener('pageshow', refresh)
}

function subscribe(listener: () => void): () => void {
  bind()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getWindowAttention(): WindowAttention {
  return current
}

export function useWindowAttention(): WindowAttention {
  return useSyncExternalStore(subscribe, getWindowAttention, () => current)
}

/** Solo tests: fuerza una relectura tras simular eventos. */
export function refreshWindowAttentionForTests(): void {
  refresh()
}
