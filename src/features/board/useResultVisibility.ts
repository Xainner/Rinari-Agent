import { createContext, useContext, useEffect, useRef } from 'react'
import { useWindowAttention } from '../../hooks/useWindowAttention'
import { useBoardAttentionStore } from '../../stores/boardAttention'

export const RESULT_READ_DWELL_MS = 500

/**
 * Condiciones de la superficie que muestra un transcript: si la sesión de
 * trabajo es visible (panel expandido o vista Normal) y no la tapa un modal.
 * Sin proveedor, no hay lectura automática (p. ej. tarjetas fuera de contexto).
 */
export interface ReadTracking {
  sessionId: string
  /** Superficie realmente visible: panel expandido / Normal con esa sesión. */
  visible: boolean
}

export const ReadTrackingContext = createContext<ReadTracking | null>(null)

export function useReadTracking(): ReadTracking | null {
  return useContext(ReadTrackingContext)
}

/**
 * Marca un resultado como leído **solo** cuando su bloque está en el viewport,
 * la superficie es visible, la ventana tiene atención y nada modal lo tapa,
 * durante `RESULT_READ_DWELL_MS` seguidos (timer cancelable). Es una regla de
 * UX, no una medición de atención humana. Devuelve el ref del bloque.
 */
export function useResultVisibility(turnId: string, enabled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null)
  const tracking = useReadTracking()
  const attention = useWindowAttention()
  const sessionId = tracking?.sessionId ?? null
  const surfaceVisible = tracking?.visible === true
  const receipt = useBoardAttentionStore((state) => (sessionId ? state.sessions[sessionId]?.turns[turnId] : undefined))
  const markTurnSeen = useBoardAttentionStore((state) => state.markTurnSeen)
  const shouldTrack = enabled && sessionId !== null && surfaceVisible && attention.attended && receipt?.state === 'unread'

  useEffect(() => {
    const element = ref.current
    if (!shouldTrack || !element || !sessionId || typeof IntersectionObserver === 'undefined') return
    let timer: number | null = null
    const clear = () => {
      if (timer !== null) window.clearTimeout(timer)
      timer = null
    }
    const modalOpen = () => document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"]') !== null
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5 && !modalOpen()) {
        if (timer === null) {
          timer = window.setTimeout(() => {
            timer = null
            if (document.visibilityState !== 'hidden' && !modalOpen()) markTurnSeen(sessionId, turnId)
          }, RESULT_READ_DWELL_MS)
        }
      } else {
        clear()
      }
    }, { threshold: [0, 0.5, 1] })
    observer.observe(element)
    return () => {
      observer.disconnect()
      clear()
    }
  }, [shouldTrack, sessionId, turnId, markTurnSeen])

  return ref
}
