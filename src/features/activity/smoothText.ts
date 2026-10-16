import { useEffect, useRef, useState } from 'react'

/** Ritmo mínimo del revelado: unos 120 caracteres por segundo. */
const BASE_CHARS_PER_MS = 0.12
/** Nunca más de esto de atraso respecto de lo recibido: si se acumula, acelera. */
const MAX_LAG_MS = 300
/** Si no llega nada en este tiempo, la palabra a medias ya está completa. */
const SETTLE_MS = 220

/**
 * Lo que ya se mostró de cada bloque vivo, por id: al volver a montarse
 * (el chat virtualizado desmonta lo que sale de la vista) sigue donde iba y
 * no repite el revelado.
 */
const shownById = new Map<string, number>()

/** El siguiente corte de palabra a partir de `index` (fin de la palabra en curso). */
export function wordEnd(text: string, index: number): number {
  if (index >= text.length) return text.length
  const next = text.slice(index).search(/\s/)
  return next === -1 ? -1 : index + next
}

/** Cuánto avanzar en `elapsedMs` con `backlog` caracteres pendientes. */
export function revealStep(backlog: number, elapsedMs: number): number {
  if (backlog <= 0) return 0
  return Math.max(BASE_CHARS_PER_MS, backlog / MAX_LAG_MS) * elapsedMs
}

const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now())

/**
 * Texto en streaming revelado con suavidad (plan 0.4.0 #52): lo que llega se
 * guarda y se muestra a ritmo constante, por palabras enteras, acelerando si
 * se acumula. Así un proveedor que manda oraciones enteras se ve igual de
 * fluido que uno que manda tokens.
 * - `streaming`: el texto sigue llegando. Si deja de llegar con el turno vivo,
 *   el revelado termina a su ritmo; al terminar el turno, todo de una vez.
 * - Con movimiento reducido, el texto sale tal cual.
 * - `fadeFrom` es desde dónde las palabras entran con su fundido: lo que ya
 *   estaba al montarse no se vuelve a animar; `shownTo`, hasta dónde se ve.
 *   El texto se pinta entero y lo pendiente espera invisible, así el
 *   revelado no cambia alturas cuadro a cuadro.
 */
export function useSmoothText(id: string, content: string, { streaming, live, reduced }: { streaming: boolean; live: boolean; reduced: boolean }): { shownTo: number; fadeFrom: number; revealing: boolean } {
  const eligible = live && !reduced
  const [mountedAt] = useState(() => (eligible ? shownById.get(id) ?? (streaming ? 0 : content.length) : content.length))
  const shown = useRef(Math.min(mountedAt, content.length))
  const [, setTick] = useState(0)
  const latest = useRef(content)
  const changedAt = useRef(0)
  if (latest.current !== content) changedAt.current = now()
  latest.current = content
  const active = eligible && (streaming || shown.current < content.length)

  useEffect(() => {
    if (!active) {
      shown.current = latest.current.length
      shownById.delete(id)
      return
    }
    let frame = 0
    let last = now()
    const step = (time: number) => {
      const text = latest.current
      const elapsed = Math.min(64, time - last)
      last = time
      if (shown.current < text.length) {
        let next = Math.min(text.length, shown.current + revealStep(text.length - shown.current, elapsed))
        // Palabras enteras: la que está a medio llegar espera a su espacio.
        const end = wordEnd(text, Math.ceil(next))
        if (end !== -1) next = Math.max(next, end)
        else if (time - changedAt.current < SETTLE_MS) next = shown.current
        const target = Math.min(text.length, Math.floor(next))
        if (target !== shown.current) {
          shown.current = target
          shownById.set(id, target)
          setTick((value) => value + 1)
        }
      }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [active, id])

  if (!active) return { shownTo: content.length, fadeFrom: content.length, revealing: false }
  return { shownTo: shown.current, fadeFrom: mountedAt, revealing: true }
}

/** Solo para pruebas. */
export function resetSmoothTextForTests() {
  shownById.clear()
}
