import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react'

/** Measure only committed DOM values. A send arms one shrink for this draft;
 * edits, restores, resizes and session changes cancel it instead of replaying it. */
export function useComposerHeight(ref: RefObject<HTMLTextAreaElement | null>, text: string, draftKey: string, placement: string, reducedMotion: boolean) {
  const pending = useRef<string | null>(null)
  const animation = useRef<Animation | null>(null)
  const measure = useCallback((animate = false) => {
    const el = ref.current
    if (!el) return
    const painted = el.getBoundingClientRect().height
    animation.current?.cancel()
    animation.current = null
    const style = getComputedStyle(el)
    const minimum = Number.parseFloat(style.minHeight) || 0
    // Boards pone un tope menor en CSS; sin hoja de estilos se queda en 240.
    const maximum = Number.parseFloat(style.maxHeight) || 240
    const border = (Number.parseFloat(style.borderTopWidth) || 0) + (Number.parseFloat(style.borderBottomWidth) || 0)
    // Un panel que se despliega monta el composer a 48 px: sin ancho de
    // contenido cada letra (o el placeholder) va en su línea y la altura sale
    // al tope. No hay nada que medir; el ResizeObserver mide al crecer.
    const content = el.clientWidth - (Number.parseFloat(style.paddingLeft) || 0) - (Number.parseFloat(style.paddingRight) || 0)
    if (content <= 0) {
      el.style.height = `${minimum}px`
      return
    }
    el.style.height = '0px'
    const height = Math.max(minimum, Math.min(el.scrollHeight + border, maximum))
    el.style.height = `${height}px`
    if (animate && !reducedMotion && painted > height && typeof el.animate === 'function') {
      animation.current = el.animate([{ height: `${painted}px` }, { height: `${height}px` }], { duration: 160, easing: 'ease-out' })
    }
  }, [ref, reducedMotion])

  useLayoutEffect(() => {
    const shrink = pending.current === draftKey && text === ''
    pending.current = null
    measure(shrink)
  }, [text, draftKey, placement, measure])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let width = el.getBoundingClientRect().width
    const observer = new ResizeObserver(() => {
      const next = el.getBoundingClientRect().width
      if (next === width) return // Height animation must not cancel itself.
      width = next
      pending.current = null
      measure()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, measure])

  useLayoutEffect(() => () => { animation.current?.cancel(); pending.current = null }, [])
  return {
    armSendReset: () => { pending.current = draftKey },
    cancelSendReset: () => { pending.current = null; measure() },
  }
}
