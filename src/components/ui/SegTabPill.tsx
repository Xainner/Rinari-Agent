import { useLayoutEffect, useRef } from 'react'
import { duration, ease, useCalmMotion } from '../../lib/motion'

/** Por grupo `.seg-tabs`, la opción que llevaba la píldora: de ahí sale la siguiente. */
const lastChoice = new WeakMap<Element, Element>()

/**
 * La píldora de una opción elegida de `.seg-tabs`: se pinta dentro del botón
 * elegido y, al cambiar la elección, se desliza desde el anterior (se mide
 * sobre él, sin `layoutId`, así cada grupo es independiente aunque haya varios
 * iguales a la vez). Sin sobrepaso, y quieta con «Reducir animaciones». Solo
 * se mueve cuando cambia la elección: si cambia el ancho, ya está en su sitio.
 */
export function SegTabPill() {
  const ref = useRef<HTMLSpanElement>(null)
  const calm = useCalmMotion()
  useLayoutEffect(() => {
    const pill = ref.current
    const option = pill?.parentElement
    const group = option?.closest('.seg-tabs')
    if (!pill || !option || !group) return
    const previous = lastChoice.get(group)
    lastChoice.set(group, option)
    if (calm || !previous || previous === option || !previous.isConnected || typeof pill.animate !== 'function') return
    const from = previous.getBoundingClientRect()
    const to = option.getBoundingClientRect()
    if (from.width === 0 || to.width === 0) return
    pill.animate(
      [{ left: `${from.left - to.left}px`, right: `${to.right - from.right}px` }, { left: '0px', right: '0px' }],
      { duration: duration.base * 1000, easing: `cubic-bezier(${ease.out.join(', ')})` },
    )
  }, [calm])
  return <span ref={ref} className="seg-tab-pill" data-testid="seg-tab-pill" aria-hidden="true" />
}
