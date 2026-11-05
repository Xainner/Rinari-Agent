import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** A menos de esto del fondo se cuenta como «abajo» (el mismo corte que el chat). */
const BOTTOM_PX = 80
/** Un `scroll` hasta este tiempo después de un gesto es de la persona. */
const GESTURE_MS = 300

/**
 * Seguir el final en una lista de chat sin virtualizar (la oficina de la
 * Agency), con las reglas del chat de una conversación (`ChatView`):
 *
 * - abre abajo en cuanto hay contenido, también si llega tarde (la carga es
 *   asíncrona) o crece después de pintar (Markdown, imágenes, texto vivo);
 * - mientras la persona está abajo, lo nuevo la lleva al fondo, como mucho
 *   una vez por cuadro y nunca dentro del ResizeObserver;
 * - solo un gesto suyo (rueda, toque, tecla, clic o la barra sostenida)
 *   apaga el seguimiento: un `scroll` que provoca el contenido al crecer no;
 * - `goToEnd` (su propio mensaje o «Ir al final») vuelve al fondo y lo sigue.
 *
 * `contentRef` es lo que crece dentro de `scrollRef`. `resetKey` vuelve a
 * empezar abajo (otro equipo en la misma vista).
 */
export function useFollowBottom(
  scrollRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  resetKey: unknown = null,
) {
  const followRef = useRef(true)
  const [atBottom, setAtBottom] = useState(true)
  const gestureAtRef = useRef(0)
  const pointerHeldRef = useRef(false)
  const frameRef = useRef(0)

  const toBottom = useCallback(() => {
    const scroller = scrollRef.current
    if (scroller && scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight > 1) scroller.scrollTop = scroller.scrollHeight
  }, [scrollRef])

  const scheduleFollow = useCallback(() => {
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0
      if (followRef.current) toBottom()
    })
  }, [toBottom])

  const measure = useCallback(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const gap = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
    const bottom = gap < BOTTOM_PX
    const gesture = pointerHeldRef.current || performance.now() - gestureAtRef.current < GESTURE_MS
    if (gap > 1 && followRef.current && !gesture) {
      // Creció el contenido o movió el programa: se sigue hasta el fondo exacto.
      scheduleFollow()
      if (!bottom) return
    }
    followRef.current = bottom
    setAtBottom(bottom)
  }, [scrollRef, scheduleFollow])

  const gesture = useCallback(() => { gestureAtRef.current = performance.now() }, [])
  const pointerDown = useCallback(() => { gesture(); pointerHeldRef.current = true }, [gesture])
  useEffect(() => {
    const release = () => { pointerHeldRef.current = false }
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    return () => {
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
    }
  }, [])

  // Empieza abajo antes de pintar, sin destello.
  useLayoutEffect(() => {
    followRef.current = true
    setAtBottom(true)
    const scroller = scrollRef.current
    if (scroller) scroller.scrollTop = scroller.scrollHeight
  }, [scrollRef, resetKey])

  // El alto cambia sin `scroll` (llegó la carga, se pintó una imagen, cambió
  // el ancho): siguiendo, se baja; leyendo arriba, solo se vuelve a medir.
  useEffect(() => {
    const scroller = scrollRef.current
    const content = contentRef.current
    if (!scroller || typeof ResizeObserver === 'undefined') return
    let frame = 0
    const observer = new ResizeObserver(() => {
      if (followRef.current) {
        scheduleFollow()
        return
      }
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    })
    observer.observe(scroller)
    if (content) observer.observe(content)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [scrollRef, contentRef, resetKey, scheduleFollow, measure])
  useEffect(() => () => cancelAnimationFrame(frameRef.current), [])

  /** Hay contenido nuevo (un mensaje más): siguiendo, se baja. */
  const contentChanged = useCallback(() => {
    if (followRef.current) scheduleFollow()
  }, [scheduleFollow])

  /** Su propio mensaje o «Ir al final»: vuelve al fondo y lo sigue. */
  const goToEnd = useCallback(() => {
    followRef.current = true
    setAtBottom(true)
    gestureAtRef.current = 0
    toBottom()
    scheduleFollow()
  }, [toBottom, scheduleFollow])

  return {
    atBottom,
    goToEnd,
    contentChanged,
    /** Para el contenedor que se desplaza. */
    scrollProps: {
      onScroll: measure,
      onWheel: gesture,
      onTouchStart: gesture,
      onKeyDown: gesture,
      onPointerDown: pointerDown,
    },
  }
}
