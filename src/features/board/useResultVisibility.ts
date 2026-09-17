import { createContext, useContext, useEffect, useRef } from 'react'
import { useWindowAttention } from '../../hooks/useWindowAttention'
import { useBoardAttentionStore } from '../../stores/boardAttention'

export const RESULT_READ_DWELL_MS = 500
/** Altura mínima del cuerpo que debe estar en pantalla cuando el bloque es más alto que el viewport. */
export const RESULT_READ_MIN_VISIBLE_PX = 120
const THRESHOLDS = Array.from({ length: 21 }, (_, index) => index / 20)

/**
 * Regla de visibilidad del **cuerpo** del resultado: al menos la mitad del
 * bloque, o `RESULT_READ_MIN_VISIBLE_PX` de un bloque más alto que eso. Un
 * marcador de 1 px asomando por debajo de un cuerpo fuera de pantalla no
 * cumple ninguna de las dos.
 */
export function isResultBodyVisible(entry: Pick<IntersectionObserverEntry, 'isIntersecting' | 'intersectionRatio' | 'intersectionRect' | 'boundingClientRect'>): boolean {
  if (!entry.isIntersecting) return false
  if (entry.intersectionRatio >= 0.5) return true
  const height = entry.boundingClientRect.height
  return height > RESULT_READ_MIN_VISIBLE_PX && entry.intersectionRect.height >= RESULT_READ_MIN_VISIBLE_PX
}

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
 * Marca un resultado como leído **solo** cuando el cuerpo real del resultado
 * (el elemento al que se aplica el ref, no un centinela) está en el viewport
 * según `isResultBodyVisible`, la superficie es visible, la ventana tiene
 * atención y nada modal lo tapa, durante `RESULT_READ_DWELL_MS` seguidos
 * (timer cancelable). Enfocar la sesión, cambiar de vista o mostrar una
 * tarjeta resumida no lo marca. Es una regla de UX, no una medición de
 * atención humana. Devuelve el ref del bloque.
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
      if (isResultBodyVisible(entry) && !modalOpen()) {
        if (timer === null) {
          timer = window.setTimeout(() => {
            timer = null
            if (document.visibilityState !== 'hidden' && !modalOpen()) markTurnSeen(sessionId, turnId)
          }, RESULT_READ_DWELL_MS)
        }
      } else {
        clear()
      }
    }, { threshold: THRESHOLDS })
    observer.observe(element)
    return () => {
      observer.disconnect()
      clear()
    }
  }, [shouldTrack, sessionId, turnId, markTurnSeen])

  return ref
}
