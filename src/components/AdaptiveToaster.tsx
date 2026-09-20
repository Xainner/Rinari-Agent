import { useEffect, useMemo, useRef, useState } from 'react'
import { Toaster, useSonner } from 'sonner'

import { useNativeSurfaces, type NativeRect } from '../stores/nativeSurfaces'

type Placement = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'

const MARGIN = 16
const TOAST_WIDTH = 380
const TOAST_HEIGHT = 176
const placements: Placement[] = [
  'bottom-right',
  'top-right',
  'bottom-left',
  'top-left',
  'top-center',
  'bottom-center',
]

export function toastLane(position: Placement, width: number, height: number): NativeRect {
  const x = position.endsWith('left')
    ? MARGIN
    : position.endsWith('right')
      ? Math.max(MARGIN, width - TOAST_WIDTH - MARGIN)
      : Math.max(MARGIN, (width - TOAST_WIDTH) / 2)
  const y = position.startsWith('top')
    ? MARGIN
    : Math.max(MARGIN, height - TOAST_HEIGHT - MARGIN)
  return { x, y, width: Math.min(TOAST_WIDTH, width - MARGIN * 2), height: TOAST_HEIGHT }
}

export function overlaps(a: NativeRect, b: NativeRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

export function chooseToastLayout(
  surfaces: NativeRect[],
  viewport: { width: number; height: number },
  frozen?: Placement | null,
): { chosen: Placement; occlusions: NativeRect[] } {
  const chosen =
    frozen ??
    placements.find((candidate) => {
      const rect = toastLane(candidate, viewport.width, viewport.height)
      return surfaces.every((surface) => !overlaps(rect, surface))
    }) ??
    'bottom-right'
  const rect = toastLane(chosen, viewport.width, viewport.height)
  const blocked = surfaces.some((surface) => overlaps(rect, surface))
  return { chosen, occlusions: blocked ? [rect] : [] }
}

/** Coloca Sonner fuera de vistas nativas; si no cabe, main recorta bajo la pila. */
export default function AdaptiveToaster() {
  const { toasts } = useSonner()
  const surfaces = useNativeSurfaces((state) => state.surfaces)
  const placement = useNativeSurfaces((state) => state.toastPlacement)
  const setToastLayout = useNativeSurfaces((state) => state.setToastLayout)
  const frozen = useRef<Placement | null>(null)
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))

  useEffect(() => {
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  const active = toasts.length > 0
  const decision = useMemo(() => {
    const native = Object.values(surfaces)
    return chooseToastLayout(native, viewport, frozen.current)
  }, [surfaces, viewport])

  useEffect(() => {
    if (active && frozen.current === null) frozen.current = decision.chosen
    if (!active) frozen.current = null
    setToastLayout(active ? (frozen.current ?? decision.chosen) : placement, active ? decision.occlusions : [])
  }, [active, decision, placement, setToastLayout])

  return <Toaster position={active ? (frozen.current ?? decision.chosen) : placement} />
}
