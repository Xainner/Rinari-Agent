import { useEffect, useMemo, useRef, useState } from 'react'
import { Toaster, useSonner } from 'sonner'

import { useNativeSurfaces, type NativeRect } from '../stores/nativeSurfaces'

type Placement = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'

const MARGIN = 16
const TOAST_WIDTH = 380
const FALLBACK_TOAST_HEIGHT = 176
const placements: Placement[] = [
  'bottom-right',
  'top-right',
  'bottom-left',
  'top-left',
  'top-center',
  'bottom-center',
]

export function toastLane(
  position: Placement,
  width: number,
  height: number,
  stack: { width: number; height: number } = {
    width: TOAST_WIDTH,
    height: FALLBACK_TOAST_HEIGHT,
  },
): NativeRect {
  const stackWidth = Math.min(Math.max(1, Math.ceil(stack.width)), Math.max(1, width - MARGIN * 2))
  const stackHeight = Math.min(
    Math.max(1, Math.ceil(stack.height)),
    Math.max(1, height - MARGIN * 2),
  )
  const x = position.endsWith('left')
    ? MARGIN
    : position.endsWith('right')
      ? Math.max(MARGIN, width - stackWidth - MARGIN)
      : Math.max(MARGIN, (width - stackWidth) / 2)
  const y = position.startsWith('top')
    ? MARGIN
    : Math.max(MARGIN, height - stackHeight - MARGIN)
  return { x, y, width: stackWidth, height: stackHeight }
}

export function overlaps(a: NativeRect, b: NativeRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

export function chooseToastLayout(
  surfaces: NativeRect[],
  viewport: { width: number; height: number },
  frozen?: Placement | null,
  stack?: { width: number; height: number },
): { chosen: Placement; occlusions: NativeRect[] } {
  const chosen =
    frozen ??
    placements.find((candidate) => {
      const rect = toastLane(candidate, viewport.width, viewport.height, stack)
      return surfaces.every((surface) => !overlaps(rect, surface))
    }) ??
    'bottom-right'
  const rect = toastLane(chosen, viewport.width, viewport.height, stack)
  const blocked = surfaces.some((surface) => overlaps(rect, surface))
  return { chosen, occlusions: blocked ? [rect] : [] }
}

/**
 * Unión de las cajas que pinta el árbol que Sonner entrega por su `ref`
 * público. No busca clases, atributos ni nodos privados: si Sonner cambia su
 * estructura, seguimos midiendo todos los elementos que realmente pinta.
 */
export function measureToastStack(root: HTMLElement): NativeRect | null {
  const document = root.ownerDocument
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  let left = Number.POSITIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  let node: Node | null = root
  while (node) {
    if (node instanceof HTMLElement) {
      for (const rect of Array.from(node.getClientRects())) {
        if (rect.width <= 0 || rect.height <= 0) continue
        left = Math.min(left, rect.left)
        top = Math.min(top, rect.top)
        right = Math.max(right, rect.right)
        bottom = Math.max(bottom, rect.bottom)
      }
    }
    node = walker.nextNode()
  }
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null
  return {
    x: Math.floor(left),
    y: Math.floor(top),
    width: Math.ceil(right - left),
    height: Math.ceil(bottom - top),
  }
}

/** Coloca Sonner fuera de vistas nativas; si no cabe, main recorta bajo la pila. */
export default function AdaptiveToaster() {
  const { toasts } = useSonner()
  const surfaces = useNativeSurfaces((state) => state.surfaces)
  const placement = useNativeSurfaces((state) => state.toastPlacement)
  const setToastLayout = useNativeSurfaces((state) => state.setToastLayout)
  const toaster = useRef<HTMLElement | null>(null)
  const frozen = useRef<Placement | null>(null)
  const [measured, setMeasured] = useState<NativeRect | null>(null)
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))

  useEffect(() => {
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  const active = toasts.length > 0
  const decision = useMemo(() => {
    const native = Object.values(surfaces)
    const stack = measured ? { width: measured.width, height: measured.height } : undefined
    return chooseToastLayout(native, viewport, frozen.current, stack)
  }, [surfaces, viewport, measured])

  useEffect(() => {
    const root = toaster.current
    if (!active || !root) {
      setMeasured(null)
      return
    }

    let frame: number | null = null
    let framesLeft = 0
    const measure = () => {
      frame = null
      const next = measureToastStack(root)
      setMeasured((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      )
      framesLeft -= 1
      if (framesLeft > 0) frame = requestAnimationFrame(measure)
    }
    const burst = () => {
      // Cubre la transición de entrada/salida de Sonner y mide también pilas
      // que crecen por texto largo o por una fila de acción.
      framesLeft = Math.max(framesLeft, 36)
      if (frame === null) frame = requestAnimationFrame(measure)
    }
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(burst) : null
    const observeTree = () => {
      resize?.disconnect()
      resize?.observe(root)
      const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
      let node = walker.nextNode()
      while (node) {
        if (node instanceof Element) resize?.observe(node)
        node = walker.nextNode()
      }
      burst()
    }
    const mutation =
      typeof MutationObserver === 'function'
        ? new MutationObserver(observeTree)
        : null
    mutation?.observe(root, { childList: true, subtree: true, attributes: true })
    root.addEventListener('transitionrun', burst, true)
    root.addEventListener('transitionend', burst, true)
    observeTree()
    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      resize?.disconnect()
      mutation?.disconnect()
      root.removeEventListener('transitionrun', burst, true)
      root.removeEventListener('transitionend', burst, true)
    }
  }, [active, toasts])

  useEffect(() => {
    if (active && measured && frozen.current === null) frozen.current = decision.chosen
    if (!active) frozen.current = null
    setToastLayout(active ? (frozen.current ?? decision.chosen) : placement, active ? decision.occlusions : [])
  }, [active, decision, measured, placement, setToastLayout])

  return (
    <Toaster
      ref={toaster}
      offset={MARGIN}
      position={active ? (frozen.current ?? decision.chosen) : placement}
    />
  )
}
