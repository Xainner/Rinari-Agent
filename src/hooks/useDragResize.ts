import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

export interface DragResizeOptions {
  value: number
  min: number
  max: number | (() => number)
  /**
   * `right`: arrastrar hacia la derecha agranda (el elemento está a la
   * izquierda del handle). `left`: arrastrar hacia la derecha achica (el
   * elemento está a la derecha del handle).
   */
  direction: 'left' | 'right'
  onChange: (next: number) => void
  /** Se llama con el valor final al soltar o al terminar por teclado. */
  onCommit?: (final: number) => void
  step?: number
  disabled?: boolean
}

export interface ResizeHandleProps {
  role: 'separator'
  'aria-orientation': 'vertical'
  'aria-valuenow': number
  'aria-valuemin': number
  'aria-valuemax': number
  'aria-disabled'?: boolean
  'data-dragging'?: boolean
  tabIndex: number
  onPointerDown: (event: PointerEvent<HTMLElement>) => void
  onPointerMove: (event: PointerEvent<HTMLElement>) => void
  onPointerUp: (event: PointerEvent<HTMLElement>) => void
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void
  onLostPointerCapture: (event: PointerEvent<HTMLElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

/**
 * Redimensionado horizontal en píxeles con pointer capture y teclado.
 *
 * Extraído del visor de archivos: el arrastre no selecciona texto ni captura
 * teclado fuera de su control; `pointercancel`/`lostpointercapture` terminan
 * el arrastre con el último valor válido (nunca se persiste un valor a medio
 * cancelar), y el commit ocurre una sola vez al soltar.
 */
export function useDragResize(options: DragResizeOptions): { handleProps: ResizeHandleProps } {
  const { value, min, direction, onChange, onCommit, step = 20, disabled = false } = options
  const maxValue = typeof options.max === 'function' ? options.max() : options.max
  const dragging = useRef<{ pointerId: number; startX: number; startValue: number } | null>(null)
  const [active, setActive] = useState(false)
  const latest = useRef(value)
  latest.current = value

  const clamp = useCallback((next: number) => {
    const max = typeof options.max === 'function' ? options.max() : options.max
    return Math.round(Math.max(min, Math.min(max, next)))
  }, [min, options])

  /** Quita los listeners de la ventana del arrastre en curso. */
  const detach = useRef<(() => void) | null>(null)

  const finish = useCallback((commit: boolean) => {
    if (!dragging.current) return
    dragging.current = null
    setActive(false)
    detach.current?.()
    detach.current = null
    if (commit) onCommit?.(latest.current)
  }, [onCommit])

  const move = useCallback((event: globalThis.PointerEvent) => {
    const drag = dragging.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const delta = event.clientX - drag.startX
    const next = clamp(drag.startValue + (direction === 'right' ? delta : -delta))
    if (next !== latest.current) {
      latest.current = next
      onChange(next)
    }
  }, [clamp, direction, onChange])

  // El arrastre se sigue en la ventana, no solo con la captura del puntero:
  // una vista nativa que se mueve o se retira (el navegador del panel lateral)
  // puede quitarle la captura al separador a mitad de camino, y el arrastre se
  // cortaba ahí.
  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    if (disabled || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const pointerId = event.pointerId
    dragging.current = { pointerId, startX: event.clientX, startValue: latest.current }
    setActive(true)
    const up = (upEvent: globalThis.PointerEvent) => { if (upEvent.pointerId === pointerId) finish(true) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    detach.current = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [disabled, finish, move])

  // Los eventos del propio separador llegan a la ventana por burbujeo; aquí no
  // se procesan dos veces. Perder la captura ya no termina el arrastre.
  const onPointerMove = useCallback(() => {}, [])
  const onPointerUp = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }, [])
  const onPointerCancel = useCallback(() => {}, [])
  const onLostPointerCapture = useCallback(() => {}, [])

  // Desmontar a mitad de un arrastre no deja listeners en la ventana.
  useEffect(() => () => detach.current?.(), [])

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (disabled) return
    let next: number | null = null
    if (event.key === 'ArrowLeft') next = clamp(latest.current + (direction === 'right' ? -step : step))
    if (event.key === 'ArrowRight') next = clamp(latest.current + (direction === 'right' ? step : -step))
    if (event.key === 'Home') next = clamp(min)
    if (event.key === 'End') next = clamp(Number.MAX_SAFE_INTEGER)
    if (next === null) return
    event.preventDefault()
    if (next !== latest.current) {
      latest.current = next
      onChange(next)
    }
    onCommit?.(next)
  }, [clamp, direction, disabled, min, onChange, onCommit, step])

  return {
    handleProps: {
      role: 'separator',
      'aria-orientation': 'vertical',
      'aria-valuenow': value,
      'aria-valuemin': min,
      'aria-valuemax': maxValue,
      'aria-disabled': disabled || undefined,
      // Mientras se arrastra, el asa se ve aunque el puntero se salga de ella.
      'data-dragging': active || undefined,
      tabIndex: disabled ? -1 : 0,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onLostPointerCapture,
      onKeyDown,
    },
  }
}
