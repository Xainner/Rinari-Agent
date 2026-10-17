import { useEffect, useRef, useState } from 'react'

const SHRINK_MS = 900

/** Tokens en corto («116 k», «19 k»), en el idioma de la app. */
export function shortTokens(value: number, lang: string): string {
  return new Intl.NumberFormat(lang === 'es' ? 'es' : 'en', { notation: 'compact', maximumFractionDigits: value < 10_000 ? 1 : 0 }).format(value)
}

/**
 * Cuenta de `from` a `to` en `SHRINK_MS` cuando `animate` (la compactación se
 * vio terminar); si no, el valor final de una vez.
 */
export function useCountTo(from: number | undefined, to: number | undefined, animate: boolean): number | undefined {
  const [value, setValue] = useState(animate ? from : to)
  const frame = useRef(0)
  useEffect(() => {
    if (to === undefined) return
    if (!animate || from === undefined) { setValue(to); return }
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / SHRINK_MS)
      const eased = 1 - (1 - t) ** 3
      setValue(Math.round(from + (to - from) * eased))
      if (t < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [from, to, animate])
  return value
}

/**
 * La barrita de tokens de una compactación (#28): llena mientras compacta (con
 * un brillo que la recorre) y, al terminar, se encoge hasta lo que queda
 * (116 k → 19 k). Con `animate` apagado (al reabrir, o con movimiento
 * reducido) ya está en su tamaño final.
 */
export function CompactBar({ used, after, running, animate }: { used?: number; after?: number; running: boolean; animate: boolean }) {
  const target = !running && used && after !== undefined ? Math.max(0.04, Math.min(1, after / used)) : 1
  const [scale, setScale] = useState(animate ? 1 : target)
  useEffect(() => {
    if (!animate) { setScale(target); return }
    const id = requestAnimationFrame(() => setScale(target))
    return () => cancelAnimationFrame(id)
  }, [target, animate])
  return (
    <span className="compact-bar" data-running={running || undefined} aria-hidden="true">
      <span className="compact-bar-fill" style={{ transform: `scaleX(${scale})` }} />
    </span>
  )
}
